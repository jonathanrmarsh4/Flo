import { 
  countryUnitConventions, 
  type CountryCode,
  type BiomarkerUnitConvention
} from "../../shared/domain/countryUnitConventions";

export type ValidationSeverity = "warning" | "error";

export interface UnitValidationIssue {
  biomarkerName: string;
  extractedUnit: string;
  expectedUnits: string[];
  severity: ValidationSeverity;
  confidence: string;
  measurementId?: string;
}

export interface ValidationResult {
  issues: UnitValidationIssue[];
  hasBlockingIssues: boolean;
}

export interface ExtractedBiomarker {
  name: string;
  value: number;
  unit: string;
}

export function validateBiomarkerUnits(
  extractedBiomarkers: ExtractedBiomarker[],
  country: CountryCode
): ValidationResult {
  const conventions = countryUnitConventions[country];
  const issues: UnitValidationIssue[] = [];
  
  if (!conventions || conventions.length === 0) {
    console.warn(`[Validation] No unit conventions configured for country: ${country}. Skipping validation.`);
    return {
      issues: [],
      hasBlockingIssues: false,
    };
  }
  
  for (const biomarker of extractedBiomarkers) {
    const { name, unit } = biomarker;
    
    if (!unit || unit.trim() === "") {
      issues.push({
        biomarkerName: name,
        extractedUnit: unit || "(none)",
        expectedUnits: [],
        severity: "error",
        confidence: "No unit extracted from PDF",
      });
      continue;
    }
    
    const convention = conventions.find(
      (c: BiomarkerUnitConvention) => 
        c.biomarkerName.toLowerCase() === name.toLowerCase()
    );
    
    if (!convention) {
      continue;
    }
    
    const normalizedExtractedUnit = normalizeUnit(unit);
    const normalizedPreferredUnit = normalizeUnit(convention.preferredUnit);
    const normalizedAlternateUnits = (convention.alternateUnits || []).map(normalizeUnit);
    
    const isPreferredUnit = normalizedExtractedUnit === normalizedPreferredUnit;
    const isAlternateUnit = normalizedAlternateUnits.includes(normalizedExtractedUnit);
    
    if (!isPreferredUnit && !isAlternateUnit) {
      const expectedUnits = [convention.preferredUnit, ...(convention.alternateUnits || [])];
      
      issues.push({
        biomarkerName: name,
        extractedUnit: unit,
        expectedUnits,
        severity: "warning",
        confidence: `Expected ${convention.preferredUnit} for ${country} labs, but extracted ${unit}. This may indicate: (1) lab used non-standard unit, (2) GPT extraction error.`,
      });
    }
  }
  
  const hasBlockingIssues = issues.some(issue => issue.severity === "error");
  
  return {
    issues,
    hasBlockingIssues,
  };
}

function normalizeUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/µ/g, 'u')
    .replace(/mcg/g, 'ug')
    .replace(/\s+/g, '');
}
