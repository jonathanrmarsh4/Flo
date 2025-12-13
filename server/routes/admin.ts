import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { requireAdmin } from "../middleware/rbac";
import { logger } from "../logger";
import Stripe from "stripe";
import { generateInsightCards } from "../services/correlationEngine";
import { syncBloodWorkEmbeddings, syncHealthKitEmbeddings } from "../services/embeddingService";
import { db } from "../db";
import { userDailyMetrics, bloodWorkRecords, systemSettings, insertSystemSettingsSchema, userMetricBaselines } from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import * as healthRouter from "../services/healthStorageRouter";
import { generateDailyReminder } from "../services/dailyReminderService";
import { fromError } from "zod-validation-error";
import { sendAccountApprovalEmail } from "../services/emailService";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-10-29.clover",
    })
  : null;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

export function registerAdminRoutes(app: Express) {
  app.get('/api/admin/overview', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const cacheKey = 'admin:overview';
      let stats = getCached(cacheKey);
      
      if (!stats) {
        stats = await storage.getAdminOverviewStats();
        setCache(cacheKey, stats);
      }
      
      res.json(stats);
    } catch (error) {
      logger.error('Error fetching admin overview', error);
      res.status(500).json({ error: "Failed to fetch overview stats" });
    }
  });

  app.get('/api/admin/api-usage', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const cacheKey = `admin:api-usage:${days}`;
      let usage = getCached(cacheKey);
      
      if (!usage) {
        usage = await storage.getApiUsageDaily(days);
        setCache(cacheKey, usage);
      }
      
      res.json(usage);
    } catch (error) {
      logger.error('Error fetching API usage', error);
      res.status(500).json({ error: "Failed to fetch API usage" });
    }
  });

  app.get('/api/admin/analytics', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const months = parseInt(req.query.months as string) || 7;
      const cacheKey = `admin:analytics:${months}`;
      let data = getCached(cacheKey);
      
      if (!data) {
        const [revenueTrends, subscriptionBreakdown] = await Promise.all([
          storage.getRevenueTrends(months),
          storage.getSubscriptionBreakdown(),
        ]);
        
        data = {
          revenueTrends,
          subscriptionBreakdown,
        };
        setCache(cacheKey, data);
      }
      
      res.json(data);
    } catch (error) {
      logger.error('Error fetching analytics', error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get('/api/admin/analytics/comprehensive', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const period = (req.query.period as 'today' | '7d' | '30d' | '90d' | 'all') || '30d';
      const cacheKey = `admin:analytics:comprehensive:${period}`;
      let data = getCached(cacheKey);
      
      if (!data) {
        data = await storage.getComprehensiveAnalytics(period);
        setCache(cacheKey, data);
      }
      
      res.json(data);
    } catch (error) {
      logger.error('Error fetching comprehensive analytics', error);
      res.status(500).json({ error: "Failed to fetch comprehensive analytics" });
    }
  });

  app.get('/api/admin/billing/summary', isAuthenticated, requireAdmin, async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured" });
    }
    
    try {
      const cacheKey = 'admin:billing-summary';
      let data = getCached(cacheKey);
      
      if (!data) {
        const [subscriptionBreakdown, revenueTrends] = await Promise.all([
          storage.getSubscriptionBreakdown(),
          storage.getRevenueTrends(1),
        ]);

        const monthlyRevenue = revenueTrends[0]?.revenue || 0;
        const annualRevenue = monthlyRevenue * 12;

        const stripeBalance = await stripe.balance.retrieve();
        const availableBalance = stripeBalance.available.reduce(
          (sum, balance) => sum + balance.amount,
          0
        ) / 100;

        data = {
          subscriptionBreakdown,
          monthlyRevenue,
          annualRevenue,
          availableBalance,
        };
        setCache(cacheKey, data);
      }
      
      res.json(data);
    } catch (error) {
      logger.error('Error fetching billing summary', error);
      res.status(500).json({ error: "Failed to fetch billing summary" });
    }
  });

  app.get('/api/admin/audit-logs', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const cacheKey = `admin:audit-logs:${limit}`;
      let logs = getCached(cacheKey);
      
      if (!logs) {
        logs = await storage.getAuditLogs(limit);
        setCache(cacheKey, logs);
      }
      
      res.json(logs);
    } catch (error) {
      logger.error('Error fetching audit logs', error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.get('/api/admin/users', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const query = req.query.query as string | undefined;
      const role = req.query.role as string | undefined;
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await storage.listUsers({ query, role, status, limit, offset });
      res.json(result);
    } catch (error) {
      logger.error('Error fetching users', error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch('/api/admin/users/:id', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const adminId = req.user.claims.sub;
      const { role, status } = req.body;

      if (role === undefined && status === undefined) {
        return res.status(400).json({ error: "At least one field (role or status) is required" });
      }

      if (userId === adminId && (role !== undefined || status !== undefined)) {
        return res.status(403).json({ error: "Cannot modify your own role or status" });
      }

      // Security: Check if user is pending_approval - must use approve/reject endpoints instead
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (user.status === 'pending_approval') {
        return res.status(403).json({ 
          error: "Cannot modify pending users directly",
          message: "Use the approve or reject endpoints for pending users"
        });
      }

      // Security: Prevent setting role to apple_test for non-pending users
      // apple_test role should only be assigned during account creation or by explicit admin action
      if (role === 'apple_test' && user.role !== 'apple_test') {
        return res.status(403).json({ 
          error: "Cannot assign apple_test role",
          message: "The apple_test role can only be assigned to dedicated test accounts"
        });
      }

      const updatedUser = await storage.updateUser(userId, { role, status }, adminId);
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      logger.error('Error updating user', error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete('/api/admin/users/:id', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const adminId = req.user.claims.sub;

      if (userId === adminId) {
        return res.status(403).json({ error: "Cannot delete your own account" });
      }

      await storage.deleteUser(userId, adminId);
      res.json({ success: true, message: "User deleted successfully" });
    } catch (error: any) {
      logger.error('Error deleting user', error);
      if (error.message === 'User not found') {
        return res.status(404).json({ error: "User not found" });
      }
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Approve a pending user - sets status to 'active' and sends notification email
  app.post('/api/admin/users/:id/approve', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const adminId = req.user.claims.sub || req.user.id;

      // Get the user first to check current status
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.status !== 'pending_approval') {
        return res.status(400).json({ error: "User is not pending approval" });
      }

      // Update user status to active
      const updatedUser = await storage.updateUser(userId, { status: 'active' }, adminId);

      // Send approval notification email
      if (user.email) {
        const emailSent = await sendAccountApprovalEmail(user.email, user.firstName);
        if (!emailSent) {
          logger.warn('Failed to send approval email, but user was approved', { userId, email: user.email });
        }
      }

      logger.info('User approved successfully', { userId, adminId });
      res.json({ 
        success: true, 
        message: "User approved successfully",
        user: updatedUser
      });
    } catch (error) {
      logger.error('Error approving user', error);
      res.status(500).json({ error: "Failed to approve user" });
    }
  });

  // Reject a pending user - sets status to 'suspended'
  app.post('/api/admin/users/:id/reject', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const adminId = req.user.claims.sub || req.user.id;

      // Get the user first to check current status
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.status !== 'pending_approval') {
        return res.status(400).json({ error: "User is not pending approval" });
      }

      // Update user status to suspended (rejected)
      const updatedUser = await storage.updateUser(userId, { status: 'suspended' }, adminId);

      logger.info('User rejected successfully', { userId, adminId });
      res.json({ 
        success: true, 
        message: "User rejected successfully",
        user: updatedUser
      });
    } catch (error) {
      logger.error('Error rejecting user', error);
      res.status(500).json({ error: "Failed to reject user" });
    }
  });

  // Get pending approval users count
  app.get('/api/admin/users/pending-count', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const result = await storage.listUsers({ status: 'pending_approval', limit: 1000, offset: 0 });
      res.json({ count: result.total });
    } catch (error) {
      logger.error('Error fetching pending users count', error);
      res.status(500).json({ error: "Failed to fetch pending users count" });
    }
  });

  // Create an Apple Test User account (for App Store review)
  // These accounts bypass pending approval and are immediately active
  app.post('/api/admin/users/create-test-account', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      const adminId = req.user.claims.sub || req.user.id;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Import bcrypt for password hashing
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(password, 10);

      // Create the test user with apple_test role and active status (bypasses approval)
      const user = await storage.upsertUser({
        email,
        firstName: firstName || 'Apple',
        lastName: lastName || 'Test User',
        role: 'apple_test',
        status: 'active', // Immediately active - bypasses pending approval
      });

      // Create user credentials
      await storage.createUserCredentials({
        userId: user.id,
        passwordHash,
      });

      // Create auth provider record
      await storage.upsertAuthProvider({
        userId: user.id,
        provider: 'email',
        providerUserId: user.id,
        email,
      });

      // Create profile
      const existingProfile = await storage.getProfile(user.id);
      if (!existingProfile) {
        await storage.upsertProfile(user.id, {});
      }

      logger.info('Apple Test User created', { userId: user.id, email, adminId });
      res.json({ 
        success: true, 
        message: "Apple Test User created successfully",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
        }
      });
    } catch (error) {
      logger.error('Error creating Apple Test User', error);
      res.status(500).json({ error: "Failed to create Apple Test User" });
    }
  });

  app.get('/api/admin/healthkit/stats', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const cacheKey = 'admin:healthkit:stats';
      let stats = getCached(cacheKey);
      
      if (!stats) {
        stats = await storage.getHealthKitStats();
        setCache(cacheKey, stats);
      }
      
      res.json(stats);
    } catch (error) {
      logger.error('Error fetching HealthKit stats', error);
      res.status(500).json({ error: "Failed to fetch HealthKit statistics" });
    }
  });

  app.get('/api/admin/healthkit/status', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const status = await storage.checkHealthKitStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error checking HealthKit status', error);
      res.status(500).json({ error: "Failed to check HealthKit status", status: "error" });
    }
  });

  /**
   * Admin endpoint to trigger insights generation for testing
   * POST /api/admin/trigger-insights-generation
   * 
   * This endpoint runs the full insights generation pipeline:
   * 1. Syncs embeddings for recent health data
   * 2. Detects correlations using the Pearson engine
   * 3. Generates and saves insight cards to the database
   * 4. Optionally generates and delivers a daily reminder notification
   * 
   * Query params:
   * - userId (optional): Specific user ID to generate insights for. Defaults to authenticated user.
   * - withNotification (optional): If true, also generates a daily reminder notification. Defaults to false.
   */
  app.post('/api/admin/trigger-insights-generation', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const startTime = Date.now();
      const targetUserId = req.query.userId || req.user.claims.sub;
      const withNotification = req.query.withNotification === 'true';

      logger.info(`[Admin] Triggering insights generation for user ${targetUserId} (withNotification: ${withNotification})`);

      // Step 1: Sync embeddings
      logger.info(`[Admin] Step 1/3: Syncing embeddings for user ${targetUserId}...`);
      
      // Get recent blood work data with analysis (using same pattern as scheduler)
      const { analysisResults } = await import("@shared/schema");
      
      const bloodWorkRaw = await db
        .select()
        .from(bloodWorkRecords)
        .leftJoin(analysisResults, eq(bloodWorkRecords.id, analysisResults.recordId))
        .where(eq(bloodWorkRecords.userId, targetUserId))
        .orderBy(desc(bloodWorkRecords.uploadedAt))
        .limit(10);

      // Transform joined data to flat structure expected by embedding service
      const bloodWorkData = bloodWorkRaw.map(row => ({
        ...row.blood_work_records,
        analysis: row.analysis_results,
      }));

      // Get recent HealthKit metrics (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const healthKitData = await db
        .select()
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, targetUserId),
            gte(userDailyMetrics.utcDayStart, thirtyDaysAgo)
          )
        )
        .orderBy(desc(userDailyMetrics.localDate));

      let embeddingCount = 0;
      if (bloodWorkData.length > 0) {
        embeddingCount += await syncBloodWorkEmbeddings(targetUserId, bloodWorkData as any);
      }
      if (healthKitData.length > 0) {
        embeddingCount += await syncHealthKitEmbeddings(targetUserId, healthKitData);
      }

      logger.info(`[Admin] ✓ Synced ${embeddingCount} embeddings`);

      // Step 2: Generate insights
      logger.info(`[Admin] Step 2/3: Generating insight cards for user ${targetUserId}...`);
      const insights = await generateInsightCards(targetUserId);
      logger.info(`[Admin] ✓ Generated ${insights.length} insight cards`);

      // Step 3: Optionally generate daily reminder notification
      let reminderResult = null;
      if (withNotification) {
        logger.info(`[Admin] Step 3/3: Generating daily reminder notification...`);
        
        // Get user reminder preferences
        const userResult = await db.execute(sql`
          SELECT reminder_time, reminder_timezone 
          FROM users 
          WHERE id = ${targetUserId}
          LIMIT 1
        `);

        const user = userResult.rows?.[0] as any;
        
        if (!user) {
          logger.warn(`[Admin] ✗ User ${targetUserId} not found, skipping notification`);
          reminderResult = { success: false, error: 'User not found' };
        } else {
          const reminderTime = user.reminder_time || '08:15';
          const reminderTimezone = user.reminder_timezone || 'UTC';

          reminderResult = await generateDailyReminder(targetUserId, reminderTime, reminderTimezone);
          
          if (reminderResult.success) {
            logger.info(`[Admin] ✓ Generated daily reminder notification`);
          } else {
            logger.warn(`[Admin] ✗ Failed to generate reminder: ${reminderResult.error}`);
          }
        }
      }

      const duration = Date.now() - startTime;

      res.json({
        success: true,
        userId: targetUserId,
        embeddingsSynced: embeddingCount,
        insightsGenerated: insights.length,
        insights: insights.map(i => ({
          category: i.category,
          pattern: i.pattern,
          confidence: Math.round(i.confidence * 100),
          isNew: i.isNew,
        })),
        notification: withNotification ? {
          triggered: reminderResult?.success || false,
          error: reminderResult?.error,
          reminder: reminderResult?.reminder,
        } : null,
        durationMs: duration,
      });

    } catch (error: any) {
      logger.error('[Admin] Error triggering insights generation:', error);
      res.status(500).json({ 
        success: false,
        error: "Failed to generate insights",
        message: error.message 
      });
    }
  });

  // System settings management
  app.get('/api/admin/settings', isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const settingKey = req.query.key as string | undefined;

      if (settingKey) {
        // Get specific setting
        const [setting] = await db
          .select()
          .from(systemSettings)
          .where(eq(systemSettings.settingKey, settingKey))
          .limit(1);

        if (!setting) {
          return res.status(404).json({ error: "Setting not found" });
        }

        res.json(setting);
      } else {
        // Get all settings
        const settings = await db
          .select()
          .from(systemSettings)
          .orderBy(systemSettings.settingKey);

        res.json(settings);
      }
    } catch (error) {
      logger.error('[Admin] Error fetching system settings:', error);
      res.status(500).json({ error: "Failed to fetch system settings" });
    }
  });

  app.post('/api/admin/settings', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;

      // Validate request body
      const validationResult = insertSystemSettingsSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const { settingKey, settingValue, description } = validationResult.data;

      // Upsert setting (insert or update if exists)
      const [setting] = await db
        .insert(systemSettings)
        .values({
          settingKey,
          settingValue,
          description,
        })
        .onConflictDoUpdate({
          target: systemSettings.settingKey,
          set: {
            settingValue,
            description,
            updatedAt: new Date(),
          },
        })
        .returning();

      logger.info(`[Admin] System setting updated: ${settingKey} by ${adminId}`);
      res.json(setting);
    } catch (error) {
      logger.error('[Admin] Error updating system setting:', error);
      res.status(500).json({ error: "Failed to update system setting" });
    }
  });

  // ==========================================
  // Correlation Engine Admin Routes
  // ==========================================

  app.post('/api/admin/correlation/analyze', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { correlationInsightService } = await import('../services/correlationInsightService');
      const result = await correlationInsightService.runFullAnalysis(userId);

      logger.info(`[Admin] Correlation analysis triggered for ${userId}`, {
        anomalies: result.anomalies.length,
        insights: result.insights.length,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('[Admin] Correlation analysis failed:', error);
      res.status(500).json({ error: error.message || "Failed to run correlation analysis" });
    }
  });

  app.post('/api/admin/correlation/analyze-with-notification', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { correlationInsightService } = await import('../services/correlationInsightService');
      const result = await correlationInsightService.runFullAnalysisWithNotification(userId);

      logger.info(`[Admin] Correlation analysis with notification triggered for ${userId}`, {
        anomalies: result.anomalies.length,
        insights: result.insights.length,
        brainInsightsStored: result.brainInsightsStored,
        notificationSent: result.notificationSent,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('[Admin] Correlation analysis with notification failed:', error);
      res.status(500).json({ error: error.message || "Failed to run correlation analysis" });
    }
  });

  app.post('/api/admin/correlation/simulate', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId, scenario } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const validScenarios = ['illness', 'recovery', 'single_metric'];
      const selectedScenario = validScenarios.includes(scenario) ? scenario : 'single_metric';

      const { correlationInsightService } = await import('../services/correlationInsightService');
      const result = await correlationInsightService.simulateAnomalyForTesting(userId, selectedScenario);

      logger.info(`[Admin] Simulated ${selectedScenario} scenario for ${userId}`);

      res.json({
        scenario: selectedScenario,
        ...result,
      });
    } catch (error: any) {
      logger.error('[Admin] Simulation failed:', error);
      res.status(500).json({ error: error.message || "Failed to simulate anomaly" });
    }
  });

  app.get('/api/admin/correlation/insights/:userId', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const { correlationInsightService } = await import('../services/correlationInsightService');
      const insights = await correlationInsightService.getRecentInsights(userId, limit);

      res.json({ insights });
    } catch (error: any) {
      logger.error('[Admin] Failed to fetch correlation insights:', error);
      res.status(500).json({ error: error.message || "Failed to fetch insights" });
    }
  });

  app.post('/api/admin/correlation/feedback', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId, feedbackId, question, responseValue, responseText, channel } = req.body;
      
      if (!userId || !feedbackId || !question || responseValue === undefined) {
        return res.status(400).json({ error: "userId, feedbackId, question, and responseValue are required" });
      }

      const { correlationInsightService } = await import('../services/correlationInsightService');
      await correlationInsightService.recordFeedbackResponse(
        userId,
        feedbackId,
        question,
        { value: responseValue, text: responseText },
        channel || 'in_app'
      );

      logger.info(`[Admin] Recorded feedback response for ${userId}`);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('[Admin] Failed to record feedback:', error);
      res.status(500).json({ error: error.message || "Failed to record feedback" });
    }
  });

  /**
   * ============================================================================
   * ML BASELINE VALIDATION ENDPOINTS
   * ============================================================================
   * 
   * Step 1 of ML Architecture Refactor:
   * These endpoints allow validation of ClickHouse as the single source of truth
   * by comparing results against shadow math implementations.
   */
  
  app.get('/api/admin/ml/unified-analysis/:userId', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const windowDays = parseInt(req.query.windowDays as string) || 90;
      const lookbackHours = parseInt(req.query.lookbackHours as string) || 48;

      const { getHealthId } = await import('../services/supabaseHealthStorage');
      const healthId = await getHealthId(userId);
      
      if (!healthId) {
        return res.status(404).json({ error: "Health ID not found for user" });
      }

      const { clickhouseBaselineEngine } = await import('../services/clickhouseBaselineEngine');
      const result = await clickhouseBaselineEngine.getMetricsForAnalysis(healthId, {
        windowDays,
        lookbackHours,
      });

      logger.info(`[Admin] Unified ML analysis for ${userId}: ${result.metrics.length} metrics, ${result.anomalies.length} anomalies`);
      res.json(result);
    } catch (error: any) {
      logger.error('[Admin] Unified ML analysis failed:', error);
      res.status(500).json({ error: error.message || "Failed to run unified analysis" });
    }
  });

  // NOTE: /api/admin/ml/baseline-comparison/:userId endpoint REMOVED in Stage 3
  // Shadow math comparison is no longer needed - ClickHouse is the single source of truth

  app.get('/api/admin/ml/source-of-truth-status', isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const { clickhouseBaselineEngine } = await import('../services/clickhouseBaselineEngine');
      const isInitialized = await clickhouseBaselineEngine.ensureInitialized();

      res.json({
        status: isInitialized ? 'operational' : 'unavailable',
        sourceOfTruth: 'ClickHouseBaselineEngine',
        removedSystems: [
          'anomalyDetectionEngine.calculateBaseline() - REMOVED',
          'baselineComparisonLogger - REMOVED',
          'Shadow math comparison endpoints - REMOVED',
        ],
        unifiedApi: 'clickhouseBaselineEngine.getMetricsForAnalysis()',
        refactorStep: 3,
        description: 'Stage 3 Complete - ClickHouse is the single source of truth. Shadow math removed.',
      });
    } catch (error: any) {
      logger.error('[Admin] ML status check failed:', error);
      res.status(500).json({ error: error.message || "Failed to check ML status" });
    }
  });

  // NOTE: The following endpoints were REMOVED in Stage 3 (shadow math removal):
  // - /api/admin/ml/rag-comparison/:userId
  // - /api/admin/ml/neon-comparison/:userId  
  // - /api/admin/ml/full-comparison/:userId
  // ClickHouse is now the single source of truth - no comparison needed.

  /**
   * ============================================================================
   * CLICKHOUSE FULL HISTORY SYNC
   * ============================================================================
   * 
   * Triggers a full history sync from Supabase to ClickHouse for a specific user.
   * Use this when a user has no ClickHouse data and baselines are falling back to
   * population defaults. This syncs ALL historical data instead of just the last day.
   * 
   * Supports both session-based admin auth and CLI key auth (X-Admin-CLI-Key header).
   */
  app.post('/api/admin/ml/full-sync/:userId', async (req: any, res) => {
    try {
      // Check for CLI key auth first
      const cliKey = req.headers['x-admin-cli-key'];
      const expectedKey = process.env.ADMIN_CLI_KEY;
      
      const isCliAuth = cliKey && expectedKey && cliKey === expectedKey;
      
      // If not CLI auth, require session-based admin auth
      if (!isCliAuth) {
        // Check session auth
        if (!req.user?.claims?.sub) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        const user = await storage.getUser(req.user.claims.sub);
        if (!user || user.role !== 'admin') {
          return res.status(403).json({ message: "Forbidden - Admin access required" });
        }
      }
      
      const { userId } = req.params;
      
      const { getHealthId } = await import('../services/supabaseHealthStorage');
      const { clickhouseBaselineEngine } = await import('../services/clickhouseBaselineEngine');
      
      const healthId = await getHealthId(userId);
      if (!healthId) {
        return res.status(404).json({ error: "Health ID not found for user" });
      }

      logger.info(`[Admin] Starting full ClickHouse sync for user ${userId} (healthId: ${healthId})`);
      
      // Run comprehensive sync with null daysBack to get full history
      const syncResult = await clickhouseBaselineEngine.syncAllHealthData(healthId, null);
      
      logger.info(`[Admin] Full sync complete for ${userId}:`, syncResult);
      
      res.json({
        success: true,
        userId,
        healthId,
        syncResult,
        message: `Synced ${syncResult.total} total records to ClickHouse`,
      });
    } catch (error: any) {
      logger.error('[Admin] Full sync failed:', error);
      res.status(500).json({ error: error.message || "Failed to run full sync" });
    }
  });

  /**
   * ============================================================================
   * CLICKHOUSE FULL HISTORY SYNC BY HEALTH_ID
   * ============================================================================
   * 
   * Same as above but accepts health_id directly (for production use when you
   * have health_ids but not user_ids in Neon).
   */
  app.post('/api/admin/ml/full-sync-by-health-id/:healthId', async (req: any, res) => {
    try {
      // Check for CLI key auth first
      const cliKey = req.headers['x-admin-cli-key'];
      const expectedKey = process.env.ADMIN_CLI_KEY;
      
      const isCliAuth = cliKey && expectedKey && cliKey === expectedKey;
      
      // If not CLI auth, require session-based admin auth
      if (!isCliAuth) {
        if (!req.user?.claims?.sub) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        const user = await storage.getUser(req.user.claims.sub);
        if (!user || user.role !== 'admin') {
          return res.status(403).json({ message: "Forbidden - Admin access required" });
        }
      }
      
      const { healthId } = req.params;
      
      if (!healthId || healthId.length < 10) {
        return res.status(400).json({ error: "Invalid health_id" });
      }

      const { clickhouseBaselineEngine } = await import('../services/clickhouseBaselineEngine');

      logger.info(`[Admin] Starting full ClickHouse sync for health_id: ${healthId}`);
      
      // Run comprehensive sync with null daysBack to get full history
      const syncResult = await clickhouseBaselineEngine.syncAllHealthData(healthId, null);
      
      logger.info(`[Admin] Full sync complete for health_id ${healthId}:`, syncResult);
      
      res.json({
        success: true,
        healthId,
        syncResult,
        message: `Synced ${syncResult.total} total records to ClickHouse`,
      });
    } catch (error: any) {
      logger.error('[Admin] Full sync by health_id failed:', error);
      res.status(500).json({ error: error.message || "Failed to run full sync" });
    }
  });

  /**
   * ============================================================================
   * DATA PARITY REPORT - ClickHouse vs Supabase Comparison
   * ============================================================================
   * 
   * Compares activity metrics (steps, active_energy) between ClickHouse and Supabase
   * to identify any discrepancies, particularly Oura + HealthKit duplicate issues.
   */
  app.get('/api/admin/data-parity/:userId', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const days = parseInt(req.query.days as string) || 14;
      
      const { getHealthId } = await import('../services/supabaseHealthStorage');
      const { getClickHouseClient, isClickHouseEnabled } = await import('../services/clickhouseService');
      const { getSupabaseClient } = await import('../services/supabaseClient');
      
      const healthId = await getHealthId(userId);
      if (!healthId) {
        return res.status(404).json({ error: "Health ID not found for user" });
      }
      
      const errors: string[] = [];
      const report: any = {
        userId,
        healthId,
        generatedAt: new Date().toISOString(),
        daysAnalyzed: days,
        clickhouse: { available: false, metrics: {}, error: null },
        supabase: { available: false, metrics: {}, error: null },
        discrepancies: [],
        summary: {},
        errors: [],
      };
      
      // Query ClickHouse for activity metrics - keep per-source breakdown
      if (isClickHouseEnabled()) {
        const ch = getClickHouseClient();
        if (ch) {
          try {
            // Query returns per-source values so we can detect duplicates
            const chResult = await ch.query({
              query: `
                SELECT 
                  local_date,
                  metric_type,
                  source,
                  sum(value) as total_value,
                  count() as sample_count
                FROM flo_health.health_metrics FINAL
                WHERE health_id = {healthId:String}
                  AND local_date >= today() - {days:UInt32}
                  AND metric_type IN ('steps', 'active_energy')
                GROUP BY local_date, metric_type, source
                ORDER BY local_date DESC, metric_type, source
              `,
              query_params: { healthId, days },
              format: 'JSONEachRow',
            });
            
            const chRows = await chResult.json() as any[];
            report.clickhouse.available = true;
            
            // Group by date and metric, keeping all sources
            const chMetrics: Record<string, Record<string, { total: number; bySource: Record<string, number> }>> = {};
            for (const row of chRows) {
              const dateKey = row.local_date;
              if (!chMetrics[dateKey]) chMetrics[dateKey] = {};
              if (!chMetrics[dateKey][row.metric_type]) {
                chMetrics[dateKey][row.metric_type] = { total: 0, bySource: {} };
              }
              chMetrics[dateKey][row.metric_type].bySource[row.source] = row.total_value;
              chMetrics[dateKey][row.metric_type].total += row.total_value;
            }
            report.clickhouse.metrics = chMetrics;
          } catch (chError: any) {
            report.clickhouse.error = chError.message;
            errors.push(`ClickHouse: ${chError.message}`);
            logger.error(`[DataParity] ClickHouse query error: ${chError.message}`);
          }
        }
      } else {
        report.clickhouse.error = 'ClickHouse not enabled';
      }
      
      // Query Supabase for activity metrics (user_daily_metrics table)
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - days);
          const startDateStr = startDate.toISOString().split('T')[0];
          
          const { data: sbRows, error: sbError } = await supabase
            .from('user_daily_metrics')
            .select('local_date, steps, active_energy, steps_sources, active_energy_sources')
            .eq('health_id', healthId)
            .gte('local_date', startDateStr)
            .order('local_date', { ascending: false });
          
          if (sbError) {
            report.supabase.error = sbError.message;
            errors.push(`Supabase: ${sbError.message}`);
            logger.error(`[DataParity] Supabase query error: ${sbError.message}`);
          } else if (sbRows) {
            report.supabase.available = true;
            const sbMetrics: Record<string, { steps?: number; active_energy?: number; sources?: any }> = {};
            for (const row of sbRows) {
              // sources are already arrays from Supabase, no JSON.parse needed
              const stepsSources = Array.isArray(row.steps_sources) ? row.steps_sources : [];
              const energySources = Array.isArray(row.active_energy_sources) ? row.active_energy_sources : [];
              
              sbMetrics[row.local_date] = {
                steps: row.steps,
                active_energy: row.active_energy,
                sources: {
                  steps: stepsSources,
                  active_energy: energySources,
                },
              };
            }
            report.supabase.metrics = sbMetrics;
          }
        } catch (sbError: any) {
          report.supabase.error = sbError.message;
          errors.push(`Supabase: ${sbError.message}`);
          logger.error(`[DataParity] Supabase query exception: ${sbError.message}`);
        }
      } else {
        report.supabase.error = 'Supabase client not available';
      }
      
      // If both databases failed, return error
      if (!report.clickhouse.available && !report.supabase.available) {
        return res.status(502).json({ 
          error: "Could not query either database", 
          details: errors 
        });
      }
      
      // Compare and find discrepancies
      const chDates = Object.keys(report.clickhouse.metrics);
      const sbDates = Object.keys(report.supabase.metrics);
      const allDates = Array.from(new Set([...chDates, ...sbDates])).sort().reverse();
      
      for (const date of allDates) {
        const chData = report.clickhouse.metrics[date] || {};
        const sbData = report.supabase.metrics[date] || {};
        
        // Check steps discrepancy
        const chSteps = chData.steps?.total;
        const sbSteps = sbData.steps;
        if (chSteps !== undefined && sbSteps !== undefined) {
          const diff = Math.abs(chSteps - sbSteps);
          const diffPct = sbSteps > 0 ? (diff / sbSteps) * 100 : 0;
          if (diffPct > 5) {
            report.discrepancies.push({
              date,
              metric: 'steps',
              clickhouse: chSteps,
              clickhouseSources: chData.steps?.bySource,
              supabase: sbSteps,
              supabaseSources: sbData.sources?.steps,
              difference: diff,
              diffPercent: diffPct.toFixed(1) + '%',
            });
          }
        }
        
        // Check active_energy discrepancy
        const chEnergy = chData.active_energy?.total;
        const sbEnergy = sbData.active_energy;
        if (chEnergy !== undefined && sbEnergy !== undefined) {
          const diff = Math.abs(chEnergy - sbEnergy);
          const diffPct = sbEnergy > 0 ? (diff / sbEnergy) * 100 : 0;
          if (diffPct > 5) {
            report.discrepancies.push({
              date,
              metric: 'active_energy',
              clickhouse: chEnergy,
              clickhouseSources: chData.active_energy?.bySource,
              supabase: sbEnergy,
              supabaseSources: sbData.sources?.active_energy,
              difference: diff,
              diffPercent: diffPct.toFixed(1) + '%',
            });
          }
        }
      }
      
      // Check for Oura sources in both ClickHouse and Supabase data
      const ouraPatterns = ['oura', 'ouraring', 'com.ouraring'];
      const ouraSourceWarnings: any[] = [];
      
      // Check ClickHouse sources
      for (const [date, metrics] of Object.entries(report.clickhouse.metrics) as [string, any][]) {
        for (const [metricType, data] of Object.entries(metrics) as [string, any][]) {
          const sources = Object.keys(data.bySource || {});
          const ouraSources = sources.filter((s: string) => 
            ouraPatterns.some(p => s?.toLowerCase().includes(p))
          );
          if (ouraSources.length > 0) {
            ouraSourceWarnings.push({
              date,
              metric: metricType,
              database: 'clickhouse',
              ouraSources,
              ouraValue: ouraSources.reduce((sum, src) => sum + (data.bySource[src] || 0), 0),
              allSources: sources,
            });
          }
        }
      }
      
      // Check Supabase sources
      for (const [date, data] of Object.entries(report.supabase.metrics) as [string, any][]) {
        const stepsSources: string[] = data.sources?.steps || [];
        const energySources: string[] = data.sources?.active_energy || [];
        
        const ouraStepsSources = stepsSources.filter((s: string) => 
          ouraPatterns.some(p => s?.toLowerCase().includes(p))
        );
        const ouraEnergySources = energySources.filter((s: string) => 
          ouraPatterns.some(p => s?.toLowerCase().includes(p))
        );
        
        if (ouraStepsSources.length > 0) {
          ouraSourceWarnings.push({
            date,
            metric: 'steps',
            database: 'supabase',
            ouraSources: ouraStepsSources,
            allSources: stepsSources,
          });
        }
        if (ouraEnergySources.length > 0) {
          ouraSourceWarnings.push({
            date,
            metric: 'active_energy',
            database: 'supabase',
            ouraSources: ouraEnergySources,
            allSources: energySources,
          });
        }
      }
      
      report.summary = {
        datesWithClickHouseData: chDates.length,
        datesWithSupabaseData: sbDates.length,
        discrepancyCount: report.discrepancies.length,
        ouraSourceWarnings: ouraSourceWarnings.length,
      };
      report.ouraWarnings = ouraSourceWarnings;
      report.errors = errors;
      
      logger.info(`[DataParity] Generated report for ${userId}: ${report.discrepancies.length} discrepancies, ${ouraSourceWarnings.length} Oura source warnings`);
      res.json(report);
    } catch (error: any) {
      logger.error('[Admin] Data parity report failed:', error);
      res.status(500).json({ error: error.message || "Failed to generate data parity report" });
    }
  });
}
