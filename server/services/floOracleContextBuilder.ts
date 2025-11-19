import { db } from '../db';
import { 
  profiles, 
  biomarkerTestSessions,
  biomarkerMeasurements,
  biomarkers,
  diagnosticsStudies, 
  userDailyMetrics,
  flomentumDaily,
  sleepNights,
  insightCards,
  lifeEvents
} from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { logger } from '../logger';

// In-memory cache for user health context (5 minute TTL)
interface CachedContext {
  context: string;
  timestamp: number;
}

const contextCache = new Map<string, CachedContext>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface UserHealthContext {
  age: number | null;
  sex: string;
  primaryGoals: string[];
  latestBloodPanel: {
    date: string | null;
    apob: string;
    glucose: string;
    hba1c: string;
    hscrp: string;
    testosterone: string;
    [key: string]: string | null;
  };
  latestCAC: {
    score: number | null;
    percentile: string | null;
    date: string | null;
  };
  latestDEXA: {
    visceralFat: number | null;
    leanMass: number | null;
    bodyFat: number | null;
    date: string | null;
  };
  wearableAvg7Days: {
    hrv: number | null;
    sleep: string | null;
    rhr: number | null;
    steps: number | null;
    activeKcal: number | null;
  };
  flomentumCurrent: {
    score: number | null;
    zone: string | null;
    dailyFocus: string | null;
  };
  bodyCompositionExplanation: string | null;
}

function calculateAge(dateOfBirth: Date | string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function formatBiomarkerValue(value: number | null, unit: string = ''): string {
  if (value === null || value === undefined) return 'not recorded';
  return `${value}${unit ? ' ' + unit : ''}`;
}

interface BloodPanelHistory {
  date: string;
  biomarkers: Record<string, string>;
}

export async function buildUserHealthContext(userId: string, skipCache: boolean = false): Promise<string> {
  try {
    // Check cache first (unless explicitly skipped)
    if (!skipCache) {
      const cached = contextCache.get(userId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        logger.info(`[FloOracle] Using cached health context for user ${userId}`);
        return cached.context;
      }
    }

    logger.info(`[FloOracle] Building fresh health context for user ${userId}`);

    const context: UserHealthContext = {
      age: null,
      sex: 'unknown',
      primaryGoals: [],
      latestBloodPanel: {
        date: null,
        apob: 'not recorded',
        glucose: 'not recorded',
        hba1c: 'not recorded',
        hscrp: 'not recorded',
        testosterone: 'not recorded',
      },
      latestCAC: {
        score: null,
        percentile: null,
        date: null,
      },
      latestDEXA: {
        visceralFat: null,
        leanMass: null,
        bodyFat: null,
        date: null,
      },
      wearableAvg7Days: {
        hrv: null,
        sleep: null,
        rhr: null,
        steps: null,
        activeKcal: null,
      },
      flomentumCurrent: {
        score: null,
        zone: null,
        dailyFocus: null,
      },
      bodyCompositionExplanation: null,
    };

    const [userProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (userProfile) {
      context.age = calculateAge(userProfile.dateOfBirth);
      context.sex = userProfile.sex || 'unknown';
      context.primaryGoals = Array.isArray(userProfile.goals) ? userProfile.goals : [];
    }

    // Fetch ALL blood panels from the last 12 months (for historical context)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const allSessions = await db
      .select()
      .from(biomarkerTestSessions)
      .where(
        and(
          eq(biomarkerTestSessions.userId, userId),
          gte(biomarkerTestSessions.testDate, twelveMonthsAgo)
        )
      )
      .orderBy(desc(biomarkerTestSessions.testDate));

    const bloodPanelHistory: BloodPanelHistory[] = [];

    if (allSessions.length > 0) {
      // Process latest panel for backward compatibility
      const latestSession = allSessions[0];
      context.latestBloodPanel.date = latestSession.testDate.toISOString().split('T')[0];
      
      // Fetch biomarkers for ALL sessions
      for (const session of allSessions) {
        const measurements = await db
          .select({
            biomarkerName: biomarkers.name,
            value: biomarkerMeasurements.valueDisplay,
          })
          .from(biomarkerMeasurements)
          .innerJoin(biomarkers, eq(biomarkerMeasurements.biomarkerId, biomarkers.id))
          .where(eq(biomarkerMeasurements.sessionId, session.id));

        const biomarkerMap: Record<string, string> = {};
        measurements.forEach((m) => {
          biomarkerMap[m.biomarkerName] = m.value;
        });
        
        // Store this panel in history
        if (Object.keys(biomarkerMap).length > 0) {
          bloodPanelHistory.push({
            date: session.testDate.toISOString().split('T')[0],
            biomarkers: biomarkerMap,
          });
        }
        
        // For the LATEST panel, also store in context object for backward compatibility
        if (session.id === latestSession.id) {
          Object.keys(biomarkerMap).forEach((key) => {
            context.latestBloodPanel[key] = biomarkerMap[key];
          });
          
          context.latestBloodPanel.apob = biomarkerMap['ApoB'] || 'not recorded';
          context.latestBloodPanel.glucose = biomarkerMap['Glucose'] || biomarkerMap['Fasting Glucose'] || 'not recorded';
          context.latestBloodPanel.hba1c = biomarkerMap['HbA1c'] || 'not recorded';
          context.latestBloodPanel.hscrp = biomarkerMap['hs-CRP'] || biomarkerMap['CRP'] || 'not recorded';
          context.latestBloodPanel.testosterone = biomarkerMap['Testosterone'] || biomarkerMap['Total Testosterone'] || 'not recorded';
        }
      }
    }

    const latestCAC = await db
      .select()
      .from(diagnosticsStudies)
      .where(
        and(
          eq(diagnosticsStudies.userId, userId),
          eq(diagnosticsStudies.type, 'coronary_calcium_score')
        )
      )
      .orderBy(desc(diagnosticsStudies.studyDate))
      .limit(1);

    if (latestCAC.length > 0) {
      const cac = latestCAC[0];
      const payload = cac.aiPayload as Record<string, any> || {};
      context.latestCAC.score = cac.totalScoreNumeric ?? payload.cacScore ?? null;
      context.latestCAC.percentile = cac.agePercentile?.toString() ?? payload.percentile ?? null;
      context.latestCAC.date = cac.studyDate.toISOString().split('T')[0];
    }

    const latestDEXA = await db
      .select()
      .from(diagnosticsStudies)
      .where(
        and(
          eq(diagnosticsStudies.userId, userId),
          eq(diagnosticsStudies.type, 'dexa_scan')
        )
      )
      .orderBy(desc(diagnosticsStudies.studyDate))
      .limit(1);

    if (latestDEXA.length > 0) {
      const dexa = latestDEXA[0];
      const payload = dexa.aiPayload as Record<string, any> || {};
      context.latestDEXA.visceralFat = payload.visceralFatMass ?? null;
      context.latestDEXA.leanMass = payload.totalLeanMass ?? null;
      context.latestDEXA.bodyFat = payload.totalBodyFat ?? null;
      context.latestDEXA.date = dexa.studyDate.toISOString().split('T')[0];
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const wearableData = await db
      .select({
        avgHrv: sql<number>`AVG(${userDailyMetrics.hrvMs})`,
        avgRhr: sql<number>`AVG(${userDailyMetrics.restingHrBpm})`,
        avgSteps: sql<number>`AVG(${userDailyMetrics.stepsRawSum})`,
        avgActiveKcal: sql<number>`AVG(${userDailyMetrics.activeEnergyKcal})`,
      })
      .from(userDailyMetrics)
      .where(
        and(
          eq(userDailyMetrics.userId, userId),
          gte(userDailyMetrics.localDate, sevenDaysAgoStr)
        )
      );

    if (wearableData.length > 0 && wearableData[0]) {
      context.wearableAvg7Days.hrv = wearableData[0].avgHrv ? Math.round(wearableData[0].avgHrv) : null;
      context.wearableAvg7Days.rhr = wearableData[0].avgRhr ? Math.round(wearableData[0].avgRhr) : null;
      context.wearableAvg7Days.steps = wearableData[0].avgSteps ? Math.round(wearableData[0].avgSteps) : null;
      context.wearableAvg7Days.activeKcal = wearableData[0].avgActiveKcal ? Math.round(wearableData[0].avgActiveKcal) : null;
    }

    const sleepData = await db
      .select({
        avgSleep: sql<number>`AVG(${sleepNights.totalSleepMin})`,
      })
      .from(sleepNights)
      .where(
        and(
          eq(sleepNights.userId, userId),
          gte(sleepNights.sleepDate, sevenDaysAgoStr)
        )
      );

    if (sleepData.length > 0 && sleepData[0]?.avgSleep) {
      const hours = Math.floor(sleepData[0].avgSleep / 60);
      const mins = Math.round(sleepData[0].avgSleep % 60);
      context.wearableAvg7Days.sleep = `${hours}h${mins}m`;
    }

    const [latestFlomentum] = await db
      .select()
      .from(flomentumDaily)
      .where(eq(flomentumDaily.userId, userId))
      .orderBy(desc(flomentumDaily.date))
      .limit(1);

    if (latestFlomentum) {
      context.flomentumCurrent.score = latestFlomentum.score;
      context.flomentumCurrent.zone = latestFlomentum.zone;
      const factors = latestFlomentum.dailyFocus as Record<string, any> || {};
      context.flomentumCurrent.dailyFocus = factors.focus || null;
    }

    // Fetch unified body composition data (DEXA + HealthKit with priority logic)
    try {
      const { BodyCompositionService } = await import('./bodyCompositionService');
      const bodyCompData = await BodyCompositionService.getBodyComposition(userId);
      context.bodyCompositionExplanation = bodyCompData.explanation;
    } catch (error) {
      logger.warn('[FloOracle] Failed to fetch body composition data');
      context.bodyCompositionExplanation = null;
    }

    const contextString = buildContextString(context, bloodPanelHistory);
    logger.info(`[FloOracle] Context built successfully (${contextString.length} chars)`);
    
    // Cache the result
    contextCache.set(userId, {
      context: contextString,
      timestamp: Date.now(),
    });
    
    return contextString;
  } catch (error) {
    logger.error('[FloOracle] Failed to build user context:', error);
    return buildFallbackContext();
  }
}

function buildContextString(context: UserHealthContext, bloodPanelHistory: BloodPanelHistory[] = []): string {
  const lines: string[] = ['USER CONTEXT (never shared with user):'];
  
  lines.push(`Age: ${context.age ?? 'unknown'} | Sex: ${context.sex} | Primary goal: ${context.primaryGoals.join(', ') || 'general health'}`);
  
  // Format blood panels with historical context
  if (bloodPanelHistory.length > 0) {
    lines.push('');
    lines.push('BLOOD WORK HISTORY (most recent first):');
    
    bloodPanelHistory.forEach((panel, index) => {
      const isLatest = index === 0;
      const label = isLatest ? '📊 LATEST PANEL' : `📊 Panel`;
      lines.push(`${label} (${panel.date}):`);
      
      // Get all unique biomarkers across all panels
      const biomarkerKeys = Object.keys(panel.biomarkers).sort();
      
      if (biomarkerKeys.length > 0) {
        biomarkerKeys.forEach(key => {
          lines.push(`  • ${key}: ${panel.biomarkers[key]}`);
        });
      }
      
      // Add spacing between panels (except after last one)
      if (index < bloodPanelHistory.length - 1) {
        lines.push('');
      }
    });
  } else if (context.latestBloodPanel.date) {
    // Fallback to old format if bloodPanelHistory wasn't populated
    lines.push(`Latest blood panel: ${context.latestBloodPanel.date}`);
    
    const biomarkerKeys = Object.keys(context.latestBloodPanel)
      .filter(key => key !== 'date' && context.latestBloodPanel[key] !== 'not recorded')
      .sort();
    
    if (biomarkerKeys.length > 0) {
      biomarkerKeys.forEach(key => {
        lines.push(`  • ${key}: ${context.latestBloodPanel[key]}`);
      });
    } else {
      lines.push('  • No biomarker measurements available');
    }
  } else {
    lines.push('Latest blood panel: No blood work uploaded yet');
  }
  
  if (context.latestCAC.score !== null) {
    const percentileText = context.latestCAC.percentile ? ` (${context.latestCAC.percentile} percentile)` : '';
    lines.push(`Latest CAC (${context.latestCAC.date || 'date unknown'}): ${context.latestCAC.score}${percentileText}`);
  }
  
  if (context.latestDEXA.visceralFat !== null) {
    lines.push(`Latest DEXA (${context.latestDEXA.date || 'date unknown'}): Visceral fat ${context.latestDEXA.visceralFat}g | Lean mass ${context.latestDEXA.leanMass ?? 'unknown'}kg | Body fat ${context.latestDEXA.bodyFat ?? 'unknown'}%`);
  }
  
  const wearable = context.wearableAvg7Days;
  if (wearable.hrv || wearable.sleep || wearable.rhr) {
    const parts: string[] = [];
    if (wearable.hrv) parts.push(`HRV ${wearable.hrv} ms`);
    if (wearable.sleep) parts.push(`Sleep ${wearable.sleep}`);
    if (wearable.rhr) parts.push(`RHR ${wearable.rhr} bpm`);
    if (wearable.steps) parts.push(`Steps ${wearable.steps}`);
    if (wearable.activeKcal) parts.push(`Active kcal ${wearable.activeKcal}`);
    lines.push(`7-day wearable avg: ${parts.join(', ')}`);
  }
  
  if (context.flomentumCurrent.score !== null) {
    lines.push(`Flōmentum score: ${context.flomentumCurrent.score}/100 (${context.flomentumCurrent.zone || 'calculating'}) | Daily focus: ${context.flomentumCurrent.dailyFocus || 'building baseline'}`);
  }
  
  // Add body composition explanation (DEXA vs HealthKit nuances)
  if (context.bodyCompositionExplanation) {
    lines.push('');
    lines.push('BODY COMPOSITION DATA SOURCES:');
    lines.push(context.bodyCompositionExplanation);
  }
  
  return lines.join('\n');
}

function buildFallbackContext(): string {
  return `USER CONTEXT (never shared with user):
No health data available yet. User has not uploaded blood work, diagnostic studies, or synced wearable data.
Encourage them to upload their first blood panel or sync their HealthKit data to get started.`;
}

/**
 * Retrieve relevant insight cards for RAG-enhanced context
 * Returns the top discovered patterns to inject into Flō Oracle's context
 */
export async function getRelevantInsights(userId: string, limit: number = 5): Promise<string> {
  try {
    const insights = await db
      .select({
        category: insightCards.category,
        pattern: insightCards.pattern,
        confidence: insightCards.confidence,
        supportingData: insightCards.supportingData,
      })
      .from(insightCards)
      .where(
        and(
          eq(insightCards.userId, userId),
          eq(insightCards.isActive, true)
        )
      )
      .orderBy(desc(insightCards.confidence), desc(insightCards.createdAt))
      .limit(limit);

    if (insights.length === 0) {
      return '';
    }

    const lines = [
      '',
      'DISCOVERED PATTERNS (use these insights naturally in conversation):',
    ];

    insights.forEach((insight, index) => {
      const confidencePercent = Math.round(insight.confidence * 100);
      lines.push(`${index + 1}. ${insight.pattern} (${confidencePercent}% confidence, ${insight.supportingData})`);
    });

    logger.info(`[FloOracle] Retrieved ${insights.length} insight cards for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving insights:', error);
    return '';
  }
}

/**
 * Get recent life events to enhance conversational context
 * Returns user's logged behaviors from the past 14 days
 */
export async function getRecentLifeEvents(userId: string, days: number = 14): Promise<string> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const events = await db
      .select({
        eventType: lifeEvents.eventType,
        details: lifeEvents.details,
        notes: lifeEvents.notes,
        happenedAt: lifeEvents.happenedAt,
      })
      .from(lifeEvents)
      .where(
        and(
          eq(lifeEvents.userId, userId),
          gte(lifeEvents.happenedAt, cutoffDate)
        )
      )
      .orderBy(desc(lifeEvents.happenedAt))
      .limit(10);

    if (events.length === 0) {
      return '';
    }

    const lines = [
      '',
      'RECENT LOGGED BEHAVIORS (reference these naturally when relevant):',
    ];

    events.forEach((event) => {
      const date = new Date(event.happenedAt);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const timeRef = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
      
      let eventDesc = event.eventType.replace(/_/g, ' ');
      if (event.details && typeof event.details === 'object') {
        const details = event.details as Record<string, any>;
        if (details.duration_min) eventDesc += ` (${details.duration_min} min)`;
        if (details.drinks) eventDesc += ` (${details.drinks} drinks)`;
        if (details.names) eventDesc += ` (${details.names.join(', ')})`;
      }
      
      lines.push(`• ${timeRef}: ${eventDesc}`);
    });

    logger.info(`[FloOracle] Retrieved ${events.length} life events for user ${userId}`);
    return lines.join('\n');
  } catch (error) {
    logger.error('[FloOracle] Error retrieving life events:', error);
    return '';
  }
}
