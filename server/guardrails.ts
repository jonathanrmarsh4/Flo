// AI Guardrails v1 - Clinical triage, data quality, and safety rules for blood work analysis

export type ClinicalBand = 'GREEN' | 'AMBER' | 'RED' | 'BLACK';

export interface BiomarkerObservation {
  analyte_canonical: string;
  analyte_display: string;
  value_canonical: number | null;
  value_canonical_unit: string;
  value_original: string | null;
  unit_original: string | null;
  reference_range: {
    low: number | null;
    high: number | null;
    unit: string | null;
    source: 'PROVIDED' | 'DEFAULT_DATABASE';
  };
  flag: 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | 'NORMAL' | 'UNKNOWN';
  clinical_band: ClinicalBand;
  notes: string[];
  normalization_status: 'OK' | 'FAILED' | 'AMBIGUOUS';
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  suggested_actions: string[];
}

export interface ConfidenceScores {
  overall: number;
  components: {
    ocr_quality?: number;
    parser_confidence: number;
    normalization_confidence: number;
    range_consistency: number;
  };
}

// BLACK band critical thresholds (require urgent medical attention)
const CRITICAL_THRESHOLDS: Record<string, { low?: number; high?: number; unit: string; notes?: string }> = {
  'POTASSIUM': { high: 6.5, low: 2.5, unit: 'mmol/L', notes: 'Cardiac arrhythmia risk' },
  'SODIUM': { low: 120, high: 160, unit: 'mmol/L', notes: 'Neurological risk' },
  'GLUCOSE_FASTING': { low: 2.5, high: 20, unit: 'mmol/L', notes: '45-360 mg/dL equivalent' },
  'GLUCOSE': { low: 2.5, high: 20, unit: 'mmol/L', notes: 'Any glucose reading' },
  'HEMOGLOBIN': { low: 70, unit: 'g/L', notes: 'Severe anemia' },
  'PLATELETS': { low: 20, unit: '10^9/L', notes: 'Bleeding risk' },
  'WBC': { low: 1.0, high: 50, unit: '10^9/L', notes: 'Immune/infection concern' },
  'CREATININE': { high: 500, unit: 'umol/L', notes: 'Acute kidney injury indicator' },
  'TROPONIN': { high: 0.04, unit: 'ng/mL', notes: 'Varies by assay - MI threshold' },
  'INR': { high: 5.0, unit: 'ratio', notes: 'Bleeding risk on anticoagulation' },
  'CO2': { low: 15, high: 40, unit: 'mmol/L', notes: 'Bicarbonate/respiratory issue' },
  'CALCIUM': { low: 1.9, high: 3.0, unit: 'mmol/L', notes: 'Cardiac/neuromuscular risk' },
  'MAGNESIUM': { low: 0.5, high: 2.5, unit: 'mmol/L', notes: 'Arrhythmia/seizure risk' },
};

// Unit conversion tables
const UNIT_CONVERSIONS: Record<string, Record<string, { from: string; to: string; factor: number; offset?: number }>> = {
  'GLUCOSE': {
    'mg/dL_to_mmol/L': { from: 'mg/dL', to: 'mmol/L', factor: 0.0555 },
    'mmol/L_to_mg/dL': { from: 'mmol/L', to: 'mg/dL', factor: 18.0 },
  },
  'CHOLESTEROL': {
    'mg/dL_to_mmol/L': { from: 'mg/dL', to: 'mmol/L', factor: 0.0259 },
    'mmol/L_to_mg/dL': { from: 'mmol/L', to: 'mg/dL', factor: 38.67 },
  },
  'LDL': {
    'mg/dL_to_mmol/L': { from: 'mg/dL', to: 'mmol/L', factor: 0.0259 },
    'mmol/L_to_mg/dL': { from: 'mmol/L', to: 'mg/dL', factor: 38.67 },
  },
  'HDL': {
    'mg/dL_to_mmol/L': { from: 'mg/dL', to: 'mmol/L', factor: 0.0259 },
    'mmol/L_to_mg/dL': { from: 'mmol/L', to: 'mg/dL', factor: 38.67 },
  },
  'TRIGLYCERIDES': {
    'mg/dL_to_mmol/L': { from: 'mg/dL', to: 'mmol/L', factor: 0.0113 },
    'mmol/L_to_mg/dL': { from: 'mmol/L', to: 'mg/dL', factor: 88.5 },
  },
};

// Plausibility ranges (reject biologically impossible values)
const PLAUSIBILITY_RANGES: Record<string, { min: number; max: number; unit: string }> = {
  'SODIUM': { min: 100, max: 200, unit: 'mmol/L' },
  'POTASSIUM': { min: 1.5, max: 10, unit: 'mmol/L' },
  'GLUCOSE': { min: 1, max: 50, unit: 'mmol/L' },
  'HEMOGLOBIN': { min: 30, max: 220, unit: 'g/L' },
  'HEMATOCRIT': { min: 10, max: 80, unit: '%' },
  'WBC': { min: 0.1, max: 100, unit: '10^9/L' },
  'PLATELETS': { min: 10, max: 2000, unit: '10^9/L' },
  'CREATININE': { min: 10, max: 2000, unit: 'umol/L' },
  'ALT': { min: 0, max: 5000, unit: 'U/L' },
  'AST': { min: 0, max: 5000, unit: 'U/L' },
};

// Age and sex-specific reference ranges (simplified defaults)
const REFERENCE_RANGES: Record<string, { low: number; high: number; unit: string; age_min?: number; age_max?: number; sex?: 'M' | 'F' }[]> = {
  'GLUCOSE_FASTING': [
    { low: 3.9, high: 5.6, unit: 'mmol/L' }, // 70-100 mg/dL
  ],
  'HBA1C': [
    { low: 4.0, high: 5.6, unit: '%' },
  ],
  'CHOLESTEROL_TOTAL': [
    { low: 3.9, high: 5.2, unit: 'mmol/L' }, // < 200 mg/dL
  ],
  'LDL': [
    { low: 1.5, high: 3.4, unit: 'mmol/L' }, // < 100 mg/dL optimal
  ],
  'HDL': [
    { low: 1.0, high: 10.0, unit: 'mmol/L', sex: 'M' }, // > 40 mg/dL
    { low: 1.3, high: 10.0, unit: 'mmol/L', sex: 'F' }, // > 50 mg/dL
  ],
  'TRIGLYCERIDES': [
    { low: 0.5, high: 1.7, unit: 'mmol/L' }, // < 150 mg/dL
  ],
  'CREATININE': [
    { low: 62, high: 106, unit: 'umol/L', sex: 'M' },
    { low: 44, high: 80, unit: 'umol/L', sex: 'F' },
  ],
  'HEMOGLOBIN': [
    { low: 135, high: 175, unit: 'g/L', sex: 'M' },
    { low: 120, high: 155, unit: 'g/L', sex: 'F' },
  ],
};

/**
 * Data Quality Check: Validate units and biological plausibility
 */
export function performDataQualityCheck(
  analyte: string,
  value: number | null,
  unit: string | null
): { status: 'OK' | 'WARNING' | 'ERROR'; message?: string } {
  if (value === null) {
    return { status: 'WARNING', message: 'Value is null' };
  }

  if (!unit) {
    return { status: 'ERROR', message: 'Unit is missing' };
  }

  // Check plausibility
  const plausible = PLAUSIBILITY_RANGES[analyte];
  if (plausible && plausible.unit === unit) {
    if (value < plausible.min || value > plausible.max) {
      return {
        status: 'ERROR',
        message: `Value ${value} ${unit} is outside plausible range (${plausible.min}-${plausible.max} ${plausible.unit}). Likely data error.`,
      };
    }
  }

  return { status: 'OK' };
}

/**
 * Compute clinical band based on value and reference range
 */
export function computeClinicalBand(
  analyte: string,
  value: number | null,
  referenceRange: { low: number | null; high: number | null; unit: string | null },
  symptoms?: string[]
): ClinicalBand {
  if (value === null) return 'GREEN';

  // Check for CRITICAL thresholds (BLACK band)
  const critical = CRITICAL_THRESHOLDS[analyte];
  if (critical && referenceRange.unit === critical.unit) {
    if (critical.low && value <= critical.low) return 'BLACK';
    if (critical.high && value >= critical.high) return 'BLACK';
  }

  // Check for symptoms that force BLACK band regardless of value
  const urgentSymptoms = ['chest_pain', 'stroke_signs', 'syncope', 'severe_bleeding', 'confusion'];
  if (symptoms && symptoms.some(s => urgentSymptoms.includes(s))) {
    return 'BLACK';
  }

  // Normal range logic
  if (referenceRange.low !== null && referenceRange.high !== null) {
    const rangeWidth = referenceRange.high - referenceRange.low;
    const borderlineThreshold = rangeWidth * 0.1; // 10% margin

    // GREEN: within range
    if (value >= referenceRange.low && value <= referenceRange.high) {
      return 'GREEN';
    }

    // AMBER: borderline (within 10% of range boundary)
    if (
      (value < referenceRange.low && value >= referenceRange.low - borderlineThreshold) ||
      (value > referenceRange.high && value <= referenceRange.high + borderlineThreshold)
    ) {
      return 'AMBER';
    }

    // RED: abnormal but not critical
    return 'RED';
  }

  // If no reference range, default to GREEN
  return 'GREEN';
}

/**
 * Generate suggested next steps based on clinical band (per AI Guardrails v1 specification)
 */
export function generateSuggestedActions(
  analyte: string,
  band: ClinicalBand,
  value: number | null
): { type: string; when?: string; reason: string }[] {
  const actions: { type: string; when?: string; reason: string }[] = [];

  switch (band) {
    case 'BLACK':
      actions.push({
        type: 'urgent_care',
        reason: 'Result may need urgent medical attention',
      });
      break;

    case 'RED':
      actions.push({
        type: 'discuss_with_clinician',
        when: '1-2 weeks',
        reason: 'Abnormal result requires timely clinician review',
      });
      actions.push({
        type: 'retest',
        when: '2-4 weeks',
        reason: 'Confirm result with repeat measurement',
      });
      break;

    case 'AMBER':
      actions.push({
        type: 'retest',
        when: '4-12 weeks',
        reason: 'Confirm direction after dietary/exercise focus',
      });
      actions.push({
        type: 'discuss_with_clinician',
        reason: 'Discuss at next routine visit for overall context',
      });
      break;

    case 'GREEN':
      actions.push({
        type: 'maintain',
        reason: 'Result within normal range - continue current practices',
      });
      break;
  }

  return actions;
}

/**
 * Validate the entire report structure and return validation results
 */
export function validateReport(observations: BiomarkerObservation[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestedActions: string[] = [];

  // Check for missing units
  observations.forEach(obs => {
    if (!obs.value_canonical_unit) {
      errors.push(`Missing unit for ${obs.analyte_display}`);
    }

    if (obs.normalization_status === 'FAILED') {
      warnings.push(`Failed to normalize ${obs.analyte_display}`);
    }

    if (obs.normalization_status === 'AMBIGUOUS') {
      warnings.push(`Ambiguous normalization for ${obs.analyte_display} - please verify`);
    }

    if (obs.clinical_band === 'BLACK') {
      suggestedActions.push(`URGENT: ${obs.analyte_display} requires immediate medical attention`);
    }

    if (obs.clinical_band === 'RED') {
      suggestedActions.push(`Schedule clinician review for abnormal ${obs.analyte_display}`);
    }
  });

  // Check for data quality issues
  const failedNormalization = observations.filter(o => o.normalization_status === 'FAILED').length;
  if (failedNormalization > observations.length * 0.2) {
    warnings.push(`High normalization failure rate (${failedNormalization}/${observations.length})`);
    suggestedActions.push('Verify units and values with your lab report');
  }

  return { errors, warnings, suggested_actions: suggestedActions };
}

/**
 * Calculate overall confidence score
 */
export function calculateConfidence(
  observations: BiomarkerObservation[],
  ocrQuality?: number
): ConfidenceScores {
  const normalizedCount = observations.filter(o => o.normalization_status === 'OK').length;
  const normalizationConfidence = observations.length > 0 ? normalizedCount / observations.length : 0;

  const withRanges = observations.filter(o => o.reference_range.low !== null || o.reference_range.high !== null).length;
  const rangeConsistency = observations.length > 0 ? withRanges / observations.length : 0;

  const parserConfidence = observations.length > 0 ? 0.95 : 0; // Simplified, would be more complex in real implementation

  const overall = (
    (ocrQuality || 1.0) * 0.3 +
    parserConfidence * 0.3 +
    normalizationConfidence * 0.2 +
    rangeConsistency * 0.2
  );

  return {
    overall,
    components: {
      ocr_quality: ocrQuality,
      parser_confidence: parserConfidence,
      normalization_confidence: normalizationConfidence,
      range_consistency: rangeConsistency,
    },
  };
}

/**
 * Get the urgent care banner text for BLACK band (exact specification from AI Guardrails v1)
 */
export function getUrgentCareBanner(): string {
  return "Your result may need urgent medical attention. If you have concerning symptoms (e.g., chest pain, severe shortness of breath, confusion, fainting, bleeding), seek urgent care now or call local emergency services.";
}

/**
 * Enforce safety rules: check for disallowed content in AI responses (enhanced pattern matching)
 */
export function enforceSafetyRules(aiResponse: any): { safe: boolean; violations: string[] } {
  const violations: string[] = [];
  const responseText = JSON.stringify(aiResponse).toLowerCase();

  // Disallowed phrases (literal)
  const disallowedPhrases = [
    'you have',
    'diagnosed with',
    'diagnosis of',
    'diagnosis:',
    'prescribe',
    'prescription for',
    'cure',
    'start taking',
    'stop taking',
    'you should take',
    'recommended dose',
    'your doctor is wrong',
  ];

  disallowedPhrases.forEach(phrase => {
    if (responseText.includes(phrase)) {
      violations.push(`Disallowed phrase detected: "${phrase}"`);
    }
  });

  // Pattern-based checks for doses
  const dosePatterns = [
    /\b\d+(?:\.\d+)?\s?(?:mg|mcg|g|units?|tablets?|capsules?)\b/gi,
    /take\s+\d+/gi,
    /\d+\s+times?\s+(?:per|a)\s+day/gi,
  ];

  dosePatterns.forEach((pattern, idx) => {
    if (pattern.test(responseText)) {
      violations.push(`Dose pattern detected (pattern ${idx + 1})`);
    }
  });

  // Common medication names (sample list - would be expanded)
  const medications = [
    'metformin',
    'insulin',
    'statin',
    'atorvastatin',
    'lisinopril',
    'warfarin',
    'aspirin',
    'ibuprofen',
  ];

  medications.forEach(med => {
    const medRegex = new RegExp(`\\b${med}\\b`, 'gi');
    if (medRegex.test(responseText)) {
      violations.push(`Medication name detected: "${med}"`);
    }
  });

  return {
    safe: violations.length === 0,
    violations,
  };
}
