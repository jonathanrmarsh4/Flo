/**
 * Evidence Hierarchy System for Daily Insights Engine v2.0
 * 
 * Defines 5 tiers of scientific evidence (strongest to emerging personal patterns):
 * Tier 1: Meta-analyses & RCTs
 * Tier 2: Large cohort studies (UK Biobank, NHANES, Framingham)
 * Tier 3: Strong mechanistic + multiple smaller studies
 * Tier 4: Emerging but replicated in ≥3 longevity/performance cohorts
 * Tier 5: Personal replication ≥2 times with ≥medium effect
 */

export type EvidenceTier = "1" | "2" | "3" | "4" | "5";

export interface EvidenceSource {
  tier: EvidenceTier;
  description: string;
  canTriggerFirstOccurrence: boolean; // Can this tier trigger insights before personal replication?
  minEffectSize: number; // Minimum effect size threshold (Spearman ρ or Cliff's delta)
  requiresPersonalConfirmation: boolean; // Does this tier require personal data confirmation?
}

/**
 * Evidence tier definitions with scientific rigor thresholds
 */
export const EVIDENCE_TIERS: Record<EvidenceTier, EvidenceSource> = {
  "1": {
    tier: "1",
    description: "Meta-analyses & Randomized Controlled Trials",
    canTriggerFirstOccurrence: true,
    minEffectSize: 0.20, // Lower threshold for tier 1 evidence (well-established)
    requiresPersonalConfirmation: false,
  },
  "2": {
    tier: "2",
    description: "Large cohort studies (UK Biobank, NHANES, Framingham)",
    canTriggerFirstOccurrence: true,
    minEffectSize: 0.25,
    requiresPersonalConfirmation: false,
  },
  "3": {
    tier: "3",
    description: "Strong mechanistic + multiple smaller studies",
    canTriggerFirstOccurrence: true,
    minEffectSize: 0.30,
    requiresPersonalConfirmation: false,
  },
  "4": {
    tier: "4",
    description: "Emerging but replicated in ≥3 longevity/performance cohorts",
    canTriggerFirstOccurrence: true,
    minEffectSize: 0.35,
    requiresPersonalConfirmation: false,
  },
  "5": {
    tier: "5",
    description: "Personal replication ≥2 times with ≥medium effect",
    canTriggerFirstOccurrence: false, // Requires at least 2 occurrences
    minEffectSize: 0.35,
    requiresPersonalConfirmation: true,
  },
};

/**
 * PubMed reference structure for citing scientific evidence
 */
export interface PubMedReference {
  pmid?: string; // PubMed ID
  doi?: string; // Digital Object Identifier
  authors: string; // First author et al.
  title: string;
  journal: string;
  year: number;
  url?: string; // Direct link to study
  summary: string; // One-sentence key finding
}

/**
 * Evidence-backed relationship between variables
 */
export interface EvidenceBackedRelationship {
  independent: string; // e.g., "alcohol_intake"
  dependent: string; // e.g., "sleep_deep_minutes"
  direction: "positive" | "negative" | "bidirectional"; // Correlation direction
  tier: EvidenceTier;
  mechanism: string; // Biological mechanism explanation
  references: PubMedReference[]; // Supporting studies
  effectSizeRange: { min: number; max: number }; // Expected effect size from literature
  doseDependent?: boolean; // Does effect vary with dose?
  timingDependent?: boolean; // Does timing matter (e.g., caffeine timing)?
}

/**
 * Check if a detected pattern meets evidence tier requirements
 */
export function meetsEvidenceRequirements(
  tier: EvidenceTier,
  effectSize: number,
  replicationCount: number = 1
): boolean {
  const tierReqs = EVIDENCE_TIERS[tier];
  
  // Check minimum effect size
  if (Math.abs(effectSize) < tierReqs.minEffectSize) {
    return false;
  }
  
  // Tier 5 requires at least 2 replications
  if (tier === "5" && replicationCount < 2) {
    return false;
  }
  
  return true;
}

/**
 * Get the highest applicable evidence tier for a pattern
 * Priority: Tier 1-4 (scientific literature) > Tier 5 (personal replication)
 */
export function determineEvidenceTier(
  patternSignature: string,
  effectSize: number,
  personalReplicationCount: number,
  scienceTier?: EvidenceTier // Tier from scientific literature (if pattern is documented)
): EvidenceTier | null {
  // If pattern exists in scientific literature, use that tier (if effect size meets threshold)
  if (scienceTier && scienceTier !== "5") {
    if (meetsEvidenceRequirements(scienceTier, effectSize)) {
      return scienceTier;
    }
  }
  
  // Check for personal replication (Tier 5)
  if (meetsEvidenceRequirements("5", effectSize, personalReplicationCount)) {
    return "5";
  }
  
  return null; // Pattern doesn't meet any evidence tier requirements
}

/**
 * Format evidence tier for display
 */
export function formatEvidenceTier(tier: EvidenceTier, includeDescription: boolean = false): string {
  const tierInfo = EVIDENCE_TIERS[tier];
  
  if (includeDescription) {
    return `Tier ${tier}: ${tierInfo.description}`;
  }
  
  return `Tier ${tier}`;
}

/**
 * Get confidence multiplier based on evidence tier
 * Tier 1 evidence gets 1.0x multiplier, lower tiers get reduced confidence
 */
export function getEvidenceConfidenceMultiplier(tier: EvidenceTier): number {
  const multipliers: Record<EvidenceTier, number> = {
    "1": 1.0,   // Meta-analyses/RCTs - highest confidence
    "2": 0.9,   // Large cohorts
    "3": 0.8,   // Mechanistic + smaller studies
    "4": 0.7,   // Emerging patterns
    "5": 0.75,  // Personal replication - higher than Tier 4 due to N-of-1 relevance
  };
  
  return multipliers[tier];
}
