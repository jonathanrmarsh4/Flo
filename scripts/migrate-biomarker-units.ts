import { db } from "../server/db";
import { biomarkerMeasurements, biomarkers, biomarkerUnits } from "../shared/schema";
import { eq } from "drizzle-orm";

function normalizeUnit(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/μ/g, 'u')
    .replace(/µ/g, 'u')
    .trim();
}

async function convertUnit(
  biomarkerId: string,
  value: number,
  fromUnit: string,
  toUnit: string
): Promise<{ convertedValue: number; formula: string } | null> {
  const normalizedFromUnit = normalizeUnit(fromUnit);
  const normalizedToUnit = normalizeUnit(toUnit);

  if (normalizedFromUnit === normalizedToUnit) {
    return null;
  }

  const allConversions = await db
    .select()
    .from(biomarkerUnits)
    .where(eq(biomarkerUnits.biomarkerId, biomarkerId));

  const conversion = allConversions.find(
    (c) =>
      normalizeUnit(c.fromUnit) === normalizedFromUnit &&
      normalizeUnit(c.toUnit) === normalizedToUnit
  );

  if (!conversion) {
    return null;
  }

  let convertedValue: number;
  let formula: string;

  if (conversion.conversionType === "ratio") {
    convertedValue = value * conversion.multiplier;
    formula = `${value} * ${conversion.multiplier} = ${convertedValue}`;
  } else {
    convertedValue = value * conversion.multiplier + conversion.offset;
    formula = `(${value} * ${conversion.multiplier}) + ${conversion.offset} = ${convertedValue}`;
  }

  return { convertedValue, formula };
}

async function migrateBiomarkerUnits() {
  console.log("🔄 Starting biomarker unit migration...\n");

  const allMeasurements = await db
    .select({
      measurement: biomarkerMeasurements,
      biomarker: biomarkers,
    })
    .from(biomarkerMeasurements)
    .innerJoin(biomarkers, eq(biomarkerMeasurements.biomarkerId, biomarkers.id));

  console.log(`📊 Found ${allMeasurements.length} biomarker measurements to check\n`);

  let recalculated = 0;
  let skipped = 0;
  let errors = 0;

  for (const { measurement, biomarker } of allMeasurements) {
    // Skip if essential data is missing
    if (!measurement.unitRaw || measurement.valueRaw === null || measurement.valueRaw === undefined || !isFinite(measurement.valueRaw)) {
      console.warn(
        `⚠️  Skipping ${biomarker.name} (ID: ${measurement.id}): missing or invalid data (unitRaw: ${measurement.unitRaw}, valueRaw: ${measurement.valueRaw})`
      );
      skipped++;
      continue;
    }

    if (measurement.valueCanonical === null) {
      console.warn(
        `⚠️  Skipping ${biomarker.name} (ID: ${measurement.id}): valueCanonical is null`
      );
      skipped++;
      continue;
    }

    const normalizedRawUnit = normalizeUnit(measurement.unitRaw);
    const normalizedCanonicalUnit = normalizeUnit(biomarker.canonicalUnit);

    if (normalizedRawUnit === normalizedCanonicalUnit) {
      skipped++;
      continue;
    }

    try {
      const conversion = await convertUnit(
        biomarker.id,
        measurement.valueRaw,
        measurement.unitRaw,
        biomarker.canonicalUnit
      );

      if (conversion) {
        const oldValue = measurement.valueCanonical;
        const newValue = conversion.convertedValue;

        if (!isFinite(newValue)) {
          console.error(
            `❌ Conversion produced invalid value for ${biomarker.name} (ID: ${measurement.id}): ${newValue}`
          );
          errors++;
          continue;
        }

        if (Math.abs(oldValue - newValue) > 0.01) {
          const displayValue = newValue.toFixed(biomarker.precision ?? 1);
          
          await db
            .update(biomarkerMeasurements)
            .set({
              valueCanonical: newValue,
              valueDisplay: displayValue,
              unitCanonical: biomarker.canonicalUnit, // Preserve original casing
              warnings: [
                ...(measurement.warnings || []),
                `Recalculated on 2025-11-15: ${oldValue} → ${newValue}`,
              ],
              updatedAt: new Date(),
            })
            .where(eq(biomarkerMeasurements.id, measurement.id));

          console.log(
            `✓ Updated ${biomarker.name}: ${oldValue} ${biomarker.canonicalUnit} → ${newValue} ${biomarker.canonicalUnit} (from ${measurement.valueRaw} ${measurement.unitRaw})`
          );
          recalculated++;
        } else {
          skipped++;
        }
      } else {
        console.warn(
          `⚠️  No conversion found for ${biomarker.name}: ${measurement.unitRaw} → ${biomarker.canonicalUnit}`
        );
        skipped++;
      }
    } catch (error: any) {
      console.error(
        `❌ Error processing ${biomarker.name} (ID: ${measurement.id}): ${error.message}`
      );
      errors++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📈 Migration Summary:");
  console.log("=".repeat(60));
  console.log(`Total measurements checked: ${allMeasurements.length}`);
  console.log(`✓ Recalculated: ${recalculated}`);
  console.log(`⊘ Skipped (no change needed): ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log("=".repeat(60) + "\n");

  if (recalculated > 0) {
    console.log("✅ Migration completed successfully!");
  } else {
    console.log("ℹ️  No values needed recalculation.");
  }
}

migrateBiomarkerUnits()
  .then(() => {
    console.log("\n✨ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error);
    process.exit(1);
  });
