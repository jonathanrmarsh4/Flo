// PhenoAge Biological Age Calculator
// Based on Levine et al. (2018) algorithm
// https://doi.org/10.1093/aje/kwy164

// All inputs MUST be in Levine units:
// albumin: g/L
// creatinine: µmol/L
// glucose: mmol/L
// crp: mg/dL
// lymphocytePercent: %
// mcv: fL
// rdw: %
// alkPhos: U/L
// wbc: 10^3 cells/µL (≈ 10^9/L)

export interface PhenoAgeInputs {
  ageYears: number;
  albumin_g_L: number;
  creatinine_umol_L: number;
  glucose_mmol_L: number;
  crp_mg_dL: number;
  lymphocyte_percent: number;
  mcv_fL: number;
  rdw_percent: number;
  alkPhos_U_L: number;
  wbc_10e3_per_uL: number;
}

export interface PhenoAgeResult {
  phenoAge: number;
  chronologicalAge: number;
  ageAcceleration: number;
}

// Assumes Math.log = natural log.
export function calculatePhenoAge(params: PhenoAgeInputs): number {
  const {
    ageYears,
    albumin_g_L,
    creatinine_umol_L,
    glucose_mmol_L,
    crp_mg_dL,
    lymphocyte_percent,
    mcv_fL,
    rdw_percent,
    alkPhos_U_L,
    wbc_10e3_per_uL,
  } = params;

  // 1. Basic validation & clamping for CRP
  if (crp_mg_dL <= 0) {
    throw new Error("CRP must be > 0 (mg/dL) for PhenoAge calculation.");
  }

  // 2. Linear predictor xb
  const xb =
    -19.907 +
    (-0.0336 * albumin_g_L) +
    (0.0095 * creatinine_umol_L) +
    (0.1953 * glucose_mmol_L) +
    (0.0954 * Math.log(crp_mg_dL)) +
    (-0.0120 * lymphocyte_percent) +
    (0.0268 * mcv_fL) +
    (0.3306 * rdw_percent) +
    (0.00188 * alkPhos_U_L) +
    (0.0554 * wbc_10e3_per_uL) +
    (0.0804 * ageYears);

  // 3. Mortality score M
  const M = 1 - Math.exp(-1.51714 * Math.exp(xb) / 0.0076927);

  // Protect against rounding causing 1 - M <= 0
  const oneMinusM = Math.max(1e-12, 1 - M);

  // 4. Phenotypic Age
  const phenoAge =
    141.50 + Math.log(-0.00553 * Math.log(oneMinusM)) / 0.09165;

  return phenoAge;
}

// Optional helper for "age acceleration"
export function calculatePhenoAgeAccel(phenoAge: number, chronologicalAge: number): number {
  return phenoAge - chronologicalAge; // +ve = "older than age", -ve = "younger"
}

// Unit conversion helpers to convert from common storage units to Levine units
export class UnitConverter {
  // Albumin: g/dL → g/L (multiply by 10)
  static albumin_gPerDL_to_gPerL(value: number): number {
    return value * 10;
  }

  // Creatinine: mg/dL → µmol/L (multiply by 88.4)
  static creatinine_mgPerDL_to_umolPerL(value: number): number {
    return value * 88.4;
  }

  // Glucose: mg/dL → mmol/L (divide by 18.0182)
  static glucose_mgPerDL_to_mmolPerL(value: number): number {
    return value / 18.0182;
  }

  // CRP: mg/L → mg/dL (divide by 10)
  static crp_mgPerL_to_mgPerDL(value: number): number {
    return value / 10;
  }

  // WBC: K/μL → 10^3 cells/µL (already same unit, just verify)
  static wbc_KPerUL_to_10e3PerUL(value: number): number {
    return value; // K/μL is the same as 10^3/µL
  }

  // Lymphocyte percentage: Calculate from absolute count (K/μL) and WBC (K/μL)
  static calculateLymphocytePercent(lymphocytes_KPerUL: number, wbc_KPerUL: number): number {
    if (wbc_KPerUL <= 0) {
      throw new Error("WBC must be > 0 to calculate lymphocyte percentage");
    }
    return (lymphocytes_KPerUL / wbc_KPerUL) * 100;
  }
}

// Helper to validate all required inputs are present
export function validatePhenoAgeInputs(inputs: Partial<PhenoAgeInputs>): { valid: boolean; missing: string[] } {
  const required: Array<keyof PhenoAgeInputs> = [
    'ageYears',
    'albumin_g_L',
    'creatinine_umol_L',
    'glucose_mmol_L',
    'crp_mg_dL',
    'lymphocyte_percent',
    'mcv_fL',
    'rdw_percent',
    'alkPhos_U_L',
    'wbc_10e3_per_uL',
  ];

  const missing = required.filter(key => {
    const value = inputs[key];
    return value === undefined || value === null || isNaN(value as number);
  });

  return {
    valid: missing.length === 0,
    missing,
  };
}
