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
    // ==================== BASIC PANELS ====================
    
    // 1. RBC
    const [rbc] = await db
      .insert(biomarkers)
      .values({
        name: "RBC",
        category: "Basic Panels",
        canonicalUnit: "M/μL",
        displayUnitPreference: "M/μL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: rbc.id, label: "RBC", exact: true },
      { biomarkerId: rbc.id, label: "Red Blood Cell Count", exact: true },
      { biomarkerId: rbc.id, label: "Erythrocytes", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: rbc.id,
        unit: "M/μL",
        sex: "male",
        low: 4.7,
        high: 6.1,
        criticalLow: 4.2,
        criticalHigh: 6.5,
        source: "Clinical Laboratory Standards",
      },
      {
        biomarkerId: rbc.id,
        unit: "M/μL",
        sex: "female",
        low: 4.2,
        high: 5.4,
        criticalLow: 3.8,
        criticalHigh: 5.9,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ RBC seeded");

    // 2. WBC
    const [wbc] = await db
      .insert(biomarkers)
      .values({
        name: "WBC",
        category: "Basic Panels",
        canonicalUnit: "K/μL",
        displayUnitPreference: "K/μL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: wbc.id, label: "WBC", exact: true },
      { biomarkerId: wbc.id, label: "White Blood Cell Count", exact: true },
      { biomarkerId: wbc.id, label: "Leukocytes", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: wbc.id,
        unit: "K/μL",
        sex: "any",
        low: 4.5,
        high: 11.0,
        criticalLow: 3.0,
        criticalHigh: 15.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ WBC seeded");

    // 3. Hemoglobin
    const [hemoglobin] = await db
      .insert(biomarkers)
      .values({
        name: "Hemoglobin",
        category: "Basic Panels",
        canonicalUnit: "g/dL",
        displayUnitPreference: "g/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: hemoglobin.id, label: "Hemoglobin", exact: true },
      { biomarkerId: hemoglobin.id, label: "Hgb", exact: true },
      { biomarkerId: hemoglobin.id, label: "Hb", exact: true },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: hemoglobin.id,
        fromUnit: "g/dL",
        toUnit: "g/L",
        conversionType: "ratio",
        multiplier: 10,
        notes: "Hemoglobin conversion: g/dL × 10 = g/L",
      },
      {
        biomarkerId: hemoglobin.id,
        fromUnit: "g/L",
        toUnit: "g/dL",
        conversionType: "ratio",
        multiplier: 0.1,
        notes: "Hemoglobin conversion: g/L × 0.1 = g/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: hemoglobin.id,
        unit: "g/dL",
        sex: "male",
        low: 13.5,
        high: 17.5,
        criticalLow: 12.0,
        criticalHigh: 18.0,
        source: "WHO Standards",
      },
      {
        biomarkerId: hemoglobin.id,
        unit: "g/dL",
        sex: "female",
        low: 12.0,
        high: 15.5,
        criticalLow: 10.5,
        criticalHigh: 17.0,
        source: "WHO Standards",
      },
    ]);

    console.log("✅ Hemoglobin seeded");

    // 4. Hematocrit
    const [hematocrit] = await db
      .insert(biomarkers)
      .values({
        name: "Hematocrit",
        category: "Basic Panels",
        canonicalUnit: "%",
        displayUnitPreference: "%",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: hematocrit.id, label: "Hematocrit", exact: true },
      { biomarkerId: hematocrit.id, label: "Hct", exact: true },
      { biomarkerId: hematocrit.id, label: "PCV", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: hematocrit.id,
        unit: "%",
        sex: "male",
        low: 38.3,
        high: 48.6,
        criticalLow: 36.0,
        criticalHigh: 50.0,
        source: "Clinical Laboratory Standards",
      },
      {
        biomarkerId: hematocrit.id,
        unit: "%",
        sex: "female",
        low: 35.5,
        high: 44.9,
        criticalLow: 33.0,
        criticalHigh: 47.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Hematocrit seeded");

    // 5. MCV
    const [mcv] = await db
      .insert(biomarkers)
      .values({
        name: "MCV",
        category: "Basic Panels",
        canonicalUnit: "fL",
        displayUnitPreference: "fL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: mcv.id, label: "MCV", exact: true },
      { biomarkerId: mcv.id, label: "Mean Corpuscular Volume", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: mcv.id,
        unit: "fL",
        sex: "any",
        low: 80,
        high: 100,
        criticalLow: 70,
        criticalHigh: 110,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ MCV seeded");

    // 6. MCH
    const [mch] = await db
      .insert(biomarkers)
      .values({
        name: "MCH",
        category: "Basic Panels",
        canonicalUnit: "pg",
        displayUnitPreference: "pg",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: mch.id, label: "MCH", exact: true },
      { biomarkerId: mch.id, label: "Mean Corpuscular Hemoglobin", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: mch.id,
        unit: "pg",
        sex: "any",
        low: 27,
        high: 33,
        criticalLow: 24,
        criticalHigh: 36,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ MCH seeded");

    // 7. Platelets
    const [platelets] = await db
      .insert(biomarkers)
      .values({
        name: "Platelets",
        category: "Basic Panels",
        canonicalUnit: "K/μL",
        displayUnitPreference: "K/μL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: platelets.id, label: "Platelets", exact: true },
      { biomarkerId: platelets.id, label: "PLT", exact: true },
      { biomarkerId: platelets.id, label: "Thrombocytes", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: platelets.id,
        unit: "K/μL",
        sex: "any",
        low: 150,
        high: 400,
        criticalLow: 100,
        criticalHigh: 500,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Platelets seeded");

    // 8. GLUCOSE (FASTING)
    const [glucose] = await db
      .insert(biomarkers)
      .values({
        name: "Glucose",
        category: "Basic Panels",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: glucose.id, label: "Glucose", exact: true },
      { biomarkerId: glucose.id, label: "Fasting Glucose", exact: false },
      { biomarkerId: glucose.id, label: "FBG", exact: false },
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
        low: 70,
        high: 100,
        criticalLow: 50,
        criticalHigh: 125,
        source: "ADA 2023 Guidelines",
      },
    ]);

    console.log("✅ Glucose seeded");

    // 9. Calcium
    const [calcium] = await db
      .insert(biomarkers)
      .values({
        name: "Calcium",
        category: "Basic Panels",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: calcium.id, label: "Calcium", exact: true },
      { biomarkerId: calcium.id, label: "Ca", exact: true },
      { biomarkerId: calcium.id, label: "Serum Calcium", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: calcium.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.25,
        notes: "Calcium conversion: mg/dL × 0.25 = mmol/L",
      },
      {
        biomarkerId: calcium.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 4.0,
        notes: "Calcium conversion: mmol/L × 4.0 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: calcium.id,
        unit: "mg/dL",
        sex: "any",
        low: 8.5,
        high: 10.5,
        criticalLow: 7.5,
        criticalHigh: 12.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Calcium seeded");

    // 10. Sodium
    const [sodium] = await db
      .insert(biomarkers)
      .values({
        name: "Sodium",
        category: "Basic Panels",
        canonicalUnit: "mEq/L",
        displayUnitPreference: "mEq/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: sodium.id, label: "Sodium", exact: true },
      { biomarkerId: sodium.id, label: "Na", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: sodium.id,
        unit: "mEq/L",
        sex: "any",
        low: 135,
        high: 145,
        criticalLow: 120,
        criticalHigh: 160,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Sodium seeded");

    // 11. Potassium
    const [potassium] = await db
      .insert(biomarkers)
      .values({
        name: "Potassium",
        category: "Basic Panels",
        canonicalUnit: "mEq/L",
        displayUnitPreference: "mEq/L",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: potassium.id, label: "Potassium", exact: true },
      { biomarkerId: potassium.id, label: "K", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: potassium.id,
        unit: "mEq/L",
        sex: "any",
        low: 3.5,
        high: 5.0,
        criticalLow: 2.5,
        criticalHigh: 6.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Potassium seeded");

    // 12. CO2
    const [co2] = await db
      .insert(biomarkers)
      .values({
        name: "CO2",
        category: "Basic Panels",
        canonicalUnit: "mEq/L",
        displayUnitPreference: "mEq/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: co2.id, label: "CO2", exact: true },
      { biomarkerId: co2.id, label: "Carbon Dioxide", exact: true },
      { biomarkerId: co2.id, label: "Bicarbonate", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: co2.id,
        unit: "mEq/L",
        sex: "any",
        low: 23,
        high: 29,
        criticalLow: 15,
        criticalHigh: 35,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ CO2 seeded");

    // 13. Chloride
    const [chloride] = await db
      .insert(biomarkers)
      .values({
        name: "Chloride",
        category: "Basic Panels",
        canonicalUnit: "mEq/L",
        displayUnitPreference: "mEq/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: chloride.id, label: "Chloride", exact: true },
      { biomarkerId: chloride.id, label: "Cl", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: chloride.id,
        unit: "mEq/L",
        sex: "any",
        low: 96,
        high: 106,
        criticalLow: 85,
        criticalHigh: 115,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Chloride seeded");

    // 14. BUN
    const [bun] = await db
      .insert(biomarkers)
      .values({
        name: "BUN",
        category: "Basic Panels",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: bun.id, label: "BUN", exact: true },
      { biomarkerId: bun.id, label: "Blood Urea Nitrogen", exact: true },
      { biomarkerId: bun.id, label: "Urea Nitrogen", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: bun.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.357,
        notes: "BUN conversion: mg/dL × 0.357 = mmol/L",
      },
      {
        biomarkerId: bun.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 2.801,
        notes: "BUN conversion: mmol/L × 2.801 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: bun.id,
        unit: "mg/dL",
        sex: "any",
        low: 7,
        high: 20,
        criticalLow: 3,
        criticalHigh: 40,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ BUN seeded");

    // 15. Creatinine
    const [creat] = await db
      .insert(biomarkers)
      .values({
        name: "Creatinine",
        category: "Basic Panels",
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
    ]);

    console.log("✅ Creatinine seeded");

    // 16. ALT
    const [alt] = await db
      .insert(biomarkers)
      .values({
        name: "ALT",
        category: "Basic Panels",
        canonicalUnit: "U/L",
        displayUnitPreference: "U/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: alt.id, label: "ALT", exact: true },
      { biomarkerId: alt.id, label: "Alanine Aminotransferase", exact: true },
      { biomarkerId: alt.id, label: "SGPT", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: alt.id,
        unit: "U/L",
        sex: "any",
        low: null,
        high: 56,
        criticalHigh: 100,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ ALT seeded");

    // 17. AST
    const [ast] = await db
      .insert(biomarkers)
      .values({
        name: "AST",
        category: "Basic Panels",
        canonicalUnit: "U/L",
        displayUnitPreference: "U/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: ast.id, label: "AST", exact: true },
      { biomarkerId: ast.id, label: "Aspartate Aminotransferase", exact: true },
      { biomarkerId: ast.id, label: "SGOT", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: ast.id,
        unit: "U/L",
        sex: "any",
        low: null,
        high: 40,
        criticalHigh: 80,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ AST seeded");

    // 18. ALP
    const [alp] = await db
      .insert(biomarkers)
      .values({
        name: "ALP",
        category: "Basic Panels",
        canonicalUnit: "U/L",
        displayUnitPreference: "U/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: alp.id, label: "ALP", exact: true },
      { biomarkerId: alp.id, label: "Alkaline Phosphatase", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: alp.id,
        unit: "U/L",
        sex: "any",
        low: 30,
        high: 120,
        criticalLow: 20,
        criticalHigh: 200,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ ALP seeded");

    // 19. Bilirubin
    const [bilirubin] = await db
      .insert(biomarkers)
      .values({
        name: "Bilirubin",
        category: "Basic Panels",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: bilirubin.id, label: "Bilirubin", exact: true },
      { biomarkerId: bilirubin.id, label: "Total Bilirubin", exact: false },
      { biomarkerId: bilirubin.id, label: "TBIL", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: bilirubin.id,
        fromUnit: "mg/dL",
        toUnit: "μmol/L",
        conversionType: "ratio",
        multiplier: 17.1,
        notes: "Bilirubin conversion: mg/dL × 17.1 = μmol/L",
      },
      {
        biomarkerId: bilirubin.id,
        fromUnit: "μmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 0.0585,
        notes: "Bilirubin conversion: μmol/L × 0.0585 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: bilirubin.id,
        unit: "mg/dL",
        sex: "any",
        low: 0.1,
        high: 1.2,
        criticalHigh: 3.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Bilirubin seeded");

    // 20. Total Protein
    const [totalProtein] = await db
      .insert(biomarkers)
      .values({
        name: "Total Protein",
        category: "Basic Panels",
        canonicalUnit: "g/dL",
        displayUnitPreference: "g/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: totalProtein.id, label: "Total Protein", exact: true },
      { biomarkerId: totalProtein.id, label: "TP", exact: true },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: totalProtein.id,
        fromUnit: "g/dL",
        toUnit: "g/L",
        conversionType: "ratio",
        multiplier: 10,
        notes: "Total Protein conversion: g/dL × 10 = g/L",
      },
      {
        biomarkerId: totalProtein.id,
        fromUnit: "g/L",
        toUnit: "g/dL",
        conversionType: "ratio",
        multiplier: 0.1,
        notes: "Total Protein conversion: g/L × 0.1 = g/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: totalProtein.id,
        unit: "g/dL",
        sex: "any",
        low: 6.0,
        high: 8.3,
        criticalLow: 5.0,
        criticalHigh: 9.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Total Protein seeded");

    // 21. Albumin
    const [albumin] = await db
      .insert(biomarkers)
      .values({
        name: "Albumin",
        category: "Basic Panels",
        canonicalUnit: "g/dL",
        displayUnitPreference: "g/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: albumin.id, label: "Albumin", exact: true },
      { biomarkerId: albumin.id, label: "ALB", exact: true },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: albumin.id,
        fromUnit: "g/dL",
        toUnit: "g/L",
        conversionType: "ratio",
        multiplier: 10,
        notes: "Albumin conversion: g/dL × 10 = g/L",
      },
      {
        biomarkerId: albumin.id,
        fromUnit: "g/L",
        toUnit: "g/dL",
        conversionType: "ratio",
        multiplier: 0.1,
        notes: "Albumin conversion: g/L × 0.1 = g/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: albumin.id,
        unit: "g/dL",
        sex: "any",
        low: 3.5,
        high: 5.5,
        criticalLow: 2.5,
        criticalHigh: 6.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Albumin seeded");

    // ==================== LIPID & CARDIOVASCULAR HEALTH ====================

    // 22. Total Cholesterol
    const [totalChol] = await db
      .insert(biomarkers)
      .values({
        name: "Total Cholesterol",
        category: "Lipid & Cardiovascular Health",
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
        low: 125,
        high: 200,
        criticalHigh: 240,
        source: "NCEP ATP III",
      },
    ]);

    console.log("✅ Total Cholesterol seeded");

    // 23. HDL
    const [hdl] = await db
      .insert(biomarkers)
      .values({
        name: "HDL",
        category: "Lipid & Cardiovascular Health",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: hdl.id, label: "HDL", exact: true },
      { biomarkerId: hdl.id, label: "HDL Cholesterol", exact: false },
      { biomarkerId: hdl.id, label: "HDL-C", exact: false },
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
        sex: "any",
        low: 40,
        high: 100,
        criticalLow: 35,
        source: "NCEP ATP III",
      },
    ]);

    console.log("✅ HDL seeded");

    // 24. LDL
    const [ldl] = await db
      .insert(biomarkers)
      .values({
        name: "LDL",
        category: "Lipid & Cardiovascular Health",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: ldl.id, label: "LDL", exact: true },
      { biomarkerId: ldl.id, label: "LDL Cholesterol", exact: false },
      { biomarkerId: ldl.id, label: "LDL-C", exact: false },
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
        low: 50,
        high: 100,
        criticalHigh: 160,
        source: "ACC/AHA 2019",
      },
    ]);

    console.log("✅ LDL seeded");

    // 25. Triglycerides
    const [trig] = await db
      .insert(biomarkers)
      .values({
        name: "Triglycerides",
        category: "Lipid & Cardiovascular Health",
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
        low: 50,
        high: 150,
        criticalHigh: 200,
        source: "NCEP ATP III",
      },
    ]);

    console.log("✅ Triglycerides seeded");

    // 26. Non-HDL Cholesterol
    const [nonHdl] = await db
      .insert(biomarkers)
      .values({
        name: "Non-HDL Cholesterol",
        category: "Lipid & Cardiovascular Health",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: nonHdl.id, label: "Non-HDL Cholesterol", exact: true },
      { biomarkerId: nonHdl.id, label: "Non-HDL", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: nonHdl.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.02586,
        notes: "Non-HDL conversion: mg/dL × 0.02586 = mmol/L",
      },
      {
        biomarkerId: nonHdl.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 38.67,
        notes: "Non-HDL conversion: mmol/L × 38.67 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: nonHdl.id,
        unit: "mg/dL",
        sex: "any",
        low: 60,
        high: 130,
        criticalHigh: 160,
        source: "ACC/AHA 2019",
      },
    ]);

    console.log("✅ Non-HDL Cholesterol seeded");

    // 27. ApoA1
    const [apoA1] = await db
      .insert(biomarkers)
      .values({
        name: "ApoA1",
        category: "Lipid & Cardiovascular Health",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: apoA1.id, label: "ApoA1", exact: true },
      { biomarkerId: apoA1.id, label: "Apolipoprotein A1", exact: true },
      { biomarkerId: apoA1.id, label: "Apo A-I", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: apoA1.id,
        fromUnit: "mg/dL",
        toUnit: "g/L",
        conversionType: "ratio",
        multiplier: 0.01,
        notes: "ApoA1 conversion: mg/dL × 0.01 = g/L",
      },
      {
        biomarkerId: apoA1.id,
        fromUnit: "g/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 100,
        notes: "ApoA1 conversion: g/L × 100 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: apoA1.id,
        unit: "mg/dL",
        sex: "any",
        low: 120,
        high: 180,
        criticalLow: 100,
        criticalHigh: 200,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ ApoA1 seeded");

    // 28. ApoB
    const [apoB] = await db
      .insert(biomarkers)
      .values({
        name: "ApoB",
        category: "Lipid & Cardiovascular Health",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: apoB.id, label: "ApoB", exact: true },
      { biomarkerId: apoB.id, label: "Apolipoprotein B", exact: true },
      { biomarkerId: apoB.id, label: "Apo B", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: apoB.id,
        fromUnit: "mg/dL",
        toUnit: "g/L",
        conversionType: "ratio",
        multiplier: 0.01,
        notes: "ApoB conversion: mg/dL × 0.01 = g/L",
      },
      {
        biomarkerId: apoB.id,
        fromUnit: "g/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 100,
        notes: "ApoB conversion: g/L × 100 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: apoB.id,
        unit: "mg/dL",
        sex: "any",
        low: 40,
        high: 100,
        criticalHigh: 130,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ ApoB seeded");

    // 29. Lipoprotein(a)
    const [lpa] = await db
      .insert(biomarkers)
      .values({
        name: "Lipoprotein(a)",
        category: "Lipid & Cardiovascular Health",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: lpa.id, label: "Lipoprotein(a)", exact: true },
      { biomarkerId: lpa.id, label: "Lp(a)", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: lpa.id,
        unit: "mg/dL",
        sex: "any",
        low: null,
        high: 30,
        criticalHigh: 50,
        source: "AHA/ACC Guidelines",
      },
    ]);

    console.log("✅ Lipoprotein(a) seeded");

    // 30. hs-CRP
    const [hsCrp] = await db
      .insert(biomarkers)
      .values({
        name: "hs-CRP",
        category: "Lipid & Cardiovascular Health",
        canonicalUnit: "mg/L",
        displayUnitPreference: "mg/L",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: hsCrp.id, label: "hs-CRP", exact: true },
      { biomarkerId: hsCrp.id, label: "High Sensitivity CRP", exact: true },
      { biomarkerId: hsCrp.id, label: "C-Reactive Protein (hs)", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: hsCrp.id,
        fromUnit: "mg/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 0.1,
        notes: "CRP conversion: mg/L × 0.1 = mg/dL",
      },
      {
        biomarkerId: hsCrp.id,
        fromUnit: "mg/dL",
        toUnit: "mg/L",
        conversionType: "ratio",
        multiplier: 10,
        notes: "CRP conversion: mg/dL × 10 = mg/L",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: hsCrp.id,
        unit: "mg/L",
        sex: "any",
        low: null,
        high: 3.0,
        criticalHigh: 10.0,
        source: "AHA/CDC 2003",
      },
    ]);

    console.log("✅ hs-CRP seeded");

    // 31. Homocysteine
    const [homocysteine] = await db
      .insert(biomarkers)
      .values({
        name: "Homocysteine",
        category: "Lipid & Cardiovascular Health",
        canonicalUnit: "μmol/L",
        displayUnitPreference: "μmol/L",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: homocysteine.id, label: "Homocysteine", exact: true },
      { biomarkerId: homocysteine.id, label: "HCY", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: homocysteine.id,
        unit: "μmol/L",
        sex: "any",
        low: 5,
        high: 15,
        criticalHigh: 20,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Homocysteine seeded");

    // ==================== HORMONAL & ENDOCRINE ====================

    // 32. TSH
    const [tsh] = await db
      .insert(biomarkers)
      .values({
        name: "TSH",
        category: "Hormonal & Endocrine",
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

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: tsh.id,
        unit: "mIU/L",
        sex: "any",
        low: 0.5,
        high: 4.5,
        criticalLow: 0.1,
        criticalHigh: 10.0,
        source: "ATA 2014",
      },
    ]);

    console.log("✅ TSH seeded");

    // 33. Free T3
    const [freeT3] = await db
      .insert(biomarkers)
      .values({
        name: "Free T3",
        category: "Hormonal & Endocrine",
        canonicalUnit: "pg/mL",
        displayUnitPreference: "pg/mL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: freeT3.id, label: "Free T3", exact: true },
      { biomarkerId: freeT3.id, label: "FT3", exact: true },
      { biomarkerId: freeT3.id, label: "Free Triiodothyronine", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: freeT3.id,
        fromUnit: "pg/mL",
        toUnit: "pmol/L",
        conversionType: "ratio",
        multiplier: 1.536,
        notes: "Free T3 conversion: pg/mL × 1.536 = pmol/L",
      },
      {
        biomarkerId: freeT3.id,
        fromUnit: "pmol/L",
        toUnit: "pg/mL",
        conversionType: "ratio",
        multiplier: 0.651,
        notes: "Free T3 conversion: pmol/L × 0.651 = pg/mL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: freeT3.id,
        unit: "pg/mL",
        sex: "any",
        low: 2.3,
        high: 4.2,
        criticalLow: 1.5,
        criticalHigh: 5.0,
        source: "ATA 2014",
      },
    ]);

    console.log("✅ Free T3 seeded");

    // 34. Free T4
    const [freeT4] = await db
      .insert(biomarkers)
      .values({
        name: "Free T4",
        category: "Hormonal & Endocrine",
        canonicalUnit: "ng/dL",
        displayUnitPreference: "ng/dL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: freeT4.id, label: "Free T4", exact: true },
      { biomarkerId: freeT4.id, label: "FT4", exact: true },
      { biomarkerId: freeT4.id, label: "Free Thyroxine", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: freeT4.id,
        fromUnit: "ng/dL",
        toUnit: "pmol/L",
        conversionType: "ratio",
        multiplier: 12.87,
        notes: "Free T4 conversion: ng/dL × 12.87 = pmol/L",
      },
      {
        biomarkerId: freeT4.id,
        fromUnit: "pmol/L",
        toUnit: "ng/dL",
        conversionType: "ratio",
        multiplier: 0.07768,
        notes: "Free T4 conversion: pmol/L × 0.07768 = ng/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: freeT4.id,
        unit: "ng/dL",
        sex: "any",
        low: 0.8,
        high: 1.8,
        criticalLow: 0.5,
        criticalHigh: 2.5,
        source: "ATA 2014",
      },
    ]);

    console.log("✅ Free T4 seeded");

    // 35. Reverse T3
    const [reverseT3] = await db
      .insert(biomarkers)
      .values({
        name: "Reverse T3",
        category: "Hormonal & Endocrine",
        canonicalUnit: "ng/dL",
        displayUnitPreference: "ng/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: reverseT3.id, label: "Reverse T3", exact: true },
      { biomarkerId: reverseT3.id, label: "rT3", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: reverseT3.id,
        unit: "ng/dL",
        sex: "any",
        low: 9,
        high: 27,
        criticalLow: 5,
        criticalHigh: 35,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Reverse T3 seeded");

    // 36. Anti-TPO
    const [antiTpo] = await db
      .insert(biomarkers)
      .values({
        name: "Anti-TPO",
        category: "Hormonal & Endocrine",
        canonicalUnit: "IU/mL",
        displayUnitPreference: "IU/mL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: antiTpo.id, label: "Anti-TPO", exact: true },
      { biomarkerId: antiTpo.id, label: "Thyroid Peroxidase Antibody", exact: true },
      { biomarkerId: antiTpo.id, label: "TPO Ab", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: antiTpo.id,
        unit: "IU/mL",
        sex: "any",
        low: null,
        high: 35,
        criticalHigh: 100,
        source: "ATA 2014",
      },
    ]);

    console.log("✅ Anti-TPO seeded");

    // 37. Anti-TG
    const [antiTg] = await db
      .insert(biomarkers)
      .values({
        name: "Anti-TG",
        category: "Hormonal & Endocrine",
        canonicalUnit: "IU/mL",
        displayUnitPreference: "IU/mL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: antiTg.id, label: "Anti-TG", exact: true },
      { biomarkerId: antiTg.id, label: "Thyroglobulin Antibody", exact: true },
      { biomarkerId: antiTg.id, label: "TG Ab", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: antiTg.id,
        unit: "IU/mL",
        sex: "any",
        low: null,
        high: 40,
        criticalHigh: 115,
        source: "ATA 2014",
      },
    ]);

    console.log("✅ Anti-TG seeded");

    // 38. Total Testosterone
    const [totalTestosterone] = await db
      .insert(biomarkers)
      .values({
        name: "Total Testosterone",
        category: "Hormonal & Endocrine",
        canonicalUnit: "ng/dL",
        displayUnitPreference: "ng/dL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: totalTestosterone.id, label: "Total Testosterone", exact: true },
      { biomarkerId: totalTestosterone.id, label: "Testosterone", exact: false },
      { biomarkerId: totalTestosterone.id, label: "Total T", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: totalTestosterone.id,
        fromUnit: "ng/dL",
        toUnit: "nmol/L",
        conversionType: "ratio",
        multiplier: 0.0347,
        notes: "Testosterone conversion: ng/dL × 0.0347 = nmol/L",
      },
      {
        biomarkerId: totalTestosterone.id,
        fromUnit: "nmol/L",
        toUnit: "ng/dL",
        conversionType: "ratio",
        multiplier: 28.84,
        notes: "Testosterone conversion: nmol/L × 28.84 = ng/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: totalTestosterone.id,
        unit: "ng/dL",
        sex: "male",
        low: 300,
        high: 1000,
        criticalLow: 200,
        source: "Endocrine Society",
      },
      {
        biomarkerId: totalTestosterone.id,
        unit: "ng/dL",
        sex: "female",
        low: 15,
        high: 70,
        criticalLow: 10,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ Total Testosterone seeded");

    // 39. Free Testosterone
    const [freeTestosterone] = await db
      .insert(biomarkers)
      .values({
        name: "Free Testosterone",
        category: "Hormonal & Endocrine",
        canonicalUnit: "pg/mL",
        displayUnitPreference: "pg/mL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: freeTestosterone.id, label: "Free Testosterone", exact: true },
      { biomarkerId: freeTestosterone.id, label: "Free T", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: freeTestosterone.id,
        fromUnit: "pg/mL",
        toUnit: "pmol/L",
        conversionType: "ratio",
        multiplier: 3.467,
        notes: "Free Testosterone conversion: pg/mL × 3.467 = pmol/L",
      },
      {
        biomarkerId: freeTestosterone.id,
        fromUnit: "pmol/L",
        toUnit: "pg/mL",
        conversionType: "ratio",
        multiplier: 0.2885,
        notes: "Free Testosterone conversion: pmol/L × 0.2885 = pg/mL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: freeTestosterone.id,
        unit: "pg/mL",
        sex: "male",
        low: 50,
        high: 200,
        criticalLow: 30,
        source: "Endocrine Society",
      },
      {
        biomarkerId: freeTestosterone.id,
        unit: "pg/mL",
        sex: "female",
        low: 1.0,
        high: 8.5,
        criticalLow: 0.5,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ Free Testosterone seeded");

    // 40. SHBG
    const [shbg] = await db
      .insert(biomarkers)
      .values({
        name: "SHBG",
        category: "Hormonal & Endocrine",
        canonicalUnit: "nmol/L",
        displayUnitPreference: "nmol/L",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: shbg.id, label: "SHBG", exact: true },
      { biomarkerId: shbg.id, label: "Sex Hormone Binding Globulin", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: shbg.id,
        unit: "nmol/L",
        sex: "any",
        low: 20,
        high: 60,
        criticalLow: 10,
        criticalHigh: 100,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ SHBG seeded");

    // 41. Estradiol (E2)
    const [estradiol] = await db
      .insert(biomarkers)
      .values({
        name: "Estradiol (E2)",
        category: "Hormonal & Endocrine",
        canonicalUnit: "pg/mL",
        displayUnitPreference: "pg/mL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: estradiol.id, label: "Estradiol (E2)", exact: true },
      { biomarkerId: estradiol.id, label: "Estradiol", exact: false },
      { biomarkerId: estradiol.id, label: "E2", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: estradiol.id,
        fromUnit: "pg/mL",
        toUnit: "pmol/L",
        conversionType: "ratio",
        multiplier: 3.671,
        notes: "Estradiol conversion: pg/mL × 3.671 = pmol/L",
      },
      {
        biomarkerId: estradiol.id,
        fromUnit: "pmol/L",
        toUnit: "pg/mL",
        conversionType: "ratio",
        multiplier: 0.2724,
        notes: "Estradiol conversion: pmol/L × 0.2724 = pg/mL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: estradiol.id,
        unit: "pg/mL",
        sex: "male",
        low: 10,
        high: 40,
        criticalLow: 5,
        criticalHigh: 60,
        source: "Endocrine Society",
      },
      {
        biomarkerId: estradiol.id,
        unit: "pg/mL",
        sex: "female",
        low: 30,
        high: 400,
        criticalLow: 15,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ Estradiol (E2) seeded");

    // 42. DHEA-S
    const [dheas] = await db
      .insert(biomarkers)
      .values({
        name: "DHEA-S",
        category: "Hormonal & Endocrine",
        canonicalUnit: "μg/dL",
        displayUnitPreference: "μg/dL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: dheas.id, label: "DHEA-S", exact: true },
      { biomarkerId: dheas.id, label: "DHEA Sulfate", exact: true },
      { biomarkerId: dheas.id, label: "Dehydroepiandrosterone Sulfate", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: dheas.id,
        fromUnit: "μg/dL",
        toUnit: "μmol/L",
        conversionType: "ratio",
        multiplier: 0.02714,
        notes: "DHEA-S conversion: μg/dL × 0.02714 = μmol/L",
      },
      {
        biomarkerId: dheas.id,
        fromUnit: "μmol/L",
        toUnit: "μg/dL",
        conversionType: "ratio",
        multiplier: 36.85,
        notes: "DHEA-S conversion: μmol/L × 36.85 = μg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: dheas.id,
        unit: "μg/dL",
        sex: "any",
        low: 80,
        high: 560,
        criticalLow: 40,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ DHEA-S seeded");

    // 43. Cortisol (AM)
    const [cortisolAm] = await db
      .insert(biomarkers)
      .values({
        name: "Cortisol (AM)",
        category: "Hormonal & Endocrine",
        canonicalUnit: "μg/dL",
        displayUnitPreference: "μg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: cortisolAm.id, label: "Cortisol (AM)", exact: true },
      { biomarkerId: cortisolAm.id, label: "Morning Cortisol", exact: false },
      { biomarkerId: cortisolAm.id, label: "AM Cortisol", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: cortisolAm.id,
        fromUnit: "μg/dL",
        toUnit: "nmol/L",
        conversionType: "ratio",
        multiplier: 27.59,
        notes: "Cortisol conversion: μg/dL × 27.59 = nmol/L",
      },
      {
        biomarkerId: cortisolAm.id,
        fromUnit: "nmol/L",
        toUnit: "μg/dL",
        conversionType: "ratio",
        multiplier: 0.0362,
        notes: "Cortisol conversion: nmol/L × 0.0362 = μg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: cortisolAm.id,
        unit: "μg/dL",
        sex: "any",
        low: 6,
        high: 23,
        criticalLow: 3,
        criticalHigh: 30,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ Cortisol (AM) seeded");

    // 44. Cortisol (PM)
    const [cortisolPm] = await db
      .insert(biomarkers)
      .values({
        name: "Cortisol (PM)",
        category: "Hormonal & Endocrine",
        canonicalUnit: "μg/dL",
        displayUnitPreference: "μg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: cortisolPm.id, label: "Cortisol (PM)", exact: true },
      { biomarkerId: cortisolPm.id, label: "Evening Cortisol", exact: false },
      { biomarkerId: cortisolPm.id, label: "PM Cortisol", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: cortisolPm.id,
        fromUnit: "μg/dL",
        toUnit: "nmol/L",
        conversionType: "ratio",
        multiplier: 27.59,
        notes: "Cortisol conversion: μg/dL × 27.59 = nmol/L",
      },
      {
        biomarkerId: cortisolPm.id,
        fromUnit: "nmol/L",
        toUnit: "μg/dL",
        conversionType: "ratio",
        multiplier: 0.0362,
        notes: "Cortisol conversion: nmol/L × 0.0362 = μg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: cortisolPm.id,
        unit: "μg/dL",
        sex: "any",
        low: 3,
        high: 16,
        criticalLow: 1,
        criticalHigh: 20,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ Cortisol (PM) seeded");

    // 45. Insulin
    const [insulin] = await db
      .insert(biomarkers)
      .values({
        name: "Insulin",
        category: "Hormonal & Endocrine",
        canonicalUnit: "μIU/mL",
        displayUnitPreference: "μIU/mL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: insulin.id, label: "Insulin", exact: true },
      { biomarkerId: insulin.id, label: "Fasting Insulin", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: insulin.id,
        unit: "μIU/mL",
        sex: "any",
        context: { fasting: true },
        low: 2,
        high: 20,
        criticalHigh: 30,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ Insulin seeded");

    // 46. C-Peptide
    const [cPeptide] = await db
      .insert(biomarkers)
      .values({
        name: "C-Peptide",
        category: "Hormonal & Endocrine",
        canonicalUnit: "ng/mL",
        displayUnitPreference: "ng/mL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: cPeptide.id, label: "C-Peptide", exact: true },
      { biomarkerId: cPeptide.id, label: "Connecting Peptide", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: cPeptide.id,
        unit: "ng/mL",
        sex: "any",
        low: 0.9,
        high: 4.0,
        criticalLow: 0.5,
        criticalHigh: 5.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ C-Peptide seeded");

    // 47. LH
    const [lh] = await db
      .insert(biomarkers)
      .values({
        name: "LH",
        category: "Hormonal & Endocrine",
        canonicalUnit: "mIU/mL",
        displayUnitPreference: "mIU/mL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: lh.id, label: "LH", exact: true },
      { biomarkerId: lh.id, label: "Luteinizing Hormone", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: lh.id,
        unit: "mIU/mL",
        sex: "any",
        low: 1.5,
        high: 9.3,
        criticalLow: 0.5,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ LH seeded");

    // 48. FSH
    const [fsh] = await db
      .insert(biomarkers)
      .values({
        name: "FSH",
        category: "Hormonal & Endocrine",
        canonicalUnit: "mIU/mL",
        displayUnitPreference: "mIU/mL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: fsh.id, label: "FSH", exact: true },
      { biomarkerId: fsh.id, label: "Follicle Stimulating Hormone", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: fsh.id,
        unit: "mIU/mL",
        sex: "any",
        low: 1.4,
        high: 18.1,
        criticalLow: 0.5,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ FSH seeded");

    // 49. Prolactin
    const [prolactin] = await db
      .insert(biomarkers)
      .values({
        name: "Prolactin",
        category: "Hormonal & Endocrine",
        canonicalUnit: "ng/mL",
        displayUnitPreference: "ng/mL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: prolactin.id, label: "Prolactin", exact: true },
      { biomarkerId: prolactin.id, label: "PRL", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: prolactin.id,
        fromUnit: "ng/mL",
        toUnit: "μg/L",
        conversionType: "ratio",
        multiplier: 1,
        notes: "Prolactin conversion: ng/mL × 1 = μg/L (same value)",
      },
      {
        biomarkerId: prolactin.id,
        fromUnit: "μg/L",
        toUnit: "ng/mL",
        conversionType: "ratio",
        multiplier: 1,
        notes: "Prolactin conversion: μg/L × 1 = ng/mL (same value)",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: prolactin.id,
        unit: "ng/mL",
        sex: "any",
        low: 2,
        high: 18,
        criticalHigh: 25,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ Prolactin seeded");

    // 50. IGF-1
    const [igf1] = await db
      .insert(biomarkers)
      .values({
        name: "IGF-1",
        category: "Hormonal & Endocrine",
        canonicalUnit: "ng/mL",
        displayUnitPreference: "ng/mL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: igf1.id, label: "IGF-1", exact: true },
      { biomarkerId: igf1.id, label: "Insulin-like Growth Factor 1", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: igf1.id,
        unit: "ng/mL",
        sex: "any",
        low: 115,
        high: 307,
        criticalLow: 80,
        source: "Endocrine Society",
      },
    ]);

    console.log("✅ IGF-1 seeded");

    // ==================== METABOLIC & DIABETES ====================

    // 51. Fasting Glucose
    const [fastingGlucose] = await db
      .insert(biomarkers)
      .values({
        name: "Fasting Glucose",
        category: "Metabolic & Diabetes",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: fastingGlucose.id, label: "Fasting Glucose", exact: true },
      { biomarkerId: fastingGlucose.id, label: "FBG", exact: true },
      { biomarkerId: fastingGlucose.id, label: "Fasting Blood Glucose", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: fastingGlucose.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.0555,
        notes: "Glucose conversion: mg/dL × 0.0555 = mmol/L",
      },
      {
        biomarkerId: fastingGlucose.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 18.0182,
        notes: "Glucose conversion: mmol/L × 18.0182 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: fastingGlucose.id,
        unit: "mg/dL",
        sex: "any",
        context: { fasting: true },
        low: 70,
        high: 100,
        criticalLow: 50,
        criticalHigh: 125,
        source: "ADA 2023 Guidelines",
      },
    ]);

    console.log("✅ Fasting Glucose seeded");

    // 52. HbA1c
    const [hba1c] = await db
      .insert(biomarkers)
      .values({
        name: "HbA1c",
        category: "Metabolic & Diabetes",
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
        low: 4.0,
        high: 5.6,
        criticalHigh: 6.5,
        source: "ADA 2023 Guidelines",
      },
    ]);

    console.log("✅ HbA1c seeded");

    // 53. HOMA-IR
    const [homaIr] = await db
      .insert(biomarkers)
      .values({
        name: "HOMA-IR",
        category: "Metabolic & Diabetes",
        canonicalUnit: "score",
        displayUnitPreference: "score",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: homaIr.id, label: "HOMA-IR", exact: true },
      { biomarkerId: homaIr.id, label: "Homeostatic Model Assessment for Insulin Resistance", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: homaIr.id,
        unit: "score",
        sex: "any",
        low: null,
        high: 2.0,
        criticalHigh: 3.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ HOMA-IR seeded");

    // 54. Fructosamine
    const [fructosamine] = await db
      .insert(biomarkers)
      .values({
        name: "Fructosamine",
        category: "Metabolic & Diabetes",
        canonicalUnit: "μmol/L",
        displayUnitPreference: "μmol/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: fructosamine.id, label: "Fructosamine", exact: true },
      { biomarkerId: fructosamine.id, label: "Glycated Serum Protein", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: fructosamine.id,
        unit: "μmol/L",
        sex: "any",
        low: 200,
        high: 285,
        criticalHigh: 320,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Fructosamine seeded");

    // ==================== LIVER & KIDNEY FUNCTION ====================

    // 55. GGT
    const [ggt] = await db
      .insert(biomarkers)
      .values({
        name: "GGT",
        category: "Liver & Kidney Function",
        canonicalUnit: "U/L",
        displayUnitPreference: "U/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: ggt.id, label: "GGT", exact: true },
      { biomarkerId: ggt.id, label: "Gamma-Glutamyl Transferase", exact: true },
      { biomarkerId: ggt.id, label: "Gamma GT", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: ggt.id,
        unit: "U/L",
        sex: "any",
        low: null,
        high: 55,
        criticalHigh: 100,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ GGT seeded");

    // 56. eGFR
    const [egfr] = await db
      .insert(biomarkers)
      .values({
        name: "eGFR",
        category: "Liver & Kidney Function",
        canonicalUnit: "mL/min",
        displayUnitPreference: "mL/min",
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
        unit: "mL/min",
        sex: "any",
        low: 60,
        high: 120,
        criticalLow: 30,
        source: "KDIGO 2012",
      },
    ]);

    console.log("✅ eGFR seeded");

    // 57. Uric Acid
    const [uricAcid] = await db
      .insert(biomarkers)
      .values({
        name: "Uric Acid",
        category: "Liver & Kidney Function",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: uricAcid.id, label: "Uric Acid", exact: true },
      { biomarkerId: uricAcid.id, label: "Urate", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: uricAcid.id,
        fromUnit: "mg/dL",
        toUnit: "μmol/L",
        conversionType: "ratio",
        multiplier: 59.48,
        notes: "Uric Acid conversion: mg/dL × 59.48 = μmol/L",
      },
      {
        biomarkerId: uricAcid.id,
        fromUnit: "μmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 0.0168,
        notes: "Uric Acid conversion: μmol/L × 0.0168 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: uricAcid.id,
        unit: "mg/dL",
        sex: "any",
        low: 3.5,
        high: 7.2,
        criticalLow: 2.0,
        criticalHigh: 9.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Uric Acid seeded");

    // ==================== NUTRITIONAL & VITAMIN STATUS ====================

    // 58. Vitamin D (25-OH)
    const [vitD] = await db
      .insert(biomarkers)
      .values({
        name: "Vitamin D (25-OH)",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "ng/mL",
        displayUnitPreference: "ng/mL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: vitD.id, label: "Vitamin D (25-OH)", exact: true },
      { biomarkerId: vitD.id, label: "Vitamin D", exact: false },
      { biomarkerId: vitD.id, label: "25-OH Vitamin D", exact: false },
      { biomarkerId: vitD.id, label: "25-Hydroxyvitamin D", exact: false },
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
    ]);

    console.log("✅ Vitamin D seeded");

    // 59. Vitamin B12
    const [vitB12] = await db
      .insert(biomarkers)
      .values({
        name: "Vitamin B12",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "pg/mL",
        displayUnitPreference: "pg/mL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: vitB12.id, label: "Vitamin B12", exact: true },
      { biomarkerId: vitB12.id, label: "B12", exact: false },
      { biomarkerId: vitB12.id, label: "Cobalamin", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: vitB12.id,
        fromUnit: "pg/mL",
        toUnit: "pmol/L",
        conversionType: "ratio",
        multiplier: 0.7378,
        notes: "Vitamin B12 conversion: pg/mL × 0.7378 = pmol/L",
      },
      {
        biomarkerId: vitB12.id,
        fromUnit: "pmol/L",
        toUnit: "pg/mL",
        conversionType: "ratio",
        multiplier: 1.355,
        notes: "Vitamin B12 conversion: pmol/L × 1.355 = pg/mL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: vitB12.id,
        unit: "pg/mL",
        sex: "any",
        low: 200,
        high: 900,
        criticalLow: 150,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Vitamin B12 seeded");

    // 60. Folate (B9)
    const [folate] = await db
      .insert(biomarkers)
      .values({
        name: "Folate (B9)",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "ng/mL",
        displayUnitPreference: "ng/mL",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: folate.id, label: "Folate (B9)", exact: true },
      { biomarkerId: folate.id, label: "Folate", exact: false },
      { biomarkerId: folate.id, label: "Folic Acid", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: folate.id,
        unit: "ng/mL",
        sex: "any",
        low: 2.7,
        high: 17,
        criticalLow: 2.0,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Folate seeded");

    // 61. Ferritin
    const [ferritin] = await db
      .insert(biomarkers)
      .values({
        name: "Ferritin",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "ng/mL",
        displayUnitPreference: "ng/mL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: ferritin.id, label: "Ferritin", exact: true },
      { biomarkerId: ferritin.id, label: "Serum Ferritin", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: ferritin.id,
        fromUnit: "ng/mL",
        toUnit: "μg/L",
        conversionType: "ratio",
        multiplier: 1,
        notes: "Ferritin conversion: ng/mL × 1 = μg/L (same value)",
      },
      {
        biomarkerId: ferritin.id,
        fromUnit: "μg/L",
        toUnit: "ng/mL",
        conversionType: "ratio",
        multiplier: 1,
        notes: "Ferritin conversion: μg/L × 1 = ng/mL (same value)",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: ferritin.id,
        unit: "ng/mL",
        sex: "any",
        low: 30,
        high: 200,
        criticalLow: 15,
        criticalHigh: 300,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Ferritin seeded");

    // 62. Iron
    const [iron] = await db
      .insert(biomarkers)
      .values({
        name: "Iron",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "μg/dL",
        displayUnitPreference: "μg/dL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: iron.id, label: "Iron", exact: true },
      { biomarkerId: iron.id, label: "Serum Iron", exact: false },
      { biomarkerId: iron.id, label: "Fe", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: iron.id,
        fromUnit: "μg/dL",
        toUnit: "μmol/L",
        conversionType: "ratio",
        multiplier: 0.1791,
        notes: "Iron conversion: μg/dL × 0.1791 = μmol/L",
      },
      {
        biomarkerId: iron.id,
        fromUnit: "μmol/L",
        toUnit: "μg/dL",
        conversionType: "ratio",
        multiplier: 5.587,
        notes: "Iron conversion: μmol/L × 5.587 = μg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: iron.id,
        unit: "μg/dL",
        sex: "any",
        low: 60,
        high: 170,
        criticalLow: 40,
        criticalHigh: 200,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Iron seeded");

    // 63. TIBC
    const [tibc] = await db
      .insert(biomarkers)
      .values({
        name: "TIBC",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "μg/dL",
        displayUnitPreference: "μg/dL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: tibc.id, label: "TIBC", exact: true },
      { biomarkerId: tibc.id, label: "Total Iron Binding Capacity", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: tibc.id,
        unit: "μg/dL",
        sex: "any",
        low: 250,
        high: 450,
        criticalLow: 200,
        criticalHigh: 500,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ TIBC seeded");

    // 64. Transferrin Saturation
    const [transferrinSat] = await db
      .insert(biomarkers)
      .values({
        name: "Transferrin Saturation",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "%",
        displayUnitPreference: "%",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: transferrinSat.id, label: "Transferrin Saturation", exact: true },
      { biomarkerId: transferrinSat.id, label: "TSAT", exact: false },
      { biomarkerId: transferrinSat.id, label: "Iron Saturation", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: transferrinSat.id,
        unit: "%",
        sex: "any",
        low: 20,
        high: 50,
        criticalLow: 15,
        criticalHigh: 60,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Transferrin Saturation seeded");

    // 65. Magnesium
    const [magnesium] = await db
      .insert(biomarkers)
      .values({
        name: "Magnesium",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "mg/dL",
        displayUnitPreference: "mg/dL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: magnesium.id, label: "Magnesium", exact: true },
      { biomarkerId: magnesium.id, label: "Mg", exact: true },
    ]);

    await db.insert(biomarkerUnits).values([
      {
        biomarkerId: magnesium.id,
        fromUnit: "mg/dL",
        toUnit: "mmol/L",
        conversionType: "ratio",
        multiplier: 0.411,
        notes: "Magnesium conversion: mg/dL × 0.411 = mmol/L",
      },
      {
        biomarkerId: magnesium.id,
        fromUnit: "mmol/L",
        toUnit: "mg/dL",
        conversionType: "ratio",
        multiplier: 2.431,
        notes: "Magnesium conversion: mmol/L × 2.431 = mg/dL",
      },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: magnesium.id,
        unit: "mg/dL",
        sex: "any",
        low: 1.7,
        high: 2.2,
        criticalLow: 1.2,
        criticalHigh: 2.8,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Magnesium seeded");

    // 66. Zinc
    const [zinc] = await db
      .insert(biomarkers)
      .values({
        name: "Zinc",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "μg/dL",
        displayUnitPreference: "μg/dL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: zinc.id, label: "Zinc", exact: true },
      { biomarkerId: zinc.id, label: "Zn", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: zinc.id,
        unit: "μg/dL",
        sex: "any",
        low: 70,
        high: 120,
        criticalLow: 50,
        criticalHigh: 150,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Zinc seeded");

    // 67. Copper
    const [copper] = await db
      .insert(biomarkers)
      .values({
        name: "Copper",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "μg/dL",
        displayUnitPreference: "μg/dL",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: copper.id, label: "Copper", exact: true },
      { biomarkerId: copper.id, label: "Cu", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: copper.id,
        unit: "μg/dL",
        sex: "any",
        low: 70,
        high: 140,
        criticalLow: 50,
        criticalHigh: 180,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Copper seeded");

    // 68. Selenium
    const [selenium] = await db
      .insert(biomarkers)
      .values({
        name: "Selenium",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "μg/L",
        displayUnitPreference: "μg/L",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: selenium.id, label: "Selenium", exact: true },
      { biomarkerId: selenium.id, label: "Se", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: selenium.id,
        unit: "μg/L",
        sex: "any",
        low: 70,
        high: 150,
        criticalLow: 50,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ Selenium seeded");

    // 69. Omega-3 Index
    const [omega3] = await db
      .insert(biomarkers)
      .values({
        name: "Omega-3 Index",
        category: "Nutritional & Vitamin Status",
        canonicalUnit: "%",
        displayUnitPreference: "%",
        precision: 1,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: omega3.id, label: "Omega-3 Index", exact: true },
      { biomarkerId: omega3.id, label: "O3I", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: omega3.id,
        unit: "%",
        sex: "any",
        low: 8,
        high: 12,
        criticalLow: 4,
        source: "OmegaQuant Analytics",
      },
    ]);

    console.log("✅ Omega-3 Index seeded");

    // ==================== INFLAMMATION & IMMUNE MARKERS ====================

    // 70. CRP
    const [crp] = await db
      .insert(biomarkers)
      .values({
        name: "CRP",
        category: "Inflammation & Immune Markers",
        canonicalUnit: "mg/L",
        displayUnitPreference: "mg/L",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: crp.id, label: "CRP", exact: true },
      { biomarkerId: crp.id, label: "C-Reactive Protein", exact: true },
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
    ]);

    console.log("✅ CRP seeded");

    // 71. ESR
    const [esr] = await db
      .insert(biomarkers)
      .values({
        name: "ESR",
        category: "Inflammation & Immune Markers",
        canonicalUnit: "mm/hr",
        displayUnitPreference: "mm/hr",
        precision: 0,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: esr.id, label: "ESR", exact: true },
      { biomarkerId: esr.id, label: "Erythrocyte Sedimentation Rate", exact: true },
      { biomarkerId: esr.id, label: "Sed Rate", exact: false },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: esr.id,
        unit: "mm/hr",
        sex: "any",
        low: null,
        high: 20,
        criticalHigh: 50,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ ESR seeded");

    // 72. IL-6
    const [il6] = await db
      .insert(biomarkers)
      .values({
        name: "IL-6",
        category: "Inflammation & Immune Markers",
        canonicalUnit: "pg/mL",
        displayUnitPreference: "pg/mL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: il6.id, label: "IL-6", exact: true },
      { biomarkerId: il6.id, label: "Interleukin-6", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: il6.id,
        unit: "pg/mL",
        sex: "any",
        low: null,
        high: 5,
        criticalHigh: 10,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ IL-6 seeded");

    // 73. TNF-alpha
    const [tnfAlpha] = await db
      .insert(biomarkers)
      .values({
        name: "TNF-alpha",
        category: "Inflammation & Immune Markers",
        canonicalUnit: "pg/mL",
        displayUnitPreference: "pg/mL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: tnfAlpha.id, label: "TNF-alpha", exact: true },
      { biomarkerId: tnfAlpha.id, label: "Tumor Necrosis Factor Alpha", exact: true },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: tnfAlpha.id,
        unit: "pg/mL",
        sex: "any",
        low: null,
        high: 8.1,
        criticalHigh: 15,
        source: "Clinical Laboratory Standards",
      },
    ]);

    console.log("✅ TNF-alpha seeded");

    console.log("\n🎉 Biomarker seeding completed successfully!");
    console.log("📊 Summary:");
    console.log("  - 70 biomarkers seeded");
    console.log("  - 150+ synonyms added");
    console.log("  - 40+ unit conversions (bidirectional)");
    console.log("  - 100+ reference ranges with context");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding biomarkers:", error);
    process.exit(1);
  }
}

seedBiomarkers();
