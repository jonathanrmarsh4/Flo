/**
 * Age Calculation Utility
 * 
 * For privacy, we only store birth year (not full DOB).
 * To minimize calculation error, we assume each user was born on July 1st (mid-year).
 * This keeps age calculations within ±6 months accuracy.
 */

/**
 * Calculate age from birth year using July 1st mid-year assumption
 * @param birthYear - The year of birth (e.g., 1985)
 * @returns Age in years, or null if birthYear is invalid
 */
export function calculateAgeFromBirthYear(birthYear: number | null | undefined): number | null {
  if (!birthYear || birthYear < 1900 || birthYear > new Date().getFullYear()) {
    return null;
  }
  
  // Assume born July 1st of birth year for ±6 month accuracy
  const assumedBirthDate = new Date(birthYear, 6, 1); // July 1st (month is 0-indexed)
  const now = new Date();
  
  // Calculate age in years using precise millisecond calculation
  const ageInMs = now.getTime() - assumedBirthDate.getTime();
  const ageInYears = Math.floor(ageInMs / (365.25 * 24 * 60 * 60 * 1000));
  
  return ageInYears;
}

/**
 * Calculate age in decimal years for more precise calculations (e.g., PhenoAge)
 * @param birthYear - The year of birth (e.g., 1985)
 * @returns Age in decimal years (e.g., 39.5), or null if birthYear is invalid
 */
export function calculatePreciseAgeFromBirthYear(birthYear: number | null | undefined): number | null {
  if (!birthYear || birthYear < 1900 || birthYear > new Date().getFullYear()) {
    return null;
  }
  
  // Assume born July 1st of birth year for ±6 month accuracy
  const assumedBirthDate = new Date(birthYear, 6, 1);
  const now = new Date();
  
  // Calculate age in decimal years
  const ageInMs = now.getTime() - assumedBirthDate.getTime();
  const ageInYears = ageInMs / (365.25 * 24 * 60 * 60 * 1000);
  
  return Math.round(ageInYears * 10) / 10; // Round to 1 decimal place
}
