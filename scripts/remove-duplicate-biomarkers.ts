import { db } from "../server/db";
import { biomarkers, biomarkerSynonyms, biomarkerUnits, biomarkerReferenceRanges, biomarkerMeasurements } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

async function removeDuplicateBiomarkers() {
  console.log("🧹 Removing duplicate biomarkers...");

  try {
    // Find all biomarkers with duplicates
    const duplicates = await db.execute(sql`
      SELECT name, COUNT(*) as count
      FROM biomarkers
      GROUP BY name
      HAVING COUNT(*) > 1
    `);

    console.log(`Found ${duplicates.rows.length} biomarkers with duplicates`);

    for (const row of duplicates.rows) {
      const name = row.name as string;
      console.log(`\nProcessing: ${name} (${row.count} duplicates)`);

      // Get all biomarker IDs for this name
      const allBiomarkers = await db.query.biomarkers.findMany({
        where: eq(biomarkers.name, name),
        orderBy: (biomarkers, { asc }) => [asc(biomarkers.createdAt)]
      });

      if (allBiomarkers.length <= 1) continue;

      // Keep the first one (oldest)
      const keepId = allBiomarkers[0].id;
      const deleteIds = allBiomarkers.slice(1).map(b => b.id);

      console.log(`  Keeping: ${keepId}`);
      console.log(`  Deleting: ${deleteIds.join(', ')}`);

      // Update any measurements that reference the duplicates
      for (const deleteId of deleteIds) {
        await db.execute(sql`
          UPDATE biomarker_measurements
          SET biomarker_id = ${keepId}
          WHERE biomarker_id = ${deleteId}
        `);
      }

      // Delete synonyms, units, and reference ranges for duplicates
      // (CASCADE delete will handle this automatically)
      for (const deleteId of deleteIds) {
        await db.delete(biomarkers).where(eq(biomarkers.id, deleteId));
      }

      console.log(`  ✅ Removed ${deleteIds.length} duplicates`);
    }

    console.log("\n✅ All duplicates removed successfully!");

    // Verify
    const remaining = await db.execute(sql`
      SELECT name, COUNT(*) as count
      FROM biomarkers
      GROUP BY name
      HAVING COUNT(*) > 1
    `);

    if (remaining.rows.length === 0) {
      console.log("✅ No duplicates remaining!");
    } else {
      console.log(`⚠️  Still have ${remaining.rows.length} biomarkers with duplicates`);
    }

    const totalCount = await db.execute(sql`SELECT COUNT(*) as total FROM biomarkers`);
    console.log(`\nTotal biomarkers: ${totalCount.rows[0].total}`);

  } catch (error) {
    console.error("❌ Error removing duplicates:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

removeDuplicateBiomarkers();
