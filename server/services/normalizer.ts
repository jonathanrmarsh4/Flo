import { db } from "../db";
import { biomarkers, biomarkerSynonyms, biomarkerUnits, referenceProfiles, referenceProfileRanges } from "@shared/schema";
import { eq, and, or, sql, lte, gte } from "drizzle-orm";
import type { RawBiomarker } from "./simpleExtractor";

export interface NormalizedBiomarker {
  biomarkerName: string;
  biomarkerId: string;
  
  valueRawString: string;
  valueRawNumeric: number;
  unitRaw: string;
  
  valueCanonical: number;
  unitCanonical: string;
  
  referenceLow: number | null;
  referenceHigh: number | null;
  
  flags: string[];
  warnings: string[];
  
  normalizationContext: {
    matchedSynonym?: string;
    conversionApplied?: boolean;
    conversionFormula?: string;
    profileUsed?: string;
    parseWarnings?: string[];
  };
}

export interface NormalizationResult {
  success: boolean;
  normalized?: NormalizedBiomarker;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

function parseNumericValue(valueRaw: string): { value: number | null; flags: string[]; warnings: string[] } {
  const flags: string[] = [];
  const warnings: string[] = [];
  let cleanValue = valueRaw.trim();

  if (cleanValue.startsWith('<')) {
    flags.push('LOW');
    cleanValue = cleanValue.substring(1).trim();
  } else if (cleanValue.startsWith('>')) {
    flags.push('HIGH');
    cleanValue = cleanValue.substring(1).trim();
  }

  const numericValue = parseFloat(cleanValue);
  
  if (isNaN(numericValue)) {
    warnings.push(`Could not parse numeric value from: ${valueRaw}`);
    return { value: null, flags, warnings };
  }

  return { value: numericValue, flags, warnings };
}

async function findBiomarkerByName(nameRaw: string): Promise<{ biomarkerId: string; name: string; matchedSynonym?: string } | null> {
  const exactMatch = await db
    .select()
    .from(biomarkers)
    .where(eq(biomarkers.name, nameRaw))
    .limit(1);

  if (exactMatch.length > 0) {
    return { biomarkerId: exactMatch[0].id, name: exactMatch[0].name };
  }

  const synonymMatch = await db
    .select({
      biomarkerId: biomarkerSynonyms.biomarkerId,
      biomarkerName: biomarkers.name,
      synonym: biomarkerSynonyms.label,
    })
    .from(biomarkerSynonyms)
    .innerJoin(biomarkers, eq(biomarkerSynonyms.biomarkerId, biomarkers.id))
    .where(eq(biomarkerSynonyms.label, nameRaw))
    .limit(1);

  if (synonymMatch.length > 0) {
    return {
      biomarkerId: synonymMatch[0].biomarkerId,
      name: synonymMatch[0].biomarkerName,
      matchedSynonym: synonymMatch[0].synonym,
    };
  }

  const fuzzyMatch = await db
    .select({
      biomarkerId: biomarkerSynonyms.biomarkerId,
      biomarkerName: biomarkers.name,
      synonym: biomarkerSynonyms.label,
    })
    .from(biomarkerSynonyms)
    .innerJoin(biomarkers, eq(biomarkerSynonyms.biomarkerId, biomarkers.id))
    .where(
      or(
        sql`LOWER(${biomarkerSynonyms.label}) = LOWER(${nameRaw})`,
        sql`LOWER(${biomarkers.name}) = LOWER(${nameRaw})`
      )
    )
    .limit(1);

  if (fuzzyMatch.length > 0) {
    return {
      biomarkerId: fuzzyMatch[0].biomarkerId,
      name: fuzzyMatch[0].biomarkerName,
      matchedSynonym: fuzzyMatch[0].synonym,
    };
  }

  return null;
}

async function convertUnit(
  biomarkerId: string,
  value: number,
  fromUnit: string,
  toUnit: string
): Promise<{ convertedValue: number; formula: string } | null> {
  const conversion = await db
    .select()
    .from(biomarkerUnits)
    .where(
      and(
        eq(biomarkerUnits.biomarkerId, biomarkerId),
        sql`LOWER(${biomarkerUnits.fromUnit}) = LOWER(${fromUnit})`,
        sql`LOWER(${biomarkerUnits.toUnit}) = LOWER(${toUnit})`
      )
    )
    .limit(1);

  if (conversion.length === 0) {
    return null;
  }

  const conv = conversion[0];
  let convertedValue: number;
  let formula: string;

  if (conv.conversionType === "ratio") {
    convertedValue = value * conv.multiplier;
    formula = `${value} * ${conv.multiplier} = ${convertedValue}`;
  } else {
    convertedValue = value * conv.multiplier + conv.offset;
    formula = `(${value} * ${conv.multiplier}) + ${conv.offset} = ${convertedValue}`;
  }

  return { convertedValue, formula };
}

async function getReferenceRange(
  biomarkerId: string,
  unit: string,
  userSex?: "Male" | "Female" | "Other",
  userAgeY?: number,
  profileName?: string
): Promise<{ low: number | null; high: number | null; profileUsed: string } | null> {
  const targetProfile = profileName || "Global Default";
  
  const profile = await db
    .select()
    .from(referenceProfiles)
    .where(eq(referenceProfiles.name, targetProfile))
    .limit(1);

  if (profile.length === 0) {
    if (targetProfile !== "Global Default") {
      return getReferenceRange(biomarkerId, unit, userSex, userAgeY, "Global Default");
    }
    return null;
  }

  const profileId = profile[0].id;
  const sex = userSex === "Male" ? "male" : userSex === "Female" ? "female" : "any";

  let ranges = await db
    .select()
    .from(referenceProfileRanges)
    .where(
      and(
        eq(referenceProfileRanges.profileId, profileId),
        eq(referenceProfileRanges.biomarkerId, biomarkerId),
        sql`LOWER(${referenceProfileRanges.unit}) = LOWER(${unit})`
      )
    );

  if (ranges.length === 0) {
    if (targetProfile !== "Global Default") {
      return getReferenceRange(biomarkerId, unit, userSex, userAgeY, "Global Default");
    }
    return null;
  }

  const matchedRanges = ranges.filter((range) => {
    if (range.sex !== "any" && range.sex !== sex) {
      return false;
    }
    
    if (userAgeY !== undefined) {
      if (range.ageMinY !== null && userAgeY < range.ageMinY) {
        return false;
      }
      if (range.ageMaxY !== null && userAgeY > range.ageMaxY) {
        return false;
      }
    }
    
    return true;
  });

  if (matchedRanges.length === 0) {
    if (targetProfile !== "Global Default") {
      return getReferenceRange(biomarkerId, unit, userSex, userAgeY, "Global Default");
    }
    return null;
  }

  const bestMatch = matchedRanges[0];
  return {
    low: bestMatch.low ?? null,
    high: bestMatch.high ?? null,
    profileUsed: targetProfile,
  };
}

export async function normalizeBiomarker(
  raw: RawBiomarker,
  options?: {
    userSex?: "Male" | "Female" | "Other";
    userAgeY?: number;
    profileName?: string;
  }
): Promise<NormalizationResult> {
  const flags: string[] = [];
  const warnings: string[] = [];
  const normalizationContext: NormalizedBiomarker["normalizationContext"] = {};

  const biomarkerMatch = await findBiomarkerByName(raw.biomarker_name_raw);
  if (!biomarkerMatch) {
    return {
      success: false,
      skipped: true,
      skipReason: `Biomarker not recognized: ${raw.biomarker_name_raw}`,
    };
  }

  if (biomarkerMatch.matchedSynonym) {
    normalizationContext.matchedSynonym = biomarkerMatch.matchedSynonym;
  }

  const parsedValue = parseNumericValue(raw.value_raw);
  if (parsedValue.value === null) {
    return {
      success: false,
      error: `Could not parse numeric value: ${raw.value_raw}`,
    };
  }

  flags.push(...parsedValue.flags);
  warnings.push(...parsedValue.warnings);

  if (raw.flag_raw) {
    const flagUpper = raw.flag_raw.toUpperCase();
    if (flagUpper.includes('H') || flagUpper.includes('HIGH')) {
      if (!flags.includes('HIGH')) flags.push('HIGH');
    }
    if (flagUpper.includes('L') || flagUpper.includes('LOW')) {
      if (!flags.includes('LOW')) flags.push('LOW');
    }
  }

  const biomarkerDetails = await db
    .select()
    .from(biomarkers)
    .where(eq(biomarkers.id, biomarkerMatch.biomarkerId))
    .limit(1);

  if (biomarkerDetails.length === 0) {
    return {
      success: false,
      error: "Biomarker details not found",
    };
  }

  const canonicalUnit = biomarkerDetails[0].canonicalUnit;
  let valueCanonical = parsedValue.value;
  let conversionApplied = false;
  let conversionFormula: string | undefined;

  if (raw.unit_raw !== canonicalUnit) {
    const conversion = await convertUnit(
      biomarkerMatch.biomarkerId,
      parsedValue.value,
      raw.unit_raw,
      canonicalUnit
    );

    if (conversion) {
      valueCanonical = conversion.convertedValue;
      conversionApplied = true;
      conversionFormula = conversion.formula;
    } else {
      warnings.push(
        `No conversion found from ${raw.unit_raw} to ${canonicalUnit} - using raw value`
      );
    }
  }

  if (conversionApplied) {
    normalizationContext.conversionApplied = true;
    normalizationContext.conversionFormula = conversionFormula;
  }

  const refRange = await getReferenceRange(
    biomarkerMatch.biomarkerId,
    canonicalUnit,
    options?.userSex,
    options?.userAgeY,
    options?.profileName || "Global Default"
  );

  let referenceLow: number | null = null;
  let referenceHigh: number | null = null;

  if (refRange) {
    referenceLow = refRange.low;
    referenceHigh = refRange.high;
    normalizationContext.profileUsed = refRange.profileUsed;
  } else {
    warnings.push("No reference range found - using global defaults");
    referenceLow = biomarkerDetails[0].globalDefaultRefMin ?? null;
    referenceHigh = biomarkerDetails[0].globalDefaultRefMax ?? null;
  }

  if (warnings.length > 0) {
    normalizationContext.parseWarnings = warnings;
  }

  return {
    success: true,
    normalized: {
      biomarkerName: biomarkerMatch.name,
      biomarkerId: biomarkerMatch.biomarkerId,
      valueRawString: raw.value_raw,
      valueRawNumeric: parsedValue.value,
      unitRaw: raw.unit_raw,
      valueCanonical,
      unitCanonical: canonicalUnit,
      referenceLow,
      referenceHigh,
      flags,
      warnings,
      normalizationContext,
    },
  };
}

export async function normalizeBatch(
  rawBiomarkers: RawBiomarker[],
  options?: {
    userSex?: "Male" | "Female" | "Other";
    userAgeY?: number;
    profileName?: string;
  }
): Promise<{
  normalized: NormalizedBiomarker[];
  failed: Array<{ raw: RawBiomarker; error: string }>;
  skipped: Array<{ raw: RawBiomarker; reason: string }>;
}> {
  const normalized: NormalizedBiomarker[] = [];
  const failed: Array<{ raw: RawBiomarker; error: string }> = [];
  const skipped: Array<{ raw: RawBiomarker; reason: string }> = [];

  for (const raw of rawBiomarkers) {
    const result = await normalizeBiomarker(raw, options);
    
    if (result.success && result.normalized) {
      normalized.push(result.normalized);
    } else if (result.skipped && result.skipReason) {
      skipped.push({ raw, reason: result.skipReason });
    } else if (result.error) {
      failed.push({ raw, error: result.error });
    }
  }

  return { normalized, failed, skipped };
}
