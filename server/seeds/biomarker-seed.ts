import { db } from "../db";
import { biomarkers, biomarkerSynonyms, biomarkerUnits, referenceProfiles, referenceProfileRanges } from "@shared/schema";
import { eq, and } from "drizzle-orm";

interface BiomarkerSeedData {
  name: string;
  category: string;
  canonicalUnit: string;
  displayUnitPreference?: string;
  precision?: number;
  globalDefaultRefMin?: number;
  globalDefaultRefMax?: number;
  synonyms?: string[];
  conversions?: Array<{
    fromUnit: string;
    toUnit: string;
    multiplier: number;
    offset?: number;
  }>;
}

const biomarkerData: BiomarkerSeedData[] = [
  {
    name: "Testosterone",
    category: "Hormones",
    canonicalUnit: "nmol/L",
    displayUnitPreference: "ng/dL",
    precision: 1,
    globalDefaultRefMin: 10.4,
    globalDefaultRefMax: 34.6,
    synonyms: ["Total Testosterone", "Testosterone Total", "Testosterone Serum"],
    conversions: [
      { fromUnit: "ng/dL", toUnit: "nmol/L", multiplier: 0.0347 },
      { fromUnit: "nmol/L", toUnit: "ng/dL", multiplier: 28.818 },
    ],
  },
  {
    name: "Total Cholesterol",
    category: "Lipids",
    canonicalUnit: "mmol/L",
    displayUnitPreference: "mg/dL",
    precision: 1,
    globalDefaultRefMin: 3.0,
    globalDefaultRefMax: 5.2,
    synonyms: ["Cholesterol", "Cholesterol Total", "Total Chol"],
    conversions: [
      { fromUnit: "mg/dL", toUnit: "mmol/L", multiplier: 0.0259 },
      { fromUnit: "mmol/L", toUnit: "mg/dL", multiplier: 38.66 },
    ],
  },
  {
    name: "LDL Cholesterol",
    category: "Lipids",
    canonicalUnit: "mmol/L",
    displayUnitPreference: "mg/dL",
    precision: 1,
    globalDefaultRefMin: 0.0,
    globalDefaultRefMax: 3.4,
    synonyms: ["LDL", "LDL-C", "Low Density Lipoprotein"],
    conversions: [
      { fromUnit: "mg/dL", toUnit: "mmol/L", multiplier: 0.0259 },
      { fromUnit: "mmol/L", toUnit: "mg/dL", multiplier: 38.66 },
    ],
  },
  {
    name: "HDL Cholesterol",
    category: "Lipids",
    canonicalUnit: "mmol/L",
    displayUnitPreference: "mg/dL",
    precision: 1,
    globalDefaultRefMin: 1.0,
    globalDefaultRefMax: 10.0,
    synonyms: ["HDL", "HDL-C", "High Density Lipoprotein"],
    conversions: [
      { fromUnit: "mg/dL", toUnit: "mmol/L", multiplier: 0.0259 },
      { fromUnit: "mmol/L", toUnit: "mg/dL", multiplier: 38.66 },
    ],
  },
  {
    name: "Triglycerides",
    category: "Lipids",
    canonicalUnit: "mmol/L",
    displayUnitPreference: "mg/dL",
    precision: 1,
    globalDefaultRefMin: 0.0,
    globalDefaultRefMax: 1.7,
    synonyms: ["Trig", "TG"],
    conversions: [
      { fromUnit: "mg/dL", toUnit: "mmol/L", multiplier: 0.0113 },
      { fromUnit: "mmol/L", toUnit: "mg/dL", multiplier: 88.57 },
    ],
  },
  {
    name: "Glucose",
    category: "Metabolic",
    canonicalUnit: "mmol/L",
    displayUnitPreference: "mg/dL",
    precision: 1,
    globalDefaultRefMin: 3.9,
    globalDefaultRefMax: 5.6,
    synonyms: ["Blood Glucose", "Fasting Glucose", "Plasma Glucose"],
    conversions: [
      { fromUnit: "mg/dL", toUnit: "mmol/L", multiplier: 0.0555 },
      { fromUnit: "mmol/L", toUnit: "mg/dL", multiplier: 18.02 },
    ],
  },
  {
    name: "HbA1c",
    category: "Metabolic",
    canonicalUnit: "%",
    displayUnitPreference: "%",
    precision: 1,
    globalDefaultRefMin: 4.0,
    globalDefaultRefMax: 5.6,
    synonyms: ["Hemoglobin A1c", "Glycated Hemoglobin", "A1C"],
    conversions: [
      { fromUnit: "%", toUnit: "mmol/mol", multiplier: 10.93, offset: -23.5 },
      { fromUnit: "mmol/mol", toUnit: "%", multiplier: 0.0915, offset: 2.15 },
    ],
  },
  {
    name: "Creatinine",
    category: "Kidney",
    canonicalUnit: "µmol/L",
    displayUnitPreference: "mg/dL",
    precision: 1,
    globalDefaultRefMin: 62,
    globalDefaultRefMax: 106,
    synonyms: ["Creat", "Serum Creatinine"],
    conversions: [
      { fromUnit: "mg/dL", toUnit: "µmol/L", multiplier: 88.42 },
      { fromUnit: "µmol/L", toUnit: "mg/dL", multiplier: 0.0113 },
    ],
  },
  {
    name: "Vitamin D",
    category: "Vitamins",
    canonicalUnit: "nmol/L",
    displayUnitPreference: "ng/mL",
    precision: 1,
    globalDefaultRefMin: 50,
    globalDefaultRefMax: 125,
    synonyms: ["25-OH Vitamin D", "Vitamin D3", "25-Hydroxyvitamin D"],
    conversions: [
      { fromUnit: "ng/mL", toUnit: "nmol/L", multiplier: 2.5 },
      { fromUnit: "nmol/L", toUnit: "ng/mL", multiplier: 0.4 },
    ],
  },
  {
    name: "TSH",
    category: "Thyroid",
    canonicalUnit: "mIU/L",
    displayUnitPreference: "mIU/L",
    precision: 2,
    globalDefaultRefMin: 0.4,
    globalDefaultRefMax: 4.0,
    synonyms: ["Thyroid Stimulating Hormone", "Thyrotropin"],
    conversions: [],
  },
  {
    name: "Free T4",
    category: "Thyroid",
    canonicalUnit: "pmol/L",
    displayUnitPreference: "ng/dL",
    precision: 1,
    globalDefaultRefMin: 12,
    globalDefaultRefMax: 22,
    synonyms: ["FT4", "Free Thyroxine"],
    conversions: [
      { fromUnit: "ng/dL", toUnit: "pmol/L", multiplier: 12.87 },
      { fromUnit: "pmol/L", toUnit: "ng/dL", multiplier: 0.0777 },
    ],
  },
  {
    name: "CRP",
    category: "Inflammation",
    canonicalUnit: "mg/L",
    displayUnitPreference: "mg/L",
    precision: 1,
    globalDefaultRefMin: 0.0,
    globalDefaultRefMax: 3.0,
    synonyms: ["C-Reactive Protein", "hs-CRP"],
    conversions: [],
  },
];

export async function seedBiomarkers() {
  console.log("Starting biomarker seed...");

  for (const biomarkerSeed of biomarkerData) {
    const existing = await db
      .select()
      .from(biomarkers)
      .where(eq(biomarkers.name, biomarkerSeed.name))
      .limit(1);

    let biomarkerId: string;

    if (existing.length === 0) {
      const [created] = await db
        .insert(biomarkers)
        .values({
          name: biomarkerSeed.name,
          category: biomarkerSeed.category,
          canonicalUnit: biomarkerSeed.canonicalUnit,
          displayUnitPreference: biomarkerSeed.displayUnitPreference,
          precision: biomarkerSeed.precision,
          globalDefaultRefMin: biomarkerSeed.globalDefaultRefMin,
          globalDefaultRefMax: biomarkerSeed.globalDefaultRefMax,
        })
        .returning();
      biomarkerId = created.id;
      console.log(`✓ Created biomarker: ${biomarkerSeed.name}`);
    } else {
      biomarkerId = existing[0].id;
      console.log(`- Biomarker already exists: ${biomarkerSeed.name}`);
    }

    if (biomarkerSeed.synonyms) {
      for (const synonym of biomarkerSeed.synonyms) {
        const existingSynonym = await db
          .select()
          .from(biomarkerSynonyms)
          .where(
            and(
              eq(biomarkerSynonyms.biomarkerId, biomarkerId),
              eq(biomarkerSynonyms.label, synonym)
            )
          )
          .limit(1);

        if (existingSynonym.length === 0) {
          await db.insert(biomarkerSynonyms).values({
            biomarkerId,
            label: synonym,
            exact: true,
          });
          console.log(`  ✓ Added synonym: ${synonym}`);
        }
      }
    }

    if (biomarkerSeed.conversions) {
      for (const conversion of biomarkerSeed.conversions) {
        const existingConversion = await db
          .select()
          .from(biomarkerUnits)
          .where(
            and(
              eq(biomarkerUnits.biomarkerId, biomarkerId),
              eq(biomarkerUnits.fromUnit, conversion.fromUnit),
              eq(biomarkerUnits.toUnit, conversion.toUnit)
            )
          )
          .limit(1);

        if (existingConversion.length === 0) {
          await db.insert(biomarkerUnits).values({
            biomarkerId,
            fromUnit: conversion.fromUnit,
            toUnit: conversion.toUnit,
            conversionType: conversion.offset !== undefined ? "affine" : "ratio",
            multiplier: conversion.multiplier,
            offset: conversion.offset || 0,
          });
          console.log(
            `  ✓ Added conversion: ${conversion.fromUnit} → ${conversion.toUnit}`
          );
        }
      }
    }
  }

  console.log("✓ Biomarker seed complete!");
}

seedBiomarkers()
  .then(() => {
    console.log("Seed completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
