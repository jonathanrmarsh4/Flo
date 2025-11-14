import { z } from "zod";

export const CountryCode = z.enum(["US", "CA", "GB", "AU", "NZ"]);
export type CountryCode = z.infer<typeof CountryCode>;

export interface BiomarkerUnitConvention {
  biomarkerName: string;
  preferredUnit: string;
  alternateUnits?: string[];
}

export const countryUnitConventions: Record<CountryCode, BiomarkerUnitConvention[]> = {
  US: [
    { biomarkerName: "Glucose", preferredUnit: "mg/dL" },
    { biomarkerName: "Cholesterol", preferredUnit: "mg/dL" },
    { biomarkerName: "Triglycerides", preferredUnit: "mg/dL" },
    { biomarkerName: "HDL", preferredUnit: "mg/dL" },
    { biomarkerName: "LDL", preferredUnit: "mg/dL" },
    { biomarkerName: "Creatinine", preferredUnit: "mg/dL" },
    { biomarkerName: "Uric Acid", preferredUnit: "mg/dL" },
    { biomarkerName: "Calcium", preferredUnit: "mg/dL" },
    { biomarkerName: "Testosterone", preferredUnit: "ng/dL" },
    { biomarkerName: "Free Testosterone", preferredUnit: "pg/mL" },
    { biomarkerName: "DHEA-S", preferredUnit: "ug/dL", alternateUnits: ["mcg/dL"] },
    { biomarkerName: "Estradiol", preferredUnit: "pg/mL" },
    { biomarkerName: "Progesterone", preferredUnit: "ng/mL" },
    { biomarkerName: "Cortisol", preferredUnit: "ug/dL", alternateUnits: ["mcg/dL"] },
    { biomarkerName: "SHBG", preferredUnit: "nmol/L" },
    { biomarkerName: "TSH", preferredUnit: "mIU/L", alternateUnits: ["uIU/mL"] },
    { biomarkerName: "Free T4", preferredUnit: "ng/dL" },
    { biomarkerName: "Free T3", preferredUnit: "pg/mL" },
    { biomarkerName: "Vitamin D", preferredUnit: "ng/mL" },
    { biomarkerName: "Vitamin B12", preferredUnit: "pg/mL" },
    { biomarkerName: "Folate", preferredUnit: "ng/mL" },
    { biomarkerName: "Ferritin", preferredUnit: "ng/mL" },
    { biomarkerName: "Iron", preferredUnit: "ug/dL", alternateUnits: ["mcg/dL"] },
    { biomarkerName: "IGF-1", preferredUnit: "ng/mL" },
    { biomarkerName: "Insulin", preferredUnit: "uIU/mL", alternateUnits: ["mIU/L"] },
    { biomarkerName: "C-Peptide", preferredUnit: "ng/mL" },
    { biomarkerName: "HbA1c", preferredUnit: "%" },
    { biomarkerName: "PSA", preferredUnit: "ng/mL" },
    { biomarkerName: "Prolactin", preferredUnit: "ng/mL" },
    { biomarkerName: "FSH", preferredUnit: "mIU/mL", alternateUnits: ["IU/L"] },
    { biomarkerName: "LH", preferredUnit: "mIU/mL", alternateUnits: ["IU/L"] },
    { biomarkerName: "hCG", preferredUnit: "mIU/mL" },
    { biomarkerName: "Homocysteine", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "CRP", preferredUnit: "mg/L" },
    { biomarkerName: "hs-CRP", preferredUnit: "mg/L" },
    { biomarkerName: "Apolipoprotein B", preferredUnit: "mg/dL" },
    { biomarkerName: "Apolipoprotein A1", preferredUnit: "mg/dL" },
    { biomarkerName: "Lp(a)", preferredUnit: "nmol/L", alternateUnits: ["mg/dL"] },
  ],
  CA: [
    { biomarkerName: "Glucose", preferredUnit: "mmol/L", alternateUnits: ["mg/dL"] },
    { biomarkerName: "Cholesterol", preferredUnit: "mmol/L", alternateUnits: ["mg/dL"] },
    { biomarkerName: "Triglycerides", preferredUnit: "mmol/L", alternateUnits: ["mg/dL"] },
    { biomarkerName: "HDL", preferredUnit: "mmol/L", alternateUnits: ["mg/dL"] },
    { biomarkerName: "LDL", preferredUnit: "mmol/L", alternateUnits: ["mg/dL"] },
    { biomarkerName: "Creatinine", preferredUnit: "umol/L", alternateUnits: ["µmol/L", "mg/dL"] },
    { biomarkerName: "Uric Acid", preferredUnit: "umol/L", alternateUnits: ["µmol/L", "mg/dL"] },
    { biomarkerName: "Calcium", preferredUnit: "mmol/L", alternateUnits: ["mg/dL"] },
    { biomarkerName: "Testosterone", preferredUnit: "nmol/L", alternateUnits: ["ng/dL"] },
    { biomarkerName: "Free Testosterone", preferredUnit: "pmol/L", alternateUnits: ["pg/mL"] },
    { biomarkerName: "DHEA-S", preferredUnit: "umol/L", alternateUnits: ["µmol/L", "ug/dL"] },
    { biomarkerName: "Estradiol", preferredUnit: "pmol/L", alternateUnits: ["pg/mL"] },
    { biomarkerName: "Progesterone", preferredUnit: "nmol/L", alternateUnits: ["ng/mL"] },
    { biomarkerName: "Cortisol", preferredUnit: "nmol/L", alternateUnits: ["ug/dL"] },
    { biomarkerName: "SHBG", preferredUnit: "nmol/L" },
    { biomarkerName: "TSH", preferredUnit: "mIU/L" },
    { biomarkerName: "Free T4", preferredUnit: "pmol/L", alternateUnits: ["ng/dL"] },
    { biomarkerName: "Free T3", preferredUnit: "pmol/L", alternateUnits: ["pg/mL"] },
    { biomarkerName: "Vitamin D", preferredUnit: "nmol/L", alternateUnits: ["ng/mL"] },
    { biomarkerName: "Vitamin B12", preferredUnit: "pmol/L", alternateUnits: ["pg/mL"] },
    { biomarkerName: "Folate", preferredUnit: "nmol/L", alternateUnits: ["ng/mL"] },
    { biomarkerName: "Ferritin", preferredUnit: "ug/L", alternateUnits: ["µg/L", "ng/mL"] },
    { biomarkerName: "Iron", preferredUnit: "umol/L", alternateUnits: ["µmol/L", "ug/dL"] },
    { biomarkerName: "IGF-1", preferredUnit: "nmol/L", alternateUnits: ["ng/mL"] },
    { biomarkerName: "Insulin", preferredUnit: "pmol/L", alternateUnits: ["mIU/L"] },
    { biomarkerName: "C-Peptide", preferredUnit: "nmol/L", alternateUnits: ["ng/mL"] },
    { biomarkerName: "HbA1c", preferredUnit: "%" },
    { biomarkerName: "PSA", preferredUnit: "ug/L", alternateUnits: ["µg/L", "ng/mL"] },
    { biomarkerName: "Prolactin", preferredUnit: "ug/L", alternateUnits: ["µg/L", "ng/mL"] },
    { biomarkerName: "FSH", preferredUnit: "IU/L" },
    { biomarkerName: "LH", preferredUnit: "IU/L" },
    { biomarkerName: "hCG", preferredUnit: "IU/L" },
    { biomarkerName: "Homocysteine", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "CRP", preferredUnit: "mg/L" },
    { biomarkerName: "hs-CRP", preferredUnit: "mg/L" },
    { biomarkerName: "Apolipoprotein B", preferredUnit: "g/L", alternateUnits: ["mg/dL"] },
    { biomarkerName: "Apolipoprotein A1", preferredUnit: "g/L", alternateUnits: ["mg/dL"] },
    { biomarkerName: "Lp(a)", preferredUnit: "nmol/L", alternateUnits: ["mg/dL"] },
  ],
  GB: [
    { biomarkerName: "Glucose", preferredUnit: "mmol/L" },
    { biomarkerName: "Cholesterol", preferredUnit: "mmol/L" },
    { biomarkerName: "Triglycerides", preferredUnit: "mmol/L" },
    { biomarkerName: "HDL", preferredUnit: "mmol/L" },
    { biomarkerName: "LDL", preferredUnit: "mmol/L" },
    { biomarkerName: "Creatinine", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "Uric Acid", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "Calcium", preferredUnit: "mmol/L" },
    { biomarkerName: "Testosterone", preferredUnit: "nmol/L" },
    { biomarkerName: "Free Testosterone", preferredUnit: "pmol/L" },
    { biomarkerName: "DHEA-S", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "Estradiol", preferredUnit: "pmol/L" },
    { biomarkerName: "Progesterone", preferredUnit: "nmol/L" },
    { biomarkerName: "Cortisol", preferredUnit: "nmol/L" },
    { biomarkerName: "SHBG", preferredUnit: "nmol/L" },
    { biomarkerName: "TSH", preferredUnit: "mIU/L" },
    { biomarkerName: "Free T4", preferredUnit: "pmol/L" },
    { biomarkerName: "Free T3", preferredUnit: "pmol/L" },
    { biomarkerName: "Vitamin D", preferredUnit: "nmol/L" },
    { biomarkerName: "Vitamin B12", preferredUnit: "pmol/L" },
    { biomarkerName: "Folate", preferredUnit: "nmol/L" },
    { biomarkerName: "Ferritin", preferredUnit: "ug/L", alternateUnits: ["µg/L"] },
    { biomarkerName: "Iron", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "IGF-1", preferredUnit: "nmol/L" },
    { biomarkerName: "Insulin", preferredUnit: "pmol/L" },
    { biomarkerName: "C-Peptide", preferredUnit: "nmol/L" },
    { biomarkerName: "HbA1c", preferredUnit: "mmol/mol", alternateUnits: ["%"] },
    { biomarkerName: "PSA", preferredUnit: "ug/L", alternateUnits: ["µg/L"] },
    { biomarkerName: "Prolactin", preferredUnit: "mIU/L" },
    { biomarkerName: "FSH", preferredUnit: "IU/L" },
    { biomarkerName: "LH", preferredUnit: "IU/L" },
    { biomarkerName: "hCG", preferredUnit: "IU/L" },
    { biomarkerName: "Homocysteine", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "CRP", preferredUnit: "mg/L" },
    { biomarkerName: "hs-CRP", preferredUnit: "mg/L" },
    { biomarkerName: "Apolipoprotein B", preferredUnit: "g/L" },
    { biomarkerName: "Apolipoprotein A1", preferredUnit: "g/L" },
    { biomarkerName: "Lp(a)", preferredUnit: "nmol/L" },
  ],
  AU: [
    { biomarkerName: "Glucose", preferredUnit: "mmol/L" },
    { biomarkerName: "Cholesterol", preferredUnit: "mmol/L" },
    { biomarkerName: "Triglycerides", preferredUnit: "mmol/L" },
    { biomarkerName: "HDL", preferredUnit: "mmol/L" },
    { biomarkerName: "LDL", preferredUnit: "mmol/L" },
    { biomarkerName: "Creatinine", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "Uric Acid", preferredUnit: "mmol/L" },
    { biomarkerName: "Calcium", preferredUnit: "mmol/L" },
    { biomarkerName: "Testosterone", preferredUnit: "nmol/L" },
    { biomarkerName: "Free Testosterone", preferredUnit: "pmol/L" },
    { biomarkerName: "DHEA-S", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "Estradiol", preferredUnit: "pmol/L" },
    { biomarkerName: "Progesterone", preferredUnit: "nmol/L" },
    { biomarkerName: "Cortisol", preferredUnit: "nmol/L" },
    { biomarkerName: "SHBG", preferredUnit: "nmol/L" },
    { biomarkerName: "TSH", preferredUnit: "mIU/L" },
    { biomarkerName: "Free T4", preferredUnit: "pmol/L" },
    { biomarkerName: "Free T3", preferredUnit: "pmol/L" },
    { biomarkerName: "Vitamin D", preferredUnit: "nmol/L" },
    { biomarkerName: "Vitamin B12", preferredUnit: "pmol/L" },
    { biomarkerName: "Folate", preferredUnit: "nmol/L" },
    { biomarkerName: "Ferritin", preferredUnit: "ug/L", alternateUnits: ["µg/L"] },
    { biomarkerName: "Iron", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "IGF-1", preferredUnit: "nmol/L" },
    { biomarkerName: "Insulin", preferredUnit: "mIU/L" },
    { biomarkerName: "C-Peptide", preferredUnit: "nmol/L" },
    { biomarkerName: "HbA1c", preferredUnit: "mmol/mol", alternateUnits: ["%"] },
    { biomarkerName: "PSA", preferredUnit: "ug/L", alternateUnits: ["µg/L"] },
    { biomarkerName: "Prolactin", preferredUnit: "mIU/L" },
    { biomarkerName: "FSH", preferredUnit: "IU/L" },
    { biomarkerName: "LH", preferredUnit: "IU/L" },
    { biomarkerName: "hCG", preferredUnit: "IU/L" },
    { biomarkerName: "Homocysteine", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "CRP", preferredUnit: "mg/L" },
    { biomarkerName: "hs-CRP", preferredUnit: "mg/L" },
    { biomarkerName: "Apolipoprotein B", preferredUnit: "g/L" },
    { biomarkerName: "Apolipoprotein A1", preferredUnit: "g/L" },
    { biomarkerName: "Lp(a)", preferredUnit: "nmol/L" },
  ],
  NZ: [
    { biomarkerName: "Glucose", preferredUnit: "mmol/L" },
    { biomarkerName: "Cholesterol", preferredUnit: "mmol/L" },
    { biomarkerName: "Triglycerides", preferredUnit: "mmol/L" },
    { biomarkerName: "HDL", preferredUnit: "mmol/L" },
    { biomarkerName: "LDL", preferredUnit: "mmol/L" },
    { biomarkerName: "Creatinine", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "Uric Acid", preferredUnit: "mmol/L" },
    { biomarkerName: "Calcium", preferredUnit: "mmol/L" },
    { biomarkerName: "Testosterone", preferredUnit: "nmol/L" },
    { biomarkerName: "Free Testosterone", preferredUnit: "pmol/L" },
    { biomarkerName: "DHEA-S", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "Estradiol", preferredUnit: "pmol/L" },
    { biomarkerName: "Progesterone", preferredUnit: "nmol/L" },
    { biomarkerName: "Cortisol", preferredUnit: "nmol/L" },
    { biomarkerName: "SHBG", preferredUnit: "nmol/L" },
    { biomarkerName: "TSH", preferredUnit: "mIU/L" },
    { biomarkerName: "Free T4", preferredUnit: "pmol/L" },
    { biomarkerName: "Free T3", preferredUnit: "pmol/L" },
    { biomarkerName: "Vitamin D", preferredUnit: "nmol/L" },
    { biomarkerName: "Vitamin B12", preferredUnit: "pmol/L" },
    { biomarkerName: "Folate", preferredUnit: "nmol/L" },
    { biomarkerName: "Ferritin", preferredUnit: "ug/L", alternateUnits: ["µg/L"] },
    { biomarkerName: "Iron", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "IGF-1", preferredUnit: "nmol/L" },
    { biomarkerName: "Insulin", preferredUnit: "mIU/L" },
    { biomarkerName: "C-Peptide", preferredUnit: "nmol/L" },
    { biomarkerName: "HbA1c", preferredUnit: "mmol/mol", alternateUnits: ["%"] },
    { biomarkerName: "PSA", preferredUnit: "ug/L", alternateUnits: ["µg/L"] },
    { biomarkerName: "Prolactin", preferredUnit: "mIU/L" },
    { biomarkerName: "FSH", preferredUnit: "IU/L" },
    { biomarkerName: "LH", preferredUnit: "IU/L" },
    { biomarkerName: "hCG", preferredUnit: "IU/L" },
    { biomarkerName: "Homocysteine", preferredUnit: "umol/L", alternateUnits: ["µmol/L"] },
    { biomarkerName: "CRP", preferredUnit: "mg/L" },
    { biomarkerName: "hs-CRP", preferredUnit: "mg/L" },
    { biomarkerName: "Apolipoprotein B", preferredUnit: "g/L" },
    { biomarkerName: "Apolipoprotein A1", preferredUnit: "g/L" },
    { biomarkerName: "Lp(a)", preferredUnit: "nmol/L" },
  ],
};

export function getExpectedUnitForCountry(
  biomarkerName: string,
  country: CountryCode
): string | null {
  const conventions = countryUnitConventions[country];
  const convention = conventions.find(
    (c) => c.biomarkerName.toLowerCase() === biomarkerName.toLowerCase()
  );
  return convention?.preferredUnit || null;
}

export function isValidUnitForCountry(
  biomarkerName: string,
  unit: string,
  country: CountryCode
): boolean {
  const conventions = countryUnitConventions[country];
  const convention = conventions.find(
    (c) => c.biomarkerName.toLowerCase() === biomarkerName.toLowerCase()
  );
  
  if (!convention) return true;
  
  const normalizedUnit = unit.toLowerCase().trim();
  const preferredMatch = convention.preferredUnit.toLowerCase() === normalizedUnit;
  const alternateMatch = convention.alternateUnits?.some(
    (alt) => alt.toLowerCase() === normalizedUnit
  );
  
  return preferredMatch || !!alternateMatch;
}

export const COUNTRY_NAMES: Record<CountryCode, string> = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AU: "Australia",
  NZ: "New Zealand",
};
