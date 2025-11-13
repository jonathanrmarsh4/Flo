import { db } from "../server/db";
import {
  biomarkers,
  biomarkerSynonyms,
  biomarkerUnits,
  biomarkerReferenceRanges,
} from "../shared/schema";
import { eq } from "drizzle-orm";

async function addGrowthHormone() {
  console.log("🌱 Adding Growth Hormone...");

  try {
    // Check if it already exists
    const existing = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "Growth Hormone")
    });

    if (existing) {
      console.log("⏭️  Growth Hormone already exists");
      process.exit(0);
    }

    // Add Growth Hormone
    const [gh] = await db
      .insert(biomarkers)
      .values({
        name: "Growth Hormone",
        category: "Hormonal & Endocrine",
        canonicalUnit: "ng/mL",
        displayUnitPreference: "ng/mL",
        precision: 2,
        decimalsPolicy: "round",
      })
      .returning();

    await db.insert(biomarkerSynonyms).values([
      { biomarkerId: gh.id, label: "Growth Hormone", exact: true },
      { biomarkerId: gh.id, label: "Human Growth Hormone", exact: true },
      { biomarkerId: gh.id, label: "HGH", exact: true },
      { biomarkerId: gh.id, label: "GH", exact: true },
      { biomarkerId: gh.id, label: "Somatotropin", exact: false },
    ]);

    await db.insert(biomarkerUnits).values([
      { biomarkerId: gh.id, fromUnit: "ng/mL", toUnit: "μg/L", conversionType: "ratio", multiplier: 1, offset: 0 },
      { biomarkerId: gh.id, fromUnit: "μg/L", toUnit: "ng/mL", conversionType: "ratio", multiplier: 1, offset: 0 },
      { biomarkerId: gh.id, fromUnit: "ng/mL", toUnit: "mIU/L", conversionType: "ratio", multiplier: 3.0, offset: 0 },
      { biomarkerId: gh.id, fromUnit: "mIU/L", toUnit: "ng/mL", conversionType: "ratio", multiplier: 0.333, offset: 0 },
    ]);

    await db.insert(biomarkerReferenceRanges).values([
      {
        biomarkerId: gh.id,
        unit: "ng/mL",
        sex: "male",
        low: 0.0,
        high: 5.0,
        criticalLow: null,
        criticalHigh: 10.0,
        source: "Clinical Laboratory Standards (varies by time of day and stimulation test)",
      },
      {
        biomarkerId: gh.id,
        unit: "ng/mL",
        sex: "female",
        low: 0.0,
        high: 10.0,
        criticalLow: null,
        criticalHigh: 15.0,
        source: "Clinical Laboratory Standards (varies by time of day and stimulation test)",
      },
    ]);

    console.log("✅ Growth Hormone added successfully!");
  } catch (error) {
    console.error("❌ Error adding Growth Hormone:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

addGrowthHormone();
