import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface ParsedError {
  message: string;
  code: string;
}

export function parseApiError(error: Error | string | unknown): ParsedError {
  const errorString = typeof error === 'string' ? error : (error as Error)?.message || String(error);
  
  // Extract HTTP status code from format "500: {...}" (our apiRequest throws this)
  let statusCode = '500';
  const httpStatusMatch = errorString.match(/^(\d{3}):\s*/);
  if (httpStatusMatch) {
    statusCode = httpStatusMatch[1];
  }
  
  // Check for nested "code":503 or "status":503 patterns in JSON body
  // Nested codes are more specific and should take priority over the outer HTTP status
  const nestedCodeMatch = errorString.match(/["']?(?:code|status)["']?\s*[:\s]+\s*["']?(\d{3})["']?/i);
  if (nestedCodeMatch) {
    statusCode = nestedCodeMatch[1];
  }
  
  // Normalize the error string for keyword matching (handles nested/escaped JSON)
  const lowerError = errorString.toLowerCase().replace(/\\"/g, '"');
  
  // Define error mappings with priority order (more specific matches first)
  const errorMappings: Array<{ keywords: string[]; message: string; codePrefix: string }> = [
    { keywords: ['overloaded', 'model is overloaded'], message: 'Our AI is experiencing high demand. Please try again in a moment.', codePrefix: 'AI' },
    { keywords: ['rate limit', 'too many requests', 'quota exceeded'], message: 'Too many requests. Please wait a moment and try again.', codePrefix: 'RATE' },
    { keywords: ['unavailable', 'service unavailable'], message: 'This service is temporarily unavailable. Please try again shortly.', codePrefix: 'SVC' },
    { keywords: ['timeout', 'timed out', 'deadline exceeded'], message: 'The request took too long. Please try again.', codePrefix: 'TIME' },
    { keywords: ['unauthorized', 'not authenticated', 'authentication required'], message: 'Please sign in again to continue.', codePrefix: 'AUTH' },
    { keywords: ['forbidden', 'access denied', 'permission denied'], message: 'You don\'t have access to this feature.', codePrefix: 'PERM' },
    { keywords: ['not found', '404'], message: 'The requested data could not be found.', codePrefix: 'NF' },
    { keywords: ['network error', 'fetch failed', 'failed to fetch', 'connection refused'], message: 'Connection problem. Please check your internet and try again.', codePrefix: 'NET' },
    { keywords: ['internal server error', 'internal error'], message: 'Something went wrong on our end. Please try again.', codePrefix: 'SRV' },
  ];
  
  // Check for keyword matches
  for (const mapping of errorMappings) {
    for (const keyword of mapping.keywords) {
      if (lowerError.includes(keyword)) {
        return {
          message: mapping.message,
          code: `${mapping.codePrefix}-${statusCode}`,
        };
      }
    }
  }
  
  // Fallback based on HTTP status code
  if (statusCode === '503') {
    return { message: 'This service is temporarily unavailable. Please try again shortly.', code: 'SVC-503' };
  }
  if (statusCode === '502' || statusCode === '504') {
    return { message: 'Our servers are experiencing issues. Please try again in a moment.', code: `SVC-${statusCode}` };
  }
  if (statusCode === '401') {
    return { message: 'Please sign in again to continue.', code: 'AUTH-401' };
  }
  if (statusCode === '403') {
    return { message: 'You don\'t have access to this feature.', code: 'PERM-403' };
  }
  if (statusCode === '404') {
    return { message: 'The requested data could not be found.', code: 'NF-404' };
  }
  if (statusCode === '429') {
    return { message: 'Too many requests. Please wait a moment and try again.', code: 'RATE-429' };
  }
  
  return {
    message: 'Something went wrong. Please try again.',
    code: `ERR-${statusCode}`,
  };
}
