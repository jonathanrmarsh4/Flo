import { db } from "../server/db";
import {
  biomarkers,
  biomarkerSynonyms,
  biomarkerUnits,
  biomarkerReferenceRanges,
} from "../shared/schema";
import { eq } from "drizzle-orm";

async function addMissingBiomarkers() {
  console.log("🌱 Adding missing biomarkers...");

  try {
    // Add Urea as synonym for BUN
    const bun = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "BUN")
    });
    if (bun) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: bun.id, label: "Urea", exact: true },
      ]).onConflictDoNothing();
      console.log("✅ Added Urea synonym for BUN");
    }

    // 1. Phosphate
    const [phosphate] = await db
      .insert(biomarkers)
      .values({
        name: "Phosphate",
        category: "Basic Panels",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (phosphate) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: phosphate.id, label: "Phosphate", exact: true },
        { biomarkerId: phosphate.id, label: "Phosphorus", exact: true },
        { biomarkerId: phosphate.id, label: "Inorganic Phosphate", exact: true },
      ]);

      await db.insert(biomarkerUnits).values([
        { biomarkerId: phosphate.id, fromUnit: "mg/dL", toUnit: "mmol/L", conversionType: "ratio", multiplier: 0.323, offset: 0 },
        { biomarkerId: phosphate.id, fromUnit: "mmol/L", toUnit: "mg/dL", conversionType: "ratio", multiplier: 3.097, offset: 0 },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: phosphate.id,
          unit: "mg/dL",
          sex: "any",
          low: 2.5,
          high: 4.5,
          criticalLow: 1.0,
          criticalHigh: 6.0,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ Phosphate added");
    }

    // 2. Globulin
    const [globulin] = await db
      .insert(biomarkers)
      .values({
        name: "Globulin",
        category: "Basic Panels",
        canonicalUnit: "g/dL",
        displayUnitPreference: "g/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (globulin) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: globulin.id, label: "Globulin", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: globulin.id,
          unit: "g/dL",
          sex: "any",
          low: 2.0,
          high: 3.5,
          criticalLow: 1.5,
          criticalHigh: 4.5,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ Globulin added");
    }

    // 3. Progesterone
    const [progesterone] = await db
      .insert(biomarkers)
      .values({
        name: "Progesterone",
        category: "Hormonal & Endocrine",
        canonicalUnit: "ng/mL",
        displayUnitPreference: "ng/mL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (progesterone) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: progesterone.id, label: "Progesterone", exact: true },
      ]);

      await db.insert(biomarkerUnits).values([
        { biomarkerId: progesterone.id, fromUnit: "ng/mL", toUnit: "nmol/L", conversionType: "ratio", multiplier: 3.18, offset: 0 },
        { biomarkerId: progesterone.id, fromUnit: "nmol/L", toUnit: "ng/mL", conversionType: "ratio", multiplier: 0.314, offset: 0 },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: progesterone.id,
          unit: "ng/mL",
          sex: "female",
          low: 0.1,
          high: 25.0,
          criticalLow: null,
          criticalHigh: null,
          source: "Varies by menstrual cycle phase",
        },
      ]);
      console.log("✅ Progesterone added");
    }

    // 4. Neutrophils
    const [neutrophils] = await db
      .insert(biomarkers)
      .values({
        name: "Neutrophils",
        category: "Basic Panels",
        canonicalUnit: "K/μL",
        displayUnitPreference: "K/μL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (neutrophils) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: neutrophils.id, label: "Neutrophils", exact: true },
        { biomarkerId: neutrophils.id, label: "Absolute Neutrophils", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: neutrophils.id,
          unit: "K/μL",
          sex: "any",
          low: 1.5,
          high: 7.5,
          criticalLow: 1.0,
          criticalHigh: 10.0,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ Neutrophils added");
    }

    // 5. Lymphocytes
    const [lymphocytes] = await db
      .insert(biomarkers)
      .values({
        name: "Lymphocytes",
        category: "Basic Panels",
        canonicalUnit: "K/μL",
        displayUnitPreference: "K/μL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (lymphocytes) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: lymphocytes.id, label: "Lymphocytes", exact: true },
        { biomarkerId: lymphocytes.id, label: "Absolute Lymphocytes", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: lymphocytes.id,
          unit: "K/μL",
          sex: "any",
          low: 1.0,
          high: 4.0,
          criticalLow: 0.5,
          criticalHigh: 5.0,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ Lymphocytes added");
    }

    // 6. Monocytes
    const [monocytes] = await db
      .insert(biomarkers)
      .values({
        name: "Monocytes",
        category: "Basic Panels",
        canonicalUnit: "K/μL",
        displayUnitPreference: "K/μL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (monocytes) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: monocytes.id, label: "Monocytes", exact: true },
        { biomarkerId: monocytes.id, label: "Absolute Monocytes", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: monocytes.id,
          unit: "K/μL",
          sex: "any",
          low: 0.2,
          high: 1.0,
          criticalLow: 0.0,
          criticalHigh: 1.5,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ Monocytes added");
    }

    // 7. Eosinophils
    const [eosinophils] = await db
      .insert(biomarkers)
      .values({
        name: "Eosinophils",
        category: "Basic Panels",
        canonicalUnit: "K/μL",
        displayUnitPreference: "K/μL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (eosinophils) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: eosinophils.id, label: "Eosinophils", exact: true },
        { biomarkerId: eosinophils.id, label: "Absolute Eosinophils", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: eosinophils.id,
          unit: "K/μL",
          sex: "any",
          low: 0.0,
          high: 0.5,
          criticalLow: null,
          criticalHigh: 1.0,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ Eosinophils added");
    }

    // 8. Basophils
    const [basophils] = await db
      .insert(biomarkers)
      .values({
        name: "Basophils",
        category: "Basic Panels",
        canonicalUnit: "K/μL",
        displayUnitPreference: "K/μL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (basophils) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: basophils.id, label: "Basophils", exact: true },
        { biomarkerId: basophils.id, label: "Absolute Basophils", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: basophils.id,
          unit: "K/μL",
          sex: "any",
          low: 0.0,
          high: 0.2,
          criticalLow: null,
          criticalHigh: 0.5,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ Basophils added");
    }

    // 9. MCHC
    const [mchc] = await db
      .insert(biomarkers)
      .values({
        name: "MCHC",
        category: "Basic Panels",
        canonicalUnit: "g/dL",
        displayUnitPreference: "g/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (mchc) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: mchc.id, label: "MCHC", exact: true },
        { biomarkerId: mchc.id, label: "Mean Corpuscular Hemoglobin Concentration", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: mchc.id,
          unit: "g/dL",
          sex: "any",
          low: 32.0,
          high: 36.0,
          criticalLow: 30.0,
          criticalHigh: 37.0,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ MCHC added");
    }

    // 10. RDW
    const [rdw] = await db
      .insert(biomarkers)
      .values({
        name: "RDW",
        category: "Basic Panels",
        canonicalUnit: "%",
        displayUnitPreference: "%",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (rdw) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: rdw.id, label: "RDW", exact: true },
        { biomarkerId: rdw.id, label: "Red Cell Distribution Width", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: rdw.id,
          unit: "%",
          sex: "any",
          low: 11.5,
          high: 14.5,
          criticalLow: null,
          criticalHigh: 18.0,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ RDW added");
    }

    // 11. MPV
    const [mpv] = await db
      .insert(biomarkers)
      .values({
        name: "MPV",
        category: "Basic Panels",
        canonicalUnit: "fL",
        displayUnitPreference: "fL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (mpv) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: mpv.id, label: "MPV", exact: true },
        { biomarkerId: mpv.id, label: "Mean Platelet Volume", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: mpv.id,
          unit: "fL",
          sex: "any",
          low: 7.5,
          high: 11.5,
          criticalLow: null,
          criticalHigh: null,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ MPV added");
    }

    // 12. Transferrin
    const [transferrin] = await db
      .insert(biomarkers)
      .values({
        name: "Transferrin",
        category: "Basic Panels",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (transferrin) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: transferrin.id, label: "Transferrin", exact: true },
      ]);

      await db.insert(biomarkerUnits).values([
        { biomarkerId: transferrin.id, fromUnit: "mg/dL", toUnit: "g/L", conversionType: "ratio", multiplier: 0.01, offset: 0 },
        { biomarkerId: transferrin.id, fromUnit: "g/L", toUnit: "mg/dL", conversionType: "ratio", multiplier: 100, offset: 0 },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: transferrin.id,
          unit: "mg/dL",
          sex: "any",
          low: 200,
          high: 360,
          criticalLow: 150,
          criticalHigh: 400,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ Transferrin added");
    }

    // 13. Anion Gap
    const [anionGap] = await db
      .insert(biomarkers)
      .values({
        name: "Anion Gap",
        category: "Basic Panels",
        canonicalUnit: "mEq/L",
        displayUnitPreference: "mEq/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning()
      .onConflictDoNothing();

    if (anionGap) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: anionGap.id, label: "Anion Gap", exact: true },
      ]);

      await db.insert(biomarkerReferenceRanges).values([
        {
          biomarkerId: anionGap.id,
          unit: "mEq/L",
          sex: "any",
          low: 8,
          high: 16,
          criticalLow: 5,
          criticalHigh: 20,
          source: "Clinical Laboratory Standards",
        },
      ]);
      console.log("✅ Anion Gap added");
    }

    console.log("✅ All missing biomarkers added successfully!");
  } catch (error) {
    console.error("❌ Error adding biomarkers:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

addMissingBiomarkers();
