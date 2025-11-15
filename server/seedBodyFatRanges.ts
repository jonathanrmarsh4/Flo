import { db } from "./db";
import { bodyFatReferenceRanges } from "@shared/schema";
import { sql } from "drizzle-orm";

async function seedBodyFatRanges() {
  console.log("Seeding body fat reference ranges...");

  // Delete existing ranges
  await db.delete(bodyFatReferenceRanges);

  // Male ranges
  const maleRanges = [
    { sex: "male" as const, label: "Athlete", minPercent: 4, maxPercent: 13, displayOrder: 1 },
    { sex: "male" as const, label: "Fit", minPercent: 14, maxPercent: 17, displayOrder: 2 },
    { sex: "male" as const, label: "Average", minPercent: 18, maxPercent: 24, displayOrder: 3 },
    { sex: "male" as const, label: "High", minPercent: 25, maxPercent: 35, displayOrder: 4 },
    { sex: "male" as const, label: "Very high", minPercent: 36, maxPercent: 60, displayOrder: 5 },
  ];

  // Female ranges
  const femaleRanges = [
    { sex: "female" as const, label: "Athlete", minPercent: 12, maxPercent: 20, displayOrder: 1 },
    { sex: "female" as const, label: "Fit", minPercent: 21, maxPercent: 24, displayOrder: 2 },
    { sex: "female" as const, label: "Average", minPercent: 25, maxPercent: 31, displayOrder: 3 },
    { sex: "female" as const, label: "High", minPercent: 32, maxPercent: 42, displayOrder: 4 },
    { sex: "female" as const, label: "Very high", minPercent: 43, maxPercent: 60, displayOrder: 5 },
  ];

  // Insert all ranges
  await db.insert(bodyFatReferenceRanges).values([...maleRanges, ...femaleRanges]);

  console.log("✓ Body fat reference ranges seeded successfully");
}

seedBodyFatRanges()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error seeding body fat ranges:", error);
    process.exit(1);
  });
