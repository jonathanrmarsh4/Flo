/**
 * Dosage Parser
 * 
 * Extracts dosage information from natural language
 * Supports: ml, mg, mcg, IU, pills, tablets, capsules, grams, drops
 */

export interface DosageInfo {
  amount: number;
  unit: string;
  rawText: string;
}

/**
 * Parse dosage from message
 * Examples:
 * - "0.2ml" → {amount: 0.2, unit: "ml"}
 * - "500mg" → {amount: 500, unit: "mg"}
 * - "2 pills" → {amount: 2, unit: "pills"}
 * - "1000 IU" → {amount: 1000, unit: "IU"}
 */
export function parseDosage(message: string): DosageInfo | null {
  // Don't lowercase the whole message - preserve IU casing
  
  // Regex patterns for common dosage formats
  const patterns = [
    // Leading decimal: .2ml, .5mg
    /(\.\d+)\s*(ml|mg|mcg|iu|IU|g|grams?|drops?)/gi,
    
    // Standard: 0.2ml, 500mg, 1000IU (no space)
    /(\d+(?:\.\d+)?)\s*(ml|mg|mcg|iu|IU|g|grams?|drops?)/gi,
    
    // Fractions: 1/2 tab, 1/4 pill
    /(\d+\/\d+)\s+(pills?|tablets?|capsules?|caps?|tab)/gi,
    
    // 2 pills, 3 capsules, 1 tablet (with space)
    /(\d+(?:\.\d+)?)\s+(pills?|tablets?|capsules?|caps?|tab)/gi,
    
    // "500 mg", "0.2 ml", "20 units" (with space)
    /(\d+(?:\.\d+)?)\s+(milligrams?|micrograms?|milliliters?|grams?|units?)/gi,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(message.matchAll(pattern));
    
    if (matches.length > 0) {
      // Take the first match
      const match = matches[0];
      let amount: number;
      
      // Handle fractions (e.g., "1/2")
      if (match[1].includes('/')) {
        const [numerator, denominator] = match[1].split('/').map(Number);
        amount = numerator / denominator;
      } else {
        amount = parseFloat(match[1]);
      }
      
      // Normalize units but preserve IU casing
      let unit = normalizeUnit(match[2]);
      
      return {
        amount,
        unit,
        rawText: match[0],
      };
    }
  }
  
  return null;
}

/**
 * Normalize dosage units to standard abbreviations
 */
function normalizeUnit(unit: string): string {
  const lowerUnit = unit.toLowerCase();
  
  const unitMap: Record<string, string> = {
    'milligram': 'mg',
    'milligrams': 'mg',
    'microgram': 'mcg',
    'micrograms': 'mcg',
    'milliliter': 'ml',
    'milliliters': 'ml',
    'gram': 'g',
    'grams': 'g',
    'unit': 'IU',
    'units': 'IU',
    'iu': 'IU', // Handle lowercase iu
    'pill': 'pills',
    'tablet': 'tablets',
    'tablets': 'tablets',
    'tab': 'tablets',
    'capsule': 'capsules',
    'capsules': 'capsules',
    'cap': 'capsules',
    'caps': 'capsules',
    'drop': 'drops',
    'drops': 'drops',
  };
  
  // Return normalized unit or original if already standard
  return unitMap[lowerUnit] || unit;
}
