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
  
  const errorMappings: Record<string, { message: string; codePrefix: string }> = {
    'overloaded': { message: 'Our AI is experiencing high demand. Please try again in a moment.', codePrefix: 'AI' },
    'rate limit': { message: 'Too many requests. Please wait a moment and try again.', codePrefix: 'RATE' },
    'unavailable': { message: 'This service is temporarily unavailable. Please try again shortly.', codePrefix: 'SVC' },
    'timeout': { message: 'The request took too long. Please try again.', codePrefix: 'TIME' },
    'unauthorized': { message: 'Please sign in again to continue.', codePrefix: 'AUTH' },
    'forbidden': { message: 'You don\'t have access to this feature.', codePrefix: 'PERM' },
    'not found': { message: 'The requested data could not be found.', codePrefix: 'NF' },
    'network': { message: 'Connection problem. Please check your internet and try again.', codePrefix: 'NET' },
    'fetch': { message: 'Connection problem. Please check your internet and try again.', codePrefix: 'NET' },
  };
  
  let statusCode = '500';
  const statusMatch = errorString.match(/(?:code|status)["\s:]*(\d{3})/i);
  if (statusMatch) {
    statusCode = statusMatch[1];
  }
  
  const lowerError = errorString.toLowerCase();
  for (const [keyword, mapping] of Object.entries(errorMappings)) {
    if (lowerError.includes(keyword)) {
      return {
        message: mapping.message,
        code: `${mapping.codePrefix}-${statusCode}`,
      };
    }
  }
  
  if (statusCode === '503') {
    return { message: 'This service is temporarily unavailable. Please try again shortly.', code: `SVC-503` };
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
