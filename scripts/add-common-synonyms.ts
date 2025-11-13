import { db } from "../server/db";
import { biomarkers, biomarkerSynonyms } from "../shared/schema";
import { eq } from "drizzle-orm";

async function addCommonSynonyms() {
  console.log("🔄 Adding common biomarker synonyms...");

  try {
    // Hemoglobin - British spelling
    const hemoglobin = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "Hemoglobin")
    });
    if (hemoglobin) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: hemoglobin.id, label: "Haemoglobin", exact: true },
      ]).onConflictDoNothing();
      console.log("✅ Added Haemoglobin synonym");
    }

    // Triglycerides - singular form
    const triglycerides = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "Triglycerides")
    });
    if (triglycerides) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: triglycerides.id, label: "Triglyceride", exact: true },
      ]).onConflictDoNothing();
      console.log("✅ Added Triglyceride synonym");
    }

    // Estradiol - British spelling
    const estradiol = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "Estradiol (E2)")
    });
    if (estradiol) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: estradiol.id, label: "Oestradiol", exact: true },
        { biomarkerId: estradiol.id, label: "Estradiol", exact: true },
      ]).onConflictDoNothing();
      console.log("✅ Added Oestradiol/Estradiol synonyms");
    }

    // Free T4 - alternative names
    const freeT4 = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "Free T4")
    });
    if (freeT4) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: freeT4.id, label: "Free Thyroxine", exact: true },
        { biomarkerId: freeT4.id, label: "Free Thyroxine (FT4)", exact: true },
        { biomarkerId: freeT4.id, label: "FT4", exact: true },
      ]).onConflictDoNothing();
      console.log("✅ Added Free Thyroxine synonyms");
    }

    // Free T3 - alternative names
    const freeT3 = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "Free T3")
    });
    if (freeT3) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: freeT3.id, label: "Free Tri-iodothyronine", exact: true },
        { biomarkerId: freeT3.id, label: "Free Tri-iodothyronine (FT3)", exact: true },
        { biomarkerId: freeT3.id, label: "FT3", exact: true },
      ]).onConflictDoNothing();
      console.log("✅ Added Free Tri-iodothyronine synonyms");
    }

    // hs-CRP - no hyphen variant
    const hsCRP = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "hs-CRP")
    });
    if (hsCRP) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: hsCRP.id, label: "hsCRP", exact: true },
      ]).onConflictDoNothing();
      console.log("✅ Added hsCRP synonym");
    }

    // DHEA-S - alternative spellings
    const dheas = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "DHEA-S")
    });
    if (dheas) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: dheas.id, label: "DHEA-Sulphate", exact: true },
        { biomarkerId: dheas.id, label: "DHEA Sulfate", exact: true },
        { biomarkerId: dheas.id, label: "DHEA Sulphate", exact: true },
      ]).onConflictDoNothing();
      console.log("✅ Added DHEA-Sulphate synonyms");
    }

    // Cortisol AM - generic cortisol name
    const cortisolAM = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "Cortisol (AM)")
    });
    if (cortisolAM) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: cortisolAM.id, label: "Serum Cortisol", exact: false },
        { biomarkerId: cortisolAM.id, label: "Cortisol", exact: false },
      ]).onConflictDoNothing();
      console.log("✅ Added Serum Cortisol synonyms");
    }

    // WBC - full name
    const wbc = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "WBC")
    });
    if (wbc) {
      // Check if synonym already exists
      const existing = await db.query.biomarkerSynonyms.findFirst({
        where: eq(biomarkerSynonyms.label, "White Cell Count")
      });
      if (!existing) {
        await db.insert(biomarkerSynonyms).values([
          { biomarkerId: wbc.id, label: "White Cell Count", exact: true },
        ]);
        console.log("✅ Added White Cell Count synonym");
      }
    }

    // Calcium - adjusted calcium
    const calcium = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "Calcium")
    });
    if (calcium) {
      await db.insert(biomarkerSynonyms).values([
        { biomarkerId: calcium.id, label: "Adjusted Calcium", exact: true },
        { biomarkerId: calcium.id, label: "Corrected Calcium", exact: true },
      ]).onConflictDoNothing();
      console.log("✅ Added Adjusted Calcium synonyms");
    }

    console.log("✅ Common synonyms added successfully!");
  } catch (error) {
    console.error("❌ Error adding synonyms:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

addCommonSynonyms();
