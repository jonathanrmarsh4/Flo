import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../utils/logger";
import { correlationInsightService } from "./correlationInsightService";
import { getHealthId } from "./supabaseHealthStorage";
import { clickhouseBaselineEngine } from "./clickhouseBaselineEngine";
import { correlationEngine } from "./clickhouseCorrelationEngine";
import { updateAllBaselines } from "./baselineCalculator";

const logger = createLogger('ClickHouseOrchestrator');

export interface ProcessingWindow {
  name: string;
  utcHour: number;
  includesBaselineUpdate: boolean;
  description: string;
}

export interface WindowStats {
  windowName: string;
  startedAt: Date;
  completedAt?: Date;
  usersProcessed: number;
  anomaliesDetected: number;
  questionsGenerated: number;
  baselineUpdated: boolean;
  errors: number;
  durationMs?: number;
}

export interface UsageMetrics {
  totalWindowsToday: number;
  lastWindowStats: WindowStats | null;
  dailyStats: {
    usersProcessed: number;
    anomaliesDetected: number;
    questionsGenerated: number;
    totalDurationMs: number;
    errors: number;
  };
  windowHistory: WindowStats[];
}

const PROCESSING_WINDOWS: ProcessingWindow[] = [
  { name: 'window_00', utcHour: 0, includesBaselineUpdate: true, description: 'APAC Morning - Full baseline + anomaly detection' },
  { name: 'window_06', utcHour: 6, includesBaselineUpdate: false, description: 'EMEA Morning - Anomaly detection only' },
  { name: 'window_12', utcHour: 12, includesBaselineUpdate: false, description: 'Americas Morning - Anomaly detection only' },
  { name: 'window_18', utcHour: 18, includesBaselineUpdate: false, description: 'Americas Afternoon / APAC Evening - Anomaly detection only' },
];

class ClickHouseOrchestrator {
  private scheduledTimeouts: NodeJS.Timeout[] = [];
  private isRunning = false;
  private windowHistory: WindowStats[] = [];
  private dailyStats = {
    usersProcessed: 0,
    anomaliesDetected: 0,
    questionsGenerated: 0,
    totalDurationMs: 0,
    errors: 0,
    lastReset: new Date(),
  };

  start() {
    if (this.isRunning) {
      logger.warn("[ClickHouseOrchestrator] Already running");
      return;
    }

    this.isRunning = true;
    logger.info("[ClickHouseOrchestrator] Starting 4-window processing schedule");

    this.resetDailyStatsIfNeeded();

    for (const window of PROCESSING_WINDOWS) {
      this.scheduleWindow(window);
    }

    logger.info("[ClickHouseOrchestrator] All 4 windows scheduled", {
      windows: PROCESSING_WINDOWS.map(w => `${w.name} at ${w.utcHour}:00 UTC`),
    });
  }

  stop() {
    for (const timeout of this.scheduledTimeouts) {
      clearTimeout(timeout);
    }
    this.scheduledTimeouts = [];
    this.isRunning = false;
    logger.info("[ClickHouseOrchestrator] Stopped");
  }

  private scheduleWindow(window: ProcessingWindow) {
    const now = new Date();
    const nextRun = new Date();
    nextRun.setUTCHours(window.utcHour, 0, 0, 0);

    if (now.getUTCHours() >= window.utcHour) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    const msUntilRun = nextRun.getTime() - now.getTime();

    const timeout = setTimeout(() => {
      this.runWindow(window);
      this.scheduleNextRun(window);
    }, msUntilRun);

    this.scheduledTimeouts.push(timeout);

    logger.info(`[ClickHouseOrchestrator] ${window.name} scheduled for ${nextRun.toISOString()}`);
  }

  private scheduleNextRun(window: ProcessingWindow) {
    const nextRun = new Date();
    nextRun.setUTCHours(window.utcHour, 0, 0, 0);
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);

    const msUntilRun = nextRun.getTime() - Date.now();

    const timeout = setTimeout(() => {
      this.runWindow(window);
      this.scheduleNextRun(window);
    }, msUntilRun);

    this.scheduledTimeouts.push(timeout);
  }

  private async runWindow(window: ProcessingWindow) {
    const stats: WindowStats = {
      windowName: window.name,
      startedAt: new Date(),
      usersProcessed: 0,
      anomaliesDetected: 0,
      questionsGenerated: 0,
      baselineUpdated: false,
      errors: 0,
    };

    logger.info(`[ClickHouseOrchestrator] Starting ${window.name} - ${window.description}`);

    try {
      this.resetDailyStatsIfNeeded();

      logger.info(`[ClickHouseOrchestrator] ClickHouse warming up for ${window.name}`);
      await this.warmUpClickHouse();

      const activeUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.status, "active"));

      logger.info(`[ClickHouseOrchestrator] Processing ${activeUsers.length} users in ${window.name}`);

      if (window.includesBaselineUpdate) {
        logger.info(`[ClickHouseOrchestrator] Running baseline update in ${window.name}`);
        await this.runBaselineUpdateForAll(activeUsers);
        stats.baselineUpdated = true;
        
        // Run long-horizon correlation analysis during baseline update window (once per day)
        logger.info(`[ClickHouseOrchestrator] Running long-horizon correlation analysis in ${window.name}`);
        await this.runLongHorizonCorrelationAnalysis(activeUsers);
      }

      for (const user of activeUsers) {
        try {
          const healthId = await getHealthId(user.id);
          if (!healthId) continue;

          await clickhouseBaselineEngine.syncHealthDataFromSupabase(healthId, 1);

          const result = await correlationInsightService.runFullAnalysis(user.id);
          stats.usersProcessed++;
          stats.anomaliesDetected += result.anomalies.length;
          if (result.feedbackQuestion) {
            stats.questionsGenerated++;
          }
        } catch (error) {
          logger.error(`[ClickHouseOrchestrator] Error processing user ${user.id}:`, error);
          stats.errors++;
        }
      }

      logger.info(`[ClickHouseOrchestrator] ClickHouse returning to idle after ${window.name}`);

    } catch (error) {
      logger.error(`[ClickHouseOrchestrator] Fatal error in ${window.name}:`, error);
      stats.errors++;
    }

    stats.completedAt = new Date();
    stats.durationMs = stats.completedAt.getTime() - stats.startedAt.getTime();

    this.windowHistory.unshift(stats);
    if (this.windowHistory.length > 20) {
      this.windowHistory = this.windowHistory.slice(0, 20);
    }

    this.dailyStats.usersProcessed += stats.usersProcessed;
    this.dailyStats.anomaliesDetected += stats.anomaliesDetected;
    this.dailyStats.questionsGenerated += stats.questionsGenerated;
    this.dailyStats.totalDurationMs += stats.durationMs;
    this.dailyStats.errors += stats.errors;

    logger.info(`[ClickHouseOrchestrator] ${window.name} complete`, {
      durationMs: stats.durationMs,
      usersProcessed: stats.usersProcessed,
      anomaliesDetected: stats.anomaliesDetected,
      questionsGenerated: stats.questionsGenerated,
      baselineUpdated: stats.baselineUpdated,
      errors: stats.errors,
    });
  }

  private async warmUpClickHouse(): Promise<void> {
    try {
      await clickhouseBaselineEngine.getMLInsights('warmup-probe');
      logger.debug("[ClickHouseOrchestrator] ClickHouse warm-up complete");
    } catch (error) {
      logger.warn("[ClickHouseOrchestrator] ClickHouse warm-up query failed, proceeding anyway");
    }
  }

  private async runBaselineUpdateForAll(activeUsers: { id: string }[]): Promise<void> {
    let successCount = 0;
    let errorCount = 0;

    for (const user of activeUsers) {
      try {
        await updateAllBaselines(user.id);
        successCount++;
      } catch (error) {
        logger.error(`[ClickHouseOrchestrator] Baseline update error for user ${user.id}:`, error);
        errorCount++;
      }
    }

    logger.info(`[ClickHouseOrchestrator] Baseline update complete. Success: ${successCount}, Errors: ${errorCount}`);
  }

  private async runLongHorizonCorrelationAnalysis(activeUsers: { id: string }[]): Promise<void> {
    let successCount = 0;
    let errorCount = 0;
    let correlationsDiscovered = 0;

    for (const user of activeUsers) {
      try {
        const healthId = await getHealthId(user.id);
        if (!healthId) continue;

        // Run full correlation analysis with 6 months lookback
        const results = await correlationEngine.runFullAnalysis(healthId, 6);
        correlationsDiscovered += results.correlationsFound;
        successCount++;
        
        if (results.correlationsFound > 0) {
          logger.debug(`[ClickHouseOrchestrator] Discovered ${results.correlationsFound} correlations for user ${user.id}`);
        }
      } catch (error) {
        logger.error(`[ClickHouseOrchestrator] Long-horizon correlation error for user ${user.id}:`, error);
        errorCount++;
      }
    }

    logger.info(`[ClickHouseOrchestrator] Long-horizon correlation analysis complete. Success: ${successCount}, Errors: ${errorCount}, Correlations found: ${correlationsDiscovered}`);
  }

  private resetDailyStatsIfNeeded() {
    const now = new Date();
    const lastReset = this.dailyStats.lastReset;

    if (now.getUTCDate() !== lastReset.getUTCDate() || 
        now.getUTCMonth() !== lastReset.getUTCMonth() ||
        now.getUTCFullYear() !== lastReset.getUTCFullYear()) {
      this.dailyStats = {
        usersProcessed: 0,
        anomaliesDetected: 0,
        questionsGenerated: 0,
        totalDurationMs: 0,
        errors: 0,
        lastReset: now,
      };
      logger.info("[ClickHouseOrchestrator] Daily stats reset");
    }
  }

  async triggerManualWindow(windowName?: string): Promise<WindowStats> {
    const window = windowName 
      ? PROCESSING_WINDOWS.find(w => w.name === windowName)
      : PROCESSING_WINDOWS[0];

    if (!window) {
      throw new Error(`Unknown window: ${windowName}`);
    }

    logger.info(`[ClickHouseOrchestrator] Manual trigger for ${window.name}`);
    
    const stats: WindowStats = {
      windowName: `manual_${window.name}`,
      startedAt: new Date(),
      usersProcessed: 0,
      anomaliesDetected: 0,
      questionsGenerated: 0,
      baselineUpdated: false,
      errors: 0,
    };

    try {
      await this.warmUpClickHouse();

      const activeUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.status, "active"));

      if (window.includesBaselineUpdate) {
        await this.runBaselineUpdateForAll(activeUsers);
        stats.baselineUpdated = true;
      }

      for (const user of activeUsers) {
        try {
          const healthId = await getHealthId(user.id);
          if (!healthId) continue;

          await clickhouseBaselineEngine.syncHealthDataFromSupabase(healthId, 1);
          const result = await correlationInsightService.runFullAnalysis(user.id);
          stats.usersProcessed++;
          stats.anomaliesDetected += result.anomalies.length;
          if (result.feedbackQuestion) {
            stats.questionsGenerated++;
          }
        } catch (error) {
          stats.errors++;
        }
      }
    } catch (error) {
      stats.errors++;
    }

    stats.completedAt = new Date();
    stats.durationMs = stats.completedAt.getTime() - stats.startedAt.getTime();
    this.windowHistory.unshift(stats);

    return stats;
  }

  getUsageMetrics(): UsageMetrics {
    this.resetDailyStatsIfNeeded();

    const todayWindows = this.windowHistory.filter(w => {
      const windowDate = w.startedAt;
      const today = new Date();
      return windowDate.getUTCDate() === today.getUTCDate() &&
             windowDate.getUTCMonth() === today.getUTCMonth() &&
             windowDate.getUTCFullYear() === today.getUTCFullYear();
    });

    return {
      totalWindowsToday: todayWindows.length,
      lastWindowStats: this.windowHistory[0] || null,
      dailyStats: {
        usersProcessed: this.dailyStats.usersProcessed,
        anomaliesDetected: this.dailyStats.anomaliesDetected,
        questionsGenerated: this.dailyStats.questionsGenerated,
        totalDurationMs: this.dailyStats.totalDurationMs,
        errors: this.dailyStats.errors,
      },
      windowHistory: this.windowHistory.slice(0, 10),
    };
  }

  getProcessingWindows(): ProcessingWindow[] {
    return PROCESSING_WINDOWS;
  }

  getNextWindowInfo(): { window: ProcessingWindow; scheduledFor: Date } | null {
    const now = new Date();
    const currentHour = now.getUTCHours();

    for (const window of PROCESSING_WINDOWS) {
      if (window.utcHour > currentHour) {
        const scheduledFor = new Date();
        scheduledFor.setUTCHours(window.utcHour, 0, 0, 0);
        return { window, scheduledFor };
      }
    }

    const nextDay = new Date();
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    nextDay.setUTCHours(PROCESSING_WINDOWS[0].utcHour, 0, 0, 0);
    return { window: PROCESSING_WINDOWS[0], scheduledFor: nextDay };
  }
}

export const clickhouseOrchestrator = new ClickHouseOrchestrator();
