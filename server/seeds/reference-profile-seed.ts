import { db } from "../db";
import { biomarkers, referenceProfiles, referenceProfileRanges } from "@shared/schema";
import { eq, and } from "drizzle-orm";

interface ProfileRange {
  biomarkerName: string;
  unit: string;
  sex?: "any" | "male" | "female";
  ageMinY?: number;
  ageMaxY?: number;
  low?: number;
  high?: number;
  criticalLow?: number;
  criticalHigh?: number;
  notes?: string;
}

interface ProfileSeedData {
  name: string;
  countryCode?: string;
  labName?: string;
  description?: string;
  isDefault?: boolean;
  ranges: ProfileRange[];
}

const profileData: ProfileSeedData[] = [
  {
    name: "Global Default",
    description: "Default global reference ranges",
    isDefault: true,
    ranges: [
      {
        biomarkerName: "Testosterone",
        unit: "nmol/L",
        sex: "male",
        low: 10.4,
        high: 34.6,
        criticalLow: 5.0,
        notes: "Adult male range",
      },
      {
        biomarkerName: "Testosterone",
        unit: "nmol/L",
        sex: "female",
        low: 0.5,
        high: 2.4,
        notes: "Adult female range",
      },
      {
        biomarkerName: "Total Cholesterol",
        unit: "mmol/L",
        low: 3.0,
        high: 5.2,
        criticalHigh: 6.2,
      },
      {
        biomarkerName: "LDL Cholesterol",
        unit: "mmol/L",
        low: 0.0,
        high: 3.4,
        criticalHigh: 4.9,
      },
      {
        biomarkerName: "HDL Cholesterol",
        unit: "mmol/L",
        sex: "male",
        low: 1.0,
        high: 10.0,
        criticalLow: 0.9,
      },
      {
        biomarkerName: "HDL Cholesterol",
        unit: "mmol/L",
        sex: "female",
        low: 1.3,
        high: 10.0,
        criticalLow: 1.0,
      },
      {
        biomarkerName: "Triglycerides",
        unit: "mmol/L",
        low: 0.0,
        high: 1.7,
        criticalHigh: 2.3,
      },
      {
        biomarkerName: "Glucose",
        unit: "mmol/L",
        low: 3.9,
        high: 5.6,
        criticalLow: 3.0,
        criticalHigh: 7.0,
      },
      {
        biomarkerName: "HbA1c",
        unit: "%",
        low: 4.0,
        high: 5.6,
        criticalHigh: 6.5,
      },
      {
        biomarkerName: "Creatinine",
        unit: "µmol/L",
        sex: "male",
        low: 62,
        high: 106,
        criticalHigh: 133,
      },
      {
        biomarkerName: "Creatinine",
        unit: "µmol/L",
        sex: "female",
        low: 44,
        high: 80,
        criticalHigh: 106,
      },
      {
        biomarkerName: "Vitamin D",
        unit: "nmol/L",
        low: 50,
        high: 125,
        criticalLow: 25,
      },
      {
        biomarkerName: "TSH",
        unit: "mIU/L",
        low: 0.4,
        high: 4.0,
        criticalLow: 0.1,
        criticalHigh: 10.0,
      },
      {
        biomarkerName: "Free T4",
        unit: "pmol/L",
        low: 12,
        high: 22,
      },
      {
        biomarkerName: "CRP",
        unit: "mg/L",
        low: 0.0,
        high: 3.0,
        criticalHigh: 10.0,
      },
    ],
  },
  {
    name: "Australia Standard",
    countryCode: "AU",
    description: "Australian standard reference ranges",
    ranges: [
      {
        biomarkerName: "Testosterone",
        unit: "nmol/L",
        sex: "male",
        low: 10.0,
        high: 35.0,
        criticalLow: 5.0,
      },
      {
        biomarkerName: "Testosterone",
        unit: "nmol/L",
        sex: "female",
        low: 0.5,
        high: 2.5,
      },
      {
        biomarkerName: "Total Cholesterol",
        unit: "mmol/L",
        low: 3.0,
        high: 5.5,
        criticalHigh: 6.5,
      },
      {
        biomarkerName: "Glucose",
        unit: "mmol/L",
        low: 3.6,
        high: 6.0,
        criticalLow: 2.8,
        criticalHigh: 7.8,
      },
      {
        biomarkerName: "Vitamin D",
        unit: "nmol/L",
        low: 50,
        high: 150,
        criticalLow: 25,
      },
    ],
  },
  {
    name: "United States Standard",
    countryCode: "US",
    description: "US standard reference ranges (commonly using US customary units)",
    ranges: [
      {
        biomarkerName: "Testosterone",
        unit: "ng/dL",
        sex: "male",
        low: 300,
        high: 1000,
        criticalLow: 150,
      },
      {
        biomarkerName: "Testosterone",
        unit: "ng/dL",
        sex: "female",
        low: 15,
        high: 70,
      },
      {
        biomarkerName: "Total Cholesterol",
        unit: "mg/dL",
        low: 125,
        high: 200,
        criticalHigh: 240,
      },
      {
        biomarkerName: "Glucose",
        unit: "mg/dL",
        low: 70,
        high: 100,
        criticalLow: 54,
        criticalHigh: 126,
      },
      {
        biomarkerName: "Vitamin D",
        unit: "ng/mL",
        low: 20,
        high: 50,
        criticalLow: 10,
      },
    ],
  },
  {
    name: "United Kingdom Standard",
    countryCode: "UK",
    description: "UK NHS standard reference ranges",
    ranges: [
      {
        biomarkerName: "Testosterone",
        unit: "nmol/L",
        sex: "male",
        low: 9.0,
        high: 33.0,
        criticalLow: 5.0,
      },
      {
        biomarkerName: "Total Cholesterol",
        unit: "mmol/L",
        low: 3.0,
        high: 5.0,
        criticalHigh: 6.0,
      },
      {
        biomarkerName: "Glucose",
        unit: "mmol/L",
        low: 4.0,
        high: 5.9,
        criticalHigh: 7.0,
      },
    ],
  },
];

export async function seedReferenceProfiles() {
  console.log("Starting reference profile seed...");

  for (const profileSeed of profileData) {
    const existing = await db
      .select()
      .from(referenceProfiles)
      .where(eq(referenceProfiles.name, profileSeed.name))
      .limit(1);

    let profileId: string;

    if (existing.length === 0) {
      const [created] = await db
        .insert(referenceProfiles)
        .values({
          name: profileSeed.name,
          countryCode: profileSeed.countryCode,
          labName: profileSeed.labName,
          description: profileSeed.description,
          isDefault: profileSeed.isDefault || false,
        })
        .returning();
      profileId = created.id;
      console.log(`✓ Created profile: ${profileSeed.name}`);
    } else {
      profileId = existing[0].id;
      console.log(`- Profile already exists: ${profileSeed.name}`);
    }

    for (const range of profileSeed.ranges) {
      const biomarkerResult = await db
        .select()
        .from(biomarkers)
        .where(eq(biomarkers.name, range.biomarkerName))
        .limit(1);

      if (biomarkerResult.length === 0) {
        console.log(`  ✗ Biomarker not found: ${range.biomarkerName}`);
        continue;
      }

      const biomarkerId = biomarkerResult[0].id;

      const existingRange = await db
        .select()
        .from(referenceProfileRanges)
        .where(
          and(
            eq(referenceProfileRanges.profileId, profileId),
            eq(referenceProfileRanges.biomarkerId, biomarkerId),
            eq(referenceProfileRanges.unit, range.unit),
            eq(referenceProfileRanges.sex, range.sex || "any")
          )
        )
        .limit(1);

      if (existingRange.length === 0) {
        await db.insert(referenceProfileRanges).values({
          profileId,
          biomarkerId,
          unit: range.unit,
          sex: range.sex || "any",
          ageMinY: range.ageMinY,
          ageMaxY: range.ageMaxY,
          low: range.low,
          high: range.high,
          criticalLow: range.criticalLow,
          criticalHigh: range.criticalHigh,
          notes: range.notes,
        });
        const sexLabel = range.sex && range.sex !== "any" ? ` (${range.sex})` : "";
        console.log(`  ✓ Added range: ${range.biomarkerName}${sexLabel} in ${range.unit}`);
      }
    }
  }

  console.log("✓ Reference profile seed complete!");
}

seedReferenceProfiles()
  .then(() => {
    console.log("Seed completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
