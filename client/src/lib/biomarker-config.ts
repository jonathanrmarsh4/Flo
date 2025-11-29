// Extracted from Flō GitHub design - complete biomarker configurations

export interface BiomarkerConfig {
  unit: string;
  min: number;
  max: number;
  category: string;
}

export const CATEGORIES = [
  'All',
  'Basic Panels',
  'Lipid & Cardiovascular Health',
  'Hormonal & Endocrine',
  'Metabolic & Diabetes',
  'Liver & Kidney Function',
  'Nutritional & Vitamin Status',
  'Inflammation & Immune Markers',
  'Cardiometabolic & Advanced Panels',
  'Infectious Disease & General Health',
  'Longevity & Specialized Panels'
];

export const BIOMARKER_CONFIGS: Record<string, BiomarkerConfig> = {
  // Basic Panels
  'RBC': { unit: 'M/μL', min: 4.2, max: 5.9, category: 'Basic Panels' },
  'WBC': { unit: 'K/μL', min: 4.5, max: 11.0, category: 'Basic Panels' },
  'Hemoglobin': { unit: 'g/dL', min: 12, max: 17, category: 'Basic Panels' },
  'Hematocrit': { unit: '%', min: 36, max: 50, category: 'Basic Panels' },
  'MCV': { unit: 'fL', min: 80, max: 100, category: 'Basic Panels' },
  'MCH': { unit: 'pg', min: 27, max: 33, category: 'Basic Panels' },
  'Platelets': { unit: 'K/μL', min: 150, max: 400, category: 'Basic Panels' },
  'Glucose': { unit: 'mg/dL', min: 70, max: 100, category: 'Basic Panels' },
  'Glucose (Fasting)': { unit: 'mg/dL', min: 70, max: 100, category: 'Basic Panels' },
  'Calcium': { unit: 'mg/dL', min: 8.5, max: 10.5, category: 'Basic Panels' },
  'Sodium': { unit: 'mEq/L', min: 135, max: 145, category: 'Basic Panels' },
  'Potassium': { unit: 'mEq/L', min: 3.5, max: 5.0, category: 'Basic Panels' },
  'CO2': { unit: 'mEq/L', min: 23, max: 29, category: 'Basic Panels' },
  'Chloride': { unit: 'mEq/L', min: 96, max: 106, category: 'Basic Panels' },
  'BUN': { unit: 'mg/dL', min: 7, max: 20, category: 'Basic Panels' },
  'Creatinine': { unit: 'mg/dL', min: 0.7, max: 1.3, category: 'Basic Panels' },
  'ALT': { unit: 'U/L', min: 7, max: 56, category: 'Basic Panels' },
  'AST': { unit: 'U/L', min: 10, max: 40, category: 'Basic Panels' },
  'ALP': { unit: 'U/L', min: 30, max: 120, category: 'Basic Panels' },
  'Bilirubin': { unit: 'mg/dL', min: 0.1, max: 1.2, category: 'Basic Panels' },
  'Total Protein': { unit: 'g/dL', min: 6.0, max: 8.3, category: 'Basic Panels' },
  'Albumin': { unit: 'g/dL', min: 3.5, max: 5.5, category: 'Basic Panels' },
  
  // Lipid & Cardiovascular Health
  'Total Cholesterol': { unit: 'mg/dL', min: 125, max: 200, category: 'Lipid & Cardiovascular Health' },
  'HDL': { unit: 'mg/dL', min: 40, max: 100, category: 'Lipid & Cardiovascular Health' },
  'HDL Cholesterol': { unit: 'mg/dL', min: 40, max: 100, category: 'Lipid & Cardiovascular Health' },
  'LDL': { unit: 'mg/dL', min: 50, max: 100, category: 'Lipid & Cardiovascular Health' },
  'LDL Cholesterol': { unit: 'mg/dL', min: 50, max: 100, category: 'Lipid & Cardiovascular Health' },
  'Triglycerides': { unit: 'mg/dL', min: 50, max: 150, category: 'Lipid & Cardiovascular Health' },
  'Non-HDL Cholesterol': { unit: 'mg/dL', min: 60, max: 130, category: 'Lipid & Cardiovascular Health' },
  'ApoA1': { unit: 'mg/dL', min: 120, max: 180, category: 'Lipid & Cardiovascular Health' },
  'ApoB': { unit: 'mg/dL', min: 40, max: 100, category: 'Lipid & Cardiovascular Health' },
  'Lipoprotein(a)': { unit: 'mg/dL', min: 0, max: 30, category: 'Lipid & Cardiovascular Health' },
  'hs-CRP': { unit: 'mg/L', min: 0, max: 3, category: 'Lipid & Cardiovascular Health' },
  'Homocysteine': { unit: 'μmol/L', min: 5, max: 15, category: 'Lipid & Cardiovascular Health' },
  
  // Hormonal & Endocrine
  'TSH': { unit: 'mIU/L', min: 0.5, max: 4.5, category: 'Hormonal & Endocrine' },
  'Free T3': { unit: 'pg/mL', min: 2.3, max: 4.2, category: 'Hormonal & Endocrine' },
  'Free T4': { unit: 'ng/dL', min: 0.8, max: 1.8, category: 'Hormonal & Endocrine' },
  'Reverse T3': { unit: 'ng/dL', min: 9, max: 27, category: 'Hormonal & Endocrine' },
  'Anti-TPO': { unit: 'IU/mL', min: 0, max: 35, category: 'Hormonal & Endocrine' },
  'Anti-TG': { unit: 'IU/mL', min: 0, max: 40, category: 'Hormonal & Endocrine' },
  'Total Testosterone': { unit: 'ng/dL', min: 300, max: 1000, category: 'Hormonal & Endocrine' },
  'Free Testosterone': { unit: 'pg/mL', min: 50, max: 200, category: 'Hormonal & Endocrine' },
  'SHBG': { unit: 'nmol/L', min: 20, max: 60, category: 'Hormonal & Endocrine' },
  'Estradiol (E2)': { unit: 'pg/mL', min: 10, max: 40, category: 'Hormonal & Endocrine' },
  'DHEA-S': { unit: 'μg/dL', min: 80, max: 560, category: 'Hormonal & Endocrine' },
  'Cortisol (AM)': { unit: 'μg/dL', min: 6, max: 23, category: 'Hormonal & Endocrine' },
  'Cortisol (PM)': { unit: 'μg/dL', min: 3, max: 16, category: 'Hormonal & Endocrine' },
  'Insulin': { unit: 'μIU/mL', min: 2, max: 20, category: 'Hormonal & Endocrine' },
  'C-Peptide': { unit: 'ng/mL', min: 0.9, max: 4.0, category: 'Hormonal & Endocrine' },
  'LH': { unit: 'mIU/mL', min: 1.5, max: 9.3, category: 'Hormonal & Endocrine' },
  'FSH': { unit: 'mIU/mL', min: 1.4, max: 18.1, category: 'Hormonal & Endocrine' },
  'Prolactin': { unit: 'ng/mL', min: 2, max: 18, category: 'Hormonal & Endocrine' },
  'IGF-1': { unit: 'ng/mL', min: 115, max: 307, category: 'Hormonal & Endocrine' },
  'PSA': { unit: 'ng/mL', min: 0, max: 4.0, category: 'Hormonal & Endocrine' },
  'Prostate-Specific Antigen': { unit: 'ng/mL', min: 0, max: 4.0, category: 'Hormonal & Endocrine' },
  
  // Metabolic & Diabetes
  'Fasting Glucose': { unit: 'mg/dL', min: 70, max: 100, category: 'Metabolic & Diabetes' },
  'HbA1c': { unit: '%', min: 4, max: 5.6, category: 'Metabolic & Diabetes' },
  'HOMA-IR': { unit: 'score', min: 0, max: 2.0, category: 'Metabolic & Diabetes' },
  'Fructosamine': { unit: 'μmol/L', min: 200, max: 285, category: 'Metabolic & Diabetes' },
  
  // Liver & Kidney Function
  'GGT': { unit: 'U/L', min: 0, max: 55, category: 'Liver & Kidney Function' },
  'eGFR': { unit: 'mL/min', min: 60, max: 120, category: 'Liver & Kidney Function' },
  'Uric Acid': { unit: 'mg/dL', min: 3.5, max: 7.2, category: 'Liver & Kidney Function' },
  
  // Nutritional & Vitamin Status
  'Vitamin D (25-OH)': { unit: 'ng/mL', min: 30, max: 100, category: 'Nutritional & Vitamin Status' },
  'Vitamin B12': { unit: 'pg/mL', min: 200, max: 900, category: 'Nutritional & Vitamin Status' },
  'Folate (B9)': { unit: 'ng/mL', min: 2.7, max: 17, category: 'Nutritional & Vitamin Status' },
  'Ferritin': { unit: 'ng/mL', min: 30, max: 200, category: 'Nutritional & Vitamin Status' },
  'Iron': { unit: 'μg/dL', min: 60, max: 170, category: 'Nutritional & Vitamin Status' },
  'TIBC': { unit: 'μg/dL', min: 250, max: 450, category: 'Nutritional & Vitamin Status' },
  'Transferrin Saturation': { unit: '%', min: 20, max: 50, category: 'Nutritional & Vitamin Status' },
  'Magnesium': { unit: 'mg/dL', min: 1.7, max: 2.2, category: 'Nutritional & Vitamin Status' },
  'Zinc': { unit: 'μg/dL', min: 70, max: 120, category: 'Nutritional & Vitamin Status' },
  'Copper': { unit: 'μg/dL', min: 70, max: 140, category: 'Nutritional & Vitamin Status' },
  'Selenium': { unit: 'μg/L', min: 70, max: 150, category: 'Nutritional & Vitamin Status' },
  'Omega-3 Index': { unit: '%', min: 8, max: 12, category: 'Nutritional & Vitamin Status' },
  
  // Inflammation & Immune Markers
  'CRP': { unit: 'mg/L', min: 0, max: 3, category: 'Inflammation & Immune Markers' },
  'ESR': { unit: 'mm/hr', min: 0, max: 20, category: 'Inflammation & Immune Markers' },
  'IL-6': { unit: 'pg/mL', min: 0, max: 5, category: 'Inflammation & Immune Markers' },
  'TNF-alpha': { unit: 'pg/mL', min: 0, max: 8.1, category: 'Inflammation & Immune Markers' },
};

// Derived types for type safety
export type BiomarkerKey = keyof typeof BIOMARKER_CONFIGS;
export type BiomarkerCategory = (typeof CATEGORIES)[number];

// Biomarker structure for dropdowns and display
export interface BiomarkerOption {
  id: string;
  name: string;
  unit: string;
  category: string;
}

// Precomputed biomarkers by category for efficient rendering
export const BIOMARKERS_BY_CATEGORY = Object.freeze(
  CATEGORIES.filter(cat => cat !== 'All').map(category => ({
    category,
    biomarkers: Object.entries(BIOMARKER_CONFIGS)
      .filter(([_, config]) => config.category === category)
      .map(([name, config]) => ({
        id: name.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, ''),
        name,
        unit: config.unit,
        category: config.category,
      }))
  }))
);

// Flat array of all biomarkers for search/selection
export const ALL_BIOMARKERS = Object.freeze(
  Object.entries(BIOMARKER_CONFIGS).map(([name, config]) => ({
    id: name.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, ''),
    name,
    unit: config.unit,
    category: config.category,
  }))
);
