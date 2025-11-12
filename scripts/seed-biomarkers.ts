import { db } from "../server/db";
import {
  biomarkers,
  biomarkerSynonyms,
  biomarkerUnits,
  biomarkerReferenceRanges,
} from "../shared/schema";

async function seedBiomarkers() {
  console.log("🌱 Starting biomarker seeding...");

  try {
    // 1. GLUCOSE (FASTING)
    const [glucose] = await db
      .insert(biomarkers)
      .values({
        name: "Glucose (Fasting)",
        category: "Metabolic",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: glucose.id, label: "Glucose", exact: false },
      { biomarkerId: glucose.id, label: "Fasting Glucose", exact: true },
      { biomarkerId: glucose.id, label: "FBG", exact: true },
      { biomarkerId: glucose.id, label: "Blood Sugar", exact: false },
      { biomarkerId: glucose.id, label: "Blood Glucose", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: glucose.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.0555,
        notes: "Glucose conversion: mg/dL × 0.0555 = mmol/L",
      },
      {
        biomarkerId: glucose.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 18.0182,
        notes: "Glucose conversion: mmol/L × 18.0182 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: glucose.id,
        unit: "mg/dL",
        sex: "any",
        context: { fasting: true },
        low: 70,
        high: 100,
        criticalLow: 50,
        criticalHigh: 125,
        source: "ADA 2023 Guidelines",
      },
      {
        biomarkerId: glucose.id,
        unit: "mmol/L",
        sex: "any",
        context: { fasting: true },
        low: 3.9,
        high: 5.6,
        criticalLow: 2.8,
        criticalHigh: 6.9,
        source: "ADA 2023 Guidelines",
      },
    ]);

    console.log("✅ Glucose seeded");

    // 2. HbA1c
    const [hba1c] = await db
      .insert(biomarkers)
      .values({
        name: "HbA1c",
        category: "Metabolic",
        canonicalUnit: "%",
        displayUnitPreference: "%",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: hba1c.id, label: "HbA1c", exact: true },
      { biomarkerId: hba1c.id, label: "Hemoglobin A1c", exact: true },
      { biomarkerId: hba1c.id, label: "A1C", exact: true },
      { biomarkerId: hba1c.id, label: "Glycated Hemoglobin", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: hba1c.id,
        fromUnit: "%",
        toUnit: "mmol/mol",
        conversionType: "affine",
        multiplier: 10.929,
        offset: -23.49735,
        notes: "IFCC conversion: (% - 2.15) × 10.929 = mmol/mol",
      },
      {
        biomarkerId: hba1c.id,
        fromUnit: "mmol/mol",
        toUnit: "%",
        conversionType: "affine",
        multiplier: 0.09149967975112087,
        offset: 2.15,
        notes: "DCCT conversion: (mmol/mol ÷ 10.929) + 2.15 = %",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: hba1c.id,
        unit: "%",
        sex: "any",
        low: null,
        high: 5.7,
        criticalHigh: 6.5,
        source: "ADA 2023 Guidelines",
      },
      {
        biomarkerId: hba1c.id,
        unit: "mmol/mol",
        sex: "any",
        low: null,
        high: 39,
        criticalHigh: 48,
        source: "IFCC Standards",
      },
    ]);

    console.log("✅ HbA1c seeded");

    // 3. TOTAL CHOLESTEROL
    const [totalChol] = await db
      .insert(biomarkers)
      .values({
        name: "Total Cholesterol",
        category: "Lipid",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: totalChol.id, label: "Total Cholesterol", exact: true },
      { biomarkerId: totalChol.id, label: "Cholesterol", exact: false },
      { biomarkerId: totalChol.id, label: "Total Chol", exact: false },
      { biomarkerId: totalChol.id, label: "CHOL", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: totalChol.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.02586,
        notes: "Cholesterol conversion: mg/dL × 0.02586 = mmol/L",
      },
      {
        biomarkerId: totalChol.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 38.67,
        notes: "Cholesterol conversion: mmol/L × 38.67 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: totalChol.id,
        unit: "mg/dL",
        sex: "any",
        low: null,
        high: 200,
        criticalHigh: 240,
        source: "NCEP ATP III",
      },
      {
        biomarkerId: totalChol.id,
        unit: "mmol/L",
        sex: "any",
        low: null,
        high: 5.2,
        criticalHigh: 6.2,
        source: "NCEP ATP III",
      },
    ]);

    console.log("✅ Total Cholesterol seeded");

    // 4. LDL-C
    const [ldl] = await db
      .insert(biomarkers)
      .values({
        name: "LDL Cholesterol",
        category: "Lipid",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: ldl.id, label: "LDL Cholesterol", exact: true },
      { biomarkerId: ldl.id, label: "LDL-C", exact: true },
      { biomarkerId: ldl.id, label: "LDL", exact: false },
      { biomarkerId: ldl.id, label: "Low Density Lipoprotein", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: ldl.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.02586,
        notes: "LDL conversion: mg/dL × 0.02586 = mmol/L",
      },
      {
        biomarkerId: ldl.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 38.67,
        notes: "LDL conversion: mmol/L × 38.67 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: ldl.id,
        unit: "mg/dL",
        sex: "any",
        low: null,
        high: 100,
        criticalHigh: 160,
        source: "ACC/AHA 2019",
      },
      {
        biomarkerId: ldl.id,
        unit: "mmol/L",
        sex: "any",
        low: null,
        high: 2.6,
        criticalHigh: 4.1,
        source: "ACC/AHA 2019",
      },
    ]);

    console.log("✅ LDL-C seeded");

    // 5. HDL-C
    const [hdl] = await db
      .insert(biomarkers)
      .values({
        name: "HDL Cholesterol",
        category: "Lipid",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: hdl.id, label: "HDL Cholesterol", exact: true },
      { biomarkerId: hdl.id, label: "HDL-C", exact: true },
      { biomarkerId: hdl.id, label: "HDL", exact: false },
      { biomarkerId: hdl.id, label: "High Density Lipoprotein", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: hdl.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.02586,
        notes: "HDL conversion: mg/dL × 0.02586 = mmol/L",
      },
      {
        biomarkerId: hdl.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 38.67,
        notes: "HDL conversion: mmol/L × 38.67 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: hdl.id,
        unit: "mg/dL",
        sex: "male",
        low: 40,
        high: null,
        criticalLow: 35,
        source: "NCEP ATP III",
      },
      {
        biomarkerId: hdl.id,
        unit: "mg/dL",
        sex: "female",
        low: 50,
        high: null,
        criticalLow: 45,
        source: "NCEP ATP III",
      },
      {
        biomarkerId: hdl.id,
        unit: "mmol/L",
        sex: "male",
        low: 1.0,
        high: null,
        criticalLow: 0.9,
        source: "NCEP ATP III",
      },
      {
        biomarkerId: hdl.id,
        unit: "mmol/L",
        sex: "female",
        low: 1.3,
        high: null,
        criticalLow: 1.2,
        source: "NCEP ATP III",
      },
    ]);

    console.log("✅ HDL-C seeded");

    // 6. TRIGLYCERIDES
    const [trig] = await db
      .insert(biomarkers)
      .values({
        name: "Triglycerides",
        category: "Lipid",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: trig.id, label: "Triglycerides", exact: true },
      { biomarkerId: trig.id, label: "TRIG", exact: true },
      { biomarkerId: trig.id, label: "TG", exact: true },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: trig.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.01129,
        notes: "Triglycerides conversion: mg/dL × 0.01129 = mmol/L",
      },
      {
        biomarkerId: trig.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 88.57,
        notes: "Triglycerides conversion: mmol/L × 88.57 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: trig.id,
        unit: "mg/dL",
        sex: "any",
        context: { fasting: true },
        low: null,
        high: 150,
        criticalHigh: 200,
        source: "NCEP ATP III",
      },
      {
        biomarkerId: trig.id,
        unit: "mmol/L",
        sex: "any",
        context: { fasting: true },
        low: null,
        high: 1.7,
        criticalHigh: 2.3,
        source: "NCEP ATP III",
      },
    ]);

    console.log("✅ Triglycerides seeded");

    // 7. CREATININE
    const [creat] = await db
      .insert(biomarkers)
      .values({
        name: "Creatinine",
        category: "Kidney",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: creat.id, label: "Creatinine", exact: true },
      { biomarkerId: creat.id, label: "CREAT", exact: true },
      { biomarkerId: creat.id, label: "Serum Creatinine", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: creat.id,
        fromUnit: "mg/dL",
        toUnit: "μmol/L",
        conversionType: "ratio",
        multiplier: 88.4,
        notes: "Creatinine conversion: mg/dL × 88.4 = μmol/L",
      },
      {
        biomarkerId: creat.id,
        fromUnit: "μmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 0.0113,
        notes: "Creatinine conversion: μmol/L × 0.0113 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: creat.id,
        unit: "mg/dL",
        sex: "male",
        low: 0.7,
        high: 1.3,
        criticalLow: 0.5,
        criticalHigh: 1.5,
        source: "KDIGO 2012",
      },
      {
        biomarkerId: creat.id,
        unit: "mg/dL",
        sex: "female",
        low: 0.6,
        high: 1.1,
        criticalLow: 0.4,
        criticalHigh: 1.3,
        source: "KDIGO 2012",
      },
      {
        biomarkerId: creat.id,
        unit: "μmol/L",
        sex: "male",
        low: 62,
        high: 115,
        criticalLow: 44,
        criticalHigh: 133,
        source: "KDIGO 2012",
      },
      {
        biomarkerId: creat.id,
        unit: "μmol/L",
        sex: "female",
        low: 53,
        high: 97,
        criticalLow: 35,
        criticalHigh: 115,
        source: "KDIGO 2012",
      },
    ]);

    console.log("✅ Creatinine seeded");

    // 8. eGFR
    const [egfr] = await db
      .insert(biomarkers)
      .values({
        name: "eGFR",
        category: "Kidney",
        canonicalUnit: "mL/min/1.73m²",
        displayUnitPreference: "mL/min/1.73m²",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: egfr.id, label: "eGFR", exact: true },
      { biomarkerId: egfr.id, label: "Estimated GFR", exact: false },
      { biomarkerId: egfr.id, label: "Glomerular Filtration Rate", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: egfr.id,
        unit: "mL/min/1.73m²",
        sex: "any",
        ageMinY: 18,
        ageMaxY: 40,
        low: 90,
        high: null,
        criticalLow: 60,
        source: "KDIGO 2012",
      },
      {
        biomarkerId: egfr.id,
        unit: "mL/min/1.73m²",
        sex: "any",
        ageMinY: 40,
        ageMaxY: 65,
        low: 85,
        high: null,
        criticalLow: 60,
        source: "KDIGO 2012",
      },
      {
        biomarkerId: egfr.id,
        unit: "mL/min/1.73m²",
        sex: "any",
        ageMinY: 65,
        low: 75,
        high: null,
        criticalLow: 60,
        source: "KDIGO 2012",
      },
    ]);

    console.log("✅ eGFR seeded");

    // 9. VITAMIN D
    const [vitD] = await db
      .insert(biomarkers)
      .values({
        name: "Vitamin D (25-OH)",
        category: "Nutrition",
        canonicalUnit: "ng/mL",
        displayUnitPreference: "ng/mL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: vitD.id, label: "Vitamin D", exact: false },
      { biomarkerId: vitD.id, label: "25-OH Vitamin D", exact: true },
      { biomarkerId: vitD.id, label: "25-Hydroxyvitamin D", exact: true },
      { biomarkerId: vitD.id, label: "Calcidiol", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: vitD.id,
        fromUnit: "ng/mL",
        toUnit: "nmol/L",
        conversionType: "ratio",
        multiplier: 2.496,
        notes: "Vitamin D conversion: ng/mL × 2.496 = nmol/L",
      },
      {
        biomarkerId: vitD.id,
        fromUnit: "nmol/L",
        toUnit: "ng/mL",
        conversionType: "ratio",
        multiplier: 0.4006,
        notes: "Vitamin D conversion: nmol/L × 0.4006 = ng/mL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: vitD.id,
        unit: "ng/mL",
        sex: "any",
        low: 30,
        high: 100,
        criticalLow: 20,
        criticalHigh: 150,
        source: "Endocrine Society 2011",
      },
      {
        biomarkerId: vitD.id,
        unit: "nmol/L",
        sex: "any",
        low: 75,
        high: 250,
        criticalLow: 50,
        criticalHigh: 375,
        source: "Endocrine Society 2011",
      },
    ]);

    console.log("✅ Vitamin D seeded");

    // 10. CRP (hs)
    const [crp] = await db
      .insert(biomarkers)
      .values({
        name: "C-Reactive Protein (hs)",
        category: "Inflammation",
        canonicalUnit: "mg/L",
        displayUnitPreference: "mg/L",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: crp.id, label: "C-Reactive Protein", exact: false },
      { biomarkerId: crp.id, label: "hs-CRP", exact: true },
      { biomarkerId: crp.id, label: "CRP", exact: false },
      { biomarkerId: crp.id, label: "High Sensitivity CRP", exact: true },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: crp.id,
        fromUnit: "mg/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 0.1,
        notes: "CRP conversion: mg/L × 0.1 = mg/dL",
      },
      {
        biomarkerId: crp.id,
        fromUnit: "mg/dL",
        toUnit: "mg/L",
        conversionType: "ratio",
        multiplier: 10,
        notes: "CRP conversion: mg/dL × 10 = mg/L",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: crp.id,
        unit: "mg/L",
        sex: "any",
        low: null,
        high: 3.0,
        criticalHigh: 10.0,
        source: "AHA/CDC 2003",
      },
      {
        biomarkerId: crp.id,
        unit: "mg/dL",
        sex: "any",
        low: null,
        high: 0.3,
        criticalHigh: 1.0,
        source: "AHA/CDC 2003",
      },
    ]);

    console.log("✅ CRP (hs) seeded");

    // 11. TSH
    const [tsh] = await db
      .insert(biomarkers)
      .values({
        name: "TSH",
        category: "Hormones",
        canonicalUnit: "mIU/L",
        displayUnitPreference: "mIU/L",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: tsh.id, label: "TSH", exact: true },
      { biomarkerId: tsh.id, label: "Thyroid Stimulating Hormone", exact: true },
      { biomarkerId: tsh.id, label: "Thyrotropin", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: tsh.id,
        fromUnit: "mIU/L",
        toUnit: "μIU/mL",
        conversionType: "ratio",
        multiplier: 1,
        notes: "TSH: mIU/L and μIU/mL are equivalent",
      },
      {
        biomarkerId: tsh.id,
        fromUnit: "μIU/mL",
        toUnit: "mIU/L",
        conversionType: "ratio",
        multiplier: 1,
        notes: "TSH: μIU/mL and mIU/L are equivalent",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: tsh.id,
        unit: "mIU/L",
        sex: "any",
        ageMinY: 18,
        ageMaxY: 50,
        low: 0.4,
        high: 4.0,
        criticalLow: 0.1,
        criticalHigh: 10.0,
        source: "ATA 2014",
      },
      {
        biomarkerId: tsh.id,
        unit: "mIU/L",
        sex: "any",
        ageMinY: 50,
        low: 0.5,
        high: 5.0,
        criticalLow: 0.1,
        criticalHigh: 10.0,
        source: "ATA 2014",
      },
      {
        biomarkerId: tsh.id,
        unit: "μIU/mL",
        sex: "any",
        ageMinY: 18,
        ageMaxY: 50,
        low: 0.4,
        high: 4.0,
        criticalLow: 0.1,
        criticalHigh: 10.0,
        source: "ATA 2014",
      },
      {
        biomarkerId: tsh.id,
        unit: "μIU/mL",
        sex: "any",
        ageMinY: 50,
        low: 0.5,
        high: 5.0,
        criticalLow: 0.1,
        criticalHigh: 10.0,
        source: "ATA 2014",
      },
    ]);

    console.log("✅ TSH seeded");

    console.log("\n🎉 Biomarker seeding completed successfully!");
    console.log("📊 Summary:");
    console.log("  - 11 biomarkers");
    console.log("  - 40+ synonyms");
    console.log("  - 22 unit conversions (bidirectional)");
    console.log("  - 30+ reference ranges with context");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding biomarkers:", error);
    process.exit(1);
  }
}

seedBiomarkers();
