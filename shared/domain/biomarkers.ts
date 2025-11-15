import type {
  Biomarker,
  BiomarkerSynonym,
  BiomarkerUnit,
  BiomarkerReferenceRange,
} from "@shared/schema";

// Type definitions for normalization
export type NormalizationInput = {
  name: string;
  value: number;
  unit: string;
  sex?: "male" | "female";
  age_years?: number;
  fasting?: boolean;
  pregnancy?: boolean;
  method?: string;
  lab_id?: string;
};

export type NormalizationResult = {
  biomarker_id: string;
  value_raw: number;
  unit_raw: string;
  value_canonical: number;
  unit_canonical: string;
  value_display: string;
  ref_range: { low: number | null; high: number | null; unit: string };
  flags: string[];
  context_used: Record<string, any>;
  warnings: string[];
};

export type NormalizationContext = {
  sex?: "male" | "female";
  age_years?: number;
  fasting?: boolean;
  pregnancy?: boolean;
  method?: string;
  lab_id?: string;
};

// Error classes
export class BiomarkerNotFoundError extends Error {
  constructor(name: string) {
    super(`Biomarker not found: ${name}`);
    this.name = "BiomarkerNotFoundError";
  }
}

export class UnitConversionError extends Error {
  constructor(fromUnit: string, toUnit: string, biomarkerName: string) {
    super(`Cannot convert ${fromUnit} to ${toUnit} for ${biomarkerName}`);
    this.name = "UnitConversionError";
  }
}

/**
 * Normalize and trim whitespace from a string for comparison
 */
function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Normalize unit strings to handle unicode variations
 * Converts μ (Greek micro) and µ (micro sign) to 'u', lowercases, and trims
 */
function normalizeUnit(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/μ/g, 'u')  // Greek micro → u
    .replace(/µ/g, 'u')  // Micro sign → u
    .trim();
}

/**
 * Resolve a biomarker name to a biomarker ID using synonyms
 * Case-insensitive, whitespace-normalized matching
 * Throws BiomarkerNotFoundError if biomarker is not found
 */
export function resolveBiomarker(
  name: string,
  biomarkers: Biomarker[],
  synonyms: BiomarkerSynonym[]
): Biomarker {
  const normalizedName = normalizeString(name);

  // First, try exact synonym matches
  const exactSynonym = synonyms.find(
    (s) => s.exact === true && normalizeString(s.label) === normalizedName
  );

  if (exactSynonym) {
    const biomarker = biomarkers.find((b) => b.id === exactSynonym.biomarkerId);
    if (biomarker) {
      return biomarker;
    }
    throw new BiomarkerNotFoundError(name);
  }

  // Then, try fuzzy synonym matches
  const fuzzySynonym = synonyms.find(
    (s) => s.exact === false && normalizeString(s.label) === normalizedName
  );

  if (fuzzySynonym) {
    const biomarker = biomarkers.find((b) => b.id === fuzzySynonym.biomarkerId);
    if (biomarker) {
      return biomarker;
    }
    throw new BiomarkerNotFoundError(name);
  }

  // Finally, try direct biomarker name match
  const biomarker = biomarkers.find((b) => normalizeString(b.name) === normalizedName);
  if (biomarker) {
    return biomarker;
  }
  
  throw new BiomarkerNotFoundError(name);
}

/**
 * Safely convert a value using multiplier and offset
 * Uses the formula: result = (value * multiplier) + offset
 */
function convertValue(value: number, multiplier: number, offset: number = 0): number {
  if (!isFinite(value) || !isFinite(multiplier) || !isFinite(offset)) {
    throw new Error("All conversion parameters must be finite numbers");
  }
  return (value * multiplier) + offset;
}

/**
 * Convert a value from one unit to another using conversion metadata
 */
export function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
  biomarkerId: string,
  conversions: BiomarkerUnit[],
  biomarkerName: string
): number {
  // Normalize units to handle unicode variations and case differences
  const normalizedFromUnit = normalizeUnit(fromUnit);
  const normalizedToUnit = normalizeUnit(toUnit);

  // If units are the same (after normalization), no conversion needed
  if (normalizedFromUnit === normalizedToUnit) {
    return value;
  }

  // Find the conversion rule (with normalized unit comparison)
  const conversion = conversions.find(
    (c) =>
      c.biomarkerId === biomarkerId &&
      normalizeUnit(c.fromUnit) === normalizedFromUnit &&
      normalizeUnit(c.toUnit) === normalizedToUnit
  );

  if (conversion) {
    // Validate that multiplier exists (required field)
    if (conversion.multiplier === null || conversion.multiplier === undefined) {
      throw new Error(`Conversion missing required multiplier for ${biomarkerName}`);
    }

    // Apply conversion using multiplier and offset
    // Formula: result = (value * multiplier) + offset
    const offset = conversion.offset ?? 0;
    return convertValue(value, conversion.multiplier, offset);
  }

  // Try finding reverse conversion and invert it
  const reverseConversion = conversions.find(
    (c) =>
      c.biomarkerId === biomarkerId &&
      normalizeUnit(c.fromUnit) === normalizedToUnit &&
      normalizeUnit(c.toUnit) === normalizedFromUnit
  );

  if (reverseConversion) {
    // Validate that multiplier exists (required field)
    if (reverseConversion.multiplier === null || reverseConversion.multiplier === undefined) {
      throw new Error(`Conversion missing required multiplier for ${biomarkerName}`);
    }

    // Invert the conversion based on type
    const offset = reverseConversion.offset ?? 0;
    
    if (reverseConversion.conversionType === 'ratio') {
      // For ratio: if forward is y = x * m, then reverse is x = y / m
      return value / reverseConversion.multiplier;
    } else if (reverseConversion.conversionType === 'affine') {
      // For affine: if forward is y = x * m + b, then reverse is x = (y - b) / m
      return (value - offset) / reverseConversion.multiplier;
    }
  }

  // If still not found, throw UnitConversionError
  throw new UnitConversionError(normalizedFromUnit, normalizedToUnit, biomarkerName);
}

/**
 * Score a reference range based on how well it matches the context
 * Higher score = better match
 * Priority: lab > method > pregnancy > fasting > sex > age > default
 */
function scoreReferenceRange(
  range: BiomarkerReferenceRange,
  context: NormalizationContext
): number {
  let score = 0;

  // Validate range.context is an object (guard against null, arrays, primitives)
  const rangeContext = range.context && typeof range.context === 'object' && !Array.isArray(range.context) 
    ? range.context as Record<string, any>
    : {};

  // Lab ID match (highest priority) - 1000 points
  if (context.lab_id && range.labId === context.lab_id) {
    score += 1000;
  }

  // Method match - 500 points
  if (context.method && rangeContext.method === context.method) {
    score += 500;
  }

  // Pregnancy match - 400 points
  if (context.pregnancy && rangeContext.pregnancy === true) {
    score += 400;
  }

  // Fasting status match - 300 points
  if (context.fasting !== undefined && rangeContext.fasting === context.fasting) {
    score += 300;
  }

  // Sex match - 200 points
  if (context.sex) {
    if (range.sex === context.sex) {
      score += 200;
    } else if (range.sex === "any") {
      score += 100; // "any" sex is better than wrong sex
    }
  } else if (range.sex === "any") {
    score += 100; // Prefer "any" sex when sex is not specified
  }

  // Age range match - 100 points if age falls within range
  if (context.age_years !== undefined) {
    const ageMin = range.ageMinY ?? 0;
    const ageMax = range.ageMaxY ?? 150;
    
    if (context.age_years >= ageMin && context.age_years <= ageMax) {
      score += 100;
      
      // Bonus points for tighter age ranges (more specific)
      const rangeWidth = ageMax - ageMin;
      if (rangeWidth < 150) {
        score += Math.floor((150 - rangeWidth) / 10);
      }
    }
  } else {
    // If no age specified, prefer ranges without age restrictions
    if (range.ageMinY === null && range.ageMaxY === null) {
      score += 50;
    }
  }

  // Default range (no specific context) - 10 points
  if (!range.labId && 
      !range.context && 
      range.sex === "any" && 
      !range.ageMinY && 
      !range.ageMaxY) {
    score += 10;
  }

  return score;
}

/**
 * Select the best reference range based on context
 * Returns the range with the highest score
 */
export function selectReferenceRange(
  biomarkerId: string,
  unit: string,
  context: NormalizationContext,
  ranges: BiomarkerReferenceRange[]
): BiomarkerReferenceRange | null {
  // Normalize the unit to handle unicode variations
  const normalizedUnit = normalizeUnit(unit);
  
  // Filter ranges for this biomarker and unit
  const exactUnitRanges = ranges.filter(
    (r) => r.biomarkerId === biomarkerId && normalizeUnit(r.unit) === normalizedUnit
  );

  // If we found ranges in the exact unit, score and return the best one
  if (exactUnitRanges.length > 0) {
    let bestRange: BiomarkerReferenceRange | null = null;
    let bestScore = -1;

    for (const range of exactUnitRanges) {
      const score = scoreReferenceRange(range, context);
      if (score > bestScore) {
        bestScore = score;
        bestRange = range;
      }
    }

    return bestRange;
  }

  // No exact unit match - fall back to any range for this biomarker
  const anyUnitRanges = ranges.filter((r) => r.biomarkerId === biomarkerId);
  
  if (anyUnitRanges.length === 0) {
    return null;
  }

  // Score each range and select the best one (will need conversion later)
  let bestRange: BiomarkerReferenceRange | null = null;
  let bestScore = -1;

  for (const range of anyUnitRanges) {
    const score = scoreReferenceRange(range, context);
    if (score > bestScore) {
      bestScore = score;
      bestRange = range;
    }
  }

  return bestRange;
}

/**
 * Apply decimal policy to a value
 */
function applyDecimalsPolicy(
  value: number,
  precision: number,
  policy: "ceil" | "floor" | "round"
): number {
  const factor = Math.pow(10, precision);
  
  switch (policy) {
    case "ceil":
      return Math.ceil(value * factor) / factor;
    case "floor":
      return Math.floor(value * factor) / factor;
    case "round":
    default:
      return Math.round(value * factor) / factor;
  }
}

/**
 * Format a value for display according to biomarker precision
 */
function formatDisplayValue(
  value: number,
  precision: number,
  policy: "ceil" | "floor" | "round"
): string {
  const roundedValue = applyDecimalsPolicy(value, precision, policy);
  return roundedValue.toFixed(precision);
}

/**
 * Generate flags based on value and reference range
 */
function generateFlags(
  value: number,
  range: BiomarkerReferenceRange | null
): string[] {
  const flags: string[] = [];

  if (!range) {
    flags.push("no_reference_range");
    return flags;
  }

  // Check critical levels first
  if (range.criticalLow !== null && value < range.criticalLow) {
    flags.push("critical_low");
  } else if (range.criticalHigh !== null && value > range.criticalHigh) {
    flags.push("critical_high");
  }

  // Check normal range
  if (range.low !== null && value < range.low) {
    flags.push("below_ref");
  } else if (range.high !== null && value > range.high) {
    flags.push("above_ref");
  } else if (
    (range.low === null || value >= range.low) &&
    (range.high === null || value <= range.high)
  ) {
    flags.push("within_ref");
  }

  return flags;
}

/**
 * Main normalization function
 * Orchestrates all normalization steps
 */
/**
 * Biomarker alias map for score calculation
 * Maps canonical database names to internal scoring keys
 */
export const SCORE_CALCULATOR_ALIASES: Record<string, string> = {
  // Lipid Panel
  'LDL Cholesterol': 'LDL_C',
  'HDL Cholesterol': 'HDL_C',
  'Total Cholesterol': 'TOTAL_CHOL',
  'Triglycerides': 'TRIGLYCERIDES',
  'Apolipoprotein B': 'APOB',
  
  // Glycemic
  'Glucose': 'GLUCOSE',
  'HbA1c': 'HBA1C',
  'Insulin': 'INSULIN',
  
  // Inflammation
  'hs-CRP': 'HS_CRP',
  'C-Reactive Protein (hs)': 'HS_CRP',
};

/**
 * Get internal scoring key from canonical biomarker name
 */
export function getScoreCalculatorKey(canonicalName: string): string | null {
  return SCORE_CALCULATOR_ALIASES[canonicalName] ?? null;
}

/**
 * Create a biomarker map for score calculation using internal keys
 */
export function createScoreCalculatorMap(
  measurements: Array<{ biomarkerName: string; value: number; testDate: Date }>
): Record<string, { value: number; testDate: Date }> {
  const map: Record<string, { value: number; testDate: Date }> = {};
  
  for (const measurement of measurements) {
    const internalKey = getScoreCalculatorKey(measurement.biomarkerName);
    if (internalKey && (!map[internalKey] || measurement.testDate > map[internalKey].testDate)) {
      map[internalKey] = {
        value: measurement.value,
        testDate: measurement.testDate,
      };
    }
  }
  
  return map;
}

export function normalizeMeasurement(
  input: NormalizationInput,
  biomarkers: Biomarker[],
  synonyms: BiomarkerSynonym[],
  conversions: BiomarkerUnit[],
  ranges: BiomarkerReferenceRange[]
): NormalizationResult {
  const warnings: string[] = [];

  // Step 1: Resolve biomarker (throws BiomarkerNotFoundError if not found)
  const biomarker = resolveBiomarker(input.name, biomarkers, synonyms);

  // Step 2: Convert to canonical unit if needed
  let canonicalValue = input.value;
  try {
    canonicalValue = convertUnit(
      input.value,
      input.unit,
      biomarker.canonicalUnit,
      biomarker.id,
      conversions,
      biomarker.name
    );
  } catch (error) {
    if (error instanceof UnitConversionError) {
      warnings.push(error.message);
      // If conversion fails, assume input is already in canonical unit
      warnings.push(`Assuming input unit '${input.unit}' is equivalent to canonical unit '${biomarker.canonicalUnit}'`);
    } else {
      throw error;
    }
  }

  // Step 3: Determine display unit (prefer biomarker's display preference, fallback to canonical)
  const displayUnit = biomarker.displayUnitPreference || biomarker.canonicalUnit;

  // Step 4: Convert to display unit if different from canonical
  let displayValue = canonicalValue;
  if (displayUnit !== biomarker.canonicalUnit) {
    try {
      displayValue = convertUnit(
        canonicalValue,
        biomarker.canonicalUnit,
        displayUnit,
        biomarker.id,
        conversions,
        biomarker.name
      );
    } catch (error) {
      warnings.push(`Could not convert to display unit ${displayUnit}, using canonical value`);
      displayValue = canonicalValue;
    }
  }

  // Step 5: Build context for reference range selection
  const context: NormalizationContext = {
    sex: input.sex,
    age_years: input.age_years,
    fasting: input.fasting,
    pregnancy: input.pregnancy,
    method: input.method,
    lab_id: input.lab_id,
  };

  // Step 6: Select best reference range
  // selectReferenceRange now falls back to any available unit if exact match not found
  const refRange = selectReferenceRange(
    biomarker.id,
    displayUnit,
    context,
    ranges
  );

  if (!refRange) {
    warnings.push(`No reference range found for ${biomarker.name}`);
  } else if (!refRange.low && !refRange.high) {
    warnings.push('reference_range_incomplete');
  } else if (normalizeUnit(refRange.unit) !== normalizeUnit(displayUnit)) {
    warnings.push(`Reference range in ${refRange.unit} will be converted to ${displayUnit}`);
  }

  // Step 6b: Convert reference range to display unit if needed
  let convertedRefLow = refRange?.low ?? null;
  let convertedRefHigh = refRange?.high ?? null;
  let convertedRefCriticalLow = refRange?.criticalLow ?? null;
  let convertedRefCriticalHigh = refRange?.criticalHigh ?? null;
  
  if (refRange && refRange.unit && normalizeUnit(refRange.unit) !== normalizeUnit(displayUnit)) {
    // Reference range is in a different unit than display unit - convert it
    try {
      if (refRange.low !== null && refRange.low !== undefined) {
        convertedRefLow = convertUnit(
          refRange.low,
          refRange.unit,
          displayUnit,
          biomarker.id,
          conversions,
          biomarker.name
        );
      }
      if (refRange.high !== null && refRange.high !== undefined) {
        convertedRefHigh = convertUnit(
          refRange.high,
          refRange.unit,
          displayUnit,
          biomarker.id,
          conversions,
          biomarker.name
        );
      }
      if (refRange.criticalLow !== null && refRange.criticalLow !== undefined) {
        convertedRefCriticalLow = convertUnit(
          refRange.criticalLow,
          refRange.unit,
          displayUnit,
          biomarker.id,
          conversions,
          biomarker.name
        );
      }
      if (refRange.criticalHigh !== null && refRange.criticalHigh !== undefined) {
        convertedRefCriticalHigh = convertUnit(
          refRange.criticalHigh,
          refRange.unit,
          displayUnit,
          biomarker.id,
          conversions,
          biomarker.name
        );
      }
    } catch (error) {
      // If conversion fails, drop the reference range to avoid mismatched units
      warnings.push(`Could not convert reference range from ${refRange.unit} to ${displayUnit}, dropping reference range`);
      convertedRefLow = null;
      convertedRefHigh = null;
      convertedRefCriticalLow = null;
      convertedRefCriticalHigh = null;
    }
  }

  // Step 7: Generate flags with converted reference range
  // Create a converted range object for flag generation
  // Treat as null if all bounds are null (conversion failure or incomplete range)
  const convertedRange = refRange && 
    (convertedRefLow !== null || convertedRefHigh !== null || 
     convertedRefCriticalLow !== null || convertedRefCriticalHigh !== null) ? {
    ...refRange,
    low: convertedRefLow,
    high: convertedRefHigh,
    criticalLow: convertedRefCriticalLow,
    criticalHigh: convertedRefCriticalHigh,
    unit: displayUnit,
  } : null;
  
  const flags = generateFlags(displayValue, convertedRange);

  // Step 8: Format display value
  const valueDisplayStr = formatDisplayValue(
    displayValue,
    biomarker.precision || 1,
    biomarker.decimalsPolicy || "round"
  );

  // Step 9: Build result
  return {
    biomarker_id: biomarker.id,
    value_raw: input.value,
    unit_raw: input.unit,
    value_canonical: canonicalValue,
    unit_canonical: biomarker.canonicalUnit,
    value_display: valueDisplayStr,
    ref_range: {
      low: convertedRefLow,
      high: convertedRefHigh,
      unit: displayUnit,
    },
    flags,
    context_used: {
      ...context,
      source: refRange?.source,
      lab_id: refRange?.labId,
    },
    warnings,
  };
}
