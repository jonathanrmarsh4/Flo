/**
 * Utility to derive IANA timezone name from GPS coordinates
 * Uses geo-tz for accurate coordinate-based timezone lookup
 */

import { find as geoTzFind } from 'geo-tz';

/**
 * Validate if a string is a valid IANA timezone
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Derive IANA timezone name from GPS coordinates using geo-tz library
 * This is the most accurate method as it uses timezone boundary data
 * 
 * @param latitude - GPS latitude
 * @param longitude - GPS longitude
 * @returns IANA timezone name (e.g., "Australia/Perth") or null if cannot be determined
 */
export function deriveTimezoneFromCoords(latitude: number, longitude: number): string | null {
  try {
    const timezones = geoTzFind(latitude, longitude);
    
    if (timezones && timezones.length > 0) {
      const tz = timezones[0];
      if (isValidTimezone(tz)) {
        return tz;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[TimezoneFromCoords] Error deriving timezone:', error);
    return null;
  }
}

// Fallback offset-based lookup for when coordinates are not available
const OFFSET_FALLBACK: Record<number, string> = {
  0: 'UTC',
  3600: 'Europe/London',
  7200: 'Europe/Berlin',
  10800: 'Europe/Moscow',
  14400: 'Asia/Dubai',
  18000: 'Asia/Karachi',
  19800: 'Asia/Kolkata',
  21600: 'Asia/Dhaka',
  25200: 'Asia/Bangkok',
  28800: 'Asia/Singapore',
  32400: 'Asia/Tokyo',
  36000: 'Australia/Sydney',
  39600: 'Pacific/Noumea',
  43200: 'Pacific/Auckland',
  [-3600]: 'Atlantic/Azores',
  [-7200]: 'Atlantic/South_Georgia',
  [-10800]: 'America/Sao_Paulo',
  [-14400]: 'America/Halifax',
  [-18000]: 'America/New_York',
  [-21600]: 'America/Chicago',
  [-25200]: 'America/Denver',
  [-28800]: 'America/Los_Angeles',
  [-32400]: 'America/Anchorage',
  [-36000]: 'Pacific/Honolulu',
};

/**
 * Fallback: Derive IANA timezone name from timezone offset
 * Less accurate than coordinate-based lookup but works when coords unavailable
 * 
 * @param timezoneOffset - Timezone offset in seconds from UTC
 * @returns IANA timezone name or null if cannot be determined
 */
export function deriveTimezoneFromOffset(timezoneOffset: number, _countryCode?: string): string | null {
  const fallback = OFFSET_FALLBACK[timezoneOffset];
  if (fallback && isValidTimezone(fallback)) {
    return fallback;
  }
  
  // Try rounded hour offset
  const hours = Math.round(timezoneOffset / 3600);
  const rounded = hours * 3600;
  const roundedFallback = OFFSET_FALLBACK[rounded];
  if (roundedFallback && isValidTimezone(roundedFallback)) {
    return roundedFallback;
  }
  
  return null;
}
