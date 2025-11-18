import { logger } from '../logger';

interface GuardrailViolation {
  violated: boolean;
  type?: string;
  replacement?: string;
}

const EMERGENCY_KEYWORDS = [
  'chest pain',
  'shortness of breath',
  'suicidal',
  'want to die',
  'going to hurt myself',
  'hurt myself',
  'kill myself',
  'heart attack',
  'stroke symptoms',
  'severe pain',
  'can\'t breathe',
  'cannot breathe',
];

const DIAGNOSIS_PATTERNS = [
  /you have [\w\s]+ disease/i,
  /you are diagnosed with/i,
  /this means you have/i,
  /you suffer from/i,
  /stop taking [\w]+/i,
  /start taking [\w]+/i,
  /\bprescribe\b/i,
  /\bprescription\b/i,
  /you need surgery/i,
  /you should take [\w]+ medication/i,
];

const BODY_SHAMING_PHRASES = [
  /\bfat pig\b/i,
  /\blazy\b/i,
  /\bdisgusting\b/i,
  /should be ashamed/i,
  /look like garbage/i,
  /\bugly\b/i,
  /you're gross/i,
];

const OTHER_USER_PATTERNS = [
  /user_id:\s*\d+/i,
  /another user/i,
  /someone else's/i,
  /patient \d+/i,
  /other users?/i,
];

export function checkEmergencyTrigger(userInput: string): GuardrailViolation {
  const lowerInput = userInput.toLowerCase();
  
  for (const keyword of EMERGENCY_KEYWORDS) {
    if (lowerInput.includes(keyword)) {
      logger.warn(`[Guardrails] Emergency trigger detected: "${keyword}"`);
      return {
        violated: true,
        type: 'emergency',
        replacement: `[!] Please stop and call emergency services right now — this could be serious.\n\nCall 911 (US) or your local emergency number immediately.\n\nI'll be here when you're safe.`,
      };
    }
  }
  
  return { violated: false };
}

export function checkDiagnosisPatterns(assistantOutput: string): GuardrailViolation {
  for (const pattern of DIAGNOSIS_PATTERNS) {
    if (pattern.test(assistantOutput)) {
      logger.warn(`[Guardrails] Diagnosis pattern detected: ${pattern}`);
      return {
        violated: true,
        type: 'diagnosis',
        replacement: `I'm not a doctor and can't diagnose or prescribe — please discuss this with your physician. Here's what I can tell you from your data…`,
      };
    }
  }
  
  return { violated: false };
}

export function checkBodyShaming(assistantOutput: string): GuardrailViolation {
  for (const phrase of BODY_SHAMING_PHRASES) {
    if (phrase.test(assistantOutput)) {
      const match = assistantOutput.match(phrase);
      if (match && match[0]) {
        logger.warn(`[Guardrails] Body shaming phrase detected: "${match[0]}"`);
        return {
          violated: true,
          type: 'body_shaming',
        };
      }
    }
  }
  
  return { violated: false };
}

export function checkOtherUserData(assistantOutput: string): GuardrailViolation {
  for (const pattern of OTHER_USER_PATTERNS) {
    if (pattern.test(assistantOutput)) {
      logger.error(`[Guardrails] Other user data reference detected`);
      return {
        violated: true,
        type: 'data_leak',
        replacement: `I can only discuss your personal health data. I don't have access to other users' information.`,
      };
    }
  }
  
  return { violated: false };
}

export function enforceTokenLimits(userInput: string, maxTokens: number = 30000): GuardrailViolation {
  const estimatedTokens = Math.ceil(userInput.length / 4);
  
  if (estimatedTokens > maxTokens) {
    logger.warn(`[Guardrails] Input too long: ~${estimatedTokens} tokens (max ${maxTokens})`);
    return {
      violated: true,
      type: 'token_limit',
      replacement: `Your message is too long. Please try a shorter question or break it into multiple questions.`,
    };
  }
  
  return { violated: false };
}

export function sanitizeInput(userInput: string): string {
  let sanitized = userInput.trim();
  
  sanitized = sanitized.substring(0, 10000);
  
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe[^>]*>.*?<\/iframe>/gi, '');
  
  return sanitized;
}

export function sanitizeOutput(assistantOutput: string): string {
  let sanitized = assistantOutput;
  
  sanitized = sanitized.replace(/user_id:\s*\d+/gi, '[user data]');
  sanitized = sanitized.replace(/patient\s+\d+/gi, '[patient data]');
  
  return sanitized;
}

export function applyGuardrails(userInput: string, assistantOutput?: string): {
  safe: boolean;
  sanitizedInput?: string;
  sanitizedOutput?: string;
  violation?: GuardrailViolation;
} {
  const emergencyCheck = checkEmergencyTrigger(userInput);
  if (emergencyCheck.violated) {
    return {
      safe: false,
      violation: emergencyCheck,
    };
  }
  
  const tokenCheck = enforceTokenLimits(userInput);
  if (tokenCheck.violated) {
    return {
      safe: false,
      violation: tokenCheck,
    };
  }
  
  const sanitizedInput = sanitizeInput(userInput);
  
  if (assistantOutput) {
    const diagnosisCheck = checkDiagnosisPatterns(assistantOutput);
    if (diagnosisCheck.violated) {
      return {
        safe: false,
        sanitizedInput,
        violation: diagnosisCheck,
      };
    }
    
    const bodyShamingCheck = checkBodyShaming(assistantOutput);
    if (bodyShamingCheck.violated) {
      logger.error('[Guardrails] Body shaming detected - blocking response');
      return {
        safe: false,
        sanitizedInput,
        violation: {
          violated: true,
          type: 'body_shaming',
          replacement: `I apologize, but I need to rephrase that response. Let me try again with more sensitivity.`,
        },
      };
    }
    
    const dataLeakCheck = checkOtherUserData(assistantOutput);
    if (dataLeakCheck.violated) {
      return {
        safe: false,
        sanitizedInput,
        violation: dataLeakCheck,
      };
    }
    
    const sanitizedOutput = sanitizeOutput(assistantOutput);
    
    return {
      safe: true,
      sanitizedInput,
      sanitizedOutput,
    };
  }
  
  return {
    safe: true,
    sanitizedInput,
  };
}
