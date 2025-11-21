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
  const lowerMessage = message.toLowerCase();
  
  // Regex patterns for common dosage formats
  const patterns = [
    // 0.2ml, 500mg, 1000IU (no space)
    /(\d+(?:\.\d+)?)\s*(ml|mg|mcg|iu|g|grams?|drops?)/gi,
    
    // 2 pills, 3 capsules, 1 tablet (with space)
    /(\d+(?:\.\d+)?)\s+(pills?|tablets?|capsules?|caps)/gi,
    
    // "500 mg", "0.2 ml" (with space)
    /(\d+(?:\.\d+)?)\s+(milligrams?|micrograms?|milliliters?|grams?|units?)/gi,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(message.matchAll(pattern));
    
    if (matches.length > 0) {
      // Take the first match
      const match = matches[0];
      const amount = parseFloat(match[1]);
      let unit = match[2].toLowerCase();
      
      // Normalize units
      unit = normalizeUnit(unit);
      
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
    'pill': 'pills',
    'tablet': 'tablets',
    'tablets': 'tablets',
    'capsule': 'capsules',
    'capsules': 'capsules',
    'cap': 'capsules',
    'caps': 'capsules',
    'drop': 'drops',
  };
  
  return unitMap[unit] || unit;
}
