import { db } from "../server/db";
import { biomarkers, biomarkerSynonyms } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

async function addFormattingSynonyms() {
  console.log("🔄 Adding formatting variation synonyms...");

  try {
    // SHBG - variations with "re-std." suffix
    const shbg = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "SHBG")
    });
    if (shbg) {
      const existing = await db.query.biomarkerSynonyms.findFirst({
        where: sql`biomarker_id = ${shbg.id} AND label = 'SHBG re-std.'`
      });
      if (!existing) {
        await db.insert(biomarkerSynonyms).values([
          { biomarkerId: shbg.id, label: "SHBG re-std.", exact: true },
        ]);
        console.log("✅ Added SHBG re-std. synonym");
      }
    }

    // HDL Cholesterol - with periods
    const hdl = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "HDL Cholesterol")
    });
    if (hdl) {
      const existing = await db.query.biomarkerSynonyms.findFirst({
        where: sql`biomarker_id = ${hdl.id} AND label = 'H.D.L. Cholesterol'`
      });
      if (!existing) {
        await db.insert(biomarkerSynonyms).values([
          { biomarkerId: hdl.id, label: "H.D.L. Cholesterol", exact: true },
          { biomarkerId: hdl.id, label: "H.D.L.", exact: true },
        ]);
        console.log("✅ Added H.D.L. Cholesterol synonyms");
      }
    }

    // LDL Cholesterol - with periods
    const ldl = await db.query.biomarkers.findFirst({
      where: eq(biomarkers.name, "LDL Cholesterol")
    });
    if (ldl) {
      const existing = await db.query.biomarkerSynonyms.findFirst({
        where: sql`biomarker_id = ${ldl.id} AND label = 'L.D.L. Cholesterol'`
      });
      if (!existing) {
        await db.insert(biomarkerSynonyms).values([
          { biomarkerId: ldl.id, label: "L.D.L. Cholesterol", exact: true },
          { biomarkerId: ldl.id, label: "L.D.L.", exact: true },
        ]);
        console.log("✅ Added L.D.L. Cholesterol synonyms");
      }
    }

    console.log("✅ Formatting synonyms added successfully!");
  } catch (error) {
    console.error("❌ Error adding synonyms:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

addFormattingSynonyms();
