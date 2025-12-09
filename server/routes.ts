// Reference: javascript_log_in_with_replit and javascript_object_storage blueprints
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { calculateAgeFromBirthYear } from "@shared/utils/ageCalculation";
import { setupAuth, isAuthenticated } from "./replitAuth";
import type { GrokChatMessage } from "./services/grokClient";
import { geminiChatClient, type GeminiChatMessage } from "./services/geminiChatClient";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { analyzeBloodWork } from "./openai";
import { generateBiomarkerInsightsGemini } from "./services/geminiInsightsClient";
import { enrichBiomarkerData } from "./utils/biomarker-enrichment";
import { registerAdminRoutes } from "./routes/admin";
import mobileAuthRouter from "./routes/mobileAuth";
import billingRouter from "./routes/billing";
import { 
  canUploadLab,
  canAccessOracle,
  canSendOracleMsg,
  canAccessInsights,
  canAccessFlomentum,
} from "./middleware/planEnforcement";
import { aiEndpointRateLimiter, uploadRateLimiter } from "./middleware/rateLimiter";
import { logger } from "./logger";
import { sendBugReportEmail, sendSupportRequestEmail } from "./services/emailService";
import { fillMissingMetricsFromSamples, backfillMissingMetrics } from "./services/healthkitSampleAggregator";
import * as healthRouter from "./services/healthStorageRouter";
import { eq, desc, and, gte, gt, sql, isNull, isNotNull, or } from "drizzle-orm";
import { 
  updateDemographicsSchema, 
  updateHealthBaselineSchema, 
  updateGoalsSchema, 
  updateAIPersonalizationSchema,
  updateReminderPreferencesSchema,
  listUsersQuerySchema,
  updateUserSchema,
  normalizationInputSchema,
  bulkNormalizationInputSchema,
  getBiomarkersQuerySchema,
  getBiomarkerUnitsQuerySchema,
  getBiomarkerReferenceRangeQuerySchema,
  healthkitSamples,
  healthkitWorkouts,
  userDailyMetrics,
  insertUserDailyMetricsSchema,
  userDailyReadiness,
  sleepNights,
  sleepSubscores,
  insertSleepNightsSchema,
  insertSleepSubscoresSchema,
  userSettings as userSettingsTable,
  healthDailyMetrics,
  flomentumDaily,
  flomentumWeekly,
  healthBaselines,
  notificationTriggers,
  deviceTokens,
  apnsConfiguration,
  biomarkers,
  biomarkerSynonyms,
  biomarkerTestSessions,
  biomarkerMeasurements,
  insertNotificationTriggerSchema,
  insightCards,
  bloodWorkRecords,
  dailyInsights,
  insightFeedback,
  insertInsightFeedbackSchema,
  actionPlanItems,
  insertActionPlanItemSchema,
  ActionPlanStatusEnum,
  users,
  userDailyEngagement,
  developerMessages,
  developerMessageReads,
  userFeedback,
  sieBrainstormSessions,
  userInsights,
  openaiUsageEvents,
  sessions,
} from "@shared/schema";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { requireAdmin } from "./middleware/rbac";
import Stripe from "stripe";
import multer from "multer";
import crypto from "crypto";
import { extractRawBiomarkers } from "./services/simpleExtractor";
import { normalizeBatch } from "./services/normalizer";
import { processLabUpload } from "./services/labProcessor";
import { extractCalciumScoreFromPdf } from "./services/calciumScoreExtractor";
import { extractCalciumScoreExperimental } from "./services/calciumScoreExtractorExperimental";
import { extractDexaScan } from "./services/dexaScanExtractor";
import { extractDexaScanExperimental } from "./services/dexaScanExtractorExperimental";
import { normalizeMeasurement } from "@shared/domain/biomarkers";
import { computeDailyReadiness } from "./services/readinessEngine";
import { updateAllBaselines } from "./services/baselineCalculator";
import { calculateSleepScore } from "./services/sleepScoringEngine";
import { calculateSleepBaselinesForUser } from "./services/sleepBaselineCalculator";
import * as supabaseHealthStorage from "./services/supabaseHealthStorage";
import { processBiomarkerNotifications } from "./services/notificationTriggerService";
import { 
  calculatePhenoAge, 
  calculatePhenoAgeAccel, 
  UnitConverter,
  validatePhenoAgeInputs,
  type PhenoAgeInputs
} from "@shared/utils/phenoage";
import { generateDailyInsights } from "./services/insightsEngineV2";
import { triggerInsightsGenerationCheck } from "./services/insightsSchedulerV2";
import { format } from "date-fns";
import { 
  upsertNutritionDaily, 
  processMindfulnessSession, 
  getMindfulnessSummary, 
  getNutritionSummary 
} from "./services/nutritionMindfulnessAggregator";
import {
  createMedicalDocument,
  getMedicalDocuments,
  getMedicalDocument,
  deleteMedicalDocument,
  searchMedicalDocuments,
  updateMedicalDocumentType,
  getDocumentTypes,
  type MedicalDocumentType
} from "./services/medicalDocumentService";

// Rate limiter for ClickHouse anomaly detection to prevent spam
// Only run anomaly detection once per user per 6 hours
const anomalyDetectionCooldowns = new Map<string, number>();
const ANOMALY_DETECTION_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

function shouldRunAnomalyDetection(userId: string): boolean {
  const lastRun = anomalyDetectionCooldowns.get(userId);
  const now = Date.now();
  
  if (!lastRun || (now - lastRun) > ANOMALY_DETECTION_COOLDOWN_MS) {
    anomalyDetectionCooldowns.set(userId, now);
    return true;
  }
  return false;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Apple App Site Association for Universal Links (iOS deep linking)
  app.get('/.well-known/apple-app-site-association', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({
      applinks: {
        apps: [],
        details: [
          {
            appID: "QRJGSY642V.com.flo.healthapp",
            paths: ["/verify-email", "/verify-email/*", "/reset-password", "/reset-password/*"]
          }
        ]
      },
      webcredentials: {
        apps: ["QRJGSY642V.com.flo.healthapp"]
      }
    });
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      logger.error('Error fetching user:', error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // GET /api/auth/ws-token - Generate a short-lived JWT for WebSocket connections
  // This allows session-authenticated users (Replit Auth) to use WebSocket features
  app.get('/api/auth/ws-token', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const jwt = await import('jsonwebtoken');
      const secret = process.env.SESSION_SECRET;
      
      if (!secret) {
        logger.error('[WS Token] SESSION_SECRET not configured');
        return res.status(500).json({ error: 'Server configuration error' });
      }
      
      // Generate a short-lived token (5 minutes) for WebSocket auth
      const token = jwt.default.sign(
        { sub: userId },
        secret,
        { expiresIn: '5m' }
      );
      
      logger.info('[WS Token] Generated token for user', { userId });
      res.json({ token });
    } catch (error: any) {
      logger.error('[WS Token] Error generating token:', error);
      res.status(500).json({ error: 'Failed to generate token' });
    }
  });

  // DELETE /api/user/data - Delete all user data (for testing/cleanup)
  app.delete('/api/user/data', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Delete all user data (sessions, measurements, uploads, records)
      await storage.deleteUserData(userId);
      
      res.status(204).send();
    } catch (error) {
      logger.error('Error deleting user data:', error);
      res.status(500).json({ error: "Failed to delete user data" });
    }
  });

  // POST /api/support/bug-report - Submit a bug report
  app.post('/api/support/bug-report', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title, description, severity } = req.body;

      if (!title || !description) {
        return res.status(400).json({ error: "Title and description are required" });
      }

      if (severity && !['low', 'medium', 'high'].includes(severity)) {
        return res.status(400).json({ error: "Invalid severity level" });
      }

      // Get user email for reply-to
      const user = await storage.getUser(userId);
      const userEmail = user?.email;

      const success = await sendBugReportEmail(
        title,
        description,
        severity || 'medium',
        userEmail || undefined,
        userId
      );

      if (!success) {
        return res.status(500).json({ error: "Failed to send bug report" });
      }

      logger.info('Bug report submitted', { userId, title, severity });
      res.json({ success: true, message: "Bug report submitted successfully" });
    } catch (error) {
      logger.error('Error submitting bug report:', error);
      res.status(500).json({ error: "Failed to submit bug report" });
    }
  });

  // POST /api/support/contact - Submit a support request
  app.post('/api/support/contact', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, email, subject, message } = req.body;

      if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const success = await sendSupportRequestEmail(
        name,
        email,
        subject,
        message,
        userId
      );

      if (!success) {
        return res.status(500).json({ error: "Failed to send support request" });
      }

      logger.info('Support request submitted', { userId, subject });
      res.json({ success: true, message: "Support request submitted successfully" });
    } catch (error) {
      logger.error('Error submitting support request:', error);
      res.status(500).json({ error: "Failed to submit support request" });
    }
  });

  // GET /api/user/export-stats - Get counts for export preview
  app.get('/api/user/export-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getUserExportStats(userId);
      res.json(stats);
    } catch (error) {
      logger.error('Error getting export stats:', error);
      res.status(500).json({ error: "Failed to get export stats" });
    }
  });

  // GET /api/user/export-csv - Export all user data as CSV
  app.get('/api/user/export-csv', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const csvContent = await storage.exportUserDataAsCsv(userId);
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="flo-health-data-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } catch (error) {
      logger.error('Error exporting user data:', error);
      res.status(500).json({ error: "Failed to export user data" });
    }
  });

  // Object storage routes
  const objectStorageService = new ObjectStorageService();

  // Get upload URL for blood work file
  app.post("/api/objects/upload", isAuthenticated, uploadRateLimiter, async (req, res) => {
    try {
      const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL, objectPath });
    } catch (error) {
      logger.error('Error getting upload URL:', error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve private objects (blood work files)
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      logger.error('Error accessing object:', error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // ============================================================================
  // iOS Shortcuts API - Quick Life Event Logging
  // ============================================================================
  
  // Middleware: Validate API key authentication
  const validateApiKey = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'API key required. Use Authorization: Bearer YOUR_API_KEY' });
    }
    
    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    const { validateApiKey: validateKey } = await import('./services/apiKeyService');
    const userId = await validateKey(apiKey);
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Attach userId to request for use in endpoint
    req.userId = userId;
    next();
  };
  
  // GET /api/user/api-key - Get API key info (without revealing the key)
  app.get("/api/user/api-key", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { getApiKeyInfo } = await import('./services/apiKeyService');
      
      const keyInfo = await getApiKeyInfo(userId);
      
      if (!keyInfo) {
        return res.json({ hasKey: false });
      }
      
      res.json({
        hasKey: true,
        ...keyInfo,
      });
    } catch (error) {
      logger.error('[ApiKey] Error fetching API key info:', error);
      res.status(500).json({ error: 'Failed to fetch API key info' });
    }
  });
  
  // POST /api/user/api-key/generate - Generate or regenerate API key
  app.post("/api/user/api-key/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { generateApiKey } = await import('./services/apiKeyService');
      
      const plainKey = await generateApiKey(userId);
      
      res.json({
        success: true,
        apiKey: plainKey, // Show ONCE - never stored in plaintext
        message: 'Save this key securely. You won\'t be able to see it again.',
      });
    } catch (error) {
      logger.error('[ApiKey] Error generating API key:', error);
      res.status(500).json({ error: 'Failed to generate API key' });
    }
  });
  
  // DELETE /api/user/api-key - Revoke API key
  app.delete("/api/user/api-key", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { revokeApiKey } = await import('./services/apiKeyService');
      
      await revokeApiKey(userId);
      
      res.json({ success: true });
    } catch (error) {
      logger.error('[ApiKey] Error revoking API key:', error);
      res.status(500).json({ error: 'Failed to revoke API key' });
    }
  });
  
  // POST /api/life-events - Quick log life events (for iOS Shortcuts)
  app.post("/api/life-events", validateApiKey, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { eventType, details } = req.body;
      
      if (!eventType) {
        return res.status(400).json({ error: 'eventType is required' });
      }
      
      // Validate eventType (matches lifeEventParser types)
      const validEventTypes = [
        'ice_bath', 'sauna', 'alcohol', 'late_meal', 'supplements', 
        'workout', 'stress', 'breathwork', 'caffeine', 'symptoms',
        'health_goal', 'observation', 'other'
      ];
      
      if (!validEventTypes.includes(eventType)) {
        return res.status(400).json({ 
          error: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}` 
        });
      }
      
      const eventDetails = details || {};
      
      // Log event to Supabase (health data must go to Supabase for privacy/security)
      const { isSupabaseHealthEnabled, createLifeEvent } = await import('./services/healthStorageRouter');
      
      if (!isSupabaseHealthEnabled()) {
        logger.error(`[LifeEvents] Supabase health storage not enabled - cannot store health data`);
        return res.status(503).json({ error: "Health storage not available" });
      }
      
      const inserted = await createLifeEvent(userId, {
        eventType,
        details: eventDetails,
        notes: `Quick-logged via iOS Shortcut`, // Track source
      });
      
      logger.info(`[LifeEvents] Quick-logged ${eventType} for user ${userId} via API key`);
      
      // Trigger ClickHouse life events sync (non-blocking background task)
      (async () => {
        try {
          const { isClickHouseEnabled } = await import('./services/clickhouseService');
          if (isClickHouseEnabled()) {
            const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
            const { getHealthId } = await import('./services/supabaseHealthStorage');
            const healthId = await getHealthId(userId);
            
            const syncedCount = await clickhouseBaselineEngine.syncLifeEvents(healthId, 7);
            logger.info(`[ClickHouseML] Auto-synced ${syncedCount} life events for ${userId}`);
          }
        } catch (clickhouseError: any) {
          logger.warn(`[ClickHouseML] Life events sync failed for ${userId}:`, clickhouseError.message);
        }
      })();
      
      res.status(201).json({
        success: true,
        event: {
          id: inserted.id,
          eventType: inserted.event_type || inserted.eventType,
          happenedAt: inserted.happened_at || inserted.happenedAt,
        }
      });
    } catch (error) {
      logger.error('[LifeEvents] Error quick-logging event:', error);
      res.status(500).json({ error: 'Failed to log event' });
    }
  });

  // Blood work analysis endpoint
  app.post("/api/blood-work/analyze", isAuthenticated, canUploadLab, aiEndpointRateLimiter, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { fileUrl, fileName } = req.body;

      if (!fileUrl || !fileName) {
        return res.status(400).json({ error: "fileUrl and fileName are required" });
      }

      // Set ACL policy for the uploaded file
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        fileUrl,
        {
          owner: userId,
          visibility: "private",
        }
      );

      // Create blood work record
      const record = await storage.createBloodWorkRecord({
        userId,
        fileName,
        fileUrl: normalizedPath,
        status: "processing",
      });

      try {
        // Download PDF from object storage
        const pdfBuffer = await objectStorageService.getObjectEntityBuffer(normalizedPath);

        // Extract raw biomarkers using simplified GPT extraction
        const extractionResult = await extractRawBiomarkers(pdfBuffer);

        if (!extractionResult.success || !extractionResult.data) {
          throw new Error(extractionResult.error || "Extraction failed - no data returned");
        }

        // Validate and parse test date
        if (!extractionResult.data.testDate) {
          throw new Error("Could not extract test date from the lab report. Please ensure the report includes a collection date.");
        }
        
        let testDate: Date;
        try {
          testDate = new Date(extractionResult.data.testDate);
          if (isNaN(testDate.getTime())) {
            throw new Error("Invalid date format");
          }
          // Sanity check: test date shouldn't be in the future or too far in the past
          const now = Date.now();
          const tenYearsAgo = now - (10 * 365.25 * 24 * 60 * 60 * 1000);
          if (testDate.getTime() > now) {
            throw new Error("Test date cannot be in the future");
          }
          if (testDate.getTime() < tenYearsAgo) {
            throw new Error("Test date is more than 10 years old - please verify the date");
          }
        } catch (dateError: any) {
          logger.error('Failed to parse test date:', { 
            extractedDate: extractionResult.data.testDate, 
            error: dateError.message 
          });
          throw new Error(`Invalid test date extracted from report: "${extractionResult.data.testDate}". ${dateError.message}`);
        }

        // Get user profile for normalization context
        const profile = await storage.getProfile(userId);
        const userSex = profile?.sex ?? undefined;
        const userAgeY = calculateAgeFromBirthYear(profile?.birthYear) ?? undefined;

        // Normalize biomarkers
        const normalizationResult = await normalizeBatch(extractionResult.data.biomarkers, {
          userSex,
          userAgeY,
          profileName: "Global Default",
        });
        
        // Check for existing session with same date to prevent duplicates
        // Use UTC-normalized date and efficient direct Supabase query
        const testDateUtc = `${testDate.getUTCFullYear()}-${String(testDate.getUTCMonth() + 1).padStart(2, '0')}-${String(testDate.getUTCDate()).padStart(2, '0')}`;
        const existingSession = await healthRouter.findSessionByDateAndSource(userId, testDateUtc, 'ai_extracted');
        
        if (existingSession) {
          logger.warn(`[BloodWork] Duplicate session detected for ${testDateUtc} - using existing session ${existingSession.id}`);
          // Delete the uploaded PDF since we're not creating a new session
          try {
            await objectStorageService.deleteObjectEntity(normalizedPath);
          } catch (deleteError) {
            logger.warn(`[BloodWork] Failed to delete duplicate PDF: ${deleteError}`);
          }
          await storage.updateBloodWorkRecordStatus(record.id, "completed");
          
          return res.json({ 
            success: true, 
            duplicate: true,
            message: `Lab results for ${testDateUtc} already exist. No duplicate session created.`,
            existingSessionId: existingSession.id,
          });
        }
        
        const session = await healthRouter.createBiomarkerSession(userId, {
          source: "ai_extracted",
          test_date: testDate.toISOString(),
        });

        // Create measurements for successfully normalized biomarkers
        const measurementIds: string[] = [];
        if (normalizationResult.normalized && normalizationResult.normalized.length > 0) {
          for (const normalized of normalizationResult.normalized) {
            // Format canonical value for display (round to reasonable precision)
            const formattedCanonical = Number(normalized.valueCanonical.toFixed(2));
            const displayValue = formattedCanonical % 1 === 0 
              ? formattedCanonical.toString() 
              : normalized.valueCanonical.toFixed(2);
            
            const measurement = await healthRouter.createBiomarkerMeasurement({
              session_id: session.id,
              biomarker_id: normalized.biomarkerId,
              record_id: record.id,
              source: "ai_extracted",
              value_raw: normalized.valueRawNumeric,
              unit_raw: normalized.unitRaw,
              value_canonical: normalized.valueCanonical,
              unit_canonical: normalized.unitCanonical,
              // Use formatted canonical value + unit for display to match reference range units
              value_display: `${displayValue} ${normalized.unitCanonical}`,
              reference_low: normalized.referenceLow ?? null,
              reference_high: normalized.referenceHigh ?? null,
              flags: normalized.flags,
              warnings: normalized.warnings,
              normalization_context: normalized.normalizationContext as any,
            });
            if (measurement?.id) {
              measurementIds.push(measurement.id);
            }
          }
        }

        // Update record status
        await storage.updateBloodWorkRecordStatus(record.id, "completed");

        // Trigger ClickHouse biomarker sync (non-blocking background task)
        (async () => {
          try {
            const { isClickHouseEnabled } = await import('./services/clickhouseService');
            if (isClickHouseEnabled()) {
              const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
              const { getHealthId } = await import('./services/supabaseHealthStorage');
              const healthId = await getHealthId(userId);
              
              const syncedCount = await clickhouseBaselineEngine.syncBiomarkerData(healthId, 365);
              logger.info(`[ClickHouseML] Auto-synced ${syncedCount} biomarkers for ${userId} after blood work upload`);
            }
          } catch (clickhouseError: any) {
            logger.warn(`[ClickHouseML] Biomarker sync failed for ${userId}:`, clickhouseError.message);
          }
        })();

        res.json({ 
          success: true, 
          recordId: record.id,
          sessionId: session.id,
          measurements: {
            normalized: normalizationResult.normalized.length,
            failed: normalizationResult.failed.length,
            skipped: normalizationResult.skipped.length,
          },
          details: {
            normalized: normalizationResult.normalized.map(n => ({
              name: n.biomarkerName,
              value: n.valueRawString,
              unit: n.unitRaw,
            })),
            failed: normalizationResult.failed.map(f => ({
              name: f.raw.biomarker_name_raw,
              error: f.error,
            })),
            skipped: normalizationResult.skipped.map(s => ({
              name: s.raw.biomarker_name_raw,
              reason: s.reason,
            })),
          },
        });
      } catch (analysisError) {
        logger.error('Analysis error:', analysisError);
        await storage.updateBloodWorkRecordStatus(record.id, "failed");
        throw analysisError;
      }
    } catch (error) {
      logger.error('Error analyzing blood work:', error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logger.error('Full error details:', error, {
        message: errorMessage,
        stack: errorStack,
        errorJson: JSON.stringify(error, null, 2),
      });
      
      res.status(500).json({ 
        error: "Failed to analyze blood work",
        details: errorMessage,
      });
    }
  });

  // Get latest blood work with analysis
  app.get("/api/blood-work/latest", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const record = await storage.getLatestBloodWorkRecord(userId);
      
      if (!record) {
        return res.json({ record: null, analysis: null });
      }

      const analysis = await storage.getAnalysisResultByRecordId(record.id);
      res.json({ record, analysis });
    } catch (error) {
      logger.error('Error fetching latest blood work:', error);
      res.status(500).json({ error: "Failed to fetch latest blood work" });
    }
  });

  // Get all blood work records for a user
  app.get("/api/blood-work", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const records = await storage.getBloodWorkRecordsByUser(userId);
      
      // Get analysis for each record
      const recordsWithAnalysis = await Promise.all(
        records.map(async (record) => {
          const analysis = await storage.getAnalysisResultByRecordId(record.id);
          return { record, analysis };
        })
      );

      res.json(recordsWithAnalysis);
    } catch (error) {
      logger.error('Error fetching blood work records:', error);
      res.status(500).json({ error: "Failed to fetch blood work records" });
    }
  });

  // Get specific blood work record with analysis
  app.get("/api/blood-work/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const record = await storage.getBloodWorkRecord(id);
      
      if (!record) {
        return res.status(404).json({ error: "Blood work record not found" });
      }

      // Verify ownership
      if (record.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const analysis = await storage.getAnalysisResultByRecordId(record.id);
      res.json({ record, analysis });
    } catch (error) {
      logger.error('Error fetching blood work record:', error);
      res.status(500).json({ error: "Failed to fetch blood work record" });
    }
  });

  // Lab Work Overdue - Get overdue and upcoming biomarkers that need retesting
  app.get("/api/lab-work-overdue", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const now = new Date();

      // Get all biomarkers from database
      const allBiomarkers = await storage.getBiomarkers();
      const biomarkerMap = new Map(allBiomarkers.map(b => [b.id, b]));

      // Get all test sessions for user (from Supabase via healthRouter)
      const sessions = await healthRouter.getBiomarkerSessions(userId);
      
      if (sessions.length === 0) {
        return res.json({ overdue: [], upcoming: [], hasLabData: false });
      }

      // Get all measurements across sessions - track latest test date per biomarker
      const measurementsByBiomarker = new Map<string, { testDate: Date; biomarkerId: string; biomarkerName: string }>();
      
      for (const session of sessions) {
        const measurements = await healthRouter.getMeasurementsBySession(session.id);
        for (const m of measurements) {
          const biomarker = biomarkerMap.get(m.biomarkerId);
          if (!biomarker) continue;
          
          const existing = measurementsByBiomarker.get(m.biomarkerId);
          // Keep the most recent test date for each biomarker
          if (!existing || new Date(session.testDate) > new Date(existing.testDate)) {
            measurementsByBiomarker.set(m.biomarkerId, { 
              testDate: new Date(session.testDate), 
              biomarkerId: m.biomarkerId,
              biomarkerName: biomarker.name,
            });
          }
        }
      }

      // Define panels and their associated biomarker names (case-insensitive matching)
      // Uses broad pattern matching to catch common lab variations
      const panelDefinitions: { name: string; frequency: number; biomarkerPatterns: string[] }[] = [
        { 
          name: 'Comprehensive Metabolic Panel', 
          frequency: 90, // Quarterly - aligned with BIOMARKER_UPDATE_FREQUENCIES
          biomarkerPatterns: ['glucose', 'creatinine', 'gfr', 'bun', 'sodium', 'potassium', 'chloride', 'co2', 'bicarbonate', 'calcium', 'albumin', 'protein', 'alt', 'ast', 'alp', 'alkaline', 'bilirubin']
        },
        { 
          name: 'Lipid Panel', 
          frequency: 90, // Quarterly
          biomarkerPatterns: ['cholesterol', 'ldl', 'hdl', 'triglyceride', 'apob', 'apolipoprotein b']
        },
        { 
          name: 'Complete Blood Count (CBC)', 
          frequency: 90, // Quarterly
          biomarkerPatterns: ['wbc', 'rbc', 'hemoglobin', 'hematocrit', 'platelet', 'white blood', 'red blood', 'leukocyte', 'erythrocyte', 'mcv', 'mch', 'rdw']
        },
        { 
          name: 'Thyroid Panel (TSH, T3, T4)', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['tsh', 'free t4', 'free t3', 't4 free', 't3 free', 'thyroxine', 'triiodothyronine', 'thyroid']
        },
        { 
          name: 'Iron Panel', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['ferritin', 'iron', 'tibc', 'transferrin']
        },
        { 
          name: 'HbA1c', 
          frequency: 90, // Quarterly
          biomarkerPatterns: ['hba1c', 'a1c', 'hemoglobin a1c', 'glycated', 'glycosylated']
        },
        { 
          name: 'Vitamin D', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['vitamin d', '25-oh d', '25oh', '25-hydroxy', 'd3', 'd2']
        },
        { 
          name: 'Vitamin B12', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['b12', 'cobalamin', 'methylmalonic']
        },
        { 
          name: 'hs-CRP', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['crp', 'c-reactive', 'hscrp', 'hs-crp']
        },
        { 
          name: 'Testosterone (Total & Free)', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['testosterone']
        },
        { 
          name: 'Homocysteine', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['homocysteine']
        },
        { 
          name: 'Uric Acid', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['uric acid', 'urate']
        },
        { 
          name: 'Insulin', 
          frequency: 90, // Quarterly
          biomarkerPatterns: ['insulin']
        },
        { 
          name: 'Folate', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['folate', 'folic acid']
        },
        { 
          name: 'Magnesium', 
          frequency: 180, // Semi-annual
          biomarkerPatterns: ['magnesium']
        },
      ];

      // Helper to check if a biomarker name matches a pattern
      const matchesPattern = (biomarkerName: string, patterns: string[]): boolean => {
        const lowerName = biomarkerName.toLowerCase();
        return patterns.some(pattern => lowerName.includes(pattern.toLowerCase()));
      };

      // Calculate overdue/upcoming per panel based on earliest due date among matching biomarkers
      const overdueList: { id: string; name: string; lastTested: string; dueDate: string; daysOverdue: number; priority: 'high' | 'urgent' }[] = [];
      const upcomingList: { id: string; name: string; lastTested: string; dueDate: string; daysUntilDue: number }[] = [];

      for (const panel of panelDefinitions) {
        // Find all biomarkers that match this panel
        const matchingBiomarkers: { testDate: Date; biomarkerId: string; biomarkerName: string }[] = [];
        
        for (const [biomarkerId, data] of Array.from(measurementsByBiomarker.entries())) {
          if (matchesPattern(data.biomarkerName, panel.biomarkerPatterns)) {
            matchingBiomarkers.push(data);
          }
        }

        if (matchingBiomarkers.length === 0) continue;

        // Find the oldest test date among matching biomarkers (most likely to be overdue)
        const oldestMeasurement = matchingBiomarkers.reduce((oldest, current) => 
          current.testDate < oldest.testDate ? current : oldest
        );

        const dueDate = new Date(oldestMeasurement.testDate.getTime() + (panel.frequency * 24 * 60 * 60 * 1000));
        const daysFromNow = Math.floor((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        if (daysFromNow < 0) {
          // Overdue
          const daysOverdue = Math.abs(daysFromNow);
          overdueList.push({
            id: oldestMeasurement.biomarkerId,
            name: panel.name,
            lastTested: oldestMeasurement.testDate.toISOString().split('T')[0],
            dueDate: dueDate.toISOString().split('T')[0],
            daysOverdue,
            priority: daysOverdue > 30 ? 'urgent' : 'high',
          });
        } else if (daysFromNow <= 28) {
          // Coming up within 4 weeks
          upcomingList.push({
            id: oldestMeasurement.biomarkerId,
            name: panel.name,
            lastTested: oldestMeasurement.testDate.toISOString().split('T')[0],
            dueDate: dueDate.toISOString().split('T')[0],
            daysUntilDue: daysFromNow,
          });
        }
      }

      // Sort overdue by days overdue (most overdue first)
      overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue);
      
      // Sort upcoming by days until due (soonest first)
      upcomingList.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

      res.json({ 
        overdue: overdueList, 
        upcoming: upcomingList, 
        hasLabData: true 
      });
    } catch (error) {
      logger.error('Error fetching lab work overdue:', error);
      res.status(500).json({ error: "Failed to fetch lab work overdue" });
    }
  });

  // Profile routes
  // Get user profile
  app.get("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getProfile(userId);
      
      if (!profile) {
        return res.json(null);
      }

      res.json(profile);
    } catch (error) {
      logger.error('Error fetching profile:', error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Update demographics
  app.patch("/api/profile/demographics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // birthYear is already an integer, no parsing needed
      const requestData = {
        ...req.body,
        birthYear: req.body.birthYear ? Number(req.body.birthYear) : undefined,
      };
      
      // Validate with Zod schema
      const validationResult = updateDemographicsSchema.safeParse(requestData);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const profile = await storage.updateDemographics(userId, validationResult.data);

      res.json(profile);
    } catch (error) {
      logger.error('Error updating demographics:', error);
      res.status(500).json({ error: "Failed to update demographics" });
    }
  });

  // Update health baseline
  app.patch("/api/profile/baseline", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Validate with Zod schema
      const validationResult = updateHealthBaselineSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const profile = await storage.updateHealthBaseline(userId, validationResult.data);

      res.json(profile);
    } catch (error) {
      logger.error('Error updating health baseline:', error);
      res.status(500).json({ error: "Failed to update health baseline" });
    }
  });

  // Update goals
  app.patch("/api/profile/goals", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Validate with Zod schema
      const validationResult = updateGoalsSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const profile = await storage.updateGoals(userId, validationResult.data);

      res.json(profile);
    } catch (error) {
      logger.error('Error updating goals:', error);
      res.status(500).json({ error: "Failed to update goals" });
    }
  });

  // Update AI personalization
  app.patch("/api/profile/personalization", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Validate with Zod schema
      const validationResult = updateAIPersonalizationSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const profile = await storage.updateAIPersonalization(userId, validationResult.data);

      res.json(profile);
    } catch (error) {
      logger.error('Error updating AI personalization:', error);
      res.status(500).json({ error: "Failed to update AI personalization" });
    }
  });

  // Update reminder preferences
  app.patch("/api/profile/reminder-preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Validate with Zod schema
      const validationResult = updateReminderPreferencesSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const user = await storage.updateReminderPreferences(userId, validationResult.data);

      res.json(user);
    } catch (error) {
      logger.error('Error updating reminder preferences:', error);
      res.status(500).json({ error: "Failed to update reminder preferences" });
    }
  });

  // Get voice preference
  app.get("/api/profile/voice-preference", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { VoicePreferenceEnum, VOICE_NAME_TO_GEMINI } = await import('@shared/schema');
      
      const [user] = await db.select({ voicePreference: users.voicePreference })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      const voicePreference = user?.voicePreference || 'Amanda';
      const voiceOptions = VoicePreferenceEnum.options.map(name => ({
        name,
        geminiVoice: VOICE_NAME_TO_GEMINI[name],
        isSelected: name === voicePreference
      }));
      
      res.json({
        current: voicePreference,
        options: voiceOptions
      });
    } catch (error) {
      logger.error('Error fetching voice preference:', error);
      res.status(500).json({ error: "Failed to fetch voice preference" });
    }
  });

  // Update voice preference
  app.patch("/api/profile/voice-preference", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { voicePreference } = req.body;
      const { VoicePreferenceEnum } = await import('@shared/schema');
      
      // Validate voice preference
      const validationResult = VoicePreferenceEnum.safeParse(voicePreference);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Invalid voice preference', 
          valid: VoicePreferenceEnum.options 
        });
      }
      
      await db.update(users)
        .set({ voicePreference: validationResult.data, updatedAt: new Date() })
        .where(eq(users.id, userId));
      
      logger.info('[VoicePreference] Updated', { userId, voicePreference: validationResult.data });
      
      res.json({ voicePreference: validationResult.data });
    } catch (error) {
      logger.error('Error updating voice preference:', error);
      res.status(500).json({ error: "Failed to update voice preference" });
    }
  });

  // Update user timezone (auto-sync from device)
  app.patch("/api/user/timezone", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { timezone, source = 'device_auto' } = req.body;
      
      // Validate timezone is a valid IANA timezone identifier
      if (!timezone || typeof timezone !== 'string') {
        return res.status(400).json({ error: 'Timezone is required' });
      }
      
      // Validate it's a valid IANA timezone by trying to use it
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return res.status(400).json({ error: 'Invalid timezone identifier' });
      }
      
      // Get current timezone to check if it actually changed
      const [currentUser] = await db.select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (currentUser?.timezone === timezone) {
        // No change needed
        return res.json({ 
          timezone, 
          changed: false,
          message: 'Timezone already up to date'
        });
      }
      
      // Update timezone
      await db.update(users)
        .set({ 
          timezone, 
          timezoneSource: source,
          timezoneUpdatedAt: new Date(),
          updatedAt: new Date() 
        })
        .where(eq(users.id, userId));
      
      logger.info('[Timezone] Updated', { 
        userId, 
        timezone, 
        previousTimezone: currentUser?.timezone,
        source 
      });
      
      res.json({ 
        timezone, 
        changed: true,
        previousTimezone: currentUser?.timezone,
        source
      });
    } catch (error) {
      logger.error('Error updating timezone:', error);
      res.status(500).json({ error: "Failed to update timezone" });
    }
  });

  // Get user timezone
  app.get("/api/user/timezone", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const [user] = await db.select({ 
        timezone: users.timezone,
        timezoneSource: users.timezoneSource,
        timezoneUpdatedAt: users.timezoneUpdatedAt
      })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      res.json({
        timezone: user?.timezone || null,
        source: user?.timezoneSource || null,
        lastUpdated: user?.timezoneUpdatedAt || null
      });
    } catch (error) {
      logger.error('Error fetching timezone:', error);
      res.status(500).json({ error: "Failed to fetch timezone" });
    }
  });

  // =============================================
  // 3PM Subjective Survey Routes
  // =============================================
  
  // Submit daily survey
  app.post("/api/surveys/daily", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { energy, clarity, mood, timezone, triggerSource, responseLatencySeconds } = req.body;
      
      // Validate required fields
      if (energy === undefined || clarity === undefined || mood === undefined || !timezone) {
        return res.status(400).json({ error: "energy, clarity, mood, and timezone are required" });
      }
      
      // Validate ranges (1-10, must be integers)
      const energyNum = Number(energy);
      const clarityNum = Number(clarity);
      const moodNum = Number(mood);
      
      if (!Number.isInteger(energyNum) || energyNum < 1 || energyNum > 10) {
        return res.status(400).json({ error: "energy must be an integer between 1 and 10" });
      }
      if (!Number.isInteger(clarityNum) || clarityNum < 1 || clarityNum > 10) {
        return res.status(400).json({ error: "clarity must be an integer between 1 and 10" });
      }
      if (!Number.isInteger(moodNum) || moodNum < 1 || moodNum > 10) {
        return res.status(400).json({ error: "mood must be an integer between 1 and 10" });
      }
      
      // Validate timezone is a valid IANA timezone identifier
      if (typeof timezone !== 'string' || timezone.length === 0) {
        return res.status(400).json({ error: "timezone must be a non-empty string" });
      }
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return res.status(400).json({ error: "Invalid timezone identifier" });
      }
      
      const { submitSurvey } = await import('./services/subjectiveSurveyService');
      const survey = await submitSurvey(userId, {
        energy: energyNum,
        clarity: clarityNum,
        mood: moodNum,
        timezone,
        triggerSource: triggerSource || 'manual',
        responseLatencySeconds: responseLatencySeconds ? Number(responseLatencySeconds) : undefined
      });
      
      res.json(survey);
    } catch (error: any) {
      logger.error('[Survey] Error submitting survey:', error);
      res.status(500).json({ error: error.message || "Failed to submit survey" });
    }
  });
  
  // Get today's survey (if completed)
  app.get("/api/surveys/today", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const timezone = req.query.timezone as string;
      
      if (!timezone || typeof timezone !== 'string' || timezone.length === 0) {
        return res.status(400).json({ error: "timezone query parameter is required" });
      }
      
      // Validate timezone is a valid IANA timezone identifier
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return res.status(400).json({ error: "Invalid timezone identifier" });
      }
      
      const { getTodaySurvey } = await import('./services/subjectiveSurveyService');
      const survey = await getTodaySurvey(userId, timezone);
      
      if (!survey) {
        return res.json({ completed: false, survey: null });
      }
      
      res.json({ completed: true, survey });
    } catch (error: any) {
      logger.error('[Survey] Error fetching today survey:', error);
      res.status(500).json({ error: error.message || "Failed to fetch survey" });
    }
  });
  
  // Get survey history
  app.get("/api/surveys/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const daysBack = parseInt(req.query.days as string) || 30;
      
      const { getSurveyHistory } = await import('./services/subjectiveSurveyService');
      const history = await getSurveyHistory(userId, daysBack);
      
      res.json(history);
    } catch (error: any) {
      logger.error('[Survey] Error fetching survey history:', error);
      res.status(500).json({ error: error.message || "Failed to fetch survey history" });
    }
  });

  // Biomarker normalization routes
  // Single measurement normalization
  app.post("/api/normalize", isAuthenticated, async (req: any, res) => {
    try {
      // Validate input
      const validationResult = normalizationInputSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      // Get all biomarker data
      const { biomarkers, synonyms, units, ranges } = await storage.getAllBiomarkerData();

      // Import normalization function
      const { normalizeMeasurement, BiomarkerNotFoundError, UnitConversionError } = 
        await import("@shared/domain/biomarkers");

      // Normalize the measurement
      const result = normalizeMeasurement(
        validationResult.data,
        biomarkers,
        synonyms,
        units,
        ranges
      );

      res.json(result);
    } catch (error) {
      // Import error classes for instanceof checks
      const { BiomarkerNotFoundError, UnitConversionError } = 
        await import("@shared/domain/biomarkers");
      
      if (error instanceof BiomarkerNotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      if (error instanceof UnitConversionError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error('Error normalizing measurement:', error);
      res.status(500).json({ error: "Failed to normalize measurement" });
    }
  });

  // Bulk measurement normalization
  app.post("/api/bulk-normalize", isAuthenticated, async (req: any, res) => {
    try {
      // Validate input
      const validationResult = bulkNormalizationInputSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      // Get all biomarker data once for efficiency
      const { biomarkers, synonyms, units, ranges } = await storage.getAllBiomarkerData();

      // Import normalization function
      const { normalizeMeasurement } = await import("@shared/domain/biomarkers");

      // Normalize all measurements
      const results = validationResult.data.measurements.map((input, index) => {
        try {
          const result = normalizeMeasurement(
            input,
            biomarkers,
            synonyms,
            units,
            ranges
          );
          return { success: true, data: result, index };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            input,
            index,
          };
        }
      });

      // Calculate success/failure counts
      const totalCount = results.length;
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      // Determine HTTP status code based on success/failure ratio
      let statusCode = 200;
      if (failureCount === totalCount) {
        // All failed
        statusCode = 400;
      } else if (failureCount > 0) {
        // Some failed (partial success)
        statusCode = 207; // Multi-Status
      }
      // If all succeeded (failureCount === 0), keep 200

      res.status(statusCode).json({
        totalCount,
        successCount,
        failureCount,
        results,
      });
    } catch (error) {
      logger.error('Error in bulk normalization:', error);
      res.status(500).json({ error: "Failed to normalize measurements" });
    }
  });

  // Biomarker data routes
  // GET /api/biomarkers - Fetch all biomarkers with optional includes
  app.get("/api/biomarkers", isAuthenticated, async (req: any, res) => {
    try {
      // Validate query parameters
      const validationResult = getBiomarkersQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const { include, groupBy } = validationResult.data;

      // Fetch biomarkers
      const biomarkers = await storage.getBiomarkers();

      // Build response based on include flags
      let response = biomarkers.map(b => ({
        id: b.id,
        name: b.name,
        category: b.category,
        canonicalUnit: b.canonicalUnit,
        displayUnitPreference: b.displayUnitPreference,
      }));

      // If include=units, fetch units for each biomarker
      if (include?.includes("units")) {
        const unitsPromises = biomarkers.map(async (b) => {
          const units = await storage.getUnitConversions(b.id);
          // Get unique units (both fromUnit and toUnit)
          const uniqueUnits = new Set([b.canonicalUnit]);
          units.forEach(u => {
            uniqueUnits.add(u.fromUnit);
            uniqueUnits.add(u.toUnit);
          });
          return { id: b.id, units: Array.from(uniqueUnits) };
        });
        const biomarkerUnits = await Promise.all(unitsPromises);
        const unitsMap = new Map(biomarkerUnits.map(u => [u.id, u.units]));
        
        response = response.map(b => ({
          ...b,
          units: unitsMap.get(b.id) || [b.canonicalUnit],
        }));
      }

      // If include=ranges, fetch ranges for each biomarker
      if (include?.includes("ranges")) {
        const rangesPromises = biomarkers.map(async (b) => {
          const ranges = await storage.getReferenceRanges(b.id);
          return { id: b.id, ranges };
        });
        const biomarkerRanges = await Promise.all(rangesPromises);
        const rangesMap = new Map(biomarkerRanges.map(r => [r.id, r.ranges]));
        
        response = response.map(b => ({
          ...b,
          ranges: rangesMap.get(b.id) || [],
        }));
      }

      // Group by category if requested
      if (groupBy === "category") {
        const grouped = response.reduce((acc, biomarker) => {
          if (!acc[biomarker.category]) {
            acc[biomarker.category] = [];
          }
          acc[biomarker.category].push(biomarker);
          return acc;
        }, {} as Record<string, typeof response>);
        
        return res.json({ biomarkers: grouped });
      }

      res.json({ biomarkers: response });
    } catch (error) {
      logger.error('Error fetching biomarkers:', error);
      res.status(500).json({ error: "Failed to fetch biomarkers" });
    }
  });

  // GET /api/biomarker-sessions - Get all biomarker test sessions with measurements for the logged-in user
  app.get("/api/biomarker-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const includeDuplicates = req.query.includeDuplicates === 'true';

      // Get all test sessions for user
      const sessions = await healthRouter.getBiomarkerSessions(userId);

      // For each session, fetch its measurements
      const sessionsWithMeasurements = await Promise.all(
        sessions.map(async (session) => {
          const measurements = await healthRouter.getMeasurementsBySession(session.id);
          return {
            ...session,
            measurements,
          };
        })
      );

      // Deduplicate sessions by (testDate, source) - keep the session with most measurements
      // This fixes trend line issues caused by duplicate PDF uploads
      if (!includeDuplicates) {
        // Group sessions by normalized UTC date (YYYY-MM-DD) and source
        const sessionsByDateSource = new Map<string, typeof sessionsWithMeasurements[0]>();
        
        for (const session of sessionsWithMeasurements) {
          // Normalize date to UTC YYYY-MM-DD for grouping (consistent timezone handling)
          const testDate = new Date(session.testDate);
          const dateKey = `${testDate.getUTCFullYear()}-${String(testDate.getUTCMonth() + 1).padStart(2, '0')}-${String(testDate.getUTCDate()).padStart(2, '0')}`;
          const key = `${dateKey}|${session.source || 'unknown'}`;
          
          const existing = sessionsByDateSource.get(key);
          if (!existing) {
            sessionsByDateSource.set(key, session);
          } else {
            // Keep the session with more measurements (more complete data)
            // On tie, prefer most recent createdAt
            const existingCount = existing.measurements?.length || 0;
            const currentCount = session.measurements?.length || 0;
            if (currentCount > existingCount) {
              sessionsByDateSource.set(key, session);
            } else if (currentCount === existingCount) {
              // Tie-breaker: prefer most recent createdAt
              const existingCreatedAt = new Date(existing.createdAt || 0).getTime();
              const currentCreatedAt = new Date(session.createdAt || 0).getTime();
              if (currentCreatedAt > existingCreatedAt) {
                sessionsByDateSource.set(key, session);
              }
            }
          }
        }
        
        const deduplicatedSessions = Array.from(sessionsByDateSource.values());
        logger.info(`[BiomarkerSessions] Deduplicated ${sessions.length} sessions to ${deduplicatedSessions.length} unique (date, source) combinations`);
        
        // Log biomarker counts for debugging
        const allBiomarkerIds = new Set<string>();
        deduplicatedSessions.forEach(s => {
          s.measurements?.forEach((m: any) => allBiomarkerIds.add(m.biomarkerId));
        });
        logger.info(`[BiomarkerSessions] Total unique biomarkerIds in deduplicated sessions: ${allBiomarkerIds.size}`);
        
        // Check for Free Testosterone specifically
        const freeTestosteroneId = 'b367037b-2ed0-41e8-9701-bf0e7b38a257';
        let freeTestosteroneSessions = 0;
        deduplicatedSessions.forEach(s => {
          if (s.measurements?.some((m: any) => m.biomarkerId === freeTestosteroneId)) {
            freeTestosteroneSessions++;
          }
        });
        logger.info(`[BiomarkerSessions] Sessions with Free Testosterone after dedup: ${freeTestosteroneSessions}`);
        
        return res.json({ sessions: deduplicatedSessions });
      }

      res.json({ sessions: sessionsWithMeasurements });
    } catch (error) {
      logger.error('Error fetching biomarker sessions:', error);
      res.status(500).json({ error: "Failed to fetch biomarker sessions" });
    }
  });

  // GET /api/biological-age - Calculate biological age using PhenoAge algorithm
  app.get("/api/biological-age", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get user profile to calculate chronological age
      const profile = await storage.getProfile(userId);
      if (!profile || !profile.birthYear) {
        return res.status(400).json({ 
          error: "Birth year not found. Please complete your profile to calculate biological age.",
          missingData: "birthYear"
        });
      }

      // Calculate chronological age using mid-year (July 1st) assumption for ±6 month accuracy
      const ageYears = calculateAgeFromBirthYear(profile.birthYear)!;

      // Get user's latest biomarker test session (from Supabase via healthRouter)
      const sessions = await healthRouter.getBiomarkerSessions(userId);
      if (sessions.length === 0) {
        return res.status(400).json({ 
          error: "No biomarker data found. Please add test results to calculate biological age.",
          missingData: "biomarkers"
        });
      }

      // Sort sessions by date (most recent first)
      const sortedSessions = sessions.sort((a, b) => 
        new Date(b.testDate).getTime() - new Date(a.testDate).getTime()
      );

      // Get all biomarkers to map IDs to names
      const allBiomarkers = await storage.getBiomarkers();
      const biomarkerMapTemp = new Map(allBiomarkers.map(b => [b.id, b]));

      // Required biomarkers for PhenoAge
      const requiredBiomarkerNames = ['Albumin', 'Creatinine', 'Glucose', 'CRP', 'hs-CRP', 'Lymphocytes', 'MCV', 'RDW', 'ALP', 'WBC'];

      // Find the session with the most required biomarkers
      let bestSession = null;
      let bestMeasurements: any[] = [];
      let bestMatchCount = 0;
      
      logger.info(`[BioAge] Checking ${sortedSessions.length} sessions for user ${userId}`);
      
      for (const session of sortedSessions) {
        const sessionMeasurements = await healthRouter.getMeasurementsBySession(session.id);
        if (sessionMeasurements.length === 0) continue;

        // Count how many required biomarkers this session has
        const sessionBiomarkerNames = new Set(
          sessionMeasurements.map(m => biomarkerMapTemp.get(m.biomarkerId)?.name).filter(Boolean)
        );
        const matchCount = requiredBiomarkerNames.filter(name => sessionBiomarkerNames.has(name)).length;

        logger.info(`[BioAge] Session ${session.id} (${session.testDate}): ${matchCount} matches - [${Array.from(sessionBiomarkerNames).join(', ')}]`);

        if (matchCount > bestMatchCount) {
          bestMatchCount = matchCount;
          bestSession = session;
          bestMeasurements = sessionMeasurements;
        }
      }
      
      logger.info(`[BioAge] Best session: ${bestSession?.id} with ${bestMatchCount} matches`);

      // If no session has measurements, return error
      if (!bestSession) {
        logger.warn(`[BioAge] No session with measurements found for user ${userId}`);
        return res.status(400).json({ 
          error: "No biomarker measurements found. Please add test results to calculate biological age.",
          missingData: "biomarkers"
        });
      }

      const latestSession = bestSession;
      const measurements = bestMeasurements;
      logger.info(`[BioAge] Using session ${latestSession.id} with ${measurements.length} measurements`);

      // Get all biomarkers to map IDs to names
      const biomarkers = await storage.getBiomarkers();
      const biomarkerMap = new Map(biomarkers.map(b => [b.id, b]));

      // Create a map of biomarker name -> measurement
      const measurementMap = new Map(
        measurements.map(m => {
          const biomarker = biomarkerMap.get(m.biomarkerId);
          return [biomarker?.name, m];
        })
      );
      
      logger.info(`[BioAge] Measurement map keys: [${Array.from(measurementMap.keys()).join(', ')}]`);

      // Required biomarkers for PhenoAge calculation
      // Note: CRP can be either "CRP" or "hs-CRP" (high-sensitivity CRP)
      const requiredBiomarkers = {
        'Albumin': 'albumin_g_L',
        'Creatinine': 'creatinine_umol_L',
        'Glucose': 'glucose_mmol_L',
        'CRP': 'crp_mg_dL', // Will match "CRP" or "hs-CRP"
        'Lymphocytes': 'lymphocytes_KPerUL',
        'MCV': 'mcv_fL',
        'RDW': 'rdw_percent',
        'ALP': 'alkPhos_U_L',
        'WBC': 'wbc_10e3_per_uL',
      };

      // Extract and convert biomarker values
      const biomarkerValues: any = {};
      const missingBiomarkers: string[] = [];

      for (const [biomarkerName, fieldName] of Object.entries(requiredBiomarkers)) {
        // Special handling for CRP - check both "CRP" and "hs-CRP"
        let measurement = measurementMap.get(biomarkerName);
        if (!measurement && biomarkerName === 'CRP') {
          measurement = measurementMap.get('hs-CRP');
        }
        
        if (!measurement) {
          missingBiomarkers.push(biomarkerName);
          continue;
        }

        // Convert to Levine units based on biomarker type and current unit
        const value = measurement.valueCanonical;
        const unit = measurement.unitCanonical;

        try {
          switch (biomarkerName) {
            case 'Albumin':
              // Convert g/dL → g/L (multiply by 10)
              if (unit === 'g/dL') {
                biomarkerValues.albumin_g_L = UnitConverter.albumin_gPerDL_to_gPerL(value);
              } else if (unit === 'g/L') {
                biomarkerValues.albumin_g_L = value;
              } else {
                throw new Error(`Unsupported Albumin unit: ${unit}`);
              }
              break;

            case 'Creatinine':
              // Convert mg/dL → µmol/L (multiply by 88.4)
              if (unit === 'mg/dL') {
                biomarkerValues.creatinine_umol_L = UnitConverter.creatinine_mgPerDL_to_umolPerL(value);
              } else if (unit === 'µmol/L' || unit === 'umol/L') {
                biomarkerValues.creatinine_umol_L = value;
              } else {
                throw new Error(`Unsupported Creatinine unit: ${unit}`);
              }
              break;

            case 'Glucose':
              // Convert mg/dL → mmol/L (divide by 18.0182)
              if (unit === 'mg/dL') {
                biomarkerValues.glucose_mmol_L = UnitConverter.glucose_mgPerDL_to_mmolPerL(value);
              } else if (unit === 'mmol/L') {
                biomarkerValues.glucose_mmol_L = value;
              } else {
                throw new Error(`Unsupported Glucose unit: ${unit}`);
              }
              break;

            case 'CRP':
              // Convert mg/L → mg/dL (divide by 10)
              if (unit === 'mg/L') {
                biomarkerValues.crp_mg_dL = UnitConverter.crp_mgPerL_to_mgPerDL(value);
              } else if (unit === 'mg/dL') {
                biomarkerValues.crp_mg_dL = value;
              } else {
                throw new Error(`Unsupported CRP unit: ${unit}`);
              }
              break;

            case 'Lymphocytes':
              // Store absolute count for percentage calculation
              biomarkerValues.lymphocytes_KPerUL = value;
              break;

            case 'WBC':
              // Already in correct units (K/μL = 10^3/µL)
              biomarkerValues.wbc_10e3_per_uL = UnitConverter.wbc_KPerUL_to_10e3PerUL(value);
              break;

            case 'MCV':
              // Already in correct units (fL)
              biomarkerValues.mcv_fL = value;
              break;

            case 'RDW':
              // Already in correct units (%)
              biomarkerValues.rdw_percent = value;
              break;

            case 'ALP':
              // Already in correct units (U/L)
              biomarkerValues.alkPhos_U_L = value;
              break;
          }
        } catch (error: any) {
          logger.error(`Error converting ${biomarkerName}:`, error);
          return res.status(500).json({ 
            error: `Failed to convert ${biomarkerName}: ${error.message}` 
          });
        }
      }

      // Check if we have all required biomarkers
      logger.info(`[BioAge] Extracted values: ${JSON.stringify(biomarkerValues)}`);
      logger.info(`[BioAge] Missing biomarkers: [${missingBiomarkers.join(', ')}]`);
      
      if (missingBiomarkers.length > 0) {
        // Return partial data with chronological age and what's missing
        logger.info(`[BioAge] Returning incomplete - missing ${missingBiomarkers.length} biomarkers`);
        return res.status(200).json({ 
          chronologicalAge: ageYears,
          biologicalAge: null,
          ageDifference: null,
          testDate: latestSession.testDate,
          sessionId: latestSession.id,
          incomplete: true,
          missingBiomarkers,
          message: `Add ${missingBiomarkers.join(', ')} to calculate biological age`
        });
      }

      // Calculate lymphocyte percentage
      try {
        const lymphocytePercent = UnitConverter.calculateLymphocytePercent(
          biomarkerValues.lymphocytes_KPerUL,
          biomarkerValues.wbc_10e3_per_uL
        );

        // Build PhenoAge inputs
        const phenoAgeInputs: PhenoAgeInputs = {
          ageYears,
          albumin_g_L: biomarkerValues.albumin_g_L,
          creatinine_umol_L: biomarkerValues.creatinine_umol_L,
          glucose_mmol_L: biomarkerValues.glucose_mmol_L,
          crp_mg_dL: biomarkerValues.crp_mg_dL,
          lymphocyte_percent: lymphocytePercent,
          mcv_fL: biomarkerValues.mcv_fL,
          rdw_percent: biomarkerValues.rdw_percent,
          alkPhos_U_L: biomarkerValues.alkPhos_U_L,
          wbc_10e3_per_uL: biomarkerValues.wbc_10e3_per_uL,
        };

        // Validate inputs
        const validation = validatePhenoAgeInputs(phenoAgeInputs);
        if (!validation.valid) {
          return res.status(400).json({ 
            error: "Invalid biomarker values for biological age calculation",
            missingFields: validation.missing
          });
        }

        // Calculate PhenoAge
        const phenoAge = calculatePhenoAge(phenoAgeInputs);
        const ageAcceleration = calculatePhenoAgeAccel(phenoAge, ageYears);

        logger.info(`[BioAge] SUCCESS! PhenoAge=${phenoAge.toFixed(1)}, ChronoAge=${ageYears}, Accel=${ageAcceleration.toFixed(1)}`);

        res.json({
          biologicalAge: Math.round(phenoAge * 10) / 10, // Round to 1 decimal
          chronologicalAge: ageYears,
          ageDifference: Math.round(ageAcceleration * 10) / 10, // Round to 1 decimal
          testDate: latestSession.testDate,
          sessionId: latestSession.id,
        });

      } catch (error: any) {
        logger.error('Error calculating PhenoAge:', error);
        res.status(500).json({ 
          error: "Failed to calculate biological age",
          message: error.message
        });
      }

    } catch (error) {
      logger.error('Error in biological age endpoint:', error);
      res.status(500).json({ error: "Failed to calculate biological age" });
    }
  });

  // POST /api/health-insights - Generate comprehensive health insights
  app.post("/api/health-insights", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const schema = z.object({
        forceRefresh: z.boolean().optional().default(false),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const { forceRefresh } = validationResult.data;

      // Check cache unless forceRefresh
      if (!forceRefresh) {
        const cached = await storage.getLatestHealthInsights(userId);
        if (cached && cached.analysisData && (!cached.expiresAt || new Date(cached.expiresAt) > new Date())) {
          return res.json({
            cacheStatus: "hit",
            ...cached.analysisData,
            generatedAt: cached.generatedAt,
          });
        }
      }

      // Get user profile
      const profile = await storage.getProfile(userId);
      const missingFields: string[] = [];
      if (!profile?.birthYear) missingFields.push("birthYear");
      if (!profile?.sex) missingFields.push("sex");
      
      if (missingFields.length > 0 || !profile) {
        return res.status(422).json({ 
          error: "Insufficient profile data. Please complete your age and sex in your profile to generate comprehensive insights.",
          missingData: missingFields
        });
      }

      // Calculate age using mid-year (July 1st) assumption for ±6 month accuracy
      const ageYears = calculateAgeFromBirthYear(profile.birthYear)!;

      // Get all biomarker sessions (from Supabase via healthRouter)
      const sessions = await healthRouter.getBiomarkerSessions(userId);
      if (sessions.length === 0) {
        return res.status(422).json({ 
          error: "No biomarker data found. Please add test results to generate comprehensive insights.",
          missingData: ["biomarkers"]
        });
      }

      // Sort sessions by date (most recent first)
      const sortedSessions = sessions.sort((a, b) => 
        new Date(b.testDate).getTime() - new Date(a.testDate).getTime()
      );

      // Get all biomarkers for name mapping
      const biomarkers = await storage.getBiomarkers();
      const biomarkerMap = new Map(biomarkers.map(b => [b.id, b]));

      // Build biomarker panels with corrected reference ranges
      const { selectReferenceRange } = await import("@shared/domain/biomarkers");
      const panels = [];
      
      for (const session of sortedSessions) {
        const measurements = await healthRouter.getMeasurementsBySession(session.id);
        if (measurements.length === 0) continue;

        const markers = await Promise.all(measurements.map(async (m) => {
          const biomarker = biomarkerMap.get(m.biomarkerId);
          
          // Recalculate correct reference range (don't trust stored values due to unit mismatch bug)
          const biomarkerRanges = await storage.getReferenceRanges(m.biomarkerId);
          const contextForRange = {
            age_years: ageYears,
            sex: profile?.sex?.toLowerCase() as 'male' | 'female' | undefined,
          };
          const correctRange = selectReferenceRange(
            m.biomarkerId,
            m.unitCanonical,
            contextForRange,
            biomarkerRanges
          );
          
          return {
            code: biomarker?.name || m.biomarkerId,
            label: biomarker?.name || m.biomarkerId,
            value: m.valueCanonical,
            unit: m.unitCanonical,
            reference_range: {
              low: correctRange?.low ?? undefined,
              high: correctRange?.high ?? undefined,
              unit: m.unitCanonical,
            },
            category: biomarker?.category,
            flags: m.flags || [],
          };
        }));

        panels.push({
          panel_id: session.id,
          timestamp: session.testDate.toISOString(),
          markers,
        });
      }

      // Get biological age
      let bioageData: any = null;
      try {
        // Try to get biological age (may fail if missing required biomarkers)
        const bioageResponse = await fetch(`${req.protocol}://${req.get('host')}/api/biological-age`, {
          headers: {
            'cookie': req.headers.cookie || '',
          }
        });
        if (bioageResponse.ok) {
          const bioage = await bioageResponse.json();
          bioageData = {
            method: "PhenoAge",
            current_bioage_years: bioage.biologicalAge,
            chronological_age_years: bioage.chronologicalAge,
          };
        }
      } catch (error) {
        logger.info('Biological age calculation failed, continuing without it');
      }

      // Check if AI integration is configured
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
        return res.status(503).json({
          error: "AI integration not configured",
          message: "The OpenAI integration is not properly configured. Please check that AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL environment variables are set.",
          code: "AI_NOT_CONFIGURED"
        });
      }

      // Build comprehensive insights input
      const { generateComprehensiveInsights } = await import("./openai");
      
      const insightsInput = {
        user_profile: {
          age_years: ageYears,
          sex: (profile.sex?.toLowerCase() || 'male') as 'male' | 'female',
          height_cm: profile.height && profile.heightUnit === 'cm' ? profile.height : undefined,
          weight_kg: profile.weight && profile.weightUnit === 'kg' ? profile.weight : undefined,
          activity_level: profile.healthBaseline?.activityLevel,
          goals: profile.goals || [],
          lifestyle_tags: [
            profile.healthBaseline?.smokingStatus && profile.healthBaseline.smokingStatus !== 'Never' ? 'smoker' : null,
            profile.healthBaseline?.alcoholIntake && profile.healthBaseline.alcoholIntake !== 'None' ? 'alcohol_consumer' : null,
          ].filter(Boolean) as string[],
          other_context: profile.aiPersonalization?.medicalContext,
        },
        biomarker_panels: panels,
        derived_metrics: {
          bioage: bioageData,
        },
        analysis_config: {
          time_window_days_for_trend: 365,
          significant_change_threshold_percent: 20,
          bioage_change_significant_years: 0.5,
          max_priority_items: 5,
        },
      };

      // Generate insights
      // Generate comprehensive insights with error handling
      let insights;
      try {
        insights = await generateComprehensiveInsights(insightsInput);
      } catch (aiError: any) {
        logger.error('OpenAI generation error:', aiError);
        return res.status(500).json({
          error: "AI generation failed",
          message: aiError.message || "Failed to generate insights using AI. The service may be temporarily unavailable.",
          code: "AI_GENERATION_FAILED"
        });
      }

      // Save to database with 30-day expiration
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      try {
        await storage.saveHealthInsights({
          userId,
          analysisData: insights,
          dataWindowDays: 365,
          model: "gpt-5",
          expiresAt,
        });
      } catch (saveError) {
        logger.error('Failed to cache insights:', saveError);
        // Still return the insights even if caching fails
      }

      res.json({
        cacheStatus: "miss",
        ...insights,
      });

    } catch (error: any) {
      logger.error('Error generating comprehensive insights:', error);
      
      // Try to save error to database
      try {
        await storage.saveHealthInsights({
          userId: req.user.claims.sub,
          analysisData: { error: error.message },
          dataWindowDays: null,
          model: "gpt-5",
          expiresAt: null,
        });
      } catch (saveError) {
        logger.error('Failed to save error state:', saveError);
      }

      res.status(500).json({ 
        error: "Failed to generate comprehensive insights",
        message: error.message
      });
    }
  });

  // GET /api/health-insights - Get latest comprehensive health insights
  app.get("/api/health-insights", isAuthenticated, async (req: any, res) => {
    try {
      // CRITICAL: Prevent iOS overnight caching - force fresh data after HealthKit sync
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const userId = req.user.claims.sub;
      
      const cached = await storage.getLatestHealthInsights(userId);
      if (!cached || !cached.analysisData) {
        return res.status(404).json({ 
          error: "No health insights found. Generate insights first by making a POST request to this endpoint."
        });
      }

      res.json({
        ...cached.analysisData,
        generatedAt: cached.generatedAt,
        expiresAt: cached.expiresAt,
      });

    } catch (error) {
      logger.error('Error fetching health insights:', error);
      res.status(500).json({ error: "Failed to fetch health insights" });
    }
  });

  // GET /api/comprehensive-report - Generate comprehensive health report
  // Optional query param: sessionId - if provided, only includes data from that specific test session
  app.get("/api/comprehensive-report", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessionId = req.query.sessionId as string | undefined;

      // Get user profile
      const profile = await storage.getProfile(userId);
      if (!profile?.birthYear || !profile?.sex) {
        return res.status(422).json({ 
          error: "Insufficient profile data. Please complete your age and sex in your profile."
        });
      }

      // Calculate age using mid-year (July 1st) assumption for ±6 month accuracy
      const ageYears = calculateAgeFromBirthYear(profile.birthYear)!;

      // Get biomarker sessions (from Supabase via healthRouter)
      let sessions;
      if (sessionId) {
        // Get specific session only - need to get all sessions and filter
        const allSessions = await healthRouter.getBiomarkerSessions(userId);
        const session = allSessions.find(s => s.id === sessionId);
        if (!session) {
          return res.status(404).json({ 
            error: "Session not found or unauthorized"
          });
        }
        sessions = [session];
      } else {
        // Get all sessions
        sessions = await healthRouter.getBiomarkerSessions(userId);
      }

      if (sessions.length === 0) {
        return res.status(422).json({ 
          error: "No biomarker data found. Please add test results first."
        });
      }

      // Sort sessions by date
      const sortedSessions = sessions.sort((a, b) => 
        new Date(b.testDate).getTime() - new Date(a.testDate).getTime()
      );

      // Get biomarkers for name mapping
      const biomarkers = await storage.getBiomarkers();
      const biomarkerMap = new Map(biomarkers.map(b => [b.id, b]));

      // Build biomarker panels
      const panels = [];
      for (const session of sortedSessions) {
        // Skip sessions without valid IDs
        if (!session.id) continue;
        
        const measurements = await healthRouter.getMeasurementsBySession(session.id);
        if (measurements.length === 0) continue;

        const markers = measurements.map(m => {
          const biomarker = biomarkerMap.get(m.biomarkerId);
          return {
            code: biomarker?.name || m.biomarkerId,
            label: biomarker?.name || m.biomarkerId,
            value: m.valueCanonical,
            unit: m.unitCanonical,
            reference_range: {
              low: m.referenceLow ?? undefined,
              high: m.referenceHigh ?? undefined,
              unit: m.unitCanonical,
            },
            category: biomarker?.category,
            flags: m.flags || [],
          };
        });

        // Safely convert testDate to ISO string
        const testDate = session.testDate;
        const timestamp = testDate instanceof Date 
          ? testDate.toISOString() 
          : typeof testDate === 'string' 
            ? new Date(testDate).toISOString()
            : new Date().toISOString();

        panels.push({
          panel_id: session.id,
          timestamp,
          markers,
        });
      }

      // Get biological age
      let bioageData: any = null;
      try {
        const bioageResponse = await fetch(`${req.protocol}://${req.get('host')}/api/biological-age`, {
          headers: { 'cookie': req.headers.cookie || '' }
        });
        if (bioageResponse.ok) {
          const bioage = await bioageResponse.json();
          bioageData = {
            phenoage_years: bioage.biologicalAge,
            chronological_age_years: bioage.chronologicalAge,
            method: "PhenoAge",
          };
        }
      } catch (error) {
        logger.info('Biological age calculation failed, continuing without it');
      }

      // Get daily insights (last 10 days) - SUPABASE-ONLY for PHI privacy
      const { systemSettings } = await import("@shared/schema");
      
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      
      let dailyInsightsData: any[] = [];
      try {
        dailyInsightsData = await healthRouter.getDailyInsights(userId, { startDate: tenDaysAgo, limit: 10 });
      } catch (error) {
        logger.info('Daily insights fetch failed, continuing without them');
      }

      // Get life events (last 30 days) - routed through healthRouter to Supabase
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      let lifeEventsData: any[] = [];
      try {
        lifeEventsData = await healthRouter.getLifeEvents(userId, { startDate: thirtyDaysAgo, limit: 20 });
      } catch (error) {
        logger.info('Life events fetch failed, continuing without them');
      }

      // Get Flōmentum data (last 7 days for average) - routed through healthRouter to Supabase
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      let flomentumData: any = null;
      try {
        const recentScores = await healthRouter.getFlomentumDaily(userId, { startDate: sevenDaysAgo, limit: 7 });
        
        if (recentScores.length > 0) {
          const avgScore = recentScores.reduce((sum, s) => sum + (s.score || 0), 0) / recentScores.length;
          const latestScore = recentScores[0];
          flomentumData = {
            current_score: latestScore.score,
            trend_7d: avgScore,
            domain_scores: latestScore.factors,
          };
        }
      } catch (error) {
        logger.info('Flōmentum data fetch failed, continuing without it');
      }

      // Get HealthKit summary (7-day averages) - routed through healthRouter to Supabase
      let healthkitSummary: any = null;
      try {
        const recentSamples = await healthRouter.getHealthkitSamples(userId, { startDate: sevenDaysAgo, limit: 1000 });
        
        if (recentSamples.length > 0) {
          const metricAverages: any = {};
          const metricTypes = ['steps', 'activeEnergyBurned', 'restingHeartRate', 'heartRateVariabilitySDNN', 'sleepDuration', 'appleStandHours'];
          
          for (const metricType of metricTypes) {
            const samples = recentSamples.filter(s => s.dataType === metricType);
            if (samples.length > 0) {
              const avg = samples.reduce((sum, s) => sum + (s.value || 0), 0) / samples.length;
              metricAverages[metricType] = avg;
            }
          }
          
          healthkitSummary = {
            recent_7d_avg: {
              steps: metricAverages.steps,
              active_energy: metricAverages.activeEnergyBurned,
              resting_hr: metricAverages.restingHeartRate,
              hrv: metricAverages.heartRateVariabilitySDNN,
              sleep_hours: metricAverages.sleepDuration ? metricAverages.sleepDuration / 3600 : undefined,
              stand_hours: metricAverages.appleStandHours,
            },
          };
        }
      } catch (error) {
        logger.info('HealthKit summary fetch failed, continuing without it');
      }

      // Check which AI model to use for report generation
      let reportModel = 'gpt'; // default
      try {
        const [setting] = await db
          .select()
          .from(systemSettings)
          .where(eq(systemSettings.settingKey, 'report_ai_model'))
          .limit(1);
        
        if (setting && (setting.settingValue === 'gpt' || setting.settingValue === 'grok')) {
          reportModel = setting.settingValue;
        }
      } catch (error) {
        logger.info('No report model setting found, using default (GPT)');
      }

      // Build report input
      // Note: Supabase returns snake_case fields, so we map accordingly
      const reportInput = {
        user_profile: {
          age_years: ageYears,
          sex: (profile.sex?.toLowerCase() || 'male') as 'male' | 'female',
          goals: profile.goals || [],
          medicalContext: profile.aiPersonalization?.medicalContext,
        },
        biomarker_panels: panels.slice(0, 3), // Limit to last 3 panels for token budget
        biological_age_data: bioageData,
        rag_insights: dailyInsightsData.map((insight: any) => ({
          category: insight.category,
          insightText: insight.body,
          confidence: insight.confidence_score ?? insight.confidenceScore,
          evidenceSummary: {
            title: insight.title,
            action: insight.action,
            impactScore: insight.impact_score ?? insight.impactScore,
            actionabilityScore: insight.actionability_score ?? insight.actionabilityScore,
          },
          createdAt: insight.created_at ? new Date(insight.created_at).toISOString() : new Date().toISOString(),
        })),
        healthkit_summary: healthkitSummary,
        life_events: lifeEventsData.map((event: any) => ({
          eventType: event.event_type ?? event.eventType,
          eventDetails: event.details,
          timestamp: event.happened_at ? new Date(event.happened_at).toISOString() : new Date().toISOString(),
        })),
        flomentum_data: flomentumData,
      };

      // Generate report with selected model
      let report;
      if (reportModel === 'grok') {
        logger.info('[Report] Generating with Grok-3-mini');
        const { generateFullHealthReportGrok } = await import("./openai");
        report = await generateFullHealthReportGrok(reportInput);
      } else {
        logger.info('[Report] Generating with GPT-4o');
        const { generateFullHealthReport } = await import("./openai");
        report = await generateFullHealthReport(reportInput);
      }

      res.json(report);

    } catch (error: any) {
      logger.error('Error generating comprehensive report:', error);
      res.status(500).json({ 
        error: "Failed to generate comprehensive report",
        message: error.message
      });
    }
  });

  // GET /api/health-summary-report - Generate Health Summary Report (new design)
  app.get("/api/health-summary-report", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user profile
      const profile = await storage.getProfile(userId);
      const userName = req.user.claims.username || profile?.firstName || 'User';
      
      // Calculate age using mid-year assumption
      let ageYears = profile?.birthYear ? calculateAgeFromBirthYear(profile.birthYear) : null;
      
      // Get biomarker sessions from Supabase
      const sessions = await healthRouter.getBiomarkerSessions(userId);
      const biomarkers = await storage.getBiomarkers();
      const biomarkerMap = new Map(biomarkers.map(b => [b.id, b]));
      
      logger.info('[HealthSummaryReport] Biomarker map size:', biomarkerMap.size);
      if (biomarkers.length > 0) {
        logger.info('[HealthSummaryReport] Sample biomarker from storage:', { 
          id: biomarkers[0].id, 
          name: biomarkers[0].name 
        });
      }
      
      // Format date of birth from birthYear
      const dateOfBirth = profile?.birthYear ? `${profile.birthYear}` : 'Not specified';
      
      // Build report period string
      const reportDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      // Determine date range from sessions
      let reportPeriod = "12-month analysis";
      if (sessions.length > 0) {
        const sortedSessions = [...sessions].sort((a, b) => 
          new Date(b.testDate).getTime() - new Date(a.testDate).getTime()
        );
        const oldestDate = new Date(sortedSessions[sortedSessions.length - 1].testDate);
        const newestDate = new Date(sortedSessions[0].testDate);
        const monthsDiff = Math.ceil((newestDate.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
        reportPeriod = `${monthsDiff || 1}-month analysis`;
      }
      
      // Sort sessions by date (newest first) and normalize snake_case fields
      const sortedSessions = [...sessions]
        .map((s: any) => ({
          id: s.id || s.session_id,
          testDate: s.test_date || s.testDate,
        }))
        .sort((a, b) => new Date(b.testDate).getTime() - new Date(a.testDate).getTime());
      
      logger.info('[HealthSummaryReport] Processing sessions:', {
        sessionCount: sortedSessions.length,
        sampleSession: sortedSessions[0] ? { id: sortedSessions[0].id, testDate: sortedSessions[0].testDate } : null,
        rawSampleSession: sessions[0] ? Object.keys(sessions[0]) : null,
      });
      
      // Fetch measurements for all sessions to build historical data
      // { biomarkerId -> [{ value, date, sessionId }] ordered newest first }
      const biomarkerHistory = new Map<string, { value: number; date: Date; unit?: string }[]>();
      
      for (const session of sortedSessions) {
        if (!session.id) {
          logger.debug('[HealthSummaryReport] Skipping session without ID');
          continue;
        }
        try {
          const measurements = await healthRouter.getMeasurementsBySession(session.id);
          logger.debug(`[HealthSummaryReport] Session ${session.id}: found ${measurements.length} measurements`);
          
          // Log first measurement structure to understand the data shape
          if (measurements.length > 0 && session === sortedSessions[0]) {
            logger.info('[HealthSummaryReport] Sample measurement keys:', Object.keys(measurements[0]));
            logger.info('[HealthSummaryReport] Sample measurement:', JSON.stringify(measurements[0]));
          }
          
          for (const m of measurements) {
            // Normalize snake_case from Supabase - measurements use valueCanonical/valueRaw, not value
            const biomarkerId = m.biomarker_id || m.biomarkerId;
            const value = m.valueCanonical ?? m.value_canonical ?? m.valueRaw ?? m.value_raw ?? m.value;
            const unit = m.unitCanonical ?? m.unit_canonical ?? m.unitRaw ?? m.unit_raw ?? m.unit;
            
            if (value === null || value === undefined) continue;
            if (!biomarkerId) {
              logger.debug('[HealthSummaryReport] Skipping measurement without biomarkerId');
              continue;
            }
            if (!biomarkerHistory.has(biomarkerId)) {
              biomarkerHistory.set(biomarkerId, []);
            }
            biomarkerHistory.get(biomarkerId)!.push({
              value,
              date: new Date(session.testDate),
              unit,
            });
          }
        } catch (err) {
          logger.debug(`Failed to fetch measurements for session ${session.id}`);
        }
      }
      
      logger.info(`[HealthSummaryReport] biomarkerHistory size after processing: ${biomarkerHistory.size}`);
      
      // Log a sample of what biomarkers we found
      if (biomarkerHistory.size > 0) {
        const sampleIds = [...biomarkerHistory.keys()].slice(0, 3);
        logger.info('[HealthSummaryReport] Sample biomarker IDs in history:', sampleIds);
      }
      
      // Collect all biomarker results for categorization
      interface BiomarkerResult {
        name: string;
        value: number;
        unit: string;
        status: 'optimal' | 'attention' | 'low' | 'high';
        trend: 'up' | 'down' | 'stable';
        change: string;
        category: string;
        standardRange: string;
        optimalRange: string;
        lastTested: string;
        note?: string;
        biomarkerId: string;
      }
      
      const allResults: BiomarkerResult[] = [];
      const categoryMap: Record<string, BiomarkerResult[]> = {};
      
      // Process each biomarker's history to create results
      let matchedCount = 0;
      let unmatchedCount = 0;
      for (const [biomarkerId, history] of biomarkerHistory.entries()) {
        const biomarker = biomarkerMap.get(biomarkerId);
        if (!biomarker || history.length === 0) {
          unmatchedCount++;
          if (unmatchedCount <= 3) {
            logger.debug(`[HealthSummaryReport] No biomarker found for ID: ${biomarkerId}`);
          }
          continue;
        }
        matchedCount++;
        
        // Most recent value is first in history
        const latest = history[0];
        const value = latest.value;
        const unit = latest.unit || biomarker.unit || '';
        const refLow = biomarker.refLow;
        const refHigh = biomarker.refHigh;
        const optLow = biomarker.optLow || refLow;
        const optHigh = biomarker.optHigh || refHigh;
        
        // Determine status
        let status: 'optimal' | 'attention' | 'low' | 'high' = 'optimal';
        if (value !== null && refLow !== null && refHigh !== null) {
          if (value < refLow) status = 'low';
          else if (value > refHigh) status = 'high';
          else if (optLow !== null && optHigh !== null) {
            if (value < optLow || value > optHigh) status = 'attention';
          }
        }
        
        // Calculate trend using historical data (compare newest to previous)
        let trend: 'up' | 'down' | 'stable' = 'stable';
        let change = '0%';
        
        if (history.length >= 2) {
          const newest = history[0].value;
          const previous = history[1].value;
          
          if (previous !== 0 && previous !== null) {
            const changePercent = ((newest - previous) / Math.abs(previous)) * 100;
            change = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`;
            
            // Determine trend direction (threshold of 2% to consider significant)
            if (changePercent > 2) trend = 'up';
            else if (changePercent < -2) trend = 'down';
          }
        }
        
        // Create result object
        const bioResult: BiomarkerResult = {
          name: biomarker.name,
          value: value ?? 0,
          unit,
          status,
          trend,
          change,
          category: biomarker.category || 'General',
          standardRange: refLow !== null && refHigh !== null ? `${refLow}-${refHigh}` : 'N/A',
          optimalRange: optLow !== null && optHigh !== null ? `${optLow}-${optHigh}` : 'N/A',
          lastTested: latest.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          biomarkerId,
        };
        
        allResults.push(bioResult);
        
        // Group by category
        const cat = bioResult.category;
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push(bioResult);
      }
      
      logger.info(`[HealthSummaryReport] Biomarker processing complete: matched=${matchedCount}, unmatched=${unmatchedCount}, allResults=${allResults.length}`);
      
      // Calculate category statuses (each biomarker is already unique in categoryMap)
      const biomarkerCategories = Object.entries(categoryMap).map(([category, markers]) => {
        const hasAttention = markers.some(m => m.status === 'attention' || m.status === 'low' || m.status === 'high');
        
        return {
          category,
          status: hasAttention ? 'attention' : 'good',
          markers: markers.slice(0, 10).map(m => ({
            name: m.name,
            value: m.value,
            unit: m.unit,
            status: m.status,
            trend: m.trend,
            change: m.change,
          })),
        };
      });
      
      // Find critical alerts (biomarkers needing attention)
      const criticalAlerts = allResults
        .filter(r => r.status === 'low' || r.status === 'high' || r.status === 'attention')
        .slice(0, 5)
        .map(r => ({
          marker: r.name,
          currentValue: r.value,
          unit: r.unit,
          standardRange: r.standardRange,
          optimalRange: r.optimalRange,
          trend: r.trend === 'up' ? 'increasing' : r.trend === 'down' ? 'declining' : 'stable',
          severity: r.status === 'low' || r.status === 'high' ? 'critical' : 'moderate',
          lastTested: r.lastTested,
          note: `${r.status === 'low' ? 'Below' : r.status === 'high' ? 'Above' : 'Outside'} optimal range. Consider discussing with your healthcare provider.`,
        }));
      
      // Count statistics
      const uniqueBiomarkers = new Set(allResults.map(r => r.name));
      const totalBiomarkers = uniqueBiomarkers.size;
      const outOfRange = new Set(allResults.filter(r => r.status !== 'optimal').map(r => r.name)).size;
      const requiresAttention = criticalAlerts.length;
      
      // Generate overall assessment  
      let overallAssessment = "";
      let aiExecutiveSummary = "";
      
      if (totalBiomarkers === 0) {
        overallAssessment = "No biomarker data available yet. Upload your blood work results to generate a comprehensive health analysis.";
        aiExecutiveSummary = "";
      } else {
        // Generate AI executive summary using Gemini
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const apiKey = process.env.GOOGLE_AI_API_KEY;
          
          if (apiKey) {
            const gemini = new GoogleGenAI({ apiKey });
            
            // Build context for the AI
            const biomarkerSummary = allResults.slice(0, 20).map(r => 
              `${r.name}: ${r.value} ${r.unit} (${r.status}, trend: ${r.trend})`
            ).join('\n');
            
            const categoryStats = Object.entries(categoryMap).map(([cat, markers]) => {
              const optimalCount = markers.filter(m => m.status === 'optimal').length;
              return `${cat}: ${optimalCount}/${markers.length} optimal`;
            }).join(', ');
            
            const prompt = `You are a health analyst writing an executive summary for a personalized health report. Be warm, encouraging, and actionable.

Patient Profile:
- Age: ${ageYears || 'Unknown'} years
- Sex: ${profile?.sex || 'Not specified'}
- Total biomarkers analyzed: ${totalBiomarkers}
- Biomarkers in optimal range: ${totalBiomarkers - outOfRange}
- Biomarkers needing attention: ${outOfRange}

Category Overview: ${categoryStats}

Key Biomarkers:
${biomarkerSummary}

Write a 2-3 paragraph executive summary that:
1. Opens with an encouraging but honest assessment of overall health status
2. Highlights the most important findings (both positive and areas for improvement)
3. Provides practical guidance on how to interpret this report and next steps

Use simple, accessible language. Avoid medical jargon. Be specific about which biomarkers to focus on if any need attention. End with an actionable recommendation.

Important: This is for educational purposes. Include a brief note that users should discuss findings with their healthcare provider.`;

            const result = await gemini.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              config: {
                temperature: 0.7,
                maxOutputTokens: 800,
              },
            });
            
            aiExecutiveSummary = result.text || '';
            logger.info('[HealthSummaryReport] AI executive summary generated successfully');
          }
        } catch (aiError: any) {
          logger.warn('[HealthSummaryReport] Failed to generate AI executive summary:', aiError?.message);
        }
        
        // Fallback static assessment
        if (outOfRange === 0) {
          overallAssessment = "All biomarkers are within optimal ranges. Continue your current health practices and schedule routine follow-up testing.";
        } else {
          const categories = [...new Set(criticalAlerts.map(a => a.marker.split(' ')[0]))];
          overallAssessment = `Analysis identified ${outOfRange} biomarker${outOfRange > 1 ? 's' : ''} requiring attention. Primary areas for intervention: ${categories.slice(0, 3).join(', ')}. Consider consulting with your healthcare provider for personalized guidance.`;
        }
      }
      
      // Build retest recommendations - only show overdue or expiring within 90 days
      const now = new Date();
      const retestRecommendations = allResults
        .map(r => {
          // Determine priority and retest interval based on status
          const isCritical = r.status === 'low' || r.status === 'high';
          const isWorsening = (r.status === 'high' && r.trend === 'up') || (r.status === 'low' && r.trend === 'down');
          const isImproving = (r.status === 'high' && r.trend === 'down') || (r.status === 'low' && r.trend === 'up');
          
          let priority = 'Low';
          let intervalMonths = 12;
          let rationale = 'Stable and optimal, routine monitoring';
          
          if (isCritical && isWorsening) {
            priority = 'High';
            intervalMonths = 3;
            rationale = `${r.status === 'low' ? 'Below' : 'Above'} optimal range, trending ${r.trend === 'up' ? 'upward' : 'downward'}`;
          } else if (isCritical) {
            priority = 'High';
            intervalMonths = 3;
            rationale = `${r.status === 'low' ? 'Below' : 'Above'} optimal range${isImproving ? ', active intervention underway' : ', monitor closely'}`;
          } else if (r.status === 'attention' && isWorsening) {
            priority = 'Moderate';
            intervalMonths = 3;
            rationale = `Trending ${r.trend === 'up' ? 'upward' : 'downward'}, lifestyle modifications recommended`;
          } else if (r.status === 'attention') {
            priority = 'Moderate';
            intervalMonths = 6;
            rationale = `Below optimal, ${isImproving ? 'improvement observed' : 'lifestyle modifications recommended'}`;
          }
          
          // Calculate when retest is due based on last tested date
          const lastTestedDate = r.lastTested ? new Date(r.lastTested) : null;
          let dueDate: Date | null = null;
          let daysUntilDue = Infinity;
          
          if (lastTestedDate && !isNaN(lastTestedDate.getTime())) {
            dueDate = new Date(lastTestedDate);
            dueDate.setMonth(dueDate.getMonth() + intervalMonths);
            daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          }
          
          return { 
            marker: r.name, 
            priority, 
            interval: `${intervalMonths} months`, 
            rationale,
            daysUntilDue,
            isOverdue: daysUntilDue < 0,
            expiresWithin90Days: daysUntilDue <= 90
          };
        })
        // Only include overdue or expiring within 90 days
        .filter(r => r.isOverdue || r.expiresWithin90Days)
        .sort((a, b) => a.daysUntilDue - b.daysUntilDue) // Sort by urgency
        .slice(0, 15) // Limit to 15 items
        .map(({ marker, priority, interval, rationale }) => ({ marker, priority, interval, rationale }));
      
      // Get active action plan items as interventions (from Supabase via healthRouter)
      let activeInterventions: any[] = [];
      try {
        const actionItems = await healthRouter.getActionPlanItems(userId, 'active');
        if (actionItems && Array.isArray(actionItems)) {
          activeInterventions = actionItems
            .slice(0, 6)
            .map((item: any) => ({
              title: item.snapshot_title || item.snapshotTitle || 'Health Optimization',
              started: new Date(item.added_at || item.addedAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
              target: item.target_value || item.targetValue ? `${item.target_value || item.targetValue} ${item.unit || ''}` : 'Optimal range',
              actions: (item.snapshot_steps || item.snapshotSteps)?.slice(0, 4) || ['Follow recommended protocol'],
              progress: item.status === 'completed' ? 'Completed' : 'In progress',
            }));
        }
      } catch (error: any) {
        logger.debug('No action plan items found for health summary report', { error: error?.message });
      }
      
      // Fetch correlation insights from ClickHouse ML engine and brain system
      let correlationInsights: any[] = [];
      try {
        const { getHealthId } = await import('./services/supabaseHealthStorage');
        const healthId = await getHealthId(userId);
        
        if (healthId) {
          // Get long-term behavioral correlations from ClickHouse
          const { ClickHouseCorrelationEngine } = await import('./services/clickhouseCorrelationEngine');
          const correlationEngine = new ClickHouseCorrelationEngine();
          const longTermCorrelations = await correlationEngine.getLongTermInsights(healthId, 5);
          
          // Get recent pattern-based insights from brain
          const { correlationInsightService } = await import('./services/correlationInsightService');
          const recentInsights = await correlationInsightService.getRecentInsights(userId, 3);
          
          // Format long-term correlations for report with safe defaults
          const longTermFormatted = longTermCorrelations
            .filter(c => c && (c.naturalLanguageInsight || c.behaviorType))
            .map(c => {
              // Safe string extraction with fallbacks
              const insight = c.naturalLanguageInsight || '';
              const behaviorType = c.behaviorType || 'Behavior';
              const outcomeType = c.outcomeType || 'Outcome';
              const behaviorDesc = c.behaviorDescription || behaviorType;
              const outcomeDesc = c.outcomeDescription || outcomeType;
              const direction = c.effectDirection || 'positive';
              const effectPct = typeof c.effectSizePct === 'number' ? c.effectSizePct : 0;
              const pValue = typeof c.pValue === 'number' ? c.pValue : 0.05;
              const confidence = typeof c.confidenceLevel === 'number' ? c.confidenceLevel : 0.5;
              const months = c.timeRangeMonths || 3;
              
              return {
                title: insight.split('.')[0] || `${behaviorType} → ${outcomeType}`,
                description: insight || `${behaviorDesc} shows a ${direction} correlation with ${outcomeDesc}`,
                biomarkersInvolved: [behaviorType, outcomeType].filter(Boolean),
                clinicalRelevance: `${Math.abs(effectPct).toFixed(1)}% ${direction === 'positive' ? 'improvement' : 'impact'} observed over ${months} months (p=${pValue.toFixed(3)}, confidence: ${(confidence * 100).toFixed(0)}%)`,
              };
            });
          
          // Format recent insights for report with safe defaults
          const recentFormatted = recentInsights
            .filter(i => i && (i.title || i.description))
            .map(i => ({
              title: i.title || 'Pattern Detected',
              description: i.description || 'An interesting health pattern was identified in your data.',
              biomarkersInvolved: i.metricsInvolved || [],
              clinicalRelevance: `Pattern confidence: ${((i.confidence || 0.5) * 100).toFixed(0)}%. ${i.attribution || 'Based on multi-metric analysis.'}`,
            }));
          
          correlationInsights = [...longTermFormatted, ...recentFormatted].slice(0, 6);
          logger.info(`[HealthSummaryReport] Found ${correlationInsights.length} correlation insights for user ${userId}`);
        }
      } catch (error: any) {
        logger.debug('Error fetching correlation insights for health summary report', { error: error?.message });
      }
      
      // Build the response in HealthReportData format
      const healthReportData = {
        patientData: {
          name: userName,
          age: ageYears || 0,
          sex: profile?.sex || 'Not specified',
          dateOfBirth: dateOfBirth,
          reportDate: reportDate,
          reportPeriod: reportPeriod,
          totalBiomarkers: totalBiomarkers,
          outOfRange: outOfRange,
          requiresAttention: requiresAttention,
          overallAssessment: overallAssessment,
          aiExecutiveSummary: aiExecutiveSummary,
        },
        criticalAlerts: criticalAlerts,
        biomarkerCategories: biomarkerCategories,
        correlationInsights: correlationInsights,
        retestRecommendations: retestRecommendations,
        activeInterventions: activeInterventions,
      };
      
      logger.info('[HealthSummaryReport] Sending response:', {
        totalBiomarkers,
        biomarkerCategoriesCount: biomarkerCategories.length,
        criticalAlertsCount: criticalAlerts.length,
        retestRecommendationsCount: retestRecommendations.length,
        correlationInsightsCount: correlationInsights.length,
        activeInterventionsCount: activeInterventions.length,
        sampleCategory: biomarkerCategories[0]?.category,
        sampleMarkerCount: biomarkerCategories[0]?.markers?.length,
      });
      
      res.json(healthReportData);
      
    } catch (error: any) {
      logger.error('Error generating health summary report:', error);
      res.status(500).json({ 
        error: "Failed to generate health summary report",
        message: error.message
      });
    }
  });

  // GET /api/biomarkers/top-to-improve - Get top 3 biomarkers needing improvement
  app.get("/api/biomarkers/top-to-improve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { db } = await import("./db");
      const { biomarkers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      // Get all test sessions for the user (from Supabase via healthRouter)
      const sessions = await healthRouter.getBiomarkerSessions(userId);
      
      if (sessions.length === 0) {
        return res.json({ topBiomarkers: [] });
      }
      
      // Track latest measurement for each biomarker
      const biomarkerMap = new Map<string, any>();
      
      for (const session of sessions) {
        if (!session.id) continue; // Skip sessions without valid IDs
        const measurements = await healthRouter.getMeasurementsBySession(session.id);
        
        for (const measurement of measurements) {
          // Only keep the latest measurement for each biomarker
          if (!biomarkerMap.has(measurement.biomarkerId) || 
              (measurement.createdAt && biomarkerMap.get(measurement.biomarkerId).createdAt < measurement.createdAt)) {
            biomarkerMap.set(measurement.biomarkerId, measurement);
          }
        }
      }
      
      // Enrich each biomarker and filter for improvements needed
      const enrichedBiomarkers: any[] = [];
      
      for (const [biomarkerId, measurement] of Array.from(biomarkerMap.entries())) {
        // Get biomarker details
        const [biomarker] = await db.select().from(biomarkers).where(eq(biomarkers.id, biomarkerId));
        
        if (!biomarker) continue;
        
        // Get measurement history for trend (from Supabase via healthRouter)
        const history = await healthRouter.getMeasurementHistory(userId, biomarker.id, 6);
        const trendHistory = history.map(h => ({
          value: h.valueCanonical,
          date: h.createdAt?.toISOString().split('T')[0] || '',
        }));
        
        // Enrich the data
        const enriched = enrichBiomarkerData(
          {
            value: measurement.valueCanonical,
            unit: measurement.unitCanonical,
            referenceLow: measurement.referenceLow,
            referenceHigh: measurement.referenceHigh,
            testDate: measurement.createdAt || new Date(),
          },
          trendHistory
        );
        
        // Only include biomarkers that need improvement (severity > 0)
        if (enriched.severityScore > 0) {
          enrichedBiomarkers.push({
            id: biomarker.id,
            name: biomarker.name,
            value: measurement.valueCanonical,
            unit: measurement.unitCanonical,
            status: enriched.status,
            severityScore: enriched.severityScore,
            sparkline: trendHistory.slice(0, 5).map(h => h.value),
            change: `${enriched.deltaPercentage > 0 ? '+' : ''}${enriched.deltaPercentage.toFixed(1)}%`,
            trend: enriched.status === 'high' ? 'up' : 'down',
            color: enriched.severityScore >= 50 ? 'red' : 
                   enriched.severityScore >= 20 ? 'amber' : 'yellow',
            benefit: `${biomarker.name} is ${enriched.statusLabel.toLowerCase()}. ${enriched.valueContext}`,
          });
        }
      }
      
      // Sort by severity score (highest first) and take top 3
      const topBiomarkers = enrichedBiomarkers
        .sort((a, b) => b.severityScore - a.severityScore)
        .slice(0, 3);
      
      res.json({ topBiomarkers });
    } catch (error: any) {
      logger.error('Error fetching top biomarkers to improve:', error);
      res.status(500).json({ error: "Failed to fetch top biomarkers" });
    }
  });

  // GET /api/biomarkers/:id/units - Get available units for a biomarker
  app.get("/api/biomarkers/:id/units", isAuthenticated, async (req: any, res) => {
    try {
      const biomarkerId = req.params.id;

      // Validate query parameters
      const validationResult = getBiomarkerUnitsQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const { include } = validationResult.data;

      // Get biomarker to ensure it exists
      const biomarkers = await storage.getBiomarkers();
      const biomarker = biomarkers.find(b => b.id === biomarkerId);
      
      if (!biomarker) {
        return res.status(404).json({ error: "Biomarker not found" });
      }

      // Get unit conversions
      const conversions = await storage.getUnitConversions(biomarkerId);

      // Extract unique units
      const uniqueUnits = new Set([biomarker.canonicalUnit]);
      conversions.forEach(c => {
        uniqueUnits.add(c.fromUnit);
        uniqueUnits.add(c.toUnit);
      });

      // Build response
      const units = Array.from(uniqueUnits).map(unit => ({
        unit,
        isCanonical: unit === biomarker.canonicalUnit,
        conversions: include?.includes("conversions")
          ? conversions.filter(c => c.fromUnit === unit || c.toUnit === unit).map(c => ({
              fromUnit: c.fromUnit,
              toUnit: c.toUnit,
              conversionType: c.conversionType,
              multiplier: c.multiplier,
              offset: c.offset,
            }))
          : undefined,
      }));

      res.json({ units });
    } catch (error) {
      logger.error('Error fetching biomarker units:', error);
      res.status(500).json({ error: "Failed to fetch biomarker units" });
    }
  });

  // GET /api/biomarkers/:id/reference-range - Get personalized reference range
  app.get("/api/biomarkers/:id/reference-range", isAuthenticated, async (req: any, res) => {
    try {
      const biomarkerId = req.params.id;
      const userId = req.user.claims.sub;

      // Validate query parameters
      const validationResult = getBiomarkerReferenceRangeQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      let { age, sex, fasting, pregnancy, method, labId, context } = validationResult.data;

      // If context=auto, fetch from user profile
      if (context === "auto") {
        const profile = await storage.getProfile(userId);
        if (profile) {
          // Calculate age from birth year if not provided
          if (!age && profile.birthYear) {
            age = calculateAgeFromBirthYear(profile.birthYear) ?? undefined;
          }
          // Normalize sex to lowercase for context matching
          if (!sex && profile.sex) {
            const normalizedSex = profile.sex.toLowerCase();
            if (normalizedSex === "male" || normalizedSex === "female") {
              sex = normalizedSex;
            }
          }
        }
      }

      // Get biomarker to ensure it exists
      const biomarkers = await storage.getBiomarkers();
      const biomarker = biomarkers.find(b => b.id === biomarkerId);
      
      if (!biomarker) {
        return res.status(404).json({ error: "Biomarker not found" });
      }

      // Get all reference ranges for this biomarker
      const ranges = await storage.getReferenceRanges(biomarkerId);

      if (ranges.length === 0) {
        return res.status(404).json({ error: "No reference ranges found for this biomarker" });
      }

      // Build context object for scoring
      const contextObj: any = {};
      if (age !== undefined) contextObj.age = age;
      if (sex) contextObj.sex = sex;
      if (fasting !== undefined) contextObj.fasting = fasting;
      if (pregnancy !== undefined) contextObj.pregnancy = pregnancy;
      if (method) contextObj.method = method;
      if (labId) contextObj.labId = labId;

      // Use normalization engine to select best range
      const { selectReferenceRange } = await import("@shared/domain/biomarkers");
      const selectedRange = selectReferenceRange(
        biomarkerId,
        biomarker.canonicalUnit,
        contextObj,
        ranges
      );

      if (!selectedRange) {
        return res.status(404).json({ error: "No matching reference range found" });
      }

      res.json({
        low: selectedRange.low,
        high: selectedRange.high,
        unit: selectedRange.unit,
        criticalLow: selectedRange.criticalLow,
        criticalHigh: selectedRange.criticalHigh,
        source: selectedRange.source,
        context: selectedRange.context,
      });
    } catch (error) {
      logger.error('Error fetching reference range:', error);
      res.status(500).json({ error: "Failed to fetch reference range" });
    }
  });

  // POST /api/biomarkers/:id/insights - Generate or retrieve cached biomarker insights
  app.post("/api/biomarkers/:id/insights", isAuthenticated, async (req: any, res) => {
    try {
      const biomarkerId = req.params.id;
      const userId = req.user.claims.sub;

      const schema = z.object({
        measurementId: z.string().uuid().optional(),
        forceRefresh: z.boolean().optional().default(false),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const { measurementId, forceRefresh } = validationResult.data;

      // Get biomarker
      const biomarkers = await storage.getBiomarkers();
      const biomarker = biomarkers.find(b => b.id === biomarkerId);
      if (!biomarker) {
        return res.status(404).json({ error: "Biomarker not found" });
      }

      // Get latest measurement (or specific one if measurementId provided) - route through healthRouter for Supabase
      let measurement;
      if (measurementId) {
        // Get specific measurement by ID
        measurement = await healthRouter.getMeasurementByIdForUser(measurementId, userId);
        // Verify it's for the correct biomarker
        if (measurement && measurement.biomarkerId !== biomarkerId) {
          return res.status(400).json({ error: "Measurement does not belong to this biomarker" });
        }
      } else {
        // Get most recent measurement for this biomarker
        const measurements = await healthRouter.getMeasurementHistory(userId, biomarkerId, 1);
        measurement = measurements[0];
      }
      
      if (!measurement) {
        return res.status(404).json({ error: "No measurement found for this biomarker" });
      }

      // Get user profile for personalization
      const profile = await storage.getProfile(userId);
      
      // Build profile snapshot using mid-year (July 1st) assumption for ±6 month accuracy
      const calculatedAge = calculateAgeFromBirthYear(profile?.birthYear) ?? undefined;
      
      const profileSnapshot = {
        age: calculatedAge,
        sex: profile?.sex as 'male' | 'female' | 'other' | undefined,
        healthGoals: profile?.goals || [],
        activityLevel: profile?.healthBaseline?.activityLevel,
        sleepHours: profile?.healthBaseline?.sleepHours,
        dietType: profile?.healthBaseline?.dietType,
        smoking: profile?.healthBaseline?.smokingStatus,
        alcoholIntake: profile?.healthBaseline?.alcoholIntake,
        medicalContext: profile?.aiPersonalization?.medicalContext,
      };

      // Build measurement signature
      const measurementSignature = `${measurement.id}:${measurement.valueCanonical}`;

      // Check cache unless forceRefresh
      if (!forceRefresh) {
        const cachedInsights = await storage.getCachedBiomarkerInsights(userId, biomarkerId, measurementSignature);
        if (cachedInsights && (!cachedInsights.expiresAt || new Date(cachedInsights.expiresAt) > new Date())) {
          // Return cached insights
          return res.json({
            cacheStatus: "hit",
            measurement: {
              id: measurement.id,
              collectedAt: measurement.createdAt,
              value: measurement.valueCanonical,
              unit: measurement.unitCanonical,
              referenceLow: measurement.referenceLow,
              referenceHigh: measurement.referenceHigh,
              status: measurement.valueCanonical >= (measurement.referenceLow || 0) && 
                      measurement.valueCanonical <= (measurement.referenceHigh || Infinity) 
                      ? 'optimal' 
                      : measurement.valueCanonical < (measurement.referenceLow || 0) ? 'low' : 'high',
            },
            insights: {
              lifestyleActions: cachedInsights.lifestyleActions,
              nutrition: cachedInsights.nutrition,
              supplementation: cachedInsights.supplementation,
              medicalReferral: cachedInsights.medicalReferral,
              medicalUrgency: cachedInsights.medicalUrgency,
            },
            metadata: {
              generatedAt: cachedInsights.generatedAt,
              model: cachedInsights.model,
              expiresAt: cachedInsights.expiresAt,
            },
          });
        }
      }

      // Get historical measurements for trend (from Supabase via healthRouter)
      const history = await healthRouter.getMeasurementHistory(userId, biomarkerId, 5);
      const trendHistory = history.map(h => ({
        value: h.valueCanonical,
        date: h.createdAt?.toISOString().split('T')[0] || '',
      }));

      // Get correct reference range for this biomarker and unit
      // (Don't trust the stored reference range as it might have unit mismatch bugs)
      const { selectReferenceRange } = await import("@shared/domain/biomarkers");
      const biomarkerRanges = await storage.getReferenceRanges(biomarkerId);
      const contextForRange = {
        age_years: calculatedAge,
        sex: profile?.sex?.toLowerCase() as 'male' | 'female' | undefined,
      };
      
      logger.debug(`Biomarker: ${biomarker.name}, Canonical Unit: ${measurement.unitCanonical}`, {
        biomarker: biomarker.name,
        canonicalUnit: measurement.unitCanonical
      });
      logger.debug('Available ranges', {
        biomarker: biomarker.name,
        ranges: biomarkerRanges.map(r => ({ unit: r.unit, low: r.low, high: r.high }))
      });
      
      const correctRange = selectReferenceRange(
        biomarkerId,
        measurement.unitCanonical,
        contextForRange,
        biomarkerRanges
      );

      logger.debug('Selected range', {
        biomarker: biomarker.name,
        selectedRange: correctRange ? { unit: correctRange.unit, low: correctRange.low, high: correctRange.high } : null
      });

      // Use the correctly selected reference range instead of the stored one
      const referenceLow = correctRange?.low ?? null;
      const referenceHigh = correctRange?.high ?? null;
      
      logger.debug('Passing to AI', {
        biomarker: biomarker.name,
        referenceLow,
        referenceHigh,
        value: measurement.valueCanonical
      });

      // Enrich biomarker data for personalized insights
      const enrichedData = enrichBiomarkerData(
        {
          value: measurement.valueCanonical,
          unit: measurement.unitCanonical,
          referenceLow,
          referenceHigh,
          testDate: measurement.createdAt || new Date(),
        },
        trendHistory
      );

      // Determine status using the correct reference range
      const status = enrichedData.status === 'unknown' 
        ? (measurement.valueCanonical >= (referenceLow || 0) && 
           measurement.valueCanonical <= (referenceHigh || Infinity)
           ? 'optimal' as const
           : measurement.valueCanonical < (referenceLow || 0) ? 'low' as const : 'high' as const)
        : enrichedData.status as 'optimal' | 'low' | 'high';

      // Generate insights using Gemini 2.5 Pro
      const insights = await generateBiomarkerInsightsGemini({
        biomarkerName: biomarker.name,
        latestValue: measurement.valueCanonical,
        unit: measurement.unitCanonical,
        referenceLow: referenceLow || 0,
        referenceHigh: referenceHigh || Infinity,
        status,
        trendHistory,
        profileSnapshot,
        enrichedData: {
          valueContext: enrichedData.valueContext,
          encouragementTone: enrichedData.encouragementTone,
          severityScore: enrichedData.severityScore,
          deltaPercentage: enrichedData.deltaPercentage,
          trendLabel: enrichedData.trendLabel,
        },
      });

      // Build measurement summary
      const measurementSummary = {
        id: measurement.id,
        value: measurement.valueCanonical,
        unit: measurement.unitCanonical,
        collectedAt: measurement.createdAt,
        status,
        trend: trendHistory,
      };

      // Cache the insights
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

      await storage.cacheBiomarkerInsights({
        userId,
        biomarkerId,
        measurementSignature,
        profileSnapshot,
        measurementSummary,
        lifestyleActions: insights.lifestyleActions,
        nutrition: insights.nutrition,
        supplementation: insights.supplementation,
        medicalReferral: insights.medicalReferral,
        medicalUrgency: insights.medicalUrgency,
        model: "gemini-2.5-pro",
        expiresAt,
      });

      // Return insights
      res.json({
        cacheStatus: forceRefresh ? "miss" : "miss",
        measurement: {
          id: measurement.id,
          collectedAt: measurement.createdAt,
          value: measurement.valueCanonical,
          unit: measurement.unitCanonical,
          referenceLow,
          referenceHigh,
          status,
        },
        insights,
        metadata: {
          generatedAt: new Date(),
          model: "gemini-2.5-pro",
          expiresAt,
        },
      });
    } catch (error: any) {
      logger.error('Error generating biomarker insights:', error);
      
      // Try to return cached insights as fallback
      try {
        const userId = req.user.claims.sub;
        const biomarkerId = req.params.id;
        const fallbackInsights = await storage.getLatestCachedInsights(userId, biomarkerId);
        
        if (fallbackInsights) {
          return res.json({
            cacheStatus: "stale",
            measurement: fallbackInsights.measurementSummary,
            insights: {
              lifestyleActions: fallbackInsights.lifestyleActions,
              nutrition: fallbackInsights.nutrition,
              supplementation: fallbackInsights.supplementation,
              medicalReferral: fallbackInsights.medicalReferral,
              medicalUrgency: fallbackInsights.medicalUrgency,
            },
            metadata: {
              generatedAt: fallbackInsights.generatedAt,
              model: fallbackInsights.model,
              expiresAt: fallbackInsights.expiresAt,
            },
            warning: "Using cached insights due to generation failure",
          });
        }
      } catch (fallbackError) {
        logger.error('Failed to retrieve fallback insights:', fallbackError);
      }

      res.status(500).json({ 
        error: "Failed to generate insights",
        fallbackMessage: "We're unable to generate personalized insights at this time. Please consult with a healthcare provider for guidance on your results."
      });
    }
  });

  // Biomarker measurement persistence routes
  app.post("/api/measurements", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        biomarkerId: z.string().uuid(),
        value: z.number().finite(),
        unit: z.string().min(1),
        testDate: z.string().datetime(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const { biomarkerId, value, unit, testDate } = validationResult.data;
      const userId = req.user.claims.sub;

      const { biomarkers, synonyms, units, ranges } = await storage.getAllBiomarkerData();

      const biomarker = biomarkers.find(b => b.id === biomarkerId);
      if (!biomarker) {
        return res.status(404).json({ error: "Biomarker not found" });
      }

      const { normalizeMeasurement } = await import("@shared/domain/biomarkers");

      const normalized = normalizeMeasurement(
        {
          name: biomarker.name,
          value,
          unit,
        },
        biomarkers,
        synonyms,
        units,
        ranges
      );

      const result = await healthRouter.createMeasurementWithSession({
        userId,
        biomarkerId,
        value,
        unit,
        testDate: new Date(testDate),
        valueCanonical: normalized.value_canonical,
        unitCanonical: normalized.unit_canonical,
        valueDisplay: `${normalized.value_display} ${normalized.unit_canonical}`,
        referenceLow: normalized.ref_range.low,
        referenceHigh: normalized.ref_range.high,
        flags: normalized.flags,
        warnings: normalized.warnings,
        normalizationContext: normalized.context_used,
      });

      res.json({
        session: result.session,
        measurement: result.measurement,
        normalized,
      });
    } catch (error) {
      logger.error('Error creating measurement:', error);
      res.status(500).json({ error: "Failed to create measurement" });
    }
  });

  // GET /api/measurements - Get measurement history for a biomarker
  app.get("/api/measurements", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        biomarkerId: z.string().uuid().optional(),
      });

      const validationResult = schema.safeParse(req.query);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const { biomarkerId } = validationResult.data;
      const userId = req.user.claims.sub;

      if (!biomarkerId) {
        return res.status(400).json({ error: "biomarkerId query parameter is required" });
      }

      const measurements = await healthRouter.getMeasurementHistory(userId, biomarkerId);

      res.json({ measurements });
    } catch (error) {
      logger.error('Error fetching measurement history:', error);
      res.status(500).json({ error: "Failed to fetch measurement history" });
    }
  });

  // PATCH /api/measurements/:id - Edit a measurement
  app.patch("/api/measurements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const measurementId = req.params.id;
      const userId = req.user.claims.sub;

      const schema = z.object({
        biomarkerId: z.string().uuid().optional(),
        valueRaw: z.number().finite().optional(),
        unitRaw: z.string().min(1).optional(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const updates = validationResult.data;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "At least one field must be provided for update" });
      }

      const existingMeasurement = await healthRouter.getMeasurementByIdForUser(measurementId, userId);
      if (!existingMeasurement) {
        return res.status(404).json({ error: "Measurement not found or not authorized" });
      }

      const { biomarkers, synonyms, units, ranges } = await storage.getAllBiomarkerData();

      const targetBiomarkerId = updates.biomarkerId || existingMeasurement.biomarkerId;
      const targetValue = updates.valueRaw !== undefined ? updates.valueRaw : existingMeasurement.valueRaw;
      const targetUnit = updates.unitRaw || existingMeasurement.unitRaw;

      const biomarker = biomarkers.find(b => b.id === targetBiomarkerId);
      if (!biomarker) {
        return res.status(404).json({ error: "Biomarker not found" });
      }

      if (updates.biomarkerId && updates.biomarkerId !== existingMeasurement.biomarkerId) {
        const existingInSession = await storage.getMeasurementBySessionAndBiomarker(
          existingMeasurement.sessionId,
          updates.biomarkerId
        );
        if (existingInSession && existingInSession.id !== measurementId) {
          return res.status(409).json({ error: "A measurement for this biomarker already exists in this session" });
        }
      }

      const { normalizeMeasurement } = await import("@shared/domain/biomarkers");
      const normalized = normalizeMeasurement(
        {
          name: biomarker.name,
          value: targetValue,
          unit: targetUnit,
        },
        biomarkers,
        synonyms,
        units,
        ranges
      );

      const updatedMeasurement = await healthRouter.updateMeasurement(measurementId, {
        biomarkerId: targetBiomarkerId,
        valueRaw: targetValue,
        unitRaw: targetUnit,
        valueCanonical: normalized.value_canonical,
        unitCanonical: normalized.unit_canonical,
        valueDisplay: `${normalized.value_display} ${normalized.unit_canonical}`,
        referenceLow: normalized.ref_range.low,
        referenceHigh: normalized.ref_range.high,
        flags: normalized.flags,
        warnings: normalized.warnings,
        normalizationContext: normalized.context_used,
        source: existingMeasurement.source === "ai_extracted" ? "corrected" : existingMeasurement.source,
        updatedBy: userId,
        updatedAt: new Date(),
      });

      res.json({
        measurement: updatedMeasurement,
        normalized,
      });
    } catch (error) {
      logger.error('Error updating measurement:', error);
      res.status(500).json({ error: "Failed to update measurement" });
    }
  });

  // DELETE /api/measurements/:id - Delete a measurement
  app.delete("/api/measurements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const measurementId = req.params.id;
      const userId = req.user.claims.sub;

      const existingMeasurement = await healthRouter.getMeasurementByIdForUser(measurementId, userId);
      if (!existingMeasurement) {
        return res.status(404).json({ error: "Measurement not found or not authorized" });
      }

      const sessionId = existingMeasurement.sessionId;
      await healthRouter.deleteMeasurement(measurementId);

      const remainingMeasurements = await healthRouter.getMeasurementsBySession(sessionId);
      if (remainingMeasurements.length === 0) {
        await healthRouter.deleteTestSession(sessionId);
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting measurement:', error);
      res.status(500).json({ error: "Failed to delete measurement" });
    }
  });

  // Lab upload routes - PDF blood work upload and processing
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'));
      }
    },
  });

  app.post("/api/labs/upload", isAuthenticated, uploadRateLimiter, upload.single('file'), async (req: any, res) => {
    let job: any;
    let bloodWorkRecord: any;
    
    try {
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileBuffer = file.buffer;
      const fileName = file.originalname;
      const fileSizeBytes = file.size;
      const fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL();
      
      const uploadController = new AbortController();
      const uploadTimeout = setTimeout(() => uploadController.abort(), 30000);
      
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: fileBuffer,
        headers: {
          'Content-Type': 'application/pdf',
        },
        signal: uploadController.signal,
      });
      
      clearTimeout(uploadTimeout);

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to object storage');
      }

      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId || !objectPath) {
        throw new Error('Object storage configuration error');
      }
      const fileUrl = `https://storage.googleapis.com/${bucketId}/${objectPath.startsWith('/') ? objectPath.slice(1) : objectPath}`;

      bloodWorkRecord = await storage.createBloodWorkRecord({
        userId,
        fileName,
        fileUrl,
        status: "pending",
      });

      job = await storage.createLabUploadJob({
        userId,
        recordId: bloodWorkRecord.id,
        status: "pending",
        fileName,
        fileUrl,
        fileSizeBytes,
        fileSha256,
        steps: [],
        resultPayload: null,
        errorDetails: null,
      });

      setImmediate(async () => {
        let finalStatus: "completed" | "needs_review" | "failed" = "failed";
        let finalJobUpdate: any = {};
        
        try {
          await storage.updateLabUploadJob(job.id, {
            status: "processing",
            steps: [{ name: "started", status: "in_progress", timestamp: new Date().toISOString() }],
          });

          // Download PDF buffer from object storage
          const pdfBuffer = await objectStorageService.getObjectEntityBuffer(objectPath);
          const result = await processLabUpload(pdfBuffer);

          if (result.success && result.extractedData) {
            const extractedBiomarkers = result.extractedData.biomarkers;
            const testDate = new Date(result.extractedData.testDate);
            
            const session = await healthRouter.createBiomarkerSession(userId, {
              source: "ai_extracted",
              test_date: testDate.toISOString(),
              notes: result.extractedData.notes || `Extracted from ${fileName}`,
            });

            const biomarkerData = await storage.getAllBiomarkerData();
            const measurementIds: string[] = [];
            const successfulBiomarkers: string[] = [];
            const failedBiomarkers: { name: string; error: string }[] = [];
            const seenBiomarkersInSession = new Set<string>();

            for (const biomarker of extractedBiomarkers) {
              try {
                const normalized = normalizeMeasurement(
                  {
                    name: biomarker.name,
                    value: biomarker.value,
                    unit: biomarker.unit,
                  },
                  biomarkerData.biomarkers,
                  biomarkerData.synonyms,
                  biomarkerData.units,
                  biomarkerData.ranges
                );

                // Check for duplicates within this session/upload
                if (seenBiomarkersInSession.has(normalized.biomarker_id)) {
                  failedBiomarkers.push({
                    name: biomarker.name,
                    error: "Duplicate biomarker in this upload (same biomarker extracted multiple times)",
                  });
                  continue;
                }

                // Check for duplicates: same biomarker, same value (canonical), same test date
                const isDuplicate = await storage.checkDuplicateMeasurement({
                  userId,
                  biomarkerId: normalized.biomarker_id,
                  valueCanonical: normalized.value_canonical,
                  testDate,
                });

                if (isDuplicate) {
                  failedBiomarkers.push({
                    name: biomarker.name,
                    error: "Duplicate measurement (same biomarker, value, and test date already exists)",
                  });
                  continue;
                }

                seenBiomarkersInSession.add(normalized.biomarker_id);

                const measurement = await healthRouter.createBiomarkerMeasurement({
                  session_id: session.id,
                  biomarker_id: normalized.biomarker_id,
                  source: "ai_extracted",
                  value_raw: biomarker.value,
                  unit_raw: biomarker.unit,
                  value_canonical: normalized.value_canonical,
                  unit_canonical: normalized.unit_canonical,
                  value_display: `${biomarker.value} ${biomarker.unit}`,
                  reference_low: normalized.ref_range.low ?? null,
                  reference_high: normalized.ref_range.high ?? null,
                  reference_low_raw: biomarker.referenceRangeLow ?? null,
                  reference_high_raw: biomarker.referenceRangeHigh ?? null,
                  reference_unit_raw: biomarker.unit,
                  flags: biomarker.flags ?? normalized.flags,
                  warnings: normalized.warnings,
                  normalization_context: normalized.context_used,
                });

                if (measurement?.id) {
                  measurementIds.push(measurement.id);
                }
                successfulBiomarkers.push(biomarker.name);
              } catch (error: any) {
                logger.error(`Failed to normalize biomarker ${biomarker.name}:`, error);
                failedBiomarkers.push({
                  name: biomarker.name,
                  error: error.message || "Unknown error",
                });
              }
            }

            // Trigger notifications for out-of-range biomarkers
            try {
              const biomarkerResults = extractedBiomarkers
                .filter(b => successfulBiomarkers.includes(b.name))
                .map(b => ({
                  biomarkerName: b.name,
                  value: b.value,
                  unit: b.unit,
                  referenceMin: b.referenceRangeLow,
                  referenceMax: b.referenceRangeHigh,
                  criticalLow: null, // TODO: Extract critical ranges if available
                  criticalHigh: null,
                }));

              await processBiomarkerNotifications({
                userId,
                bloodWorkId: bloodWorkRecord.id,
                biomarkerResults,
              });
            } catch (notifError) {
              logger.error('Failed to process biomarker notifications:', notifError);
              // Don't fail the upload if notifications fail
            }

            finalStatus = failedBiomarkers.length > 0 ? "needs_review" : "completed";
            finalJobUpdate = {
              status: finalStatus,
              steps: result.steps,
              resultPayload: {
                sessionId: session.id,
                measurementIds,
                testDate: result.extractedData.testDate,
                labName: result.extractedData.labName,
                totalBiomarkers: extractedBiomarkers.length,
                successfulBiomarkers,
                failedBiomarkers,
              },
              errorDetails: failedBiomarkers.length > 0 ? { failedBiomarkers } : null,
            };
          } else {
            finalStatus = "failed";
            finalJobUpdate = {
              status: "failed",
              steps: result.steps,
              errorDetails: { error: result.error || "Processing failed" },
            };
          }
        } catch (error: any) {
          logger.error('Error processing lab upload:', error);
          finalStatus = "failed";
          finalJobUpdate = {
            status: "failed",
            errorDetails: { error: error.message || "Unknown error occurred" },
          };
        } finally {
          try {
            await storage.updateLabUploadJob(job.id, finalJobUpdate);
            await storage.updateBloodWorkRecordStatus(bloodWorkRecord.id, finalStatus);
            
            // Clean up: Delete the PDF from object storage after extraction
            // We only store the extracted biomarker data, not the original files
            // This reduces storage costs and privacy risks
            try {
              const deleted = await objectStorageService.deleteObjectEntity(objectPath);
              if (deleted) {
                logger.info(`[LabUpload] Cleaned up PDF after extraction: ${objectPath}`);
              }
            } catch (cleanupError: any) {
              logger.warn('[LabUpload] Failed to clean up PDF (non-critical)', { error: cleanupError?.message });
              // Don't fail the job if cleanup fails - the data is already extracted
            }
          } catch (updateError) {
            logger.error('Critical error updating job status:', updateError);
          }
        }
      });

      res.json({
        jobId: job.id,
        status: "pending",
        message: "Upload successful, processing started",
      });
    } catch (error: any) {
      logger.error('Error uploading lab file:', error);
      
      if (job && job.id) {
        try {
          await storage.updateLabUploadJob(job.id, {
            status: "failed",
            errorDetails: { error: error.message || "Upload failed" },
          });
        } catch (updateError) {
          logger.error('Failed to update job status:', updateError);
        }
      }
      
      if (bloodWorkRecord && bloodWorkRecord.id) {
        try {
          await storage.updateBloodWorkRecordStatus(bloodWorkRecord.id, "failed");
        } catch (updateError) {
          logger.error('Failed to update blood work record status:', updateError);
        }
      }
      
      res.status(500).json({ error: error.message || "Failed to upload lab file" });
    }
  });

  app.get("/api/labs/status/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const jobId = req.params.jobId;

      const job = await storage.getLabUploadJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.userId !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      res.json({
        jobId: job.id,
        status: job.status,
        fileName: job.fileName,
        steps: job.steps,
        result: job.resultPayload,
        error: job.errorDetails,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    } catch (error) {
      logger.error('Error getting job status:', error);
      res.status(500).json({ error: "Failed to get job status" });
    }
  });

  // GET /api/labs/history - Get user's recent lab upload history for debugging
  app.get("/api/labs/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = Math.min(parseInt(req.query.limit) || 20, 50);

      const jobs = await storage.getLabUploadJobsByUser(userId, limit);

      res.json({
        jobs: jobs.map(job => ({
          id: job.id,
          fileName: job.fileName,
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          result: job.resultPayload,
          error: job.errorDetails,
        })),
      });
    } catch (error) {
      logger.error('Error getting lab upload history:', error);
      res.status(500).json({ error: "Failed to get lab upload history" });
    }
  });

  // ============================================================================
  // Medical Documents - Specialist Reports, Imaging, etc.
  // ============================================================================

  // GET /api/medical-documents/types - Get available document types
  app.get("/api/medical-documents/types", isAuthenticated, async (req: any, res) => {
    try {
      const types = getDocumentTypes();
      res.json({ types });
    } catch (error) {
      logger.error('Error getting document types:', error);
      res.status(500).json({ error: "Failed to get document types" });
    }
  });

  // POST /api/medical-documents/upload - Upload a medical document
  app.post("/api/medical-documents/upload", isAuthenticated, uploadRateLimiter, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const documentType = (req.body.documentType || 'specialist_consult') as MedicalDocumentType;
      const title = req.body.title || null;
      const providerName = req.body.providerName || null;
      const documentDate = req.body.documentDate || null;

      // Upload to object storage
      const { uploadURL, objectPath } = await objectStorageService.getObjectEntityUploadURL();
      
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file.buffer,
        headers: {
          'Content-Type': file.mimetype || 'application/pdf',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to object storage');
      }

      // Create document record and start processing
      const result = await createMedicalDocument(
        userId,
        documentType,
        objectPath,
        file.originalname,
        file.size,
        file.mimetype || 'application/pdf',
        { title, providerName, documentDate }
      );

      res.json(result);
    } catch (error: any) {
      logger.error('Error uploading medical document:', error);
      res.status(500).json({ error: error.message || "Failed to upload document" });
    }
  });

  // GET /api/medical-documents - List user's medical documents
  app.get("/api/medical-documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentType = req.query.type as MedicalDocumentType | undefined;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const includeText = req.query.includeText === 'true';

      const documents = await getMedicalDocuments(userId, {
        documentType,
        limit,
        includeText
      });

      res.json({ documents });
    } catch (error) {
      logger.error('Error getting medical documents:', error);
      res.status(500).json({ error: "Failed to get documents" });
    }
  });

  // GET /api/medical-documents/:id - Get a specific document
  app.get("/api/medical-documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = req.params.id;

      const document = await getMedicalDocument(userId, documentId);

      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      res.json({ document });
    } catch (error) {
      logger.error('Error getting medical document:', error);
      res.status(500).json({ error: "Failed to get document" });
    }
  });

  // PATCH /api/medical-documents/:id - Update document metadata
  app.patch("/api/medical-documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = req.params.id;
      const { documentType } = req.body;

      if (documentType) {
        const success = await updateMedicalDocumentType(userId, documentId, documentType);
        if (!success) {
          return res.status(404).json({ error: "Document not found or update failed" });
        }
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating medical document:', error);
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  // DELETE /api/medical-documents/:id - Delete a document
  app.delete("/api/medical-documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = req.params.id;

      const success = await deleteMedicalDocument(userId, documentId);

      if (!success) {
        return res.status(404).json({ error: "Document not found or already deleted" });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting medical document:', error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // POST /api/medical-documents/search - Search medical documents
  app.post("/api/medical-documents/search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { query, limit = 5 } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: "Query is required" });
      }

      const results = await searchMedicalDocuments(userId, query, Math.min(limit, 20));

      res.json({ results });
    } catch (error) {
      logger.error('Error searching medical documents:', error);
      res.status(500).json({ error: "Failed to search documents" });
    }
  });

  // Admin routes - Biomarker session duplicate cleanup
  app.get("/api/admin/biomarker-duplicates/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const sessions = await healthRouter.getBiomarkerSessions(userId);
      
      type SessionType = typeof sessions[0];
      
      // Group sessions by (date, source) to find duplicates
      const sessionGroups = new Map<string, SessionType[]>();
      
      for (const session of sessions) {
        const dateKey = new Date(session.testDate).toISOString().split('T')[0];
        const key = `${dateKey}|${session.source || 'unknown'}`;
        
        if (!sessionGroups.has(key)) {
          sessionGroups.set(key, []);
        }
        sessionGroups.get(key)!.push(session);
      }
      
      // Find groups with more than one session (duplicates)
      const duplicates = [];
      for (const [key, groupSessions] of Array.from(sessionGroups.entries())) {
        if (groupSessions.length > 1) {
          // Get measurement counts for each session
          const sessionsWithCounts = await Promise.all(
            groupSessions.map(async (s: SessionType) => {
              const measurements = await healthRouter.getMeasurementsBySession(s.id!);
              return {
                id: s.id,
                testDate: s.testDate,
                source: s.source,
                createdAt: s.createdAt,
                measurementCount: measurements.length,
              };
            })
          );
          
          duplicates.push({
            key,
            count: groupSessions.length,
            sessions: sessionsWithCounts,
          });
        }
      }
      
      res.json({
        userId,
        totalSessions: sessions.length,
        duplicateGroups: duplicates.length,
        duplicates,
      });
    } catch (error) {
      logger.error('Error finding duplicate sessions:', error);
      res.status(500).json({ error: "Failed to find duplicate sessions" });
    }
  });
  
  app.delete("/api/admin/biomarker-duplicates/:userId/cleanup", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const dryRun = req.query.dryRun !== 'false'; // Default to dry run
      
      const sessions = await healthRouter.getBiomarkerSessions(userId);
      
      type SessionType = typeof sessions[0];
      
      // Group sessions by (date, source) to find duplicates
      const sessionGroups = new Map<string, SessionType[]>();
      
      for (const session of sessions) {
        const dateKey = new Date(session.testDate).toISOString().split('T')[0];
        const key = `${dateKey}|${session.source || 'unknown'}`;
        
        if (!sessionGroups.has(key)) {
          sessionGroups.set(key, []);
        }
        sessionGroups.get(key)!.push(session);
      }
      
      const deletedSessions: string[] = [];
      const keptSessions: string[] = [];
      
      for (const [key, groupSessions] of Array.from(sessionGroups.entries())) {
        if (groupSessions.length > 1) {
          // Get measurement counts for each session
          const sessionsWithCounts = await Promise.all(
            groupSessions.map(async (s: SessionType) => {
              const measurements = await healthRouter.getMeasurementsBySession(s.id!);
              return { session: s, measurementCount: measurements.length };
            })
          );
          
          // Sort by measurement count descending, then by createdAt descending
          sessionsWithCounts.sort((a, b) => {
            if (b.measurementCount !== a.measurementCount) {
              return b.measurementCount - a.measurementCount;
            }
            return new Date(b.session.createdAt || 0).getTime() - new Date(a.session.createdAt || 0).getTime();
          });
          
          // Keep the first one (most measurements/most recent), delete the rest
          keptSessions.push(sessionsWithCounts[0].session.id!);
          
          for (let i = 1; i < sessionsWithCounts.length; i++) {
            const sessionToDelete = sessionsWithCounts[i].session;
            deletedSessions.push(sessionToDelete.id!);
            
            if (!dryRun) {
              await healthRouter.deleteBiomarkerSession(userId, sessionToDelete.id!);
            }
          }
        }
      }
      
      res.json({
        dryRun,
        userId,
        keptSessions: keptSessions.length,
        deletedSessions: deletedSessions.length,
        deletedSessionIds: deletedSessions,
        keptSessionIds: keptSessions,
        message: dryRun 
          ? `Would delete ${deletedSessions.length} duplicate sessions. Add ?dryRun=false to execute.`
          : `Deleted ${deletedSessions.length} duplicate sessions.`,
      });
    } catch (error) {
      logger.error('Error cleaning up duplicate sessions:', error);
      res.status(500).json({ error: "Failed to clean up duplicate sessions" });
    }
  });

  // Admin routes - User management
  app.get("/api/admin/users", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      // Validate query parameters
      const validationResult = listUsersQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationResult.toString() });
      }

      const { q, role, status, limit, offset } = validationResult.data;

      const result = await storage.listUsers({
        query: q,
        role,
        status,
        limit,
        offset,
      });

      res.json(result);
    } catch (error) {
      logger.error('Error listing users:', error);
      res.status(500).json({ error: "Failed to list users" });
    }
  });

  // Consolidated PATCH endpoint for updating user role and/or status
  app.patch("/api/admin/users/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      const userId = req.params.id;

      // Validate request body
      const validationResult = updateUserSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const user = await storage.updateUser(userId, validationResult.data, adminId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      logger.error('Error updating user:', error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.get("/api/admin/users/:userId/billing", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const billingInfo = await storage.getBillingInfo(userId);
      res.json(billingInfo);
    } catch (error) {
      logger.error('Error fetching billing info:', error);
      res.status(500).json({ error: "Failed to fetch billing info" });
    }
  });

  // Get detailed user profile metrics for admin
  app.get("/api/admin/users/:userId/profile-metrics", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { getLatestLocation, getProfileByHealthId } = await import('./services/healthStorageRouter');
      const { getSupabaseHealth } = await import('./services/supabaseHealth');
      
      // Get user's health_id for Supabase queries
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      let datapoints = 0;
      let location: { city?: string; country?: string; latitude?: number; longitude?: number } | null = null;
      let device: { name?: string; manufacturer?: string; model?: string } | null = null;
      const integrations: string[] = [];
      
      // Try to get health data from Supabase
      try {
        const supabase = getSupabaseHealth();
        if (supabase && user.healthId) {
          // Get datapoint count from healthkit_samples
          const { count: hkCount } = await supabase
            .from('healthkit_samples')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.healthId);
          
          if (hkCount) {
            datapoints += hkCount;
            integrations.push('HealthKit');
          }
          
          // Get latest location
          const locationRecord = await getLatestLocation(userId);
          if (locationRecord) {
            location = {
              latitude: locationRecord.latitude,
              longitude: locationRecord.longitude,
            };
            
            // Try to get city name from cached weather
            const { data: cachedWeather } = await supabase
              .from('weather_cache')
              .select('weather_data')
              .eq('user_id', user.healthId)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            
            if (cachedWeather?.weather_data?.cityName) {
              location.city = cachedWeather.weather_data.cityName;
            }
          }
          
          // Get most recent device info from healthkit_samples
          const { data: deviceInfo } = await supabase
            .from('healthkit_samples')
            .select('device_name, device_manufacturer, device_model')
            .eq('user_id', user.healthId)
            .not('device_name', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (deviceInfo) {
            device = {
              name: deviceInfo.device_name,
              manufacturer: deviceInfo.device_manufacturer,
              model: deviceInfo.device_model,
            };
          }
          
          // Get biomarker measurement count
          const { count: biomarkerCount } = await supabase
            .from('biomarker_measurements')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.healthId);
          
          if (biomarkerCount) {
            datapoints += biomarkerCount;
          }
          
          // Get life events count
          const { count: lifeEventCount } = await supabase
            .from('life_events')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.healthId);
          
          if (lifeEventCount) {
            datapoints += lifeEventCount;
          }
        }
      } catch (supabaseError: any) {
        logger.warn(`[Admin] Error fetching Supabase health data for user ${userId}:`, supabaseError.message);
      }
      
      // Also count Neon-based data
      try {
        // Count healthkit samples in Neon (legacy)
        const [neonHkCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(healthkitSamples)
          .where(eq(healthkitSamples.userId, userId));
        
        if (neonHkCount?.count) {
          datapoints += Number(neonHkCount.count);
        }
        
        // Count biomarker measurements in Neon
        const [neonBiomarkerCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(biomarkerMeasurements)
          .where(eq(biomarkerMeasurements.userId, userId));
        
        if (neonBiomarkerCount?.count) {
          datapoints += Number(neonBiomarkerCount.count);
        }
        
        // Count life events in Neon
        const [neonLifeEventCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(lifeEvents)
          .where(eq(lifeEvents.userId, userId));
        
        if (neonLifeEventCount?.count) {
          datapoints += Number(neonLifeEventCount.count);
        }
      } catch (neonError: any) {
        logger.warn(`[Admin] Error fetching Neon data for user ${userId}:`, neonError.message);
      }
      
      res.json({
        datapoints,
        location,
        device,
        integrations,
      });
    } catch (error: any) {
      logger.error('Error fetching user profile metrics:', error);
      res.status(500).json({ error: "Failed to fetch user profile metrics" });
    }
  });

  // Admin notification trigger management
  app.get("/api/admin/notification-triggers", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const triggers = await db
        .select({
          id: notificationTriggers.id,
          triggerType: notificationTriggers.triggerType,
          isActive: notificationTriggers.isActive,
          biomarkerId: notificationTriggers.biomarkerId,
          title: notificationTriggers.title,
          body: notificationTriggers.body,
          triggerConditions: notificationTriggers.triggerConditions,
          createdBy: notificationTriggers.createdBy,
          createdAt: notificationTriggers.createdAt,
          updatedAt: notificationTriggers.updatedAt,
          biomarkerName: biomarkers.name,
        })
        .from(notificationTriggers)
        .leftJoin(biomarkers, eq(notificationTriggers.biomarkerId, biomarkers.id))
        .orderBy(desc(notificationTriggers.createdAt));

      res.json(triggers);
    } catch (error) {
      logger.error('Error fetching notification triggers:', error);
      res.status(500).json({ error: "Failed to fetch notification triggers" });
    }
  });

  app.post("/api/admin/notification-triggers", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      const validationResult = insertNotificationTriggerSchema.safeParse({
        ...req.body,
        createdBy: adminId,
      });

      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const [trigger] = await db
        .insert(notificationTriggers)
        .values(validationResult.data)
        .returning();

      logger.info(`[Admin] Notification trigger created: ${trigger.id} by ${adminId}`);
      res.json(trigger);
    } catch (error) {
      logger.error('Error creating notification trigger:', error);
      res.status(500).json({ error: "Failed to create notification trigger" });
    }
  });

  app.patch("/api/admin/notification-triggers/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const triggerId = req.params.id;
      const adminId = req.user.claims.sub;

      const partialSchema = insertNotificationTriggerSchema.partial();
      const validationResult = partialSchema.safeParse(req.body);

      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const [trigger] = await db
        .update(notificationTriggers)
        .set({
          ...validationResult.data,
          updatedAt: new Date(),
        })
        .where(eq(notificationTriggers.id, triggerId))
        .returning();

      if (!trigger) {
        return res.status(404).json({ error: "Trigger not found" });
      }

      logger.info(`[Admin] Notification trigger updated: ${triggerId} by ${adminId}`);
      res.json(trigger);
    } catch (error) {
      logger.error('Error updating notification trigger:', error);
      res.status(500).json({ error: "Failed to update notification trigger" });
    }
  });

  app.delete("/api/admin/notification-triggers/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const triggerId = req.params.id;
      const adminId = req.user.claims.sub;

      const [trigger] = await db
        .delete(notificationTriggers)
        .where(eq(notificationTriggers.id, triggerId))
        .returning();

      if (!trigger) {
        return res.status(404).json({ error: "Trigger not found" });
      }

      logger.info(`[Admin] Notification trigger deleted: ${triggerId} by ${adminId}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting notification trigger:', error);
      res.status(500).json({ error: "Failed to delete notification trigger" });
    }
  });

  // Get list of all biomarkers for admin notification config
  app.get("/api/biomarkers", isAuthenticated, async (req, res) => {
    try {
      const biomarkerList = await db
        .select({
          id: biomarkers.id,
          name: biomarkers.name,
          category: biomarkers.category,
        })
        .from(biomarkers)
        .orderBy(biomarkers.category, biomarkers.name);

      res.json(biomarkerList);
    } catch (error) {
      logger.error('Error fetching biomarkers:', error);
      res.status(500).json({ error: "Failed to fetch biomarkers" });
    }
  });

  // Mobile notification endpoints
  app.get("/api/notifications/pending", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { getPendingNotifications } = await import("./services/notificationTriggerService");
      const notifications = await getPendingNotifications(userId);
      res.json(notifications);
    } catch (error) {
      logger.error('Error fetching pending notifications:', error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/:id/mark-sent", isAuthenticated, async (req, res) => {
    try {
      const notificationId = req.params.id;
      const { markNotificationSent } = await import("./services/notificationTriggerService");
      await markNotificationSent(notificationId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error marking notification as sent:', error);
      res.status(500).json({ error: "Failed to mark notification as sent" });
    }
  });

  // Device token management (for push notifications)
  app.post("/api/device-tokens", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      
      logger.info(`[DeviceToken] Registration request - userId: ${userId}, hasBody: ${!!req.body}, token: ${req.body?.deviceToken?.substring(0, 20)}...`);
      
      if (!userId) {
        logger.warn(`[DeviceToken] No userId found in request - auth may have failed`);
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { insertDeviceTokenSchema } = await import("@shared/schema");
      
      const validation = insertDeviceTokenSchema.safeParse({
        userId,
        deviceToken: req.body.deviceToken,
        platform: req.body.platform || 'ios',
      });

      if (!validation.success) {
        logger.warn(`[DeviceToken] Validation failed:`, validation.error.errors);
        return res.status(400).json({ error: "Invalid device token data", details: validation.error.errors });
      }

      // Check if token already exists
      const existing = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.deviceToken, validation.data.deviceToken))
        .limit(1);

      if (existing.length > 0) {
        // Update existing token
        const [updated] = await db
          .update(deviceTokens)
          .set({
            userId,
            isActive: true,
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(deviceTokens.deviceToken, validation.data.deviceToken))
          .returning();
        
        logger.info(`[DeviceToken] Updated device token for user ${userId} - tokenId: ${updated?.id}`);
        return res.json({ success: true, action: 'updated', tokenId: updated?.id });
      }

      // Insert new token
      const [token] = await db
        .insert(deviceTokens)
        .values(validation.data)
        .returning();

      logger.info(`[DeviceToken] Registered NEW device token for user ${userId} - tokenId: ${token?.id}`);
      res.json({ success: true, action: 'created', tokenId: token?.id });
    } catch (error) {
      logger.error('Error registering device token:', error);
      res.status(500).json({ error: "Failed to register device token" });
    }
  });

  app.get("/api/device-tokens", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const tokens = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, userId));

      res.json(tokens);
    } catch (error) {
      logger.error('Error fetching device tokens:', error);
      res.status(500).json({ error: "Failed to fetch device tokens" });
    }
  });

  app.delete("/api/device-tokens/:token", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const token = req.params.token;

      const [deleted] = await db
        .delete(deviceTokens)
        .where(
          and(
            eq(deviceTokens.deviceToken, token),
            eq(deviceTokens.userId, userId)
          )
        )
        .returning();

      if (!deleted) {
        return res.status(404).json({ error: "Device token not found" });
      }

      logger.info(`[DeviceToken] Removed device token for user ${userId}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error removing device token:', error);
      res.status(500).json({ error: "Failed to remove device token" });
    }
  });

  // ============================================================================
  // Developer Messages & User Notifications (Bug Reports, Feature Requests)
  // ============================================================================

  // Get unread notification count for bell icon badge
  app.get("/api/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all active messages that haven't expired
      const allMessages = await db
        .select({ id: developerMessages.id, targetUserIds: developerMessages.targetUserIds })
        .from(developerMessages)
        .where(
          and(
            eq(developerMessages.isActive, true),
            or(
              isNull(developerMessages.expiresAt),
              gte(developerMessages.expiresAt, new Date())
            )
          )
        );
      
      // Filter to messages targeting this user (null = all users, or userId in targetUserIds array)
      const messages = allMessages.filter(m => 
        m.targetUserIds === null || (m.targetUserIds as string[]).includes(userId)
      );
      
      // Get which ones the user has read
      const readMessages = await db
        .select({ messageId: developerMessageReads.messageId })
        .from(developerMessageReads)
        .where(eq(developerMessageReads.userId, userId));
      
      const readMessageIds = new Set(readMessages.map(r => r.messageId));
      const unreadCount = messages.filter(m => !readMessageIds.has(m.id)).length;
      
      res.json({ unreadCount });
    } catch (error) {
      logger.error('Error fetching notification count:', error);
      res.status(500).json({ error: "Failed to fetch notification count" });
    }
  });

  // Get developer messages with read status
  app.get("/api/notifications/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all active messages
      const allMessages = await db
        .select()
        .from(developerMessages)
        .where(
          and(
            eq(developerMessages.isActive, true),
            or(
              isNull(developerMessages.expiresAt),
              gte(developerMessages.expiresAt, new Date())
            )
          )
        )
        .orderBy(desc(developerMessages.createdAt));
      
      // Filter to messages targeting this user (null = all users, or userId in targetUserIds array)
      const messages = allMessages.filter(m => 
        m.targetUserIds === null || (m.targetUserIds as string[]).includes(userId)
      );
      
      // Get which ones the user has read
      const readMessages = await db
        .select({ messageId: developerMessageReads.messageId })
        .from(developerMessageReads)
        .where(eq(developerMessageReads.userId, userId));
      
      const readMessageIds = new Set(readMessages.map(r => r.messageId));
      
      // Add isRead status to messages (don't expose targetUserIds to users)
      const messagesWithReadStatus = messages.map(({ targetUserIds, ...m }) => ({
        ...m,
        isRead: readMessageIds.has(m.id),
      }));
      
      res.json({ messages: messagesWithReadStatus });
    } catch (error) {
      logger.error('Error fetching developer messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Mark a developer message as read
  app.post("/api/notifications/messages/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const messageId = parseInt(req.params.id);
      
      if (isNaN(messageId)) {
        return res.status(400).json({ error: "Invalid message ID" });
      }
      
      // Check if already read
      const existing = await db
        .select()
        .from(developerMessageReads)
        .where(
          and(
            eq(developerMessageReads.userId, userId),
            eq(developerMessageReads.messageId, messageId)
          )
        )
        .limit(1);
      
      if (existing.length === 0) {
        // Mark as read
        await db
          .insert(developerMessageReads)
          .values({
            userId,
            messageId,
          });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Error marking message as read:', error);
      res.status(500).json({ error: "Failed to mark message as read" });
    }
  });

  // Submit bug report (stores in database AND sends email)
  app.post("/api/notifications/bug-report", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { message } = req.body;
      
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "Bug description is required" });
      }
      
      // Store in database
      const [feedback] = await db
        .insert(userFeedback)
        .values({
          userId,
          type: 'bug_report',
          message: message.trim(),
        })
        .returning();
      
      // Also send email notification
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const userEmail = user?.email;
      
      const { sendBugReportEmail } = await import('./services/emailService');
      await sendBugReportEmail(
        'Bug Report from Flō User',
        message.trim(),
        'medium',
        userEmail || undefined,
        parseInt(userId) || undefined
      );
      
      logger.info('[BugReport] Bug report submitted successfully', { userId, feedbackId: feedback.id });
      res.json({ success: true, id: feedback.id });
    } catch (error) {
      logger.error('Error submitting bug report:', error);
      res.status(500).json({ error: "Failed to submit bug report" });
    }
  });

  // Submit feature request (stores in database AND sends email)
  app.post("/api/notifications/feature-request", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title, description } = req.body;
      
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: "Feature title is required" });
      }
      
      if (!description || typeof description !== 'string' || description.trim().length === 0) {
        return res.status(400).json({ error: "Feature description is required" });
      }
      
      // Store in database
      const [feedback] = await db
        .insert(userFeedback)
        .values({
          userId,
          type: 'feature_request',
          title: title.trim(),
          message: description.trim(),
        })
        .returning();
      
      // Also send email notification
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const userEmail = user?.email;
      
      const { sendFeatureRequestEmail } = await import('./services/emailService');
      await sendFeatureRequestEmail(
        title.trim(),
        description.trim(),
        userEmail || undefined,
        parseInt(userId) || undefined
      );
      
      logger.info('[FeatureRequest] Feature request submitted successfully', { userId, title, feedbackId: feedback.id });
      res.json({ success: true, id: feedback.id });
    } catch (error) {
      logger.error('Error submitting feature request:', error);
      res.status(500).json({ error: "Failed to submit feature request" });
    }
  });

  // Get all pending anomaly alerts for current user (for dashboard tile)
  app.get("/api/anomaly-alerts/pending", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { correlationInsightService } = await import('./services/correlationInsightService');
      
      const pendingAlerts = await correlationInsightService.getPendingFeedbackForUser(userId);
      
      res.json({
        alerts: pendingAlerts.map(alert => ({
          feedbackId: alert.feedbackId,
          questionText: alert.question.questionText,
          questionType: alert.question.questionType,
          options: alert.question.options,
          triggerPattern: alert.question.triggerPattern,
          triggerMetrics: alert.question.triggerMetrics,
          urgency: alert.question.urgency,
          createdAt: alert.createdAt.toISOString(),
          expiresAt: alert.expiresAt.toISOString(),
        })),
      });
    } catch (error) {
      logger.error('Error fetching pending anomaly alerts:', error);
      res.status(500).json({ error: "Failed to fetch anomaly alerts" });
    }
  });

  // Get correlation insights (ML-detected patterns with user feedback)
  app.get("/api/correlation/insights", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const insights = await db.select()
        .from(userInsights)
        .where(and(
          eq(userInsights.userId, userId),
          eq(userInsights.source, 'correlation_insight'),
          eq(userInsights.status, 'active')
        ))
        .orderBy(userInsights.createdAt);

      res.json({
        insights: insights.map(i => ({
          id: i.id,
          text: i.text,
          tags: i.tags,
          importance: i.importance,
          createdAt: i.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      logger.error('Error fetching correlation insights:', error);
      res.status(500).json({ error: "Failed to fetch correlation insights" });
    }
  });

  // Delete a correlation insight
  app.delete("/api/correlation/insights/:insightId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { insightId } = req.params;
      
      const [insight] = await db.select()
        .from(userInsights)
        .where(eq(userInsights.id, insightId))
        .limit(1);

      if (!insight) {
        return res.status(404).json({ error: "Insight not found" });
      }

      if (insight.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this insight" });
      }

      await db.update(userInsights)
        .set({ status: 'dismissed' })
        .where(eq(userInsights.id, insightId));

      logger.info('[CorrelationInsight] Insight deleted', { userId, insightId });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting correlation insight:', error);
      res.status(500).json({ error: "Failed to delete insight" });
    }
  });

  // Get pending feedback question by ID
  app.get("/api/correlation/feedback/:feedbackId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { feedbackId } = req.params;

      const { correlationInsightService } = await import('./services/correlationInsightService');
      const pending = await correlationInsightService.getPendingFeedback(feedbackId);

      if (!pending) {
        return res.status(404).json({ error: "Feedback not found or expired" });
      }

      if (pending.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to access this feedback" });
      }

      res.json({
        feedbackId: pending.feedbackId,
        question: pending.question,
        createdAt: pending.createdAt.toISOString(),
        expiresAt: pending.expiresAt.toISOString(),
      });
    } catch (error) {
      logger.error('Error fetching pending feedback:', error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  // Submit correlation engine feedback (user response to dynamic questions)
  const correlationFeedbackSchema = z.object({
    feedbackId: z.string().uuid(),
    responseValue: z.number().int().min(1).max(10).optional(),
    responseBoolean: z.boolean().optional(),
    responseOptionIndex: z.number().int().min(0).optional(),
    responseText: z.string().max(1000).optional(),
    channel: z.enum(['push', 'in_app', 'voice']).optional(),
  });

  app.post("/api/correlation/feedback", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parseResult = correlationFeedbackSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid feedback data", details: parseResult.error.errors });
      }

      const { feedbackId, responseValue, responseBoolean, responseOptionIndex, responseText, channel } = parseResult.data;

      const { correlationInsightService } = await import('./services/correlationInsightService');
      
      const pending = await correlationInsightService.getPendingFeedback(feedbackId);
      if (!pending) {
        return res.status(404).json({ error: "Feedback not found or expired" });
      }

      if (pending.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to submit this feedback" });
      }

      const questionType = pending.question.questionType;
      
      if (questionType === 'scale_1_10') {
        if (responseValue === undefined) {
          return res.status(400).json({ error: "Scale response required for this question type" });
        }
        if (responseBoolean !== undefined || responseOptionIndex !== undefined) {
          return res.status(400).json({ error: "Conflicting response fields not allowed" });
        }
      }
      if (questionType === 'yes_no') {
        if (responseBoolean === undefined) {
          return res.status(400).json({ error: "Yes/No response required for this question type" });
        }
        if (responseValue !== undefined || responseOptionIndex !== undefined) {
          return res.status(400).json({ error: "Conflicting response fields not allowed" });
        }
      }
      if (questionType === 'multiple_choice') {
        if (responseOptionIndex === undefined) {
          return res.status(400).json({ error: "Option selection required for this question type" });
        }
        if (responseValue !== undefined || responseBoolean !== undefined) {
          return res.status(400).json({ error: "Conflicting response fields not allowed" });
        }
        const options = pending.question.options;
        if (!options || responseOptionIndex < 0 || responseOptionIndex >= options.length) {
          return res.status(400).json({ error: "Invalid option index" });
        }
      }
      if (questionType === 'open_ended') {
        if (!responseText || responseText.trim().length === 0) {
          return res.status(400).json({ error: "Text response required for this question type" });
        }
        if (responseValue !== undefined || responseBoolean !== undefined || responseOptionIndex !== undefined) {
          return res.status(400).json({ error: "Conflicting response fields not allowed" });
        }
      }

      const selectedOption = questionType === 'multiple_choice' && pending.question.options
        ? pending.question.options[responseOptionIndex!]
        : undefined;

      correlationInsightService.recordFeedbackResponse(
        userId,
        feedbackId,
        pending.question,
        {
          value: responseValue,
          boolean: responseBoolean,
          option: selectedOption,
          text: responseText,
        },
        channel || 'in_app'
      );

      // Save to user_insights for future reference
      const patternLabel = pending.question.triggerPattern === 'illness_precursor' 
        ? 'Possible illness pattern' 
        : pending.question.triggerPattern === 'recovery_deficit' 
          ? 'Recovery concern' 
          : 'Health pattern';
      
      const responseDesc = questionType === 'scale_1_10' 
        ? `Feeling: ${responseValue}/10`
        : questionType === 'yes_no'
          ? responseBoolean ? 'Confirmed' : 'Not confirmed'
          : questionType === 'multiple_choice'
            ? `Selected: ${selectedOption}`
            : responseText || '';

      const insightText = `${patternLabel} detected by ML: "${pending.question.questionText}" - User response: ${responseDesc}`;
      
      // Run critical database operations in parallel for faster response
      const dbOperations: Promise<any>[] = [
        db.insert(userInsights).values({
          userId,
          text: insightText,
          source: 'correlation_insight',
          tags: ['ml_anomaly', pending.question.triggerPattern || 'pattern'].filter(Boolean),
          importance: pending.question.urgency === 'high' ? 4 : pending.question.urgency === 'medium' ? 3 : 2,
          status: 'active',
        }),
        correlationInsightService.deletePendingFeedback(feedbackId),
      ];

      if (pending.question.triggerPattern) {
        dbOperations.push(
          correlationInsightService.trackAnsweredPattern(
            userId,
            pending.question.triggerPattern,
            pending.question.focusMetric
          )
        );
      }

      await Promise.all(dbOperations);

      // Fire-and-forget ClickHouse storage (non-blocking for faster response)
      (async () => {
        try {
          const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
          const { getHealthId } = await import('./services/supabaseHealthStorage');
          const healthId = await getHealthId(userId);
          
          await clickhouseBaselineEngine.storeFeedbackResponse(healthId, feedbackId, {
            questionType: pending.question.questionType,
            questionText: pending.question.questionText,
            responseValue,
            responseBoolean,
            responseOption: selectedOption,
            responseText,
            triggerPattern: pending.question.triggerPattern,
            triggerMetrics: pending.question.triggerMetrics,
            collectionChannel: channel || 'in_app',
          });
        } catch (err) {
          logger.error('[CorrelationFeedback] Background ClickHouse storage failed:', err);
        }
      })();

      logger.info('[CorrelationFeedback] Feedback submitted successfully', { 
        userId, 
        feedbackId,
        questionType,
        pattern: pending.question.triggerPattern,
        patternTracked: !!pending.question.triggerPattern
      });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error submitting correlation feedback:', error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Admin: Trigger correlation analysis for a user
  app.post("/api/admin/correlation/analyze", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { correlationInsightService } = await import('./services/correlationInsightService');
      
      logger.info('[Admin] Triggering correlation analysis', { userId, adminId: req.user.claims.sub });
      
      const result = await correlationInsightService.runFullAnalysisWithNotification(userId);
      
      res.json({ 
        success: true, 
        anomaliesDetected: result?.anomalies?.length || 0,
        questionsGenerated: result?.feedbackQuestion ? 1 : 0,
        insightsGenerated: result?.insights?.length || 0,
        notificationSent: result?.notificationSent || false,
        message: `Found ${result?.anomalies?.length || 0} anomalies, generated ${result?.insights?.length || 0} insights`
      });
    } catch (error) {
      logger.error('[Admin] Correlation analysis error:', error);
      res.status(500).json({ error: "Failed to run correlation analysis" });
    }
  });

  // Admin: Get correlation insights for a user
  app.get("/api/admin/correlation/insights/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { correlationInsightService } = await import('./services/correlationInsightService');
      
      const insights = await correlationInsightService.getRecentInsights(userId, 20);
      
      res.json({ insights });
    } catch (error) {
      logger.error('[Admin] Error fetching correlation insights:', error);
      res.status(500).json({ error: "Failed to fetch correlation insights" });
    }
  });

  // Admin: Simulate anomaly for testing
  app.post("/api/admin/correlation/simulate", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId, scenario } = req.body;
      
      if (!userId || !scenario) {
        return res.status(400).json({ error: "userId and scenario are required" });
      }

      const validScenarios = ['illness', 'recovery', 'single_metric'];
      if (!validScenarios.includes(scenario)) {
        return res.status(400).json({ error: `Invalid scenario. Valid options: ${validScenarios.join(', ')}` });
      }

      const { correlationInsightService } = await import('./services/correlationInsightService');
      
      logger.info('[Admin] Simulating anomaly scenario', { userId, scenario, adminId: req.user.claims.sub });
      
      const result = await correlationInsightService.simulateAnomalyForTesting(userId, scenario as 'illness' | 'recovery' | 'single_metric');
      
      res.json({ 
        success: true,
        scenario,
        anomaliesGenerated: result?.anomalies?.length || 0,
        hasFeedbackQuestion: !!result?.feedbackQuestion,
        questionText: result?.feedbackQuestion?.questionText || null
      });
    } catch (error) {
      logger.error('[Admin] Anomaly simulation error:', error);
      res.status(500).json({ error: "Failed to simulate anomaly" });
    }
  });

  // ============================================================================
  // Admin: ClickHouse Correlation Engine
  // ============================================================================

  // Admin: Initialize ClickHouse tables
  app.post("/api/admin/clickhouse/init", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { clickhouse } = await import('./services/clickhouseService');
      
      if (!clickhouse.isEnabled()) {
        return res.status(400).json({ 
          error: "ClickHouse not configured",
          hint: "Set CLICKHOUSE_HOST, CLICKHOUSE_USER, and CLICKHOUSE_PASSWORD secrets"
        });
      }

      const success = await clickhouse.initialize();
      
      if (success) {
        logger.info('[Admin] ClickHouse initialized successfully');
        res.json({ success: true, message: "ClickHouse tables initialized" });
      } else {
        res.status(500).json({ error: "Failed to initialize ClickHouse" });
      }
    } catch (error) {
      logger.error('[Admin] ClickHouse init error:', error);
      res.status(500).json({ error: "Failed to initialize ClickHouse" });
    }
  });

  // Admin: ClickHouse health check
  app.get("/api/admin/clickhouse/health", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { clickhouse } = await import('./services/clickhouseService');
      const health = await clickhouse.healthCheck();
      res.json(health);
    } catch (error) {
      logger.error('[Admin] ClickHouse health check error:', error);
      res.status(500).json({ connected: false, error: String(error) });
    }
  });

  // Admin: Sync user data to ClickHouse (COMPREHENSIVE - all data types)
  app.post("/api/admin/clickhouse/sync", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId, daysBack = 90, comprehensive = true } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      const healthId = await getHealthId(userId);
      
      let result;
      if (comprehensive) {
        result = await clickhouseBaselineEngine.syncAllHealthData(healthId, daysBack);
        logger.info('[Admin] ClickHouse comprehensive sync complete', { userId, healthId, ...result });
        res.json({ 
          success: true, 
          healthId,
          syncType: 'comprehensive',
          dataSources: {
            healthMetrics: result.healthMetrics,
            nutrition: result.nutrition,
            biomarkers: result.biomarkers,
            lifeEvents: result.lifeEvents,
            environmental: result.environmental,
            bodyComposition: result.bodyComposition,
          },
          totalRecords: result.total,
        });
      } else {
        const rowsSynced = await clickhouseBaselineEngine.syncHealthDataFromSupabase(healthId, daysBack);
        logger.info('[Admin] ClickHouse basic sync complete', { userId, healthId, rowsSynced });
        res.json({ success: true, rowsSynced, healthId, syncType: 'basic' });
      }
    } catch (error) {
      logger.error('[Admin] ClickHouse sync error:', error);
      res.status(500).json({ error: "Failed to sync data to ClickHouse" });
    }
  });

  // Admin: Get data coverage summary from ClickHouse
  app.get("/api/admin/clickhouse/coverage/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      
      const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      const healthId = await getHealthId(userId);
      const coverage = await clickhouseBaselineEngine.getDataCoverageSummary(healthId);
      
      res.json({ 
        healthId, 
        coverage,
        summary: {
          totalRecords: Object.values(coverage).reduce((acc: number, c: any) => acc + c.count, 0),
          dataSources: Object.fromEntries(
            Object.entries(coverage).map(([key, val]: [string, any]) => [key, val.count > 0])
          ),
        }
      });
    } catch (error) {
      logger.error('[Admin] ClickHouse coverage error:', error);
      res.status(500).json({ error: "Failed to get data coverage" });
    }
  });

  // Admin: Run ClickHouse ML analysis
  app.post("/api/admin/clickhouse/analyze", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId, windowDays = 7 } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      const { dynamicFeedbackGenerator } = await import('./services/dynamicFeedbackGenerator');
      const { correlationInsightService } = await import('./services/correlationInsightService');
      const { randomUUID } = await import('crypto');
      
      const healthId = await getHealthId(userId);
      
      // First sync ALL latest data (comprehensive)
      await clickhouseBaselineEngine.syncAllHealthData(healthId, 30);
      
      // Calculate baselines and detect anomalies
      const baselines = await clickhouseBaselineEngine.calculateBaselines(healthId, windowDays);
      const anomalies = await clickhouseBaselineEngine.detectAnomalies(healthId, { windowDays, bypassRateLimit: true });
      
      // Generate multiple feedback questions (top 3 by severity/confidence) with staggered delivery
      const feedbackQuestions: any[] = [];
      const feedbackIds: string[] = [];
      if (anomalies.length > 0) {
        const questions = await dynamicFeedbackGenerator.generateMultipleQuestions(anomalies, 3);
        
        // Filter out any questions with invalid questionText as a safety check
        const validQuestions = questions.filter(q => 
          q.questionText && typeof q.questionText === 'string' && q.questionText.trim().length > 0
        );
        
        if (validQuestions.length < questions.length) {
          logger.warn(`[Admin] Filtered out ${questions.length - validQuestions.length} questions with invalid questionText`);
        }
        
        const deliveryOffsets = {
          morning: 0,
          midday: 4 * 60 * 60 * 1000,
          evening: 8 * 60 * 60 * 1000,
        };

        for (const question of validQuestions) {
          const feedbackId = randomUUID();
          const offset = deliveryOffsets[question.deliveryWindow || 'morning'];
          const visibleAt = new Date(Date.now() + offset);
          
          await correlationInsightService.storePendingFeedback(userId, feedbackId, question, visibleAt);
          feedbackQuestions.push({ ...question, feedbackId, visibleAt: visibleAt.toISOString() });
          feedbackIds.push(feedbackId);
          logger.info(`[Admin] Stored feedback question ${feedbackId} (${question.deliveryWindow}) for user ${userId}`);
        }
      }
      
      // Get ML insights
      const mlInsights = await clickhouseBaselineEngine.getMLInsights(healthId);
      const learningContext = await clickhouseBaselineEngine.getLearningContext(healthId);
      
      logger.info('[Admin] ClickHouse analysis complete', { 
        userId, 
        baselines: baselines.length, 
        anomalies: anomalies.length,
        questionsGenerated: feedbackQuestions.length,
      });
      
      res.json({
        success: true,
        healthId,
        baselines,
        anomalies,
        feedbackQuestion: feedbackQuestions[0] || null,
        feedbackQuestions,
        feedbackIds,
        feedbackStored: feedbackIds.length > 0,
        questionsGenerated: feedbackQuestions.length,
        mlInsights,
        learningContext,
      });
    } catch (error) {
      logger.error('[Admin] ClickHouse analysis error:', error);
      res.status(500).json({ error: "Failed to run ClickHouse analysis" });
    }
  });

  // Admin: Simulate anomaly in ClickHouse
  app.post("/api/admin/clickhouse/simulate", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId, scenario } = req.body;
      
      if (!userId || !scenario) {
        return res.status(400).json({ error: "userId and scenario are required" });
      }

      const validScenarios = ['illness', 'recovery', 'single_metric'];
      if (!validScenarios.includes(scenario)) {
        return res.status(400).json({ error: `Invalid scenario. Valid options: ${validScenarios.join(', ')}` });
      }

      const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      const { dynamicFeedbackGenerator } = await import('./services/dynamicFeedbackGenerator');
      const { correlationInsightService } = await import('./services/correlationInsightService');
      const { randomUUID } = await import('crypto');
      
      const healthId = await getHealthId(userId);
      const anomalies = await clickhouseBaselineEngine.simulateAnomaly(healthId, scenario as 'illness' | 'recovery' | 'single_metric');
      
      const feedbackQuestions: any[] = [];
      const feedbackIds: string[] = [];
      if (anomalies.length > 0) {
        const questions = await dynamicFeedbackGenerator.generateMultipleQuestions(anomalies, 3);
        
        const deliveryOffsets = {
          morning: 0,
          midday: 4 * 60 * 60 * 1000,
          evening: 8 * 60 * 60 * 1000,
        };

        for (const question of questions) {
          const feedbackId = randomUUID();
          const offset = deliveryOffsets[question.deliveryWindow || 'morning'];
          const visibleAt = new Date(Date.now() + offset);
          
          await correlationInsightService.storePendingFeedback(userId, feedbackId, question, visibleAt);
          feedbackQuestions.push({ ...question, feedbackId, visibleAt: visibleAt.toISOString() });
          feedbackIds.push(feedbackId);
          logger.info(`[Admin] Stored simulated feedback question ${feedbackId} (${question.deliveryWindow}) for user ${userId}`);
        }
      }
      
      logger.info('[Admin] ClickHouse simulation complete', { userId, scenario, anomalies: anomalies.length, questionsGenerated: feedbackQuestions.length });
      
      res.json({
        success: true,
        scenario,
        healthId,
        anomalies,
        feedbackQuestion: feedbackQuestions[0] || null,
        feedbackQuestions,
        feedbackIds,
        feedbackStored: feedbackIds.length > 0,
        questionsGenerated: feedbackQuestions.length,
      });
    } catch (error) {
      logger.error('[Admin] ClickHouse simulation error:', error);
      res.status(500).json({ error: "Failed to simulate anomaly" });
    }
  });

  // Admin: Get ML insights for a user
  app.get("/api/admin/clickhouse/insights/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      
      const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      const healthId = await getHealthId(userId);
      const insights = await clickhouseBaselineEngine.getMLInsights(healthId);
      const learningContext = await clickhouseBaselineEngine.getLearningContext(healthId);
      
      res.json({ healthId, ...insights, learningContext });
    } catch (error) {
      logger.error('[Admin] ClickHouse insights error:', error);
      res.status(500).json({ error: "Failed to get ML insights" });
    }
  });

  // Admin: Record feedback outcome for ML learning
  app.post("/api/admin/clickhouse/feedback", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId, anomalyId, userFeeling, wasConfirmed, feedbackText } = req.body;
      
      if (!userId || !anomalyId || userFeeling === undefined || wasConfirmed === undefined) {
        return res.status(400).json({ error: "userId, anomalyId, userFeeling, and wasConfirmed are required" });
      }

      const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      const healthId = await getHealthId(userId);
      await clickhouseBaselineEngine.recordFeedbackOutcome(healthId, anomalyId, userFeeling, wasConfirmed, feedbackText);
      
      logger.info('[Admin] ClickHouse feedback recorded', { userId, anomalyId, wasConfirmed });
      
      res.json({ success: true });
    } catch (error) {
      logger.error('[Admin] ClickHouse feedback error:', error);
      res.status(500).json({ error: "Failed to record feedback" });
    }
  });

  // Admin: Full history backfill for pattern memory (syncs ALL user data to ClickHouse)
  // Includes batching, rate limiting, and async processing for large user sets
  app.post("/api/admin/clickhouse/backfill-full-history", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId, allUsers, batchSize = 5, delayBetweenBatchesMs = 2000 } = req.body;
      
      const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      if (allUsers) {
        const activeUsers = await db.select({ id: users.id }).from(users).where(eq(users.isActive, true));
        
        if (activeUsers.length > 50) {
          return res.status(400).json({ 
            error: `Too many users (${activeUsers.length}). Use batchSize parameter or process specific users.`,
            suggestion: "Set batchSize to a smaller number or process users individually with userId parameter"
          });
        }
        
        logger.info(`[Admin] Starting FULL HISTORY backfill for ${activeUsers.length} users (batch size: ${batchSize})`);
        
        const results: { userId: string; success: boolean; total: number; error?: string }[] = [];
        
        const batches: typeof activeUsers[] = [];
        for (let i = 0; i < activeUsers.length; i += batchSize) {
          batches.push(activeUsers.slice(i, i + batchSize));
        }
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          logger.info(`[Admin] Processing batch ${batchIndex + 1}/${batches.length}`);
          
          const batchResults = await Promise.all(
            batch.map(async (user) => {
              try {
                const healthId = await getHealthId(user.id);
                const summary = await clickhouseBaselineEngine.syncFullHistory(healthId);
                logger.info(`[Admin] Backfill complete for ${user.id}: ${summary.total} records`);
                return { userId: user.id, success: true, total: summary.total };
              } catch (err: any) {
                logger.error(`[Admin] Backfill failed for ${user.id}:`, err.message);
                return { userId: user.id, success: false, total: 0, error: err.message };
              }
            })
          );
          
          results.push(...batchResults);
          
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, Math.min(delayBetweenBatchesMs, 10000)));
          }
        }
        
        const totalRecords = results.reduce((sum, r) => sum + r.total, 0);
        const successCount = results.filter(r => r.success).length;
        
        res.json({ 
          message: `Full history backfill complete for ${successCount}/${activeUsers.length} users`,
          totalRecords,
          batchesProcessed: batches.length,
          results
        });
      } else if (userId) {
        const healthId = await getHealthId(userId);
        const summary = await clickhouseBaselineEngine.syncFullHistory(healthId);
        
        logger.info(`[Admin] FULL HISTORY backfill complete for ${userId}`, summary);
        
        res.json({ 
          message: `Full history synced for user ${userId}`,
          healthId,
          ...summary
        });
      } else {
        return res.status(400).json({ error: "Either userId or allUsers: true is required" });
      }
    } catch (error) {
      logger.error('[Admin] Full history backfill error:', error);
      res.status(500).json({ error: "Failed to backfill full history" });
    }
  });

  // Admin: Get pattern library for a user (recognized recurring patterns)
  app.get("/api/admin/clickhouse/patterns/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      
      const { isClickHouseEnabled } = await import('./services/clickhouseService');
      const { clickhouse } = await import('./services/clickhouseService');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      if (!isClickHouseEnabled()) {
        return res.status(503).json({ error: "ClickHouse not configured" });
      }
      
      const healthId = await getHealthId(userId);
      
      // Get patterns from pattern library
      const patterns = await clickhouse.query<{
        pattern_id: string;
        pattern_fingerprint: string;
        pattern_name: string;
        pattern_description: string | null;
        first_observed: string;
        last_observed: string;
        occurrence_count: number;
        confirmation_count: number;
        false_positive_count: number;
        confidence_score: number;
        typical_outcome: string | null;
        seasonal_pattern: string | null;
      }>(`
        SELECT
          pattern_id,
          pattern_fingerprint,
          pattern_name,
          pattern_description,
          first_observed,
          last_observed,
          occurrence_count,
          confirmation_count,
          false_positive_count,
          confidence_score,
          typical_outcome,
          seasonal_pattern
        FROM flo_health.pattern_library
        WHERE health_id = {healthId:String}
        ORDER BY last_observed DESC
        LIMIT 50
      `, { healthId });
      
      res.json({ healthId, patterns });
    } catch (error) {
      logger.error('[Admin] Pattern library fetch error:', error);
      res.status(500).json({ error: "Failed to fetch pattern library" });
    }
  });

  app.post("/api/admin/clickhouse/synthetic-cgm/generate", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { numPatients = 5, daysPerPatient = 7, targetHealthId } = req.body;
      
      const { syntheticCgmService } = await import('./services/syntheticCgmService');
      
      logger.info('[Admin] Generating synthetic CGM training data', { 
        numPatients, 
        daysPerPatient, 
        targetHealthId,
        adminId: req.user.claims.sub 
      });
      
      const result = await syntheticCgmService.generateAndInjectData({
        numPatients,
        daysPerPatient,
        targetHealthId,
      });
      
      res.json({
        success: result.success,
        readingsInjected: result.readingsInjected,
        patientsSimulated: result.patientsSimulated,
        anomalyPatterns: result.anomalyPatterns,
        message: result.success 
          ? `Generated ${result.readingsInjected} synthetic CGM readings from ${result.patientsSimulated} virtual patients`
          : result.error,
      });
    } catch (error: any) {
      logger.error('[Admin] Synthetic CGM generation error:', error);
      res.status(500).json({ error: error.message || "Failed to generate synthetic CGM data" });
    }
  });

  app.get("/api/admin/clickhouse/synthetic-cgm/stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { syntheticCgmService } = await import('./services/syntheticCgmService');
      
      const stats = await syntheticCgmService.getSyntheticDataStats();
      
      res.json(stats);
    } catch (error) {
      logger.error('[Admin] Synthetic CGM stats error:', error);
      res.status(500).json({ error: "Failed to fetch synthetic CGM stats" });
    }
  });

  app.delete("/api/admin/clickhouse/synthetic-cgm/clear", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { syntheticCgmService } = await import('./services/syntheticCgmService');
      
      logger.info('[Admin] Clearing synthetic CGM training data', { adminId: req.user.claims.sub });
      
      await syntheticCgmService.clearSyntheticData();
      
      res.json({ success: true, message: "Synthetic CGM training data cleared" });
    } catch (error) {
      logger.error('[Admin] Synthetic CGM clear error:', error);
      res.status(500).json({ error: "Failed to clear synthetic CGM data" });
    }
  });

  app.post("/api/admin/clickhouse/cgm-model/train", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { numPatients = 10, daysPerPatient = 14, regenerateData = false } = req.body;
      
      const { cgmPatternLearner } = await import('./services/cgmPatternLearner');
      
      logger.info('[Admin] Training CGM pattern model', { 
        numPatients, 
        daysPerPatient, 
        regenerateData,
        adminId: req.user.claims.sub 
      });
      
      const result = await cgmPatternLearner.trainOnSyntheticData({
        numPatients,
        daysPerPatient,
        regenerateData,
      });
      
      res.json({
        success: result.success,
        patternsLearned: result.patternsLearned,
        hourlyBaselines: result.hourlyBaselines,
        syntheticReadingsUsed: result.syntheticReadingsUsed,
        message: result.success 
          ? `Trained model on ${result.syntheticReadingsUsed} readings: ${result.hourlyBaselines} hourly baselines, ${result.patternsLearned} patterns`
          : result.error,
      });
    } catch (error: any) {
      logger.error('[Admin] CGM model training error:', error);
      res.status(500).json({ error: error.message || "Failed to train CGM model" });
    }
  });

  app.get("/api/admin/clickhouse/cgm-model/baselines", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { cgmPatternLearner } = await import('./services/cgmPatternLearner');
      
      const baselines = await cgmPatternLearner.getLearnedBaselines();
      
      res.json({
        hasLearnedBaselines: baselines.hourly.length > 0 || baselines.global !== null,
        hourlyBaselinesCount: baselines.hourly.length,
        scenariosCount: Object.keys(baselines.scenarios).length,
        hasGlobalBaseline: baselines.global !== null,
        hasVariabilityPatterns: baselines.variability !== null,
        baselines,
      });
    } catch (error) {
      logger.error('[Admin] CGM baselines fetch error:', error);
      res.status(500).json({ error: "Failed to fetch CGM baselines" });
    }
  });

  // ===== Biomarker Pattern Learner Endpoints =====
  app.post("/api/admin/clickhouse/biomarker-model/train", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { regenerateData = false } = req.body;
      
      const { biomarkerPatternLearner } = await import('./services/biomarkerPatternLearner');
      
      logger.info('[Admin] Training biomarker pattern model', { 
        regenerateData,
        adminId: req.user.claims.sub 
      });
      
      const result = await biomarkerPatternLearner.trainOnNhanesData({
        regenerateData,
      });
      
      res.json({
        success: result.success,
        biomarkersLearned: result.biomarkersLearned,
        totalBaselines: result.totalBaselines,
        dataSource: result.dataSource,
        message: result.success 
          ? `Trained on NHANES data: ${result.biomarkersLearned} biomarkers, ${result.totalBaselines} baselines`
          : result.error,
      });
    } catch (error: any) {
      logger.error('[Admin] Biomarker model training error:', error);
      res.status(500).json({ error: error.message || "Failed to train biomarker model" });
    }
  });

  app.get("/api/admin/clickhouse/biomarker-model/baselines", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { biomarkerPatternLearner } = await import('./services/biomarkerPatternLearner');
      
      const stats = await biomarkerPatternLearner.getBaselineStats();
      
      res.json(stats);
    } catch (error) {
      logger.error('[Admin] Biomarker baselines fetch error:', error);
      res.status(500).json({ error: "Failed to fetch biomarker baselines" });
    }
  });

  // ===== HealthKit Pattern Learner Endpoints =====
  app.post("/api/admin/clickhouse/healthkit-model/train", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { numPeople = 100, daysPerPerson = 30, regenerateData = false } = req.body;
      
      const { healthkitPatternLearner } = await import('./services/healthkitPatternLearner');
      
      logger.info('[Admin] Training HealthKit pattern model', { 
        numPeople,
        daysPerPerson,
        regenerateData,
        adminId: req.user.claims.sub 
      });
      
      const result = await healthkitPatternLearner.trainOnSyntheticData({
        numPeople,
        daysPerPerson,
        regenerateData,
      });
      
      res.json({
        success: result.success,
        metricsLearned: result.metricsLearned,
        totalBaselines: result.totalBaselines,
        syntheticRecordsUsed: result.syntheticRecordsUsed,
        message: result.success 
          ? `Trained on ${result.syntheticRecordsUsed} synthetic records: ${result.metricsLearned} metrics, ${result.totalBaselines} baselines`
          : result.error,
      });
    } catch (error: any) {
      logger.error('[Admin] HealthKit model training error:', error);
      res.status(500).json({ error: error.message || "Failed to train HealthKit model" });
    }
  });

  app.get("/api/admin/clickhouse/healthkit-model/baselines", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { healthkitPatternLearner } = await import('./services/healthkitPatternLearner');
      
      const stats = await healthkitPatternLearner.getBaselineStats();
      
      res.json(stats);
    } catch (error) {
      logger.error('[Admin] HealthKit baselines fetch error:', error);
      res.status(500).json({ error: "Failed to fetch HealthKit baselines" });
    }
  });

  app.post("/api/admin/clickhouse/ml-tables/recreate", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const clickhouse = await import('./services/clickhouseService');
      const ch = clickhouse.getClickHouseClient();
      
      if (!ch) {
        return res.status(503).json({ error: "ClickHouse not available" });
      }
      
      logger.info('[Admin] Recreating ML learned baselines tables', { 
        adminId: req.user.claims.sub 
      });
      
      await ch.command({ query: `DROP TABLE IF EXISTS flo_health.cgm_learned_baselines` });
      await ch.command({ query: `DROP TABLE IF EXISTS flo_health.biomarker_learned_baselines` });
      await ch.command({ query: `DROP TABLE IF EXISTS flo_health.healthkit_learned_baselines` });
      
      await clickhouse.initializeClickHouse();
      
      res.json({
        success: true,
        message: 'ML learned baselines tables dropped and recreated successfully',
        tablesRecreated: ['cgm_learned_baselines', 'biomarker_learned_baselines', 'healthkit_learned_baselines'],
      });
    } catch (error: any) {
      logger.error('[Admin] ML tables recreation error:', error);
      res.status(500).json({ error: error.message || "Failed to recreate ML tables" });
    }
  });

  // Debug endpoint to see raw nutrition samples for a user on a date (for diagnosing duplicate issues)
  app.get("/api/admin/nutrition/debug/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { date, timezone = 'Australia/Perth' } = req.query;
      
      if (!date) {
        return res.status(400).json({ error: "date query param is required (YYYY-MM-DD format)" });
      }

      const { TZDate } = await import('@date-fns/tz');
      const { getSupabaseClient, getHealthId } = await import('./services/supabaseHealthStorage');
      
      // Calculate UTC boundaries for the local date
      const localDayStart = new TZDate(`${date}T00:00:00`, timezone as string);
      const localDayEnd = new TZDate(`${date}T23:59:59.999`, timezone as string);
      const dayStartUTC = new Date(localDayStart.toISOString());
      const dayEndUTC = new Date(localDayEnd.toISOString());
      
      // Get health_id for this user
      const healthId = await getHealthId(userId);

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.status(500).json({ error: "Supabase not available" });
      }

      // Get all dietary samples for this date
      const { data: samples, error } = await supabase
        .from('healthkit_samples')
        .select('*')
        .eq('health_id', healthId)
        .ilike('data_type', '%Dietary%')
        .gte('start_date', dayStartUTC.toISOString())
        .lte('start_date', dayEndUTC.toISOString())
        .order('start_date', { ascending: true });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      // Group by data_type for analysis
      const byType: Record<string, { count: number; total: number; samples: any[] }> = {};
      for (const sample of samples || []) {
        const type = sample.data_type;
        if (!byType[type]) {
          byType[type] = { count: 0, total: 0, samples: [] };
        }
        byType[type].count++;
        byType[type].total += sample.value || 0;
        byType[type].samples.push({
          uuid: sample.uuid,
          value: sample.value,
          unit: sample.unit,
          start_date: sample.start_date,
          source_name: sample.source_name,
        });
      }

      // Calculate totals matching Flo's aggregation
      const calories = byType['HKQuantityTypeIdentifierDietaryEnergyConsumed']?.total || 0;
      const protein = byType['HKQuantityTypeIdentifierDietaryProtein']?.total || 0;
      const carbs = byType['HKQuantityTypeIdentifierDietaryCarbohydrates']?.total || 0;
      const fat = byType['HKQuantityTypeIdentifierDietaryFatTotal']?.total || 0;

      // Check for potential duplicates (same source, same value, within 1 second)
      const potentialDuplicates: any[] = [];
      for (const [typeName, typeData] of Object.entries(byType)) {
        const sorted = typeData.samples.sort((a: any, b: any) => 
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
        );
        for (let i = 0; i < sorted.length - 1; i++) {
          const curr = sorted[i];
          const next = sorted[i + 1];
          const timeDiff = Math.abs(new Date(curr.start_date).getTime() - new Date(next.start_date).getTime());
          if (timeDiff < 60000 && curr.value === next.value && curr.source_name === next.source_name) {
            potentialDuplicates.push({
              type: typeName,
              sample1: curr,
              sample2: next,
              timeDiffMs: timeDiff,
            });
          }
        }
      }

      return res.json({
        userId,
        date,
        timezone,
        utcRange: {
          start: dayStartUTC.toISOString(),
          end: dayEndUTC.toISOString(),
        },
        healthId,
        totalSamples: samples?.length || 0,
        aggregatedTotals: {
          calories: Math.round(calories * 100) / 100,
          proteinG: Math.round(protein * 100) / 100,
          carbsG: Math.round(carbs * 100) / 100,
          fatG: Math.round(fat * 100) / 100,
        },
        potentialDuplicates,
        byType,
      });
    } catch (error: any) {
      logger.error("[Admin] Nutrition debug error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/clickhouse/cgm-anomalies/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { lookbackHours = 24 } = req.body;
      
      const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      const healthId = await getHealthId(userId);
      const anomalies = await clickhouseBaselineEngine.detectCgmAnomalies(healthId, { lookbackHours });
      
      res.json({
        healthId,
        lookbackHours,
        anomalyCount: anomalies.length,
        anomalies,
      });
    } catch (error) {
      logger.error('[Admin] CGM anomaly detection error:', error);
      res.status(500).json({ error: "Failed to detect CGM anomalies" });
    }
  });

  // Admin: Run full long-horizon correlation analysis for a user
  app.post("/api/admin/clickhouse/correlation/analyze/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { lookbackMonths = 6 } = req.body;
      
      const { correlationEngine } = await import('./services/clickhouseCorrelationEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      const healthId = await getHealthId(userId);
      
      logger.info('[Admin] Running correlation analysis', { userId, healthId, lookbackMonths });
      
      const results = await correlationEngine.runFullAnalysis(healthId, lookbackMonths);
      
      res.json({
        healthId,
        lookbackMonths,
        ...results,
      });
    } catch (error: any) {
      logger.error('[Admin] Correlation analysis error:', error);
      res.status(500).json({ error: error.message || "Failed to run correlation analysis" });
    }
  });

  // Admin: Get long-term insights for a user
  app.get("/api/admin/clickhouse/correlation/insights/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit || '10');
      
      const { correlationEngine } = await import('./services/clickhouseCorrelationEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      const healthId = await getHealthId(userId);
      const insights = await correlationEngine.getLongTermInsights(healthId, limit);
      
      res.json({
        healthId,
        insightCount: insights.length,
        insights,
      });
    } catch (error: any) {
      logger.error('[Admin] Get correlation insights error:', error);
      res.status(500).json({ error: error.message || "Failed to get correlation insights" });
    }
  });

  // Admin: Get pending AI feedback questions for a user
  app.get("/api/admin/clickhouse/correlation/questions/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      
      const { correlationEngine } = await import('./services/clickhouseCorrelationEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      const healthId = await getHealthId(userId);
      const questions = await correlationEngine.getPendingFeedbackQuestions(healthId);
      
      res.json({
        healthId,
        questionCount: questions.length,
        questions,
      });
    } catch (error: any) {
      logger.error('[Admin] Get feedback questions error:', error);
      res.status(500).json({ error: error.message || "Failed to get feedback questions" });
    }
  });

  // Admin: Manually generate a feedback question based on current anomalies
  app.post("/api/admin/clickhouse/correlation/generate-question/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { patterns = [], metrics = {} } = req.body;
      
      const { correlationEngine } = await import('./services/clickhouseCorrelationEngine');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      
      const healthId = await getHealthId(userId);
      
      const question = await correlationEngine.generateFeedbackQuestion(
        healthId,
        'pattern',
        [],
        patterns,
        metrics
      );
      
      res.json({
        healthId,
        generated: !!question,
        question,
      });
    } catch (error: any) {
      logger.error('[Admin] Generate feedback question error:', error);
      res.status(500).json({ error: error.message || "Failed to generate feedback question" });
    }
  });

  // Admin: Comprehensive integration test for Long-Horizon Correlation Engine
  app.post("/api/admin/clickhouse/correlation/integration-test/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    const testResults: {
      stage: string;
      status: 'pass' | 'fail' | 'skip';
      message: string;
      data?: any;
      durationMs: number;
    }[] = [];
    
    const runTest = async (stage: string, testFn: () => Promise<{ pass: boolean; message: string; data?: any }>) => {
      const startTime = Date.now();
      try {
        const result = await testFn();
        testResults.push({
          stage,
          status: result.pass ? 'pass' : 'fail',
          message: result.message,
          data: result.data,
          durationMs: Date.now() - startTime,
        });
        return result.pass;
      } catch (error: any) {
        testResults.push({
          stage,
          status: 'fail',
          message: `Exception: ${error.message}`,
          durationMs: Date.now() - startTime,
        });
        return false;
      }
    };
    
    try {
      const { userId } = req.params;
      const { lookbackMonths = 6 } = req.body;
      
      const { correlationEngine } = await import('./services/clickhouseCorrelationEngine');
      const { isClickHouseEnabled, clickhouse } = await import('./services/clickhouseService');
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      const { floOracleContextBuilder } = await import('./services/floOracleContextBuilder');
      
      logger.info('[Admin] Starting correlation engine integration test', { userId, lookbackMonths });
      
      // Stage 1: ClickHouse connectivity
      await runTest('clickhouse_connectivity', async () => {
        if (!isClickHouseEnabled()) {
          return { pass: false, message: 'ClickHouse not configured' };
        }
        const result = await clickhouse.query<{ count: number }>('SELECT 1 as count', {});
        return { 
          pass: result.length === 1 && result[0].count === 1, 
          message: 'ClickHouse connection successful',
          data: { connected: true }
        };
      });
      
      // Stage 2: Health ID resolution
      let healthId: string | null = null;
      await runTest('health_id_resolution', async () => {
        healthId = await getHealthId(userId);
        if (!healthId) {
          return { pass: false, message: 'Could not resolve health_id for user' };
        }
        return { 
          pass: true, 
          message: `Resolved health_id: ${healthId.substring(0, 8)}...`,
          data: { healthId: healthId.substring(0, 8) + '...' }
        };
      });
      
      if (!healthId) {
        return res.json({ 
          success: false, 
          message: 'Cannot proceed without health_id',
          testResults 
        });
      }
      
      // Stage 3: Check health_metrics data exists
      await runTest('health_metrics_data', async () => {
        const metrics = await clickhouse.query<{ count: number }>(`
          SELECT count() as count FROM flo_health.health_metrics 
          WHERE health_id = {healthId:String}
        `, { healthId });
        const count = metrics[0]?.count || 0;
        return { 
          pass: count > 0, 
          message: count > 0 ? `Found ${count} health metric records` : 'No health metrics found - sync data first',
          data: { metricCount: count }
        };
      });
      
      // Stage 4: Extract behavior events
      let behaviorEventCount = 0;
      await runTest('behavior_event_extraction', async () => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - lookbackMonths);
        
        behaviorEventCount = await correlationEngine.extractBehaviorEvents(
          healthId!,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0]
        );
        
        return { 
          pass: true, 
          message: `Extracted ${behaviorEventCount} behavior events`,
          data: { behaviorEventCount }
        };
      });
      
      // Stage 5: Build weekly cohorts
      let cohortCount = 0;
      await runTest('weekly_cohort_building', async () => {
        cohortCount = await correlationEngine.buildWeeklyCohorts(healthId!, lookbackMonths);
        return { 
          pass: true, 
          message: `Built ${cohortCount} weekly cohort records`,
          data: { cohortCount }
        };
      });
      
      // Stage 6: Build outcome rollups
      let outcomeCount = 0;
      await runTest('outcome_rollup_building', async () => {
        outcomeCount = await correlationEngine.buildWeeklyOutcomes(healthId!, lookbackMonths);
        return { 
          pass: true, 
          message: `Built ${outcomeCount} weekly outcome rollups`,
          data: { outcomeCount }
        };
      });
      
      // Stage 7: Run correlation discovery
      let correlations: any[] = [];
      await runTest('correlation_discovery', async () => {
        correlations = await correlationEngine.discoverCorrelations(healthId!);
        return { 
          pass: true, 
          message: correlations.length > 0 
            ? `Discovered ${correlations.length} significant correlations`
            : 'No significant correlations found (may need more data)',
          data: { 
            correlationCount: correlations.length,
            correlations: correlations.map(c => ({
              behavior: c.behaviorType,
              outcome: c.outcomeType,
              effectPct: c.effectSizePct.toFixed(1) + '%',
              pValue: c.pValue.toFixed(4),
              insight: c.naturalLanguageInsight?.substring(0, 100) + '...'
            }))
          }
        };
      });
      
      // Stage 8: Verify deduplication (run again, should find same or fewer)
      await runTest('correlation_deduplication', async () => {
        const secondRun = await correlationEngine.discoverCorrelations(healthId!);
        return { 
          pass: secondRun.length <= correlations.length, 
          message: `Deduplication working: second run found ${secondRun.length} correlations (first: ${correlations.length})`,
          data: { firstRun: correlations.length, secondRun: secondRun.length }
        };
      });
      
      // Stage 9: Get stored insights
      await runTest('long_term_insights_retrieval', async () => {
        const insights = await correlationEngine.getLongTermInsights(healthId!, 10);
        return { 
          pass: true, 
          message: `Retrieved ${insights.length} stored long-term insights`,
          data: { insightCount: insights.length }
        };
      });
      
      // Stage 10: Feedback question generation with deduplication
      await runTest('feedback_question_generation', async () => {
        const q1 = await correlationEngine.generateFeedbackQuestion(
          healthId!,
          'pattern',
          [],
          ['illness_precursor'],
          { wrist_temperature_deviation: 0.5, respiratory_rate: 18 }
        );
        
        const q2 = await correlationEngine.generateFeedbackQuestion(
          healthId!,
          'pattern',
          [],
          ['illness_precursor'],
          { wrist_temperature_deviation: 0.5, respiratory_rate: 18 }
        );
        
        return { 
          pass: true, 
          message: q1 
            ? (q2 ? 'Generated 2 questions (under limit)' : 'Generated 1 question, second blocked by cooldown')
            : 'Question generation skipped (max pending reached or no matching pattern)',
          data: { q1Generated: !!q1, q2Generated: !!q2 }
        };
      });
      
      // Stage 11: Get pending feedback questions
      await runTest('pending_questions_retrieval', async () => {
        const questions = await correlationEngine.getPendingFeedbackQuestions(healthId!);
        return { 
          pass: questions.length <= 2, 
          message: `Found ${questions.length} pending feedback questions (max 2 enforced)`,
          data: { pendingCount: questions.length }
        };
      });
      
      // Stage 12: Verify Flō Oracle context integration
      await runTest('flo_oracle_context_integration', async () => {
        const context = await floOracleContextBuilder.buildContext(userId);
        const hasCorrelations = context.includes('Long-term correlation') || 
                               context.includes('correlation') ||
                               context.includes('pattern');
        return { 
          pass: true, 
          message: hasCorrelations 
            ? 'Correlation insights included in Flō Oracle context'
            : 'No correlation insights in context yet (expected if no significant correlations)',
          data: { contextLength: context.length, hasCorrelationMentions: hasCorrelations }
        };
      });
      
      // Stage 13: Check ClickHouse table row counts
      await runTest('clickhouse_table_verification', async () => {
        const tables = ['behavior_events', 'weekly_behavior_cohorts', 'weekly_outcome_rollups', 'long_term_correlations', 'ai_feedback_questions'];
        const counts: Record<string, number> = {};
        
        for (const table of tables) {
          const result = await clickhouse.query<{ count: number }>(`
            SELECT count() as count FROM flo_health.${table}
            WHERE health_id = {healthId:String}
          `, { healthId: healthId! });
          counts[table] = result[0]?.count || 0;
        }
        
        return { 
          pass: true, 
          message: 'Table row counts retrieved',
          data: counts
        };
      });
      
      const passCount = testResults.filter(t => t.status === 'pass').length;
      const failCount = testResults.filter(t => t.status === 'fail').length;
      const totalMs = testResults.reduce((sum, t) => sum + t.durationMs, 0);
      
      res.json({
        success: failCount === 0,
        summary: `${passCount}/${testResults.length} tests passed in ${totalMs}ms`,
        healthId: healthId?.substring(0, 8) + '...',
        lookbackMonths,
        testResults,
      });
      
    } catch (error: any) {
      logger.error('[Admin] Integration test error:', error);
      res.status(500).json({ 
        success: false,
        error: error.message || "Integration test failed",
        testResults 
      });
    }
  });

  // ==================== ENVIRONMENTAL DATA BACKFILL ADMIN ENDPOINTS ====================

  // Admin: Get backfill statistics across all users
  app.get("/api/admin/environmental/backfill/stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { getBackfillStats } = await import('./services/environmentalBackfillService');
      const stats = await getBackfillStats();
      res.json({ success: true, stats });
    } catch (error: any) {
      logger.error('[Admin] Environmental backfill stats error:', error);
      res.status(500).json({ error: error.message || "Failed to fetch backfill stats" });
    }
  });

  // Admin: Get backfill status for specific user
  app.get("/api/admin/environmental/backfill/status/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      const { getBackfillStatus } = await import('./services/environmentalBackfillService');
      
      const healthId = await getHealthId(userId);
      if (!healthId) {
        return res.status(404).json({ error: "User not found or no health_id" });
      }
      
      const status = await getBackfillStatus(healthId);
      res.json({ success: true, userId, healthId: healthId.substring(0, 8) + '...', status });
    } catch (error: any) {
      logger.error('[Admin] Environmental backfill status error:', error);
      res.status(500).json({ error: error.message || "Failed to fetch backfill status" });
    }
  });

  // Admin: Trigger 12-month environmental backfill for a specific user
  app.post("/api/admin/environmental/backfill/user/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { monthsBack = 12, forceRefresh = false } = req.body;
      
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      const { runBackfillForUser } = await import('./services/environmentalBackfillService');
      
      const healthId = await getHealthId(userId);
      if (!healthId) {
        return res.status(404).json({ error: "User not found or no health_id" });
      }
      
      logger.info('[Admin] Starting environmental backfill for user', { 
        userId, 
        healthId: healthId.substring(0, 8) + '...', 
        monthsBack, 
        forceRefresh,
        adminId: req.user?.claims?.sub 
      });
      
      // Run backfill (this may take a while for 12 months of data)
      const result = await runBackfillForUser(healthId, { monthsBack, forceRefresh });
      
      res.json({
        success: result.success,
        userId,
        healthId: healthId.substring(0, 8) + '...',
        daysProcessed: result.daysProcessed,
        error: result.error,
        message: result.success 
          ? `Backfilled ${result.daysProcessed} days of environmental data`
          : result.error || 'Backfill failed',
      });
    } catch (error: any) {
      logger.error('[Admin] Environmental backfill error:', error);
      res.status(500).json({ error: error.message || "Failed to run backfill" });
    }
  });

  // Admin: Trigger bulk environmental backfill for all users with location data
  app.post("/api/admin/environmental/backfill/all", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { runBackfillForAllUsers } = await import('./services/environmentalBackfillService');
      
      logger.info('[Admin] Starting bulk environmental backfill for all users', { 
        adminId: req.user?.claims?.sub 
      });
      
      // This is a long-running operation - consider making it async with status polling
      const result = await runBackfillForAllUsers();
      
      res.json({
        success: true,
        ...result,
        message: `Bulk backfill complete: ${result.successful} successful, ${result.failed} failed, ${result.noLocationData} no location data`,
      });
    } catch (error: any) {
      logger.error('[Admin] Bulk environmental backfill error:', error);
      res.status(500).json({ error: error.message || "Failed to run bulk backfill" });
    }
  });

  // Admin: Get user's location history summary (for debugging backfill)
  app.get("/api/admin/environmental/location-history/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      const { getSupabaseClient } = await import('./services/supabaseClient');
      
      const healthId = await getHealthId(userId);
      if (!healthId) {
        return res.status(404).json({ error: "User not found or no health_id" });
      }
      
      const supabase = getSupabaseClient();
      
      // Get location history stats
      const { data: stats, error } = await supabase
        .from('user_location_history')
        .select('recorded_at')
        .eq('health_id', healthId)
        .order('recorded_at', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      const records = stats || [];
      const uniqueDates = new Set(records.map(r => new Date(r.recorded_at).toISOString().split('T')[0]));
      
      res.json({
        success: true,
        userId,
        healthId: healthId.substring(0, 8) + '...',
        totalRecords: records.length,
        uniqueDays: uniqueDates.size,
        earliestRecord: records.length > 0 ? records[0].recorded_at : null,
        latestRecord: records.length > 0 ? records[records.length - 1].recorded_at : null,
      });
    } catch (error: any) {
      logger.error('[Admin] Location history error:', error);
      res.status(500).json({ error: error.message || "Failed to fetch location history" });
    }
  });

  // Admin: Get environmental data coverage for user
  app.get("/api/admin/environmental/coverage/:userId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { getHealthId } = await import('./services/supabaseHealthStorage');
      const { getSupabaseClient } = await import('./services/supabaseClient');
      
      const healthId = await getHealthId(userId);
      if (!healthId) {
        return res.status(404).json({ error: "User not found or no health_id" });
      }
      
      const supabase = getSupabaseClient();
      
      // Get weather cache stats
      const { data: weatherStats, error } = await supabase
        .from('weather_daily_cache')
        .select('date, air_quality_data')
        .eq('health_id', healthId)
        .order('date', { ascending: true });
      
      if (error) {
        throw error;
      }
      
      const records = weatherStats || [];
      const withAqi = records.filter(r => r.air_quality_data !== null);
      
      res.json({
        success: true,
        userId,
        healthId: healthId.substring(0, 8) + '...',
        totalDays: records.length,
        daysWithAqi: withAqi.length,
        coverage: records.length > 0 ? ((withAqi.length / records.length) * 100).toFixed(1) + '%' : '0%',
        earliestDate: records.length > 0 ? records[0].date : null,
        latestDate: records.length > 0 ? records[records.length - 1].date : null,
      });
    } catch (error: any) {
      logger.error('[Admin] Environmental coverage error:', error);
      res.status(500).json({ error: error.message || "Failed to fetch environmental coverage" });
    }
  });

  // Admin: Get ML Usage metrics from ClickHouse Orchestrator
  app.get("/api/admin/ml-usage/metrics", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { clickhouseOrchestrator } = await import('./services/clickhouseOrchestrator');
      
      const metrics = clickhouseOrchestrator.getUsageMetrics();
      const windows = clickhouseOrchestrator.getProcessingWindows();
      const nextWindow = clickhouseOrchestrator.getNextWindowInfo();
      
      res.json({
        metrics,
        windows,
        nextWindow: nextWindow ? {
          name: nextWindow.window.name,
          description: nextWindow.window.description,
          scheduledFor: nextWindow.scheduledFor.toISOString(),
          includesBaselineUpdate: nextWindow.window.includesBaselineUpdate,
        } : null,
      });
    } catch (error) {
      logger.error('[Admin] ML usage metrics error:', error);
      res.status(500).json({ error: "Failed to fetch ML usage metrics" });
    }
  });

  // Admin: Trigger manual ClickHouse processing window
  app.post("/api/admin/ml-usage/trigger-window", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { windowName } = req.body;
      
      const { clickhouseOrchestrator } = await import('./services/clickhouseOrchestrator');
      
      logger.info('[Admin] Manual ML processing window triggered', { windowName, adminId: req.user.claims.sub });
      
      const stats = await clickhouseOrchestrator.triggerManualWindow(windowName);
      
      res.json({
        success: true,
        stats,
        message: `Window ${stats.windowName} completed in ${stats.durationMs}ms`,
      });
    } catch (error: any) {
      logger.error('[Admin] ML processing window error:', error);
      res.status(500).json({ error: error.message || "Failed to trigger processing window" });
    }
  });

  // Admin: Get ClickHouse query usage statistics
  app.get("/api/admin/ml-usage/query-stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { isClickHouseEnabled, clickhouse } = await import('./services/clickhouseService');
      
      if (!isClickHouseEnabled()) {
        return res.status(503).json({ error: "ClickHouse not configured" });
      }
      
      const queryStats = await clickhouse.query<{
        table_name: string;
        row_count: number;
        data_size_bytes: number;
      }>(`
        SELECT 
          table AS table_name,
          sum(rows) AS row_count,
          sum(data_uncompressed_bytes) AS data_size_bytes
        FROM system.parts
        WHERE database = 'flo_health' AND active = 1
        GROUP BY table
        ORDER BY data_size_bytes DESC
      `, {});
      
      const totalRows = queryStats.reduce((acc, t) => acc + Number(t.row_count), 0);
      const totalSizeBytes = queryStats.reduce((acc, t) => acc + Number(t.data_size_bytes), 0);
      
      res.json({
        tables: queryStats.map(t => ({
          name: t.table_name,
          rowCount: Number(t.row_count),
          dataSizeMB: Math.round(Number(t.data_size_bytes) / 1024 / 1024 * 100) / 100,
        })),
        totals: {
          totalRows,
          totalSizeMB: Math.round(totalSizeBytes / 1024 / 1024 * 100) / 100,
        },
      });
    } catch (error) {
      logger.error('[Admin] ClickHouse query stats error:', error);
      res.status(500).json({ error: "Failed to fetch query stats" });
    }
  });

  // Admin: Get ML processing costs (AI + ClickHouse estimates)
  app.get("/api/admin/ml-usage/costs", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const todayAICosts = await db
        .select({
          provider: sql<string>`
            CASE 
              WHEN ${openaiUsageEvents.model} LIKE 'gpt%' THEN 'openai'
              WHEN ${openaiUsageEvents.model} LIKE 'grok%' THEN 'grok'
              WHEN ${openaiUsageEvents.model} LIKE 'gemini%' THEN 'gemini'
              ELSE 'other'
            END
          `,
          totalCost: sql<number>`COALESCE(SUM(${openaiUsageEvents.cost}), 0)`,
          totalTokens: sql<number>`COALESCE(SUM(${openaiUsageEvents.totalTokens}), 0)`,
          queryCount: sql<number>`COUNT(*)`,
        })
        .from(openaiUsageEvents)
        .where(sql`${openaiUsageEvents.createdAt} >= ${todayStart}`)
        .groupBy(sql`CASE 
          WHEN ${openaiUsageEvents.model} LIKE 'gpt%' THEN 'openai'
          WHEN ${openaiUsageEvents.model} LIKE 'grok%' THEN 'grok'
          WHEN ${openaiUsageEvents.model} LIKE 'gemini%' THEN 'gemini'
          ELSE 'other'
        END`);
      
      const monthAICosts = await db
        .select({
          totalCost: sql<number>`COALESCE(SUM(${openaiUsageEvents.cost}), 0)`,
          totalTokens: sql<number>`COALESCE(SUM(${openaiUsageEvents.totalTokens}), 0)`,
          queryCount: sql<number>`COUNT(*)`,
        })
        .from(openaiUsageEvents)
        .where(sql`${openaiUsageEvents.createdAt} >= ${monthStart}`);
      
      let clickhouseCostEstimate = { 
        storageCostMonthly: 0, 
        computeCostDaily: 0, 
        totalSizeGB: 0,
        windowsRunToday: 0,
        estimatedComputeCredits: 0,
      };
      
      try {
        const { isClickHouseEnabled, clickhouse } = await import('./services/clickhouseService');
        const { clickhouseOrchestrator } = await import('./services/clickhouseOrchestrator');
        
        if (isClickHouseEnabled()) {
          const storageStats = await clickhouse.query<{
            total_bytes: number;
          }>(`
            SELECT sum(data_uncompressed_bytes) AS total_bytes
            FROM system.parts
            WHERE database = 'flo_health' AND active = 1
          `, {});
          
          const totalBytes = Number(storageStats[0]?.total_bytes || 0);
          const totalGB = totalBytes / (1024 * 1024 * 1024);
          
          const metrics = clickhouseOrchestrator.getUsageMetrics();
          const windowsToday = metrics.totalWindowsToday || 0;
          const avgDurationMs = metrics.dailyStats.totalDurationMs / Math.max(windowsToday, 1);
          const estimatedCreditsPerWindow = (avgDurationMs / 1000 / 60) * 0.10;
          
          clickhouseCostEstimate = {
            totalSizeGB: Math.round(totalGB * 100) / 100,
            storageCostMonthly: Math.round(totalGB * 0.025 * 100) / 100,
            computeCostDaily: Math.round(estimatedCreditsPerWindow * 4 * 100) / 100,
            windowsRunToday: windowsToday,
            estimatedComputeCredits: Math.round(estimatedCreditsPerWindow * 1000) / 1000,
          };
        }
      } catch (e) {
        logger.debug('[Admin] ClickHouse cost estimate unavailable');
      }
      
      const todayAITotal = todayAICosts.reduce((acc, c) => acc + Number(c.totalCost), 0);
      const monthAITotal = Number(monthAICosts[0]?.totalCost || 0);
      
      res.json({
        today: {
          aiCosts: todayAICosts.map(c => ({
            provider: c.provider,
            cost: Math.round(Number(c.totalCost) * 10000) / 10000,
            tokens: Number(c.totalTokens),
            queries: Number(c.queryCount),
          })),
          totalAICost: Math.round(todayAITotal * 10000) / 10000,
          clickhouseComputeEstimate: clickhouseCostEstimate.computeCostDaily,
          totalEstimate: Math.round((todayAITotal + clickhouseCostEstimate.computeCostDaily) * 10000) / 10000,
        },
        month: {
          totalAICost: Math.round(monthAITotal * 10000) / 10000,
          aiQueries: Number(monthAICosts[0]?.queryCount || 0),
          aiTokens: Number(monthAICosts[0]?.totalTokens || 0),
          clickhouseStorageEstimate: clickhouseCostEstimate.storageCostMonthly,
          totalEstimate: Math.round((monthAITotal + clickhouseCostEstimate.storageCostMonthly + clickhouseCostEstimate.computeCostDaily * 30) * 100) / 100,
        },
        clickhouse: clickhouseCostEstimate,
      });
    } catch (error) {
      logger.error('[Admin] ML usage costs error:', error);
      res.status(500).json({ error: "Failed to fetch ML usage costs" });
    }
  });

  // Admin: Get real-time system health status for all integrations
  app.get("/api/admin/system-health", isAuthenticated, requireAdmin, async (req, res) => {
    const services: Array<{
      id: string;
      name: string;
      status: 'operational' | 'degraded' | 'down' | 'not_configured';
      latencyMs?: number;
      details?: string;
      lastSync?: string;
      rowCount?: number;
    }> = [];

    // Check PostgreSQL (Neon)
    try {
      const startPg = Date.now();
      const pgResult = await db.execute(sql`SELECT 1 as health_check`);
      const pgLatency = Date.now() - startPg;
      
      const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
      
      services.push({
        id: 'postgresql',
        name: 'PostgreSQL (Neon)',
        status: 'operational',
        latencyMs: pgLatency,
        details: `${userCount[0]?.count || 0} users`,
        rowCount: Number(userCount[0]?.count || 0),
      });
    } catch (e: any) {
      services.push({
        id: 'postgresql',
        name: 'PostgreSQL (Neon)',
        status: 'down',
        details: e.message?.substring(0, 50),
      });
    }

    // Check Supabase
    try {
      const { getSupabaseClient } = await import('./services/supabaseClient');
      const startSb = Date.now();
      const supabase = getSupabaseClient();
      const { count, error } = await supabase
        .from('health_profiles')
        .select('*', { count: 'exact', head: true });
      const sbLatency = Date.now() - startSb;
      
      if (error) throw error;
      
      services.push({
        id: 'supabase',
        name: 'Supabase (Health DB)',
        status: 'operational',
        latencyMs: sbLatency,
        details: `${count || 0} health profiles`,
        rowCount: count || 0,
      });
    } catch (e: any) {
      const isNotConfigured = e.message?.includes('SUPABASE_URL') || e.message?.includes('must be set');
      services.push({
        id: 'supabase',
        name: 'Supabase (Health DB)',
        status: isNotConfigured ? 'not_configured' : 'down',
        details: isNotConfigured ? 'Not configured' : e.message?.substring(0, 50),
      });
    }

    // Check ClickHouse
    try {
      const { isClickHouseEnabled, clickhouse } = await import('./services/clickhouseService');
      
      if (!isClickHouseEnabled()) {
        services.push({
          id: 'clickhouse',
          name: 'ClickHouse (ML Engine)',
          status: 'not_configured',
          details: 'Not configured',
        });
      } else {
        const startCh = Date.now();
        const result = await clickhouse.query<{ cnt: number }>(`
          SELECT count() as cnt FROM flo_health.health_metrics
        `, {});
        const chLatency = Date.now() - startCh;
        
        const { clickhouseOrchestrator } = await import('./services/clickhouseOrchestrator');
        const metrics = clickhouseOrchestrator.getUsageMetrics();
        const lastWindow = metrics.lastWindowStats;
        
        services.push({
          id: 'clickhouse',
          name: 'ClickHouse (ML Engine)',
          status: 'operational',
          latencyMs: chLatency,
          details: `${(result[0]?.cnt || 0).toLocaleString()} metrics`,
          rowCount: Number(result[0]?.cnt || 0),
          lastSync: lastWindow?.completedAt?.toISOString() || lastWindow?.startedAt?.toISOString(),
        });
      }
    } catch (e: any) {
      services.push({
        id: 'clickhouse',
        name: 'ClickHouse (ML Engine)',
        status: 'down',
        details: e.message?.substring(0, 50),
      });
    }

    // Check Stripe
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        services.push({
          id: 'stripe',
          name: 'Stripe Payments',
          status: 'not_configured',
          details: 'Not configured',
        });
      } else {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(stripeKey);
        const startStripe = Date.now();
        const balance = await stripe.balance.retrieve();
        const stripeLatency = Date.now() - startStripe;
        
        const availableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;
        
        services.push({
          id: 'stripe',
          name: 'Stripe Payments',
          status: 'operational',
          latencyMs: stripeLatency,
          details: `$${availableBalance.toFixed(2)} available`,
        });
      }
    } catch (e: any) {
      services.push({
        id: 'stripe',
        name: 'Stripe Payments',
        status: 'degraded',
        details: e.message?.substring(0, 50),
      });
    }

    // Check OpenAI
    try {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        services.push({
          id: 'openai',
          name: 'OpenAI API',
          status: 'not_configured',
          details: 'Not configured',
        });
      } else {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayUsage = await db
          .select({
            count: sql<number>`count(*)`,
            totalCost: sql<number>`COALESCE(SUM(${openaiUsageEvents.cost}), 0)`,
          })
          .from(openaiUsageEvents)
          .where(sql`${openaiUsageEvents.createdAt} >= ${todayStart} AND ${openaiUsageEvents.model} LIKE 'gpt%'`);
        
        services.push({
          id: 'openai',
          name: 'OpenAI API (GPT-4)',
          status: 'operational',
          details: `${todayUsage[0]?.count || 0} calls today ($${(Number(todayUsage[0]?.totalCost) || 0).toFixed(2)})`,
        });
      }
    } catch (e: any) {
      services.push({
        id: 'openai',
        name: 'OpenAI API (GPT-4)',
        status: 'degraded',
        details: e.message?.substring(0, 50),
      });
    }

    // Check Gemini
    try {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        services.push({
          id: 'gemini',
          name: 'Gemini API',
          status: 'not_configured',
          details: 'Not configured',
        });
      } else {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayUsage = await db
          .select({
            count: sql<number>`count(*)`,
            totalCost: sql<number>`COALESCE(SUM(${openaiUsageEvents.cost}), 0)`,
          })
          .from(openaiUsageEvents)
          .where(sql`${openaiUsageEvents.createdAt} >= ${todayStart} AND ${openaiUsageEvents.model} LIKE 'gemini%'`);
        
        services.push({
          id: 'gemini',
          name: 'Gemini API',
          status: 'operational',
          details: `${todayUsage[0]?.count || 0} calls today ($${(Number(todayUsage[0]?.totalCost) || 0).toFixed(2)})`,
        });
      }
    } catch (e: any) {
      services.push({
        id: 'gemini',
        name: 'Gemini API',
        status: 'degraded',
        details: e.message?.substring(0, 50),
      });
    }

    // Check Auth Service (Replit Auth)
    try {
      const sessionCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(sessions)
        .where(sql`${sessions.expiresAt} > NOW()`);
      
      services.push({
        id: 'auth',
        name: 'Auth Service',
        status: 'operational',
        details: `${sessionCount[0]?.count || 0} active sessions`,
      });
    } catch (e: any) {
      services.push({
        id: 'auth',
        name: 'Auth Service',
        status: 'degraded',
        details: e.message?.substring(0, 50),
      });
    }

    const operationalCount = services.filter(s => s.status === 'operational').length;
    const totalConfigured = services.filter(s => s.status !== 'not_configured').length;
    
    res.json({
      services,
      summary: {
        operational: operationalCount,
        total: totalConfigured,
        allHealthy: operationalCount === totalConfigured,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Admin: Create a new developer message
  app.post("/api/admin/developer-messages", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { title, message, type, expiresAt, targetUserIds } = req.body;
      
      if (!title || !message) {
        return res.status(400).json({ error: "Title and message are required" });
      }
      
      const [newMessage] = await db
        .insert(developerMessages)
        .values({
          title,
          message,
          type: type || 'update',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          targetUserIds: targetUserIds && targetUserIds.length > 0 ? targetUserIds : null,
        })
        .returning();
      
      logger.info('[Admin] Developer message created', { 
        messageId: newMessage.id, 
        targetUsers: targetUserIds?.length || 'all' 
      });
      res.json(newMessage);
    } catch (error) {
      logger.error('Error creating developer message:', error);
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  // Admin: Get all developer messages (including inactive)
  app.get("/api/admin/developer-messages", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const messages = await db
        .select()
        .from(developerMessages)
        .orderBy(desc(developerMessages.createdAt));
      
      res.json({ messages });
    } catch (error) {
      logger.error('Error fetching admin developer messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Admin: Update a developer message
  app.patch("/api/admin/developer-messages/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const messageId = parseInt(req.params.id);
      const { title, message, type, isActive, expiresAt } = req.body;
      
      if (isNaN(messageId)) {
        return res.status(400).json({ error: "Invalid message ID" });
      }
      
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (message !== undefined) updateData.message = message;
      if (type !== undefined) updateData.type = type;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
      
      const [updated] = await db
        .update(developerMessages)
        .set(updateData)
        .where(eq(developerMessages.id, messageId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Message not found" });
      }
      
      logger.info('[Admin] Developer message updated', { messageId });
      res.json(updated);
    } catch (error) {
      logger.error('Error updating developer message:', error);
      res.status(500).json({ error: "Failed to update message" });
    }
  });

  // Admin: Delete a developer message
  app.delete("/api/admin/developer-messages/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      
      if (isNaN(messageId)) {
        return res.status(400).json({ error: "Invalid message ID" });
      }
      
      const [deleted] = await db
        .delete(developerMessages)
        .where(eq(developerMessages.id, messageId))
        .returning();
      
      if (!deleted) {
        return res.status(404).json({ error: "Message not found" });
      }
      
      logger.info('[Admin] Developer message deleted', { messageId });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting developer message:', error);
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // ============================================================================
  // Admin: User Feedback (Bug Reports & Feature Requests)
  // ============================================================================

  // Admin: Get all user feedback with optional filtering
  app.get("/api/admin/user-feedback", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { type, status } = req.query;
      
      let query = db
        .select({
          id: userFeedback.id,
          userId: userFeedback.userId,
          type: userFeedback.type,
          title: userFeedback.title,
          message: userFeedback.message,
          status: userFeedback.status,
          adminNotes: userFeedback.adminNotes,
          createdAt: userFeedback.createdAt,
          updatedAt: userFeedback.updatedAt,
          userEmail: users.email,
          userName: users.firstName,
        })
        .from(userFeedback)
        .leftJoin(users, eq(userFeedback.userId, users.id))
        .orderBy(desc(userFeedback.createdAt));
      
      // Apply filters if provided
      const conditions = [];
      if (type && (type === 'bug_report' || type === 'feature_request')) {
        conditions.push(eq(userFeedback.type, type as any));
      }
      if (status && ['new', 'in_review', 'planned', 'resolved', 'dismissed'].includes(status as string)) {
        conditions.push(eq(userFeedback.status, status as any));
      }
      
      let results;
      if (conditions.length === 1) {
        results = await query.where(conditions[0]);
      } else if (conditions.length > 1) {
        results = await query.where(and(...conditions));
      } else {
        results = await query;
      }
      
      res.json({ feedback: results });
    } catch (error) {
      logger.error('Error fetching user feedback:', error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  // Admin: Update user feedback status/notes
  app.patch("/api/admin/user-feedback/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const feedbackId = parseInt(req.params.id);
      const { status, adminNotes } = req.body;
      
      if (isNaN(feedbackId)) {
        return res.status(400).json({ error: "Invalid feedback ID" });
      }
      
      const updateData: any = { updatedAt: new Date() };
      if (status !== undefined) updateData.status = status;
      if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
      
      const [updated] = await db
        .update(userFeedback)
        .set(updateData)
        .where(eq(userFeedback.id, feedbackId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Feedback not found" });
      }
      
      logger.info('[Admin] User feedback updated', { feedbackId, status });
      res.json(updated);
    } catch (error) {
      logger.error('Error updating user feedback:', error);
      res.status(500).json({ error: "Failed to update feedback" });
    }
  });

  // Admin: Get feedback counts by status (for dashboard)
  app.get("/api/admin/user-feedback/stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const stats = await db
        .select({
          type: userFeedback.type,
          status: userFeedback.status,
          count: sql<number>`count(*)::int`,
        })
        .from(userFeedback)
        .groupBy(userFeedback.type, userFeedback.status);
      
      res.json({ stats });
    } catch (error) {
      logger.error('Error fetching feedback stats:', error);
      res.status(500).json({ error: "Failed to fetch feedback stats" });
    }
  });

  // Admin: Get list of users for targeting messages
  app.get("/api/admin/users-list", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const usersList = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        })
        .from(users)
        .where(eq(users.status, 'active'))
        .orderBy(users.email);
      
      res.json({ users: usersList });
    } catch (error) {
      logger.error('Error fetching users list:', error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Test push notification endpoint (admin only)
  app.post("/api/admin/test-reminder", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Import daily reminder service
      const { generateDailyReminder } = await import("./services/dailyReminderService");
      
      // Get user's reminder preferences
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, userId),
        columns: {
          reminderTime: true,
          reminderTimezone: true,
          reminderEnabled: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.reminderEnabled) {
        return res.status(400).json({ error: "User has reminders disabled" });
      }

      // Generate reminder
      const result = await generateDailyReminder(
        userId,
        user.reminderTime || '08:15',
        user.reminderTimezone || 'UTC'
      );

      if (result.success) {
        return res.json({
          success: true,
          message: "Daily reminder generated and queued successfully",
          reminder: result.reminder,
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.error || "Failed to generate reminder",
        });
      }
    } catch (error: any) {
      logger.error('[Test] Failed to generate test reminder:', error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to generate reminder",
      });
    }
  });

  app.post("/api/admin/test-push", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId, title, body } = req.body;

      if (!userId || !title || !body) {
        return res.status(400).json({ error: "userId, title, and body are required" });
      }

      // Try multiple ID formats to find device tokens
      // Device tokens are registered with mobile JWT auth user_id (internal UUID format)
      // But admin might enter health_id, internal user_id, or web auth ID
      
      const idsToTry: string[] = [userId];
      const mappingDetails: any = { inputId: userId, triedIds: [userId] };
      
      // Check Supabase user_profiles for ID mappings
      const { getSupabaseClient } = await import("./services/supabaseClient");
      const supabase = getSupabaseClient();
      
      // Try to find user_profiles entry by health_id
      const { data: byHealthId } = await supabase
        .from('user_profiles')
        .select('user_id, health_id')
        .eq('health_id', userId)
        .single();
      
      if (byHealthId?.user_id && !idsToTry.includes(byHealthId.user_id)) {
        idsToTry.push(byHealthId.user_id);
        mappingDetails.foundByHealthId = byHealthId.user_id;
      }
      
      // Try to find user_profiles entry by user_id (reverse lookup)
      const { data: byUserId } = await supabase
        .from('user_profiles')
        .select('user_id, health_id')
        .eq('user_id', userId)
        .single();
      
      if (byUserId?.health_id && !idsToTry.includes(byUserId.health_id)) {
        idsToTry.push(byUserId.health_id);
        mappingDetails.foundByUserId = byUserId.health_id;
      }
      
      mappingDetails.triedIds = idsToTry;
      logger.info(`[Admin] Test push - trying IDs: ${idsToTry.join(', ')}`);

      const { apnsService } = await import("./services/apnsService");
      
      // Try each ID until we find device tokens
      for (const tryId of idsToTry) {
        const result = await apnsService.sendToUser(tryId, { title, body });
        if (result.devicesReached > 0) {
          logger.info(`[Admin] Test push notification sent via ID ${tryId}: ${result.devicesReached} devices reached`);
          return res.json({ ...result, usedId: tryId, mapping: mappingDetails });
        }
      }
      
      // No devices found with any ID
      logger.warn(`[Admin] No devices found for any ID: ${idsToTry.join(', ')}`);
      res.json({ 
        devicesReached: 0, 
        error: 'No active devices found',
        mapping: mappingDetails,
        hint: 'Ensure device token is registered and notifications are enabled in iOS settings'
      });
    } catch (error) {
      logger.error('Error sending test push notification:', error);
      res.status(500).json({ error: "Failed to send test push notification" });
    }
  });

  // Get APNs configuration status (admin only)
  app.get("/api/admin/apns-config", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const configs = await db
        .select({
          id: apnsConfiguration.id,
          environment: apnsConfiguration.environment,
          teamId: apnsConfiguration.teamId,
          keyId: apnsConfiguration.keyId,
          bundleId: apnsConfiguration.bundleId,
          isActive: apnsConfiguration.isActive,
          createdAt: apnsConfiguration.createdAt,
          updatedAt: apnsConfiguration.updatedAt,
        })
        .from(apnsConfiguration)
        .limit(5);

      const activeConfig = configs.find(c => c.isActive);
      
      res.json({
        hasActiveConfig: !!activeConfig,
        configs: configs.map(c => ({
          ...c,
          hasSigningKey: true, // Don't expose the actual key
        })),
        activeConfig: activeConfig ? {
          id: activeConfig.id,
          environment: activeConfig.environment,
          teamId: activeConfig.teamId,
          keyId: activeConfig.keyId,
          bundleId: activeConfig.bundleId,
        } : null,
      });
    } catch (error: any) {
      logger.error('[Admin] Failed to get APNs config:', error);
      res.status(500).json({ error: "Failed to get APNs configuration" });
    }
  });

  // Save APNs configuration (admin only)
  app.post("/api/admin/apns-config", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { teamId, keyId, signingKey, bundleId, environment } = req.body;

      if (!teamId || !keyId || !signingKey || !bundleId) {
        return res.status(400).json({ 
          error: "teamId, keyId, signingKey, and bundleId are required" 
        });
      }

      // Validate signingKey format
      if (!signingKey.includes('BEGIN PRIVATE KEY') || !signingKey.includes('END PRIVATE KEY')) {
        return res.status(400).json({ 
          error: "signingKey must be a valid .p8 private key (PEM format)" 
        });
      }

      // Deactivate all existing configs
      await db
        .update(apnsConfiguration)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(apnsConfiguration.isActive, true));

      // Insert new config
      const [newConfig] = await db
        .insert(apnsConfiguration)
        .values({
          id: crypto.randomUUID(),
          teamId,
          keyId,
          signingKey,
          bundleId,
          environment: environment || 'production',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({
          id: apnsConfiguration.id,
          environment: apnsConfiguration.environment,
          teamId: apnsConfiguration.teamId,
          keyId: apnsConfiguration.keyId,
          bundleId: apnsConfiguration.bundleId,
          isActive: apnsConfiguration.isActive,
        });

      // Force re-initialize APNs service
      const { apnsService } = await import("./services/apnsService");
      await apnsService.reinitialize();

      logger.info(`[Admin] APNs configuration saved: ${newConfig.id}`);
      res.json({ 
        success: true, 
        message: "APNs configuration saved and activated",
        config: newConfig,
      });
    } catch (error: any) {
      logger.error('[Admin] Failed to save APNs config:', error);
      res.status(500).json({ error: "Failed to save APNs configuration", message: error.message });
    }
  });

  // Test 3PM survey notification (admin only)
  app.post("/api/admin/test-survey-notification", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { triggerManualSurveyNotification } = await import("./services/reminderDeliveryService");
      const result = await triggerManualSurveyNotification(userId);

      logger.info(`[Admin] 3PM survey notification test: ${result.success ? 'sent' : 'failed'}`);
      res.json(result);
    } catch (error: any) {
      logger.error('Error sending 3PM survey notification:', error);
      res.status(500).json({ error: "Failed to send 3PM survey notification", message: error.message });
    }
  });

  // Manually trigger reminder delivery (admin only)
  app.post("/api/admin/trigger-reminder-delivery", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { triggerManualDelivery } = await import("./services/reminderDeliveryService");
      await triggerManualDelivery();
      
      logger.info('[Admin] Manual reminder delivery triggered');
      res.json({ success: true, message: "Reminder delivery triggered - check logs for results" });
    } catch (error: any) {
      logger.error('Error triggering reminder delivery:', error);
      res.status(500).json({ error: "Failed to trigger reminder delivery", message: error.message });
    }
  });

  // Clear Flō Oracle context cache (admin only, for debugging)
  app.post("/api/admin/clear-oracle-cache", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { userId } = req.body;
      const { clearContextCache } = await import('./services/floOracleContextBuilder');
      clearContextCache(userId);
      
      res.json({ 
        success: true, 
        message: userId ? `Cleared Oracle context cache for user ${userId}` : "Cleared all Oracle context cache"
      });
    } catch (error: any) {
      logger.error("[Admin] Clear Oracle cache failed:", error);
      res.status(500).json({ error: "Failed to clear cache", message: error.message });
    }
  });

  // ============================================================================
  // CLI-Compatible Device Token & Push Notification Debug Endpoints
  // Use x-admin-key header for authentication from terminal/Postman
  // ============================================================================

  // List device tokens for a user (CLI-compatible)
  app.get("/api/cli/device-tokens/:userId", async (req: any, res) => {
    try {
      const apiKey = req.headers['x-admin-key'];
      const expectedKey = process.env.ADMIN_CLI_KEY;
      
      if (!expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized - invalid API key" });
      }

      const { userId } = req.params;
      
      const tokens = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, userId));

      logger.info(`[CLI] Device tokens lookup for user ${userId}: ${tokens.length} found`);
      
      res.json({
        userId,
        tokenCount: tokens.length,
        tokens: tokens.map(t => ({
          id: t.id,
          platform: t.platform,
          isActive: t.isActive,
          tokenPreview: t.deviceToken.substring(0, 20) + '...',
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      });
    } catch (error: any) {
      logger.error('[CLI] Device tokens lookup error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Register a device token manually (CLI-compatible for testing)
  app.post("/api/cli/device-tokens", async (req: any, res) => {
    try {
      const apiKey = req.headers['x-admin-key'];
      const expectedKey = process.env.ADMIN_CLI_KEY;
      
      if (!expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized - invalid API key" });
      }

      const { userId, deviceToken, platform = 'ios' } = req.body;
      
      if (!userId || !deviceToken) {
        return res.status(400).json({ error: "userId and deviceToken are required" });
      }

      // Check if token already exists
      const [existing] = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.deviceToken, deviceToken))
        .limit(1);

      if (existing) {
        // Update existing token
        await db
          .update(deviceTokens)
          .set({
            userId,
            platform,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(deviceTokens.deviceToken, deviceToken));
        
        logger.info(`[CLI] Updated existing device token for user ${userId}`);
        res.json({ success: true, message: "Device token updated", userId, platform });
      } else {
        // Insert new token
        await db
          .insert(deviceTokens)
          .values({
            userId,
            deviceToken,
            platform,
            isActive: true,
          });
        
        logger.info(`[CLI] Registered new device token for user ${userId}`);
        res.json({ success: true, message: "Device token registered", userId, platform });
      }
    } catch (error: any) {
      logger.error('[CLI] Device token registration error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send test push notification (CLI-compatible)
  app.post("/api/cli/test-push", async (req: any, res) => {
    try {
      const apiKey = req.headers['x-admin-key'];
      const expectedKey = process.env.ADMIN_CLI_KEY;
      
      if (!expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized - invalid API key" });
      }

      const { userId, title = "Flō Test", body = "This is a test push notification" } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // First check if user has device tokens
      const tokens = await db
        .select()
        .from(deviceTokens)
        .where(and(
          eq(deviceTokens.userId, userId),
          eq(deviceTokens.isActive, true)
        ));

      if (tokens.length === 0) {
        return res.status(400).json({ 
          error: "No active device tokens found for this user",
          hint: "Register a token first using POST /api/cli/device-tokens",
          userId,
        });
      }

      const { apnsService } = await import("./services/apnsService");
      const result = await apnsService.sendToUser(userId, { 
        title, 
        body,
        data: { type: 'test' },
      });

      logger.info(`[CLI] Test push sent to user ${userId}: ${result.devicesReached} devices reached`);
      
      res.json({
        success: result.success,
        devicesReached: result.devicesReached,
        error: result.error,
        tokensAvailable: tokens.length,
      });
    } catch (error: any) {
      logger.error('[CLI] Test push error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Check environmental/AQI data for a user (CLI-compatible)
  app.get("/api/cli/environmental/:userId", async (req: any, res) => {
    try {
      const apiKey = req.headers['x-admin-key'];
      const expectedKey = process.env.ADMIN_CLI_KEY;
      
      if (!expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized - invalid API key" });
      }

      const { userId } = req.params;
      const today = new Date().toISOString().split('T')[0];
      
      const { getCachedWeather, getLatestLocation } = await import('./services/supabaseHealthStorage');
      
      // Check location
      const location = await getLatestLocation(userId);
      
      // Check cached weather for today
      const cachedWeather = await getCachedWeather(userId, today);
      
      // Check if API key exists
      const hasApiKey = !!process.env.OPENWEATHER_API_KEY;
      
      logger.info(`[CLI] Environmental check for user ${userId}: location=${!!location}, cache=${!!cachedWeather}, apiKey=${hasApiKey}`);
      
      res.json({
        userId,
        date: today,
        hasOpenWeatherApiKey: hasApiKey,
        location: location ? {
          latitude: location.latitude,
          longitude: location.longitude,
          recordedAt: location.recordedAt,
        } : null,
        cachedWeather: cachedWeather ? {
          temperature: cachedWeather.temperature,
          humidity: cachedWeather.humidity,
          aqi: cachedWeather.aqi,
          aqiLabel: cachedWeather.aqiLabel,
          cachedAt: cachedWeather.cachedAt,
        } : null,
        diagnosis: !location 
          ? "No location stored - user needs to grant location permission in app"
          : !hasApiKey
            ? "OpenWeather API key not configured"
            : !cachedWeather
              ? "No cached data - fetch may have failed or not been triggered"
              : "Data available",
      });
    } catch (error: any) {
      logger.error('[CLI] Environmental check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Check APNs configuration status (CLI-compatible)
  app.get("/api/cli/apns-status", async (req: any, res) => {
    try {
      const apiKey = req.headers['x-admin-key'];
      const expectedKey = process.env.ADMIN_CLI_KEY;
      
      if (!expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized - invalid API key" });
      }

      const configs = await db
        .select({
          id: apnsConfiguration.id,
          teamId: apnsConfiguration.teamId,
          keyId: apnsConfiguration.keyId,
          bundleId: apnsConfiguration.bundleId,
          environment: apnsConfiguration.environment,
          isActive: apnsConfiguration.isActive,
          createdAt: apnsConfiguration.createdAt,
        })
        .from(apnsConfiguration);

      const totalTokens = await db
        .select({ count: deviceTokens.id })
        .from(deviceTokens);

      const activeTokens = await db
        .select({ count: deviceTokens.id })
        .from(deviceTokens)
        .where(eq(deviceTokens.isActive, true));

      res.json({
        apnsConfigurations: configs,
        deviceTokenStats: {
          total: totalTokens.length,
          active: activeTokens.length,
        },
      });
    } catch (error: any) {
      logger.error('[CLI] APNs status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // Self-Improvement Engine (SIE) - Sandbox Mode
  // Unrestricted AI analysis of Flō's data landscape for product improvements
  // ============================================================================
  
  app.post("/api/sandbox/sie", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      const { generateAudio = true } = req.body;
      
      logger.info('[SIE] Analysis requested by admin', { adminId, generateAudio });
      
      const { runSIEAnalysis } = await import('./services/sieService');
      const result = await runSIEAnalysis(generateAudio);
      
      logger.info('[SIE] Analysis complete', { 
        adminId, 
        sessionId: result.sessionId,
        hasAudio: !!result.audioBase64,
        processingTimeMs: result.processingTimeMs,
      });
      
      res.json(result);
    } catch (error: any) {
      logger.error('[SIE] Analysis failed:', error);
      res.status(500).json({ 
        error: "SIE analysis failed", 
        message: error.message,
      });
    }
  });
  
  app.get("/api/sandbox/sie/sessions", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { getSIESessions } = await import('./services/sieService');
      const sessions = getSIESessions();
      
      res.json({
        sessions: sessions.map(s => ({
          id: s.id,
          timestamp: s.timestamp,
          audioGenerated: s.audioGenerated,
          responseLength: s.response.length,
        })),
        total: sessions.length,
      });
    } catch (error: any) {
      logger.error('[SIE] Sessions fetch failed:', error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });
  
  app.get("/api/sandbox/sie/data-landscape", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { getDataLandscape } = await import('./services/sieService');
      const landscape = await getDataLandscape();
      
      res.json({
        supabaseTables: landscape.supabaseTables.length,
        neonTables: landscape.neonTables.length,
        healthKitMetrics: landscape.healthKitMetrics.length,
        aiCapabilities: landscape.aiCapabilities.length,
        integrations: landscape.integrations.length,
        gaps: landscape.recentChanges.length,
        details: landscape,
      });
    } catch (error: any) {
      logger.error('[SIE] Data landscape fetch failed:', error);
      res.status(500).json({ error: "Failed to fetch data landscape" });
    }
  });
  
  // SIE Brainstorming Chat - interactive follow-up conversation
  app.post("/api/sandbox/sie/chat", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      const { message, sessionId } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }
      
      logger.info('[SIE Chat] Message received', { adminId, sessionId, messageLength: message.length });
      
      const { chatWithSIE } = await import('./services/sieService');
      const result = await chatWithSIE(sessionId || null, message);
      
      logger.info('[SIE Chat] Response sent', { 
        adminId, 
        sessionId: result.sessionId,
        messageCount: result.messageCount,
      });
      
      res.json(result);
    } catch (error: any) {
      logger.error('[SIE Chat] Failed:', error);
      res.status(500).json({ 
        error: error.message || "Brainstorming chat failed",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  });

  // SIE Brainstorm Voice Session Storage Routes
  app.post("/api/sandbox/sie/brainstorm-sessions", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      const { title, transcript, audioBase64, durationSeconds } = req.body;
      
      if (!title || !transcript || !Array.isArray(transcript)) {
        return res.status(400).json({ error: "Title and transcript array required" });
      }
      
      let audioFilePath: string | null = null;
      
      if (audioBase64) {
        try {
          const { uploadToObjectStorage } = await import('./objectStorage');
          const audioBuffer = Buffer.from(audioBase64, 'base64');
          const fileName = `sie-brainstorm-${Date.now()}.webm`;
          audioFilePath = await uploadToObjectStorage(audioBuffer, fileName, '.private/sie-sessions');
          logger.info('[SIE Sessions] Audio saved to object storage', { audioFilePath });
        } catch (audioError: any) {
          logger.warn('[SIE Sessions] Failed to save audio, continuing without it', { error: audioError.message });
        }
      }
      
      const [session] = await db.insert(sieBrainstormSessions).values({
        adminId,
        title,
        transcript,
        audioFilePath,
        durationSeconds: durationSeconds || null,
      }).returning();
      
      logger.info('[SIE Sessions] Session saved', { sessionId: session.id, adminId, title });
      
      res.json({ 
        success: true, 
        session: {
          id: session.id,
          title: session.title,
          transcript: session.transcript,
          hasAudio: !!session.audioFilePath,
          durationSeconds: session.durationSeconds,
          createdAt: session.createdAt,
        }
      });
    } catch (error: any) {
      logger.error('[SIE Sessions] Save failed:', error);
      res.status(500).json({ error: error.message || "Failed to save session" });
    }
  });

  app.get("/api/sandbox/sie/brainstorm-sessions", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const sessions = await db
        .select({
          id: sieBrainstormSessions.id,
          title: sieBrainstormSessions.title,
          transcript: sieBrainstormSessions.transcript,
          hasAudio: sql<boolean>`${sieBrainstormSessions.audioFilePath} IS NOT NULL`,
          durationSeconds: sieBrainstormSessions.durationSeconds,
          createdAt: sieBrainstormSessions.createdAt,
        })
        .from(sieBrainstormSessions)
        .orderBy(desc(sieBrainstormSessions.createdAt))
        .limit(50);
      
      res.json({ sessions });
    } catch (error: any) {
      logger.error('[SIE Sessions] List failed:', error);
      res.status(500).json({ error: error.message || "Failed to list sessions" });
    }
  });

  app.get("/api/sandbox/sie/brainstorm-sessions/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const [session] = await db
        .select()
        .from(sieBrainstormSessions)
        .where(eq(sieBrainstormSessions.id, id))
        .limit(1);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      res.json({ session });
    } catch (error: any) {
      logger.error('[SIE Sessions] Get failed:', error);
      res.status(500).json({ error: error.message || "Failed to get session" });
    }
  });

  app.get("/api/sandbox/sie/brainstorm-sessions/:id/audio", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const [session] = await db
        .select({ audioFilePath: sieBrainstormSessions.audioFilePath })
        .from(sieBrainstormSessions)
        .where(eq(sieBrainstormSessions.id, id))
        .limit(1);
      
      if (!session || !session.audioFilePath) {
        return res.status(404).json({ error: "Audio not found" });
      }
      
      const { downloadFromObjectStorage } = await import('./objectStorage');
      const audioBuffer = await downloadFromObjectStorage(session.audioFilePath);
      
      res.setHeader('Content-Type', 'audio/webm');
      res.setHeader('Content-Disposition', `attachment; filename="sie-session-${id}.webm"`);
      res.send(audioBuffer);
    } catch (error: any) {
      logger.error('[SIE Sessions] Audio download failed:', error);
      res.status(500).json({ error: error.message || "Failed to download audio" });
    }
  });

  app.delete("/api/sandbox/sie/brainstorm-sessions/:id", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user.claims.sub;
      
      const [session] = await db
        .select()
        .from(sieBrainstormSessions)
        .where(eq(sieBrainstormSessions.id, id))
        .limit(1);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      if (session.audioFilePath) {
        try {
          const { deleteFromObjectStorage } = await import('./objectStorage');
          await deleteFromObjectStorage(session.audioFilePath);
        } catch (deleteError: any) {
          logger.warn('[SIE Sessions] Failed to delete audio file', { error: deleteError.message });
        }
      }
      
      await db.delete(sieBrainstormSessions).where(eq(sieBrainstormSessions.id, id));
      
      logger.info('[SIE Sessions] Session deleted', { sessionId: id, adminId });
      
      res.json({ success: true });
    } catch (error: any) {
      logger.error('[SIE Sessions] Delete failed:', error);
      res.status(500).json({ error: error.message || "Failed to delete session" });
    }
  });

  // Stripe billing routes (referenced from javascript_stripe blueprint)
  // Initialize Stripe only if API key is available
  const stripe = process.env.STRIPE_SECRET_KEY 
    ? new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-10-29.clover",
      })
    : null;

  app.post("/api/create-payment-intent", isAuthenticated, async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured" });
    }
    try {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        payment_method_types: ["card", "apple_pay"],
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      res.status(500).json({ error: "Error creating payment intent: " + error.message });
    }
  });

  app.post("/api/create-subscription", isAuthenticated, async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured" });
    }
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.email) {
        return res.status(400).json({ error: "User email required" });
      }

      const { priceId } = req.body;
      if (!priceId) {
        return res.status(400).json({ error: "priceId required" });
      }

      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      });

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        expand: ["latest_invoice.payment_intent"],
      });

      res.json({
        subscriptionId: subscription.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  });

  // Location & Environmental Data Routes
  // Receive location updates from iOS app for weather/AQI correlation
  app.post("/api/location", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { latitude, longitude, accuracy, timestamp, source } = req.body;
      
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({ error: "Valid latitude and longitude required" });
      }
      
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: "Coordinates out of valid range" });
      }
      
      logger.info(`[Location] Received location from user ${userId}: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      
      const { saveLocation, getCachedWeather, saveWeatherCache } = await import('./services/supabaseHealthStorage');
      const { getCurrentWeatherWithQuotaGuard } = await import('./services/environmentalBackfillService');
      
      const locationRecord = await saveLocation(userId, {
        latitude,
        longitude,
        accuracy: accuracy || 0,
        source: source || 'gps',
        timestamp: timestamp || new Date().toISOString(),
      });
      
      const today = new Date().toISOString().split('T')[0];
      const existingCache = await getCachedWeather(userId, today);
      
      let weatherData = null;
      let airQualityData = null;
      
      if (!existingCache && process.env.OPENWEATHER_API_KEY) {
        try {
          const envData = await getCurrentWeatherWithQuotaGuard(latitude, longitude);
          if (envData) {
            weatherData = envData.weather;
            airQualityData = envData.airQuality;
            
            await saveWeatherCache(userId, today, { latitude, longitude }, weatherData, airQualityData);
            logger.info(`[Location] Weather data cached for user ${userId}, date ${today}`);
            
            // Auto-update user timezone using coordinate-based lookup (most accurate)
            try {
              const { deriveTimezoneFromCoords, deriveTimezoneFromOffset, isValidTimezone } = await import('./utils/timezoneFromCoords');
              
              // Get current timezone for comparison
              const userRow = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
              const currentTz = userRow[0]?.timezone;
              
              // Try coordinate-based lookup first (most accurate)
              let derivedTimezone = deriveTimezoneFromCoords(latitude, longitude);
              
              // Fall back to offset-based if coords lookup fails
              if (!derivedTimezone && weatherData && weatherData.timezone !== undefined) {
                derivedTimezone = deriveTimezoneFromOffset(weatherData.timezone);
              }
              
              // Only update if we got a valid timezone AND it's different from current
              if (derivedTimezone && isValidTimezone(derivedTimezone) && derivedTimezone !== currentTz) {
                await db.update(users).set({ timezone: derivedTimezone }).where(eq(users.id, userId));
                logger.info(`[Location] Timezone changed for user ${userId}: ${currentTz || 'null'} -> ${derivedTimezone} (coords: ${latitude.toFixed(2)}, ${longitude.toFixed(2)})`);
              } else if (!derivedTimezone) {
                logger.warn(`[Location] Could not derive valid timezone for user ${userId} (coords: ${latitude.toFixed(2)}, ${longitude.toFixed(2)})`);
              }
            } catch (tzError: any) {
              logger.warn(`[Location] Failed to update timezone for user ${userId}:`, tzError.message);
            }
            
            // Trigger ClickHouse environmental data sync (non-blocking background task)
            (async () => {
              try {
                const { isClickHouseEnabled } = await import('./services/clickhouseService');
                if (isClickHouseEnabled()) {
                  const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
                  const { getHealthId } = await import('./services/supabaseHealthStorage');
                  const healthId = await getHealthId(userId);
                  
                  const syncedCount = await clickhouseBaselineEngine.syncEnvironmentalData(healthId, 7);
                  logger.info(`[ClickHouseML] Auto-synced ${syncedCount} environmental records for ${userId}`);
                }
              } catch (clickhouseError: any) {
                logger.warn(`[ClickHouseML] Environmental sync failed for ${userId}:`, clickhouseError.message);
              }
            })();
          } else {
            logger.warn(`[Location] Weather fetch skipped for user ${userId} (quota exhausted)`);
          }
        } catch (weatherError: any) {
          const errorMsg = weatherError?.message || String(weatherError);
          if (errorMsg.includes('QUOTA_RPC_UNAVAILABLE') || errorMsg.includes('QUOTA_INCREMENT_FAILED')) {
            logger.error(`[Location] CRITICAL: Quota RPC unavailable - deploy increment_weather_api_quota to Supabase`);
          } else {
            logger.error(`[Location] Failed to fetch weather data:`, weatherError);
          }
        }
      }
      
      // Always check and update timezone on cache hit (handles traveling users)
      if (existingCache) {
        try {
          const userRow = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
          const currentTz = userRow[0]?.timezone;
          
          // Always derive timezone from new coordinates
          const { deriveTimezoneFromCoords, isValidTimezone } = await import('./utils/timezoneFromCoords');
          const derivedTimezone = deriveTimezoneFromCoords(latitude, longitude);
          
          // Update if timezone is different or missing
          if (derivedTimezone && isValidTimezone(derivedTimezone) && derivedTimezone !== currentTz) {
            await db.update(users).set({ timezone: derivedTimezone }).where(eq(users.id, userId));
            logger.info(`[Location] Timezone changed for user ${userId}: ${currentTz || 'null'} -> ${derivedTimezone} (coords: ${latitude.toFixed(2)}, ${longitude.toFixed(2)})`);
          }
        } catch (tzCacheError: any) {
          logger.debug(`[Location] Timezone update from cache hit failed for ${userId}:`, tzCacheError.message);
        }
      }
      
      res.json({ 
        success: true, 
        locationId: locationRecord.id,
        weatherCached: !!weatherData || !!existingCache,
      });
    } catch (error: any) {
      logger.error(`[Location] Error saving location:`, error);
      res.status(500).json({ error: error.message || "Failed to save location" });
    }
  });
  
  app.get("/api/location/current", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { getLatestLocation } = await import('./services/supabaseHealthStorage');
      const location = await getLatestLocation(userId);
      
      if (!location) {
        return res.status(404).json({ error: "No location data available" });
      }
      
      res.json(location);
    } catch (error: any) {
      logger.error(`[Location] Error fetching current location:`, error);
      res.status(500).json({ error: error.message || "Failed to fetch location" });
    }
  });
  
  // Diagnostic endpoint to check location status for debugging
  app.get("/api/location/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { getLatestLocation, getLocationHistory, getHealthId } = await import('./services/supabaseHealthStorage');
      const healthId = await getHealthId(userId);
      const latestLocation = await getLatestLocation(userId);
      const recentLocations = await getLocationHistory(userId, { limit: 5 });
      
      res.json({
        userId: userId.substring(0, 8) + '...',
        healthId: healthId ? healthId.substring(0, 8) + '...' : null,
        hasLocation: !!latestLocation,
        latestLocation: latestLocation ? {
          lat: latestLocation.latitude?.toFixed(4),
          lon: latestLocation.longitude?.toFixed(4),
          recordedAt: latestLocation.recorded_at,
          source: latestLocation.source,
        } : null,
        recentLocationCount: recentLocations.length,
        recentLocations: recentLocations.map((l: any) => ({
          recordedAt: l.recorded_at,
          source: l.source,
        })),
      });
    } catch (error: any) {
      logger.error(`[Location] Error checking location status:`, error);
      res.status(500).json({ error: error.message || "Failed to check location status" });
    }
  });
  
  app.get("/api/environmental/today", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const today = new Date().toISOString().split('T')[0];
      
      logger.info(`[Environmental] Fetching today's data for user ${userId}, date ${today}`);
      
      const { getCachedWeather, getLatestLocation, saveWeatherCache } = await import('./services/supabaseHealthStorage');
      
      let cache = await getCachedWeather(userId, today);
      logger.info(`[Environmental] Cache lookup result: ${cache ? 'found' : 'not found'}`);
      
      if (!cache && process.env.OPENWEATHER_API_KEY) {
        const location = await getLatestLocation(userId);
        logger.info(`[Environmental] Location lookup result: ${location ? `found (${location.latitude?.toFixed(4)}, ${location.longitude?.toFixed(4)})` : 'not found'}`);
        if (location) {
          try {
            const { getCurrentWeatherWithQuotaGuard } = await import('./services/environmentalBackfillService');
            const envData = await getCurrentWeatherWithQuotaGuard(location.latitude, location.longitude);
            
            if (envData) {
              cache = await saveWeatherCache(
                userId, 
                today, 
                { latitude: location.latitude, longitude: location.longitude },
                envData.weather,
                envData.airQuality
              );
            }
          } catch (weatherError: any) {
            const errorMsg = weatherError?.message || String(weatherError);
            if (errorMsg.includes('QUOTA_RPC_UNAVAILABLE') || errorMsg.includes('QUOTA_INCREMENT_FAILED')) {
              logger.error(`[Environmental] CRITICAL: Quota RPC unavailable - deploy increment_weather_api_quota to Supabase`);
            } else {
              logger.error(`[Environmental] Failed to fetch weather data:`, weatherError);
            }
          }
        }
      }
      
      if (!cache) {
        logger.warn(`[Environmental] No data available for user ${userId} - no cache and no location`);
        return res.status(404).json({ error: "No environmental data available", reason: "no_location_data" });
      }
      
      // Flatten air quality data for frontend consumption
      const aqData = cache.air_quality_data as any;
      const flattenedAirQuality = aqData ? {
        aqi: aqData.aqi,
        aqiLabel: aqData.aqiLabel,
        pm25: aqData.components?.pm2_5 ?? aqData.pm25 ?? 0,
        pm10: aqData.components?.pm10 ?? aqData.pm10 ?? 0,
        o3: aqData.components?.o3 ?? aqData.o3 ?? 0,
        no2: aqData.components?.no2 ?? aqData.no2 ?? 0,
        co: aqData.components?.co ?? aqData.co ?? 0,
        so2: aqData.components?.so2 ?? aqData.so2 ?? 0,
      } : null;
      
      res.json({
        date: cache.date,
        weather: cache.weather_data,
        airQuality: flattenedAirQuality,
        location: { lat: cache.latitude, lon: cache.longitude },
        fetchedAt: cache.fetched_at,
      });
    } catch (error: any) {
      logger.error(`[Environmental] Error fetching today's data:`, error);
      res.status(500).json({ error: error.message || "Failed to fetch environmental data" });
    }
  });
  
  app.get("/api/environmental/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate query params required" });
      }
      
      const { getWeatherHistory } = await import('./services/supabaseHealthStorage');
      const history = await getWeatherHistory(userId, startDate as string, endDate as string);
      
      res.json({
        count: history.length,
        data: history.map(h => ({
          date: h.date,
          weather: h.weather_data,
          airQuality: h.air_quality_data,
          location: { lat: h.latitude, lon: h.longitude },
        })),
      });
    } catch (error: any) {
      logger.error(`[Environmental] Error fetching history:`, error);
      res.status(500).json({ error: error.message || "Failed to fetch environmental history" });
    }
  });

  // HealthKit Integration Routes
  
  // ============================================================================
  // HealthKit Sync Status - First sync should backfill ALL historical data
  // ============================================================================
  
  /**
   * GET /api/healthkit/sync-status
   * Returns whether the user needs to perform a full historical backfill.
   * 
   * iOS should call this on app launch to determine sync strategy:
   * - If needsHistoricalSync=true: Request ALL HealthKit data (2-3 years)
   * - If needsHistoricalSync=false: Only request data since lastSyncDate
   * 
   * Response: {
   *   backfillComplete: boolean,
   *   backfillDate: string | null,
   *   needsHistoricalSync: boolean,
   *   recommendedStartDate: string (ISO date - how far back to sync)
   * }
   */
  app.get("/api/healthkit/sync-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const { getHealthKitSyncStatus } = await import('./services/supabaseHealthStorage');
      const status = await getHealthKitSyncStatus(userId);
      
      // Recommend syncing 3 years of history for new users
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      
      res.json({
        backfillComplete: status.backfillComplete,
        backfillDate: status.backfillDate?.toISOString() || null,
        needsHistoricalSync: status.needsHistoricalSync,
        recommendedStartDate: status.needsHistoricalSync ? threeYearsAgo.toISOString() : null,
      });
      
      logger.info(`[HealthKit] Sync status for user ${userId}: backfillComplete=${status.backfillComplete}`);
    } catch (error: any) {
      logger.error(`[HealthKit] Error getting sync status:`, error);
      res.status(500).json({ error: error.message || "Failed to get sync status" });
    }
  });
  
  /**
   * POST /api/healthkit/mark-backfill-complete
   * Called by iOS after it has synced all historical HealthKit data.
   * After this, future syncs will be incremental only.
   * 
   * Request body: { sampleCount?: number, startDate?: string, endDate?: string }
   * Response: { success: true, backfillDate: string }
   */
  app.post("/api/healthkit/mark-backfill-complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { sampleCount, startDate, endDate } = req.body;
      
      // Validate optional metadata if provided
      const metadata = (sampleCount || startDate || endDate) ? {
        sampleCount: typeof sampleCount === 'number' ? sampleCount : undefined,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
      } : undefined;
      
      const { markHealthKitBackfillComplete, getHealthId } = await import('./services/supabaseHealthStorage');
      await markHealthKitBackfillComplete(userId, metadata);
      
      // Respond immediately so iOS doesn't wait
      res.json({
        success: true,
        backfillDate: new Date().toISOString(),
      });
      
      // Trigger full history sync to ClickHouse asynchronously (non-blocking)
      // This syncs ALL the historical data that was just uploaded
      setImmediate(async () => {
        try {
          const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
          const healthId = await getHealthId(userId);
          
          logger.info(`[ClickHouseML] Starting full history sync after backfill complete for user ${userId}`);
          const result = await clickhouseBaselineEngine.syncFullHistory(healthId);
          logger.info(`[ClickHouseML] Full history sync complete for ${userId}: ${result.total} records synced to ClickHouse`);
        } catch (syncError) {
          logger.error(`[ClickHouseML] Async full history sync failed for ${userId}:`, syncError);
        }
      });
    } catch (error: any) {
      logger.error(`[HealthKit] Error marking backfill complete:`, error);
      res.status(500).json({ error: error.message || "Failed to mark backfill complete" });
    }
  });
  
  // Batch upload HealthKit samples from iOS app
  app.post("/api/healthkit/samples", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { samples } = req.body;

      if (!samples || !Array.isArray(samples)) {
        return res.status(400).json({ error: "Samples array required" });
      }

      if (samples.length === 0) {
        return res.json({ inserted: 0, duplicates: 0 });
      }

      logger.info(`[HealthKit] Batch upload: ${samples.length} samples from user ${userId}`);

      // Import the health storage router for Supabase routing
      const { isSupabaseHealthEnabled, createHealthkitSamples } = await import('./services/healthStorageRouter');
      
      let inserted = 0;
      let duplicates = 0;

      // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
      if (!isSupabaseHealthEnabled()) {
        logger.error(`[HealthKit] Supabase health storage not enabled - cannot store health data`);
        return res.status(503).json({ error: "Health storage not available" });
      }
      
      try {
        const formattedSamples = samples.map(sample => ({
          data_type: sample.dataType,
          value: sample.value,
          unit: sample.unit,
          start_date: new Date(sample.startDate).toISOString(),
          end_date: new Date(sample.endDate).toISOString(),
          source_name: sample.sourceName || null,
          source_bundle_id: sample.sourceBundleId || null,
          device_name: sample.deviceName || null,
          device_manufacturer: sample.deviceManufacturer || null,
          device_model: sample.deviceModel || null,
          metadata: sample.metadata || null,
          uuid: sample.uuid || null,
        }));
        
        inserted = await createHealthkitSamples(userId, formattedSamples);
        duplicates = samples.length - inserted;
        logger.info(`[HealthKit] Supabase batch upload: ${inserted} inserted, ${duplicates} duplicates`);
      } catch (error: any) {
        logger.error(`[HealthKit] Supabase batch upload failed:`, error);
        return res.status(500).json({ error: "Failed to store health data" });
      }

      // Trigger aggregation for critical metrics (oxygen, respiratory, temp) from samples
      // This fills gaps for metrics iOS doesn't aggregate automatically
      if (inserted > 0) {
        try {
          // Get unique dates from samples to aggregate
          const uniqueDates = new Set<string>();
          for (const sample of samples) {
            const date = new Date(sample.startDate).toISOString().split('T')[0];
            uniqueDates.add(date);
          }
          
          // Aggregate for each date (non-blocking, run in background)
          const user = await storage.getUser(userId);
          if (user) {
            const timezone = user.timezone || 'Australia/Perth';
            const datesArray = Array.from(uniqueDates);
            for (let i = 0; i < datesArray.length; i++) {
              const date = datesArray[i];
              fillMissingMetricsFromSamples(userId, date, timezone).catch(err => {
                logger.error(`[HealthKit] Aggregation error for ${date}:`, err);
              });
            }
            logger.info(`[HealthKit] Triggered aggregation for ${datesArray.length} dates`);
          }
        } catch (aggError) {
          logger.error('[HealthKit] Failed to trigger aggregation:', aggError);
        }
      }

      // Process mindfulness sessions into dedicated tables
      const mindfulnessSamples = samples.filter(s => 
        s.dataType === 'mindfulSession' || 
        s.dataType === 'HKCategoryTypeIdentifierMindfulSession'
      );
      
      if (mindfulnessSamples.length > 0) {
        logger.info(`[HealthKit] Processing ${mindfulnessSamples.length} mindfulness sessions`);
        
        // Import mindfulness aggregator
        const { processMindfulnessSession } = await import('./services/nutritionMindfulnessAggregator');
        
        for (const sample of mindfulnessSamples) {
          try {
            await processMindfulnessSession(
              userId,
              new Date(sample.startDate),
              new Date(sample.endDate),
              sample.sourceName || null,
              sample.sourceBundleId || null,
              sample.uuid || null,
              { timezone: sample.metadata?.timezone || 'Australia/Perth' }
            );
          } catch (mindErr) {
            logger.error(`[HealthKit] Mindfulness processing error:`, mindErr);
          }
        }
        
        logger.info(`[HealthKit] Processed ${mindfulnessSamples.length} mindfulness sessions into dedicated tables`);
      }

      // Trigger ClickHouse ML Correlation Engine sync (non-blocking background task)
      if (inserted > 0) {
        (async () => {
          try {
            const { isClickHouseEnabled } = await import('./services/clickhouseService');
            if (isClickHouseEnabled()) {
              const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
              const { getHealthId } = await import('./services/supabaseHealthStorage');
              const healthId = await getHealthId(userId);
              
              // Sync recent health data to ClickHouse for ML analysis
              const syncedCount = await clickhouseBaselineEngine.syncHealthDataFromSupabase(healthId, 7);
              logger.info(`[ClickHouseML] Auto-synced ${syncedCount} metrics for ${userId} after samples ingestion`);
            }
          } catch (clickhouseError: any) {
            logger.warn(`[ClickHouseML] Background sync failed for ${userId}:`, clickhouseError.message);
          }
        })();
      }

      res.json({ 
        inserted,
        duplicates,
        total: samples.length
      });
    } catch (error: any) {
      logger.error("[HealthKit] Batch upload error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Backfill missing metrics from samples (for historical data)
  app.post("/api/healthkit/backfill-samples", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { days = 30 } = req.body;
      
      logger.info(`[HealthKit] Starting backfill for user ${userId}, last ${days} days`);
      
      // Run backfill asynchronously
      backfillMissingMetrics(userId, days).catch(err => {
        logger.error(`[HealthKit] Backfill error:`, err);
      });
      
      res.json({ 
        message: `Backfill started for last ${days} days`,
        status: 'processing'
      });
    } catch (error: any) {
      logger.error("[HealthKit] Backfill request error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Batch upload HealthKit workouts from iOS app
  app.post("/api/healthkit/workouts/sync", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { workouts } = req.body;

      if (!workouts || !Array.isArray(workouts)) {
        return res.status(400).json({ error: "Workouts array required" });
      }

      if (workouts.length === 0) {
        return res.json({ inserted: 0, duplicates: 0 });
      }

      logger.info(`[HealthKit] Workout batch upload: ${workouts.length} workouts from user ${userId}`);

      // Import the health storage router for Supabase routing
      const { isSupabaseHealthEnabled, createHealthkitWorkouts } = await import('./services/healthStorageRouter');

      let inserted = 0;
      let duplicates = 0;

      let supabaseSuccess = false;
      
      if (isSupabaseHealthEnabled()) {
        // Route to Supabase - batch insert with deduplication
        try {
          const formattedWorkouts = workouts.map(workout => ({
            workout_type: workout.workoutType,
            start_date: new Date(workout.startDate).toISOString(),
            end_date: new Date(workout.endDate).toISOString(),
            duration: workout.duration,
            total_distance: workout.totalDistance || null,
            total_distance_unit: workout.totalDistanceUnit || null,
            total_energy_burned: workout.totalEnergyBurned || null,
            total_energy_burned_unit: workout.totalEnergyBurnedUnit || null,
            average_heart_rate: workout.averageHeartRate || null,
            max_heart_rate: workout.maxHeartRate || null,
            min_heart_rate: workout.minHeartRate || null,
            source_name: workout.sourceName || null,
            source_bundle_id: workout.sourceBundleId || null,
            device_name: workout.deviceName || null,
            device_manufacturer: workout.deviceManufacturer || null,
            device_model: workout.deviceModel || null,
            metadata: workout.metadata || null,
            uuid: workout.uuid || null,
          }));
          
          inserted = await createHealthkitWorkouts(userId, formattedWorkouts);
          duplicates = workouts.length - inserted;
          supabaseSuccess = true; // Mark as success even if all were duplicates
          logger.info(`[HealthKit] Supabase workout upload: ${inserted} inserted, ${duplicates} duplicates`);
        } catch (error: any) {
          logger.error(`[HealthKit] Supabase workout upload failed, falling back to Neon:`, error);
          supabaseSuccess = false;
        }
      }
      
      // SUPABASE-ONLY: Health data must go to Supabase for privacy/security
      // Return 503 if Supabase not enabled - do not fall back to Neon
      if (!isSupabaseHealthEnabled()) {
        logger.error(`[HealthKit] Supabase health storage not enabled - cannot store health data`);
        return res.status(503).json({ error: "Health storage not available" });
      }
      
      // If Supabase failed (not just duplicates), return error
      if (!supabaseSuccess) {
        logger.error(`[HealthKit] Supabase workout upload failed`);
        return res.status(500).json({ error: "Failed to store workout data" });
      }

      res.json({ 
        inserted,
        duplicates,
        total: workouts.length
      });
    } catch (error: any) {
      logger.error("[HealthKit] Workout batch upload error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get latest HealthKit samples for a user (optional: filtered by dataType)
  app.get("/api/healthkit/samples", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { dataType, limit = 100 } = req.query;

      const samples = await healthRouter.getHealthkitSamples(userId, {
        dataTypes: dataType ? [dataType as string] : undefined,
        limit: Math.min(parseInt(limit as string) || 100, 1000),
      });

      res.json({ samples });
    } catch (error: any) {
      logger.error("[HealthKit] Get samples error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Ingest normalized daily metrics from iOS
  app.post("/api/healthkit/daily-metrics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dailyMetrics = req.body;

      // PRODUCTION DEBUG: Log raw request body first
      console.log('📥 [BODY COMP DEBUG] Raw req.body:', JSON.stringify({
        weightKg: req.body.weightKg,
        bodyFatPercent: req.body.bodyFatPercent,
        leanBodyMassKg: req.body.leanBodyMassKg,
        bmi: req.body.bmi,
        waistCircumferenceCm: req.body.waistCircumferenceCm,
        localDate: req.body.localDate,
      }, null, 2));

      // Extract ALL extended health metrics from iOS (now in schema)
      // Note: iOS sends camelCase field names that may differ from backend naming
      const extendedMetrics = {
        weightKg: dailyMetrics.weightKg ?? null,
        heightCm: dailyMetrics.heightCm ?? null,
        bmi: dailyMetrics.bmi ?? null,
        bodyFatPercent: dailyMetrics.bodyFatPercent ?? null,
        leanBodyMassKg: dailyMetrics.leanBodyMassKg ?? null,
        waistCircumferenceCm: dailyMetrics.waistCircumferenceCm ?? null,
        distanceMeters: dailyMetrics.distanceMeters ?? null,
        flightsClimbed: dailyMetrics.flightsClimbed ?? null,
        standHours: dailyMetrics.standHours ?? null,
        avgHeartRateBpm: dailyMetrics.avgHeartRateBpm ?? null,
        systolicBp: dailyMetrics.systolicBp ?? null,
        diastolicBp: dailyMetrics.diastolicBp ?? null,
        bloodGlucoseMgDl: dailyMetrics.bloodGlucoseMgDl ?? null,
        vo2Max: dailyMetrics.vo2Max ?? null,
        // Extended vital signs - iOS sends walkingHeartRateAvg, oxygenSaturation, etc.
        basalEnergyKcal: dailyMetrics.basalEnergyKcal ?? null,
        walkingHrAvgBpm: dailyMetrics.walkingHeartRateAvg ?? dailyMetrics.walkingHrAvgBpm ?? null,
        dietaryWaterMl: dailyMetrics.dietaryWaterMl ?? null,
        oxygenSaturationPct: dailyMetrics.oxygenSaturation ?? dailyMetrics.oxygenSaturationPct ?? null,
        respiratoryRateBpm: dailyMetrics.respiratoryRate ?? dailyMetrics.respiratoryRateBpm ?? null,
        bodyTempC: dailyMetrics.bodyTemperatureCelsius ?? dailyMetrics.bodyTempC ?? null,
      };
      
      // PRODUCTION DEBUG: Log ALL extended metrics to verify iOS is sending them
      console.log('📊 [HEALTHKIT DEBUG] Extended metrics from iOS:', JSON.stringify(extendedMetrics, null, 2));

      // Log extended metrics for debugging
      logger.debug('[HealthKit] Extended metrics received', { extendedMetrics });

      // Validate input (this will strip body comp fields, which is why we extracted them above)
      const validationResult = insertUserDailyMetricsSchema.safeParse({
        ...dailyMetrics,
        userId,
      });

      if (!validationResult.success) {
        logger.error("[HealthKit] Daily metrics validation failed:", fromError(validationResult.error).toString());
        return res.status(400).json({ 
          error: "Invalid daily metrics data",
          details: fromError(validationResult.error).toString()
        });
      }

      const metrics = validationResult.data;

      logger.info(`[HealthKit] Ingesting daily metrics for user ${userId}, date ${metrics.localDate}`);
      logger.debug(`[HealthKit] Received metrics: ${JSON.stringify(metrics, null, 2)}`);

      // Combine validated metrics with extended health fields for Flomentum calculation
      const fullMetrics = {
        ...metrics,
        weightKg: extendedMetrics.weightKg,
        heightCm: extendedMetrics.heightCm,
        bmi: extendedMetrics.bmi,
        bodyFatPercent: extendedMetrics.bodyFatPercent,
        leanBodyMassKg: extendedMetrics.leanBodyMassKg,
        waistCircumferenceCm: extendedMetrics.waistCircumferenceCm,
        distanceMeters: extendedMetrics.distanceMeters,
        flightsClimbed: extendedMetrics.flightsClimbed,
        standHours: extendedMetrics.standHours,
        avgHeartRateBpm: extendedMetrics.avgHeartRateBpm,
        systolicBp: extendedMetrics.systolicBp,
        diastolicBp: extendedMetrics.diastolicBp,
        bloodGlucoseMgDl: extendedMetrics.bloodGlucoseMgDl,
        vo2Max: extendedMetrics.vo2Max,
        basalEnergyKcal: extendedMetrics.basalEnergyKcal,
        walkingHrAvgBpm: extendedMetrics.walkingHrAvgBpm,
        dietaryWaterMl: extendedMetrics.dietaryWaterMl,
        oxygenSaturationPct: extendedMetrics.oxygenSaturationPct,
        respiratoryRateBpm: extendedMetrics.respiratoryRateBpm,
      };

      // SUPABASE-ONLY: All health data writes go to Supabase exclusively
      const { isSupabaseHealthEnabled, upsertDailyMetrics: upsertSupabaseDailyMetrics } = await import('./services/healthStorageRouter');
      
      if (!isSupabaseHealthEnabled()) {
        return res.status(503).json({ error: "Health data storage not available - Supabase not enabled" });
      }

      // Convert to Supabase snake_case format
      const supabaseMetrics = {
        local_date: metrics.localDate,
        timezone: metrics.timezone,
        utc_day_start: metrics.utcDayStart,
        utc_day_end: metrics.utcDayEnd,
        steps_normalized: metrics.stepsNormalized,
        steps_raw_sum: metrics.stepsRawSum,
        steps_sources: metrics.stepsSources,
        active_energy_kcal: metrics.activeEnergyKcal,
        exercise_minutes: metrics.exerciseMinutes,
        sleep_hours: metrics.sleepHours,
        resting_hr_bpm: metrics.restingHrBpm,
        hrv_ms: metrics.hrvMs,
        weight_kg: extendedMetrics.weightKg,
        height_cm: extendedMetrics.heightCm,
        bmi: extendedMetrics.bmi,
        body_fat_percent: extendedMetrics.bodyFatPercent,
        lean_body_mass_kg: extendedMetrics.leanBodyMassKg,
        waist_circumference_cm: extendedMetrics.waistCircumferenceCm,
        distance_meters: extendedMetrics.distanceMeters,
        flights_climbed: extendedMetrics.flightsClimbed,
        stand_hours: extendedMetrics.standHours,
        avg_heart_rate_bpm: extendedMetrics.avgHeartRateBpm,
        systolic_bp: extendedMetrics.systolicBp,
        diastolic_bp: extendedMetrics.diastolicBp,
        blood_glucose_mg_dl: extendedMetrics.bloodGlucoseMgDl,
        vo2_max: extendedMetrics.vo2Max,
        basal_energy_kcal: extendedMetrics.basalEnergyKcal,
        walking_hr_avg_bpm: extendedMetrics.walkingHrAvgBpm,
        dietary_water_ml: extendedMetrics.dietaryWaterMl,
        oxygen_saturation_pct: extendedMetrics.oxygenSaturationPct,
        respiratory_rate_bpm: extendedMetrics.respiratoryRateBpm,
        body_temp_c: extendedMetrics.bodyTempC,
        normalization_version: 'norm_v1',
      };
      
      console.log('📤 [SUPABASE] Writing daily metrics to Supabase:', JSON.stringify(supabaseMetrics, null, 2));
      await upsertSupabaseDailyMetrics(userId, supabaseMetrics);
      logger.info(`[HealthKit] Stored daily metrics in Supabase for ${userId}, ${metrics.localDate}`);

      // Trigger ClickHouse ML Correlation Engine sync (non-blocking background task)
      (async () => {
        try {
          const { isClickHouseEnabled } = await import('./services/clickhouseService');
          if (isClickHouseEnabled()) {
            const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
            const { getHealthId } = await import('./services/supabaseHealthStorage');
            const healthId = await getHealthId(userId);
            
            // Sync recent health data to ClickHouse for ML analysis (last 7 days for real-time patterns)
            const syncedCount = await clickhouseBaselineEngine.syncHealthDataFromSupabase(healthId, 7);
            logger.info(`[ClickHouseML] Auto-synced ${syncedCount} metrics for ${userId} after HealthKit ingestion`);
            
            // Only run anomaly detection once per 6 hours per user to prevent spam
            if (shouldRunAnomalyDetection(userId)) {
              clickhouseBaselineEngine.detectAnomalies(healthId, { windowDays: 7 }).then(anomalies => {
                if (anomalies.length > 0) {
                  logger.info(`[ClickHouseML] Detected ${anomalies.length} anomalies for ${userId}:`, 
                    anomalies.map(a => `${a.metricType}: ${a.severity}`).join(', '));
                }
              }).catch(err => {
                logger.warn(`[ClickHouseML] Anomaly detection failed for ${userId}:`, err.message);
              });
            }
          }
        } catch (clickhouseError: any) {
          logger.warn(`[ClickHouseML] Background sync failed for ${userId}:`, clickhouseError.message);
        }
      })();

      // Calculate Flōmentum score after storing metrics
      try {
        const { calculateFlomentumBaselines } = await import("./services/flomentumBaselineCalculator");
        const baselines = await calculateFlomentumBaselines(userId, metrics.localDate);

        // Get user settings
        const [userSettings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
        
        if (userSettings && userSettings.flomentumEnabled) {
          const { calculateFlomentumScore } = await import("./services/flomentumScoringEngine");
          
          // Query sleep data from sleep_nights table via storage layer (more reliable than sleepHours from iOS)
          // sleepHours only captures "in bed" samples, but sleep_nights processes all sleep stages
          const sleepNight = await healthRouter.getSleepNightByDate(userId, metrics.localDate);
          
          // Map userDailyMetrics fields to Flōmentum metrics
          // Note: userDailyMetrics has limited fields, so some will be null
          // IMPORTANT: Use stepsRawSum for actual step count, not stepsNormalized (which is 0-1 score)
          const flomentumMetrics: any = {
            sleepTotalMinutes: sleepNight?.totalSleepMin ?? null, // Query from sleep_nights instead of metrics.sleepHours
            hrvSdnnMs: metrics.hrvMs ?? null,
            restingHr: metrics.restingHrBpm ?? null,
            respiratoryRate: null, // Not available in userDailyMetrics
            bodyTempDeviationC: null, // Not available in userDailyMetrics
            oxygenSaturationAvg: null, // Not available in userDailyMetrics
            steps: metrics.stepsRawSum ?? metrics.stepsNormalized ?? null, // Use raw sum, fallback to normalized
            activeKcal: metrics.activeEnergyKcal ?? null,
            exerciseMinutes: metrics.exerciseMinutes ?? null, // Now available from iOS HealthKit
            standHours: fullMetrics.standHours ?? null, // Now available from iOS HealthKit
          };

          const context: any = {
            stepsTarget: userSettings.stepsTarget,
            sleepTargetMinutes: userSettings.sleepTargetMinutes,
            restingHrBaseline: baselines.restingHrBaseline,
            hrvBaseline: baselines.hrvBaseline,
            respRateBaseline: baselines.respRateBaseline,
          };

          const scoreResult = calculateFlomentumScore(flomentumMetrics, context);

          // Store the daily Flōmentum score via healthRouter to Supabase
          await healthRouter.upsertFlomentumDaily(userId, {
            date: metrics.localDate,
            userId,
            score: scoreResult.score,
            zone: scoreResult.zone,
            factors: scoreResult.factors,
            dailyFocus: scoreResult.dailyFocus,
          });

          logger.info(`[Flōmentum] Score calculated for ${userId}, ${metrics.localDate}: ${scoreResult.score} (${scoreResult.zone})`);
          
          res.json({ 
            status: "upserted", 
            date: metrics.localDate,
            flomentumScore: scoreResult.score,
            flomentumZone: scoreResult.zone,
          });
        } else {
          res.json({ status: "upserted", date: metrics.localDate });
        }
      } catch (flomentumError: any) {
        logger.error(`[Flōmentum] Error calculating score for ${userId}, ${metrics.localDate}:`, flomentumError);
        // Return success for metrics storage even if Flōmentum fails
        res.json({ status: "upserted", date: metrics.localDate });
      }
    } catch (error: any) {
      logger.error("[HealthKit] Daily metrics ingestion error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Readiness Score Routes
  // Get today's readiness score (compute if needed)
  app.get("/api/readiness/today", isAuthenticated, async (req: any, res) => {
    try {
      // CRITICAL: Prevent iOS overnight caching - force fresh data after HealthKit sync
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const userId = req.user.claims.sub;
      
      // TIMEZONE FIX: Get today's date in user's timezone, not UTC
      // Query the user's most recent daily metric to get their timezone via healthRouter (Supabase)
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const recentMetric = recentMetrics.length > 0 ? recentMetrics[0] : null;
      
      const userTimezone = recentMetric?.timezone || 'UTC';
      
      // Calculate today's date in the user's timezone
      const today = new Date().toLocaleString('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split(',')[0]; // Format: YYYY-MM-DD
      
      logger.info(`[Readiness] Querying for date ${today} in timezone ${userTimezone}`);

      // Check if already computed
      const existing = await db
        .select()
        .from(userDailyReadiness)
        .where(
          and(
            eq(userDailyReadiness.userId, userId),
            eq(userDailyReadiness.date, today)
          )
        )
        .limit(1);

      // Fetch today's metrics for freshness check and display data via healthRouter (Supabase)
      const todayMetricsRecord = await healthRouter.getUserDailyMetricsByDate(userId, today);
      const todayMetricsData = todayMetricsRecord ? [todayMetricsRecord] : [];

      // CRITICAL GUARD: Can only return cached readiness if both exist AND metrics are fresh
      if (existing.length > 0 && todayMetricsData.length > 0) {
        const dbRecord = existing[0];
        const metricsUpdatedAt = todayMetricsData[0].updatedAt;
        const readinessCreatedAt = dbRecord.createdAt;
        
        // Check if metrics were updated AFTER readiness was calculated
        const metricsAreStale = metricsUpdatedAt && readinessCreatedAt && 
                                metricsUpdatedAt > readinessCreatedAt;
        
        if (!metricsAreStale) {
          // SAFE PATH: Cached readiness is fresh, metrics exist
          logger.info(`[Readiness] Returning cached readiness for user ${userId}, ${today}`);
          
          // Fetch yesterday's metrics for Activity Load context via healthRouter (Supabase)
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          
          const yesterdayMetricsRecord = await healthRouter.getUserDailyMetricsByDate(userId, yesterdayStr);
          const yesterdayMetricsData = yesterdayMetricsRecord ? [{ activeEnergyKcal: yesterdayMetricsRecord.activeEnergyKcal }] : [];
          
          const displayMetrics = {
            avgSleepHours: todayMetricsData[0].sleepHours ?? undefined,
            avgHRV: todayMetricsData[0].hrvMs ?? undefined,
            stepCount: todayMetricsData[0].stepsNormalized ?? undefined,
            // Include yesterday's active energy for Activity Load context
            yesterdayActiveKcal: yesterdayMetricsData.length > 0 ? yesterdayMetricsData[0].activeEnergyKcal ?? undefined : undefined,
          };

          return res.json({
            readinessScore: dbRecord.readinessScore,
            readinessBucket: dbRecord.readinessBucket,
            sleepScore: dbRecord.sleepScore,
            recoveryScore: dbRecord.recoveryScore,
            loadScore: dbRecord.loadScore,
            trendScore: dbRecord.trendScore,
            isCalibrating: dbRecord.isCalibrating,
            explanations: dbRecord.notesJson || {
              summary: "No data available",
              sleep: "No sleep data",
              recovery: "No recovery data",
              load: "No activity data",
              trend: "No trend data"
            },
            metrics: displayMetrics,
            keyFactors: [], // TODO: Store and retrieve keyFactors from DB
            timestamp: dbRecord.createdAt?.toISOString() || new Date().toISOString(),
          });
        } else {
          logger.info(`[Readiness] Cached readiness is stale (metrics updated at ${metricsUpdatedAt}, readiness at ${readinessCreatedAt}). Recomputing...`);
        }
      } else if (existing.length > 0) {
        logger.info(`[Readiness] Cached readiness exists but no metrics row found. Recomputing...`);
      }
      
      // Fall through to recompute readiness if:
      // - No cached readiness exists
      // - Cached readiness exists but metrics are stale
      // - Cached readiness exists but no metrics row (being re-synced)

      // Compute readiness (baselines are updated daily at 3AM by scheduler)
      const readiness = await computeDailyReadiness(userId, today);

      if (!readiness) {
        // CONSERVATIVE DELETE: Only delete cached readiness if we're certain metrics are permanently missing
        // Don't delete on transient errors while metrics still exist
        if (existing.length > 0 && todayMetricsData.length === 0) {
          // Double-check: metrics truly absent after recompute attempt
          logger.warn(`[Readiness] Failed to recompute readiness for user ${userId}, ${today} (no metrics available). Deleting stale cached record.`);
          await db
            .delete(userDailyReadiness)
            .where(
              and(
                eq(userDailyReadiness.userId, userId),
                eq(userDailyReadiness.date, today)
              )
            );
        } else if (existing.length > 0) {
          // Keep cached readiness - either metrics exist or this is a transient failure
          logger.warn(`[Readiness] Recompute failed for user ${userId}, ${today}. Keeping cached readiness to avoid data loss.`);
        }
        
        return res.status(404).json({ 
          error: "No data available to compute readiness",
          message: "Please ensure you have synced HealthKit data for today."
        });
      }

      // Store or update the computed readiness (only if computation succeeded)
      if (existing.length > 0) {
        // Update existing stale readiness
        await db
          .update(userDailyReadiness)
          .set({
            readinessScore: readiness.readinessScore,
            readinessBucket: readiness.readinessBucket,
            sleepScore: readiness.sleepScore,
            recoveryScore: readiness.recoveryScore,
            loadScore: readiness.loadScore,
            trendScore: readiness.trendScore,
            isCalibrating: readiness.isCalibrating,
            notesJson: readiness.explanations,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userDailyReadiness.userId, userId),
              eq(userDailyReadiness.date, today)
            )
          );
        logger.info(`[Readiness] Updated stale readiness for user ${userId}, ${today}: ${readiness.readinessScore}`);
      } else {
        // Insert new readiness
        await db.insert(userDailyReadiness).values({
          userId: readiness.userId,
          date: readiness.date,
          readinessScore: readiness.readinessScore,
          readinessBucket: readiness.readinessBucket,
          sleepScore: readiness.sleepScore,
          recoveryScore: readiness.recoveryScore,
          loadScore: readiness.loadScore,
          trendScore: readiness.trendScore,
          isCalibrating: readiness.isCalibrating,
          notesJson: readiness.explanations,
        });
        logger.info(`[Readiness] Computed and stored new readiness for user ${userId}, ${today}: ${readiness.readinessScore}`);
      }

      // Trigger ClickHouse readiness + training load sync (non-blocking background task)
      (async () => {
        try {
          const { isClickHouseEnabled } = await import('./services/clickhouseService');
          if (isClickHouseEnabled()) {
            const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
            const { getHealthId } = await import('./services/supabaseHealthStorage');
            const healthId = await getHealthId(userId);
            
            // Sync readiness and training load together
            const [readinessCount, loadCount] = await Promise.all([
              clickhouseBaselineEngine.syncReadinessScores(healthId, 7),
              clickhouseBaselineEngine.syncTrainingLoad(healthId, 7),
            ]);
            logger.info(`[ClickHouseML] Auto-synced ${readinessCount} readiness, ${loadCount} training load for ${userId}`);
          }
        } catch (clickhouseError: any) {
          logger.warn(`[ClickHouseML] Readiness sync failed for ${userId}:`, clickhouseError.message);
        }
      })();

      res.json(readiness);
    } catch (error: any) {
      logger.error("[Readiness] Error getting today's readiness:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get historical readiness scores
  app.get("/api/readiness/history", isAuthenticated, async (req: any, res) => {
    try {
      // CRITICAL: Prevent iOS overnight caching - force fresh data after HealthKit sync
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const userId = req.user.claims.sub;
      const { days = 30 } = req.query;
      const daysNum = Math.min(parseInt(days as string) || 30, 90);

      const history = await db
        .select()
        .from(userDailyReadiness)
        .where(eq(userDailyReadiness.userId, userId))
        .orderBy(desc(userDailyReadiness.date))
        .limit(daysNum);

      res.json({ history });
    } catch (error: any) {
      logger.error("[Readiness] Error getting history:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Sleep Night Data Upload (from iOS)
  // Receive comprehensive sleep night data from iOS sleep processor
  app.post("/api/sleep/nights", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sleepNightData = req.body;

      logger.info(`[Sleep] Received sleep night data for ${userId}, date: ${sleepNightData.sleepDate}`);

      // Validate required fields
      if (!sleepNightData.sleepDate || !sleepNightData.totalSleepMin) {
        return res.status(400).json({ error: "Missing required sleep data" });
      }

      // Check if updating or creating
      const existing = await healthRouter.getSleepNightByDate(userId, sleepNightData.sleepDate);

      // Use storage layer for upsert (routes to Supabase when enabled)
      await healthRouter.upsertSleepNight(userId, {
        userId,
        sleepDate: sleepNightData.sleepDate,
        timezone: sleepNightData.timezone,
        nightStart: sleepNightData.nightStart ? new Date(sleepNightData.nightStart) : null,
        finalWake: sleepNightData.finalWake ? new Date(sleepNightData.finalWake) : null,
        sleepOnset: sleepNightData.sleepOnset ? new Date(sleepNightData.sleepOnset) : null,
        timeInBedMin: sleepNightData.timeInBedMin,
        totalSleepMin: sleepNightData.totalSleepMin,
        sleepEfficiencyPct: sleepNightData.sleepEfficiencyPct,
        sleepLatencyMin: sleepNightData.sleepLatencyMin,
        wasoMin: sleepNightData.wasoMin,
        numAwakenings: sleepNightData.numAwakenings,
        coreSleepMin: sleepNightData.coreSleepMin,
        deepSleepMin: sleepNightData.deepSleepMin,
        remSleepMin: sleepNightData.remSleepMin,
        unspecifiedSleepMin: sleepNightData.unspecifiedSleepMin,
        awakeInBedMin: sleepNightData.awakeInBedMin,
        midSleepTimeLocal: sleepNightData.midSleepTimeLocal,
        fragmentationIndex: sleepNightData.fragmentationIndex,
        deepPct: sleepNightData.deepPct,
        remPct: sleepNightData.remPct,
        corePct: sleepNightData.corePct,
        bedtimeLocal: sleepNightData.bedtimeLocal,
        waketimeLocal: sleepNightData.waketimeLocal,
        restingHrBpm: sleepNightData.restingHrBpm,
        hrvMs: sleepNightData.hrvMs,
        respiratoryRate: sleepNightData.respiratoryRate,
        wristTemperature: sleepNightData.wristTemperature,
        oxygenSaturation: sleepNightData.oxygenSaturation,
      });

      const status = existing ? "updated" : "created";
      logger.info(`[Sleep] ${status} sleep night for ${userId}, ${sleepNightData.sleepDate}`);
      return res.json({ status, sleepDate: sleepNightData.sleepDate });
    } catch (error: any) {
      logger.error("[Sleep] Error uploading sleep night data:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // NEW: Process raw sleep samples from iOS (backend processing)
  app.post("/api/healthkit/sleep-samples", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Zod validation schema for raw sleep samples
      const rawSleepSamplesSchema = z.object({
        samples: z.array(z.object({
          start: z.string(), // ISO 8601 UTC timestamp
          end: z.string(), // ISO 8601 UTC timestamp
          stage: z.enum(['inBed', 'asleep', 'awake', 'core', 'deep', 'rem', 'unspecified']),
          source: z.string()
        })),
        sleepDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
        timezone: z.string() // IANA timezone identifier
      });

      // Validate request body
      const validationResult = rawSleepSamplesSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        logger.error('[Sleep] Validation error', { error: validationError });
        return res.status(400).json({ 
          error: "Invalid request body",
          details: validationError.toString()
        });
      }

      const { samples, sleepDate, timezone } = validationResult.data;

      logger.info(`[Sleep] Processing ${samples.length} raw sleep samples for ${userId}, ${sleepDate}`);

      // Import the sleep processor
      const { processSleepSamples } = await import('./services/sleepSampleProcessor');

      // Process samples on backend
      const sleepNight = await processSleepSamples(samples, sleepDate, timezone);

      if (!sleepNight) {
        logger.info(`[Sleep] Insufficient data to create sleep night for ${sleepDate} (below 3h minimum or no valid samples)`);
        return res.status(204).send(); // No content - not an error, just insufficient data
      }

      // Use storage layer for upsert (routes to Supabase when enabled)
      await healthRouter.upsertSleepNight(userId, {
        userId,
        sleepDate: sleepNight.sleepDate,
        timezone: sleepNight.timezone,
        nightStart: sleepNight.nightStart,
        finalWake: sleepNight.finalWake,
        sleepOnset: sleepNight.sleepOnset,
        timeInBedMin: sleepNight.timeInBedMin,
        totalSleepMin: sleepNight.totalSleepMin,
        sleepEfficiencyPct: sleepNight.sleepEfficiencyPct,
        sleepLatencyMin: sleepNight.sleepLatencyMin,
        wasoMin: sleepNight.wasoMin,
        numAwakenings: sleepNight.numAwakenings,
        coreSleepMin: sleepNight.coreSleepMin,
        deepSleepMin: sleepNight.deepSleepMin,
        remSleepMin: sleepNight.remSleepMin,
        unspecifiedSleepMin: sleepNight.unspecifiedSleepMin,
        awakeInBedMin: sleepNight.awakeInBedMin,
        midSleepTimeLocal: sleepNight.midSleepTimeLocal,
        fragmentationIndex: sleepNight.fragmentationIndex,
        deepPct: sleepNight.deepPct,
        remPct: sleepNight.remPct,
        corePct: sleepNight.corePct,
        bedtimeLocal: sleepNight.bedtimeLocal,
        waketimeLocal: sleepNight.waketimeLocal,
        restingHrBpm: null,
        hrvMs: null,
        respiratoryRate: null,
        wristTemperature: null,
        oxygenSaturation: null,
      });

      logger.info(`[Sleep] Saved sleep night from raw samples: ${userId}, ${sleepDate}`);

      // Recalculate Flōmentum score now that sleep data is available
      // This ensures the score includes sleep metrics even though they arrive after daily metrics
      try {
        const [userSettings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
        
        if (userSettings && userSettings.flomentumEnabled) {
          const { calculateFlomentumScore } = await import("./services/flomentumScoringEngine");
          const { calculateFlomentumBaselines } = await import("./services/flomentumBaselineCalculator");
          
          // Get daily metrics for this date via healthRouter (Supabase)
          const dailyMetrics = await healthRouter.getUserDailyMetricsByDate(userId, sleepDate);
          
          if (dailyMetrics) {
            const baselines = await calculateFlomentumBaselines(userId, sleepDate);
            
            const flomentumMetrics: any = {
              sleepTotalMinutes: sleepNight.totalSleepMin, // Now we have sleep data!
              hrvSdnnMs: dailyMetrics.hrvMs ?? null,
              restingHr: dailyMetrics.restingHrBpm ?? null,
              respiratoryRate: null,
              bodyTempDeviationC: null,
              oxygenSaturationAvg: null,
              steps: dailyMetrics.stepsRawSum ?? dailyMetrics.stepsNormalized ?? null,
              activeKcal: dailyMetrics.activeEnergyKcal ?? null,
              exerciseMinutes: dailyMetrics.exerciseMinutes ?? null,
              standHours: null,
            };

            const context: any = {
              stepsTarget: userSettings.stepsTarget,
              sleepTargetMinutes: userSettings.sleepTargetMinutes,
              restingHrBaseline: baselines.restingHrBaseline,
              hrvBaseline: baselines.hrvBaseline,
              respRateBaseline: baselines.respRateBaseline,
            };

            const scoreResult = calculateFlomentumScore(flomentumMetrics, context);

            // Update the daily Flōmentum score with sleep data included via healthRouter to Supabase
            await healthRouter.upsertFlomentumDaily(userId, {
              date: sleepDate,
              userId,
              score: scoreResult.score,
              zone: scoreResult.zone,
              factors: scoreResult.factors,
              dailyFocus: scoreResult.dailyFocus,
            });

            logger.info(`[Flōmentum] Score recalculated with sleep data for ${userId}, ${sleepDate}: ${scoreResult.score} (${scoreResult.zone})`);
          }
        }
      } catch (flomentumError: any) {
        logger.error(`[Flōmentum] Error recalculating score after sleep upload for ${userId}, ${sleepDate}:`, flomentumError);
        // Don't fail the sleep upload if Flōmentum fails
      }

      // Trigger morning briefing generation after sleep data is available
      // This runs asynchronously in the background to not block the response
      (async () => {
        try {
          const { generateBriefingForUser } = await import('./services/morningBriefingOrchestrator');
          await generateBriefingForUser(userId, sleepDate, 'sleep_end');
        } catch (briefingError: any) {
          logger.error(`[MorningBriefing] Error generating briefing for ${userId}:`, briefingError);
        }
      })();

      return res.json({ status: "upserted", sleepDate });
    } catch (error: any) {
      logger.error("[Sleep] Error processing raw sleep samples:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Nutrition Routes
  // ============================================

  // Track users who have already had backfill triggered (in-memory, resets on server restart)
  const nutritionBackfillTriggered = new Set<string>();

  // Get nutrition daily metrics for a user - uses healthStorageRouter for dual-database support
  // AUTO-BACKFILL: If no aggregated data exists but raw samples do, triggers backfill automatically
  app.get("/api/nutrition/daily", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate, limit } = req.query;

      const options: { startDate?: Date; endDate?: Date; limit?: number } = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);
      if (limit) options.limit = Number(limit);
      
      const records = await healthRouter.getNutritionDailyMetrics(userId, options);
      
      // AUTO-BACKFILL: Check if user needs backfill (no aggregated data, never triggered before)
      if (records.length === 0 && !nutritionBackfillTriggered.has(userId)) {
        nutritionBackfillTriggered.add(userId);
        
        // Check if user has raw nutrition samples in Supabase
        const { getSupabaseClient } = await import('./services/supabaseHealthStorage');
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data: samples } = await supabase
            .from('healthkit_samples')
            .select('id')
            .eq('user_id', userId)
            .ilike('sample_type', '%Dietary%')
            .limit(1);
          
          if (samples && samples.length > 0) {
            // User has raw samples but no aggregated data - trigger backfill
            logger.info(`[Nutrition] Auto-triggering backfill for ${userId} (has samples but no aggregates)`);
            
            // Get user timezone - prefer profile timezone, fallback to Australia/Perth for Australian users
            const profile = await storage.getProfile(userId);
            const timezone = profile?.timezone || 'Australia/Perth';
            
            // Run backfill in background (don't await)
            (async () => {
              try {
                const { TZDate } = await import('@date-fns/tz');
                const now = new Date();
                
                for (let i = 0; i < 90; i++) {
                  // Calculate the local date in user's timezone, not UTC
                  const targetDate = new Date(now);
                  targetDate.setDate(targetDate.getDate() - i);
                  // Convert to user's timezone and extract local date
                  const tzDate = new TZDate(targetDate, timezone);
                  const localDate = tzDate.toISOString().split('T')[0];
                  await upsertNutritionDaily(userId, localDate, timezone);
                }
                logger.info(`[Nutrition] Auto-backfill complete for ${userId} using timezone ${timezone}`);
              } catch (err) {
                logger.error(`[Nutrition] Auto-backfill error for ${userId}:`, err);
              }
            })();
          }
        }
      }
      
      return res.json(records);
    } catch (error: any) {
      logger.error("[Nutrition] Error fetching daily metrics:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get nutrition summary (averages over date range)
  app.get("/api/nutrition/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const summary = await getNutritionSummary(userId, startDate as string, endDate as string);
      return res.json(summary);
    } catch (error: any) {
      logger.error("[Nutrition] Error getting summary:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Trigger nutrition aggregation for a date (called by iOS after uploading samples)
  app.post("/api/nutrition/aggregate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { localDate, timezone } = req.body;
      
      if (!localDate || !timezone) {
        return res.status(400).json({ error: "localDate and timezone are required" });
      }

      await upsertNutritionDaily(userId, localDate, timezone);
      
      logger.info(`[Nutrition] Aggregated for ${userId} on ${localDate}`);

      // Trigger ClickHouse nutrition sync (non-blocking background task)
      (async () => {
        try {
          const { isClickHouseEnabled } = await import('./services/clickhouseService');
          if (isClickHouseEnabled()) {
            const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
            const { getHealthId } = await import('./services/supabaseHealthStorage');
            const healthId = await getHealthId(userId);
            
            // Sync nutrition data to ClickHouse for ML analysis
            const syncedCount = await clickhouseBaselineEngine.syncNutritionData(healthId, 7);
            logger.info(`[ClickHouseML] Auto-synced ${syncedCount} nutrition records for ${userId}`);
          }
        } catch (clickhouseError: any) {
          logger.warn(`[ClickHouseML] Nutrition sync failed for ${userId}:`, clickhouseError.message);
        }
      })();

      return res.json({ status: "ok", localDate });
    } catch (error: any) {
      logger.error("[Nutrition] Error aggregating:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Backfill nutrition aggregation for multiple days (re-aggregate from HealthKit samples)
  app.post("/api/nutrition/backfill", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { days = 90, timezone } = req.body;
      
      if (!timezone) {
        return res.status(400).json({ error: "timezone is required" });
      }

      const daysToProcess = Math.min(Number(days), 365);
      logger.info(`[Nutrition] Starting backfill for user ${userId}, last ${daysToProcess} days`);

      // Run backfill asynchronously so we don't timeout
      (async () => {
        try {
          const { TZDate } = await import('@date-fns/tz');
          let processed = 0;
          const now = new Date();
          
          for (let i = 0; i < daysToProcess; i++) {
            const targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() - i);
            // Convert to user's timezone and extract local date
            const tzDate = new TZDate(targetDate, timezone);
            const localDate = tzDate.toISOString().split('T')[0];
            
            await upsertNutritionDaily(userId, localDate, timezone);
            processed++;
            
            if (processed % 10 === 0) {
              logger.info(`[Nutrition] Backfill progress: ${processed}/${daysToProcess} days`);
            }
          }
          
          logger.info(`[Nutrition] Backfill complete for ${userId}: ${processed} days processed using timezone ${timezone}`);
        } catch (err) {
          logger.error(`[Nutrition] Backfill error for ${userId}:`, err);
        }
      })();

      return res.json({ 
        status: "started", 
        message: `Backfill started for last ${daysToProcess} days`,
        days: daysToProcess 
      });
    } catch (error: any) {
      logger.error("[Nutrition] Error starting backfill:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Debug endpoint to see raw nutrition samples for a date (for diagnosing duplicate issues)
  app.get("/api/nutrition/debug", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { date, timezone = 'Australia/Perth' } = req.query;
      
      if (!date) {
        return res.status(400).json({ error: "date is required (YYYY-MM-DD format)" });
      }

      const { TZDate } = await import('@date-fns/tz');
      const { getSupabaseClient } = await import('./services/supabaseHealthStorage');
      
      // Calculate UTC boundaries for the local date
      const localDayStart = new TZDate(`${date}T00:00:00`, timezone as string);
      const localDayEnd = new TZDate(`${date}T23:59:59.999`, timezone as string);
      const dayStartUTC = new Date(localDayStart.toISOString());
      const dayEndUTC = new Date(localDayEnd.toISOString());
      
      // Get health_id for this user
      const [user] = await db.select({ healthId: users.healthId }).from(users).where(eq(users.id, userId));
      if (!user?.healthId) {
        return res.status(404).json({ error: "No health_id found for user" });
      }

      const supabase = getSupabaseClient();
      if (!supabase) {
        return res.status(500).json({ error: "Supabase not available" });
      }

      // Get all dietary samples for this date
      const { data: samples, error } = await supabase
        .from('healthkit_samples')
        .select('*')
        .eq('health_id', user.healthId)
        .ilike('data_type', '%Dietary%')
        .gte('start_date', dayStartUTC.toISOString())
        .lte('start_date', dayEndUTC.toISOString())
        .order('start_date', { ascending: true });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      // Group by data_type for analysis
      const byType: Record<string, { count: number; total: number; samples: any[] }> = {};
      for (const sample of samples || []) {
        const type = sample.data_type;
        if (!byType[type]) {
          byType[type] = { count: 0, total: 0, samples: [] };
        }
        byType[type].count++;
        byType[type].total += sample.value || 0;
        byType[type].samples.push({
          uuid: sample.uuid,
          value: sample.value,
          unit: sample.unit,
          start_date: sample.start_date,
          source_name: sample.source_name,
        });
      }

      // Calculate totals matching Flo's aggregation
      const calories = byType['HKQuantityTypeIdentifierDietaryEnergyConsumed']?.total || 0;
      const protein = byType['HKQuantityTypeIdentifierDietaryProtein']?.total || 0;
      const carbs = byType['HKQuantityTypeIdentifierDietaryCarbohydrates']?.total || 0;
      const fat = byType['HKQuantityTypeIdentifierDietaryFatTotal']?.total || 0;

      return res.json({
        date,
        timezone,
        utcRange: {
          start: dayStartUTC.toISOString(),
          end: dayEndUTC.toISOString(),
        },
        healthId: user.healthId,
        totalSamples: samples?.length || 0,
        aggregatedTotals: {
          calories: Math.round(calories * 100) / 100,
          proteinG: Math.round(protein * 100) / 100,
          carbsG: Math.round(carbs * 100) / 100,
          fatG: Math.round(fat * 100) / 100,
        },
        byType,
      });
    } catch (error: any) {
      logger.error("[Nutrition] Debug error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Admin: Force re-aggregate nutrition for a user (bypasses cache, uses updated deduplication logic)
  // Accepts either session auth (admin) OR x-admin-key header for CLI usage
  app.post("/api/admin/nutrition/force-reaggregate", async (req: any, res) => {
    try {
      // Check for API key in header (for CLI usage)
      const apiKey = req.headers['x-admin-key'];
      const expectedKey = process.env.ADMIN_CLI_KEY;
      
      // Debug logging (will be removed after debugging)
      logger.info(`[Nutrition Admin] Auth check - hasApiKey: ${!!apiKey}, hasExpectedKey: ${!!expectedKey}, keysMatch: ${apiKey === expectedKey}`);
      
      let adminId = 'cli-admin';
      
      if (apiKey && expectedKey && apiKey === expectedKey) {
        // API key auth - proceed
        logger.info('[Nutrition Admin] CLI access via API key');
      } else if (req.user?.claims?.sub) {
        // Session auth - check admin role
        const [adminUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, req.user.claims.sub));
        if (adminUser?.role !== 'admin') {
          return res.status(403).json({ error: "Admin access required" });
        }
        adminId = req.user.claims.sub;
      } else {
        return res.status(401).json({ error: "Authentication required. Use session auth or x-admin-key header." });
      }
      
      const { userId, days = 7, timezone = 'Australia/Perth' } = req.body;
      
      // If no userId provided, use the admin's own ID
      const targetUserId = userId || adminId;
      const daysToProcess = Math.min(Number(days), 365);
      
      logger.info(`[Nutrition Admin] Force re-aggregate started by ${adminId} for user ${targetUserId}, last ${daysToProcess} days`);

      const { TZDate } = await import('@date-fns/tz');
      const results: { date: string; status: string }[] = [];
      const now = new Date();
      
      for (let i = 0; i < daysToProcess; i++) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() - i);
        const tzDate = new TZDate(targetDate, timezone);
        const localDate = tzDate.toISOString().split('T')[0];
        
        try {
          await upsertNutritionDaily(targetUserId, localDate, timezone);
          results.push({ date: localDate, status: 'ok' });
        } catch (err: any) {
          results.push({ date: localDate, status: `error: ${err.message}` });
        }
      }
      
      logger.info(`[Nutrition Admin] Force re-aggregate complete for ${targetUserId}: ${results.filter(r => r.status === 'ok').length}/${daysToProcess} days succeeded`);

      return res.json({ 
        status: "complete",
        userId: targetUserId,
        daysProcessed: daysToProcess,
        results
      });
    } catch (error: any) {
      logger.error("[Nutrition Admin] Force re-aggregate error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Admin endpoint to clean up duplicate HealthKit samples
  // Removes duplicates based on (health_id, data_type, value, start_date, source_bundle_id)
  app.post("/api/admin/healthkit/cleanup-duplicates", async (req: any, res) => {
    try {
      const apiKey = req.headers['x-admin-key'];
      const expectedKey = process.env.ADMIN_CLI_KEY;

      if (!expectedKey || apiKey !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized - invalid API key" });
      }

      const { healthId, daysBack = 7, dryRun = true } = req.body;
      
      if (!healthId) {
        return res.status(400).json({ error: "healthId required" });
      }

      const { getSupabaseClient } = await import('./services/supabaseHealthStorage');
      const supabase = getSupabaseClient();
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      
      logger.info(`[Admin] Cleaning up duplicates for health_id ${healthId}, last ${daysBack} days, dryRun: ${dryRun}`);
      
      // Fetch all samples in the date range
      const { data: samples, error: fetchError } = await supabase
        .from('healthkit_samples')
        .select('id, data_type, value, start_date, source_bundle_id, created_at')
        .eq('health_id', healthId)
        .gte('start_date', startDate.toISOString())
        .lte('start_date', endDate.toISOString())
        .order('created_at', { ascending: true });
      
      if (fetchError) {
        logger.error('[Admin] Error fetching samples:', fetchError);
        return res.status(500).json({ error: fetchError.message });
      }
      
      // Find duplicates - keep the first one (oldest created_at), mark others for deletion
      const seen = new Map<string, string>(); // fingerprint -> id to keep
      const toDelete: string[] = [];
      
      for (const sample of samples || []) {
        const valueRounded = Math.round(sample.value * 100) / 100;
        const fingerprint = `${sample.data_type}|${valueRounded}|${sample.start_date}|${sample.source_bundle_id || ''}`;
        
        if (seen.has(fingerprint)) {
          // This is a duplicate, mark for deletion
          toDelete.push(sample.id);
        } else {
          // First occurrence, keep it
          seen.set(fingerprint, sample.id);
        }
      }
      
      logger.info(`[Admin] Found ${samples?.length || 0} samples, ${toDelete.length} duplicates to remove`);
      
      if (dryRun) {
        return res.json({
          status: "dry_run",
          healthId,
          totalSamples: samples?.length || 0,
          duplicatesToRemove: toDelete.length,
          uniqueSamples: seen.size,
          message: "Set dryRun: false to actually delete duplicates"
        });
      }
      
      // Actually delete duplicates
      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('healthkit_samples')
          .delete()
          .in('id', toDelete);
        
        if (deleteError) {
          logger.error('[Admin] Error deleting duplicates:', deleteError);
          return res.status(500).json({ error: deleteError.message });
        }
        
        logger.info(`[Admin] Successfully deleted ${toDelete.length} duplicate samples`);
      }
      
      return res.json({
        status: "complete",
        healthId,
        totalSamples: samples?.length || 0,
        duplicatesRemoved: toDelete.length,
        remainingSamples: seen.size
      });
    } catch (error: any) {
      logger.error("[Admin] Cleanup duplicates error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Mindfulness Routes
  // ============================================

  // Get mindfulness sessions for a user - uses healthStorageRouter for dual-database support
  app.get("/api/mindfulness/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate, limit } = req.query;

      const options: { startDate?: Date; endDate?: Date; limit?: number } = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);
      options.limit = limit ? Number(limit) : 100;
      
      const records = await healthRouter.getMindfulnessSessions(userId, options);
      
      return res.json(records);
    } catch (error: any) {
      logger.error("[Mindfulness] Error fetching sessions:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get mindfulness daily metrics - uses healthStorageRouter for dual-database support
  app.get("/api/mindfulness/daily", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate, limit } = req.query;

      const options: { startDate?: Date; endDate?: Date; limit?: number } = {};
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);
      options.limit = limit ? Number(limit) : 100;
      
      const records = await healthRouter.getMindfulnessDailyMetrics(userId, options);
      
      return res.json(records);
    } catch (error: any) {
      logger.error("[Mindfulness] Error fetching daily metrics:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get mindfulness summary (totals over date range)
  app.get("/api/mindfulness/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const summary = await getMindfulnessSummary(userId, startDate as string, endDate as string);
      return res.json(summary);
    } catch (error: any) {
      logger.error("[Mindfulness] Error getting summary:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Upload mindfulness session from iOS HealthKit
  app.post("/api/mindfulness/session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startTime, endTime, sourceName, sourceId, healthkitUuid, timezone } = req.body;
      
      if (!startTime || !endTime) {
        return res.status(400).json({ error: "startTime and endTime are required" });
      }

      await processMindfulnessSession(
        userId,
        new Date(startTime),
        new Date(endTime),
        sourceName || null,
        sourceId || null,
        healthkitUuid || null,
        { timezone: timezone || 'America/Los_Angeles' }
      );
      
      logger.info(`[Mindfulness] Session processed for ${userId}`);
      return res.json({ status: "ok" });
    } catch (error: any) {
      logger.error("[Mindfulness] Error processing session:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Activity Routes (for Activity Page)
  // ============================================

  // Get activity summary for today - aggregates daily metrics, workouts, and recovery data
  app.get("/api/activity/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { date } = req.query;
      
      // Get user's timezone from their most recent daily metric
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const userTimezone = recentMetrics.length > 0 ? recentMetrics[0].timezone : 'UTC';
      
      // Calculate the target date in user's timezone
      const targetDate = date 
        ? (date as string) 
        : new Date().toLocaleString('en-CA', { 
            timeZone: userTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).split(',')[0];
      
      // Fetch daily metrics for today
      const todayMetrics = await healthRouter.getUserDailyMetricsByDate(userId, targetDate);
      
      // Fetch profile for user-specific targets (weight, sex, age)
      const profile = await healthRouter.getProfile(userId);
      
      // Fetch 7-day history for HRV baseline and VO2 trend
      const weekMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 7 });
      
      // Calculate HRV baseline (7-day average)
      const hrvValues = weekMetrics.filter(m => m.hrvMs != null).map(m => m.hrvMs!);
      const hrvBaseline = hrvValues.length > 0 
        ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length) 
        : null;
      
      // Calculate VO2 trend (compare current to 30-day average if available)
      const thirtyDayMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 30 });
      const vo2Values = thirtyDayMetrics.filter(m => m.vo2Max != null).map(m => m.vo2Max!);
      const vo2Avg = vo2Values.length > 0 
        ? vo2Values.reduce((a, b) => a + b, 0) / vo2Values.length 
        : null;
      
      const currentVo2 = todayMetrics?.vo2Max ?? null;
      let vo2Trend: 'up' | 'stable' | 'down' = 'stable';
      if (currentVo2 != null && vo2Avg != null) {
        if (currentVo2 > vo2Avg + 1) vo2Trend = 'up';
        else if (currentVo2 < vo2Avg - 1) vo2Trend = 'down';
      }
      
      // Determine recovery status based on HRV
      const hrv = todayMetrics?.hrvMs ?? null;
      let hrvStatus: 'recovered' | 'ok' | 'strained' = 'ok';
      if (hrv != null && hrvBaseline != null) {
        if (hrv >= hrvBaseline + 5) hrvStatus = 'recovered';
        else if (hrv < hrvBaseline - 5) hrvStatus = 'strained';
      }
      
      // VO2 level categorization based on fitness standards
      const vo2Level = currentVo2 != null
        ? currentVo2 >= 50 ? 'Excellent' : currentVo2 >= 42 ? 'Good' : currentVo2 >= 35 ? 'Fair' : 'Below Average'
        : null;
      
      // Calculate strain score (0-21 scale similar to WHOOP)
      // Based on active energy, exercise minutes, and HRV deviation from baseline
      let strainScore: number | null = null;
      const activeEnergy = todayMetrics?.activeEnergyKcal ?? 0;
      const exerciseMinutes = todayMetrics?.exerciseMinutes ?? 0;
      
      if (activeEnergy > 0 || exerciseMinutes > 0) {
        // Strain components:
        // 1. Energy expenditure (0-10): Scale based on typical range 0-1000 kcal
        const energyComponent = Math.min(10, (activeEnergy / 1000) * 10);
        // 2. Exercise time (0-7): Scale based on 0-60+ min of exercise
        const exerciseComponent = Math.min(7, (exerciseMinutes / 60) * 7);
        // 3. HRV impact (0-4): Lower HRV relative to baseline = higher strain
        let hrvComponent = 0;
        if (hrv != null && hrvBaseline != null && hrvBaseline > 0) {
          const hrvRatio = hrv / hrvBaseline;
          if (hrvRatio < 0.8) hrvComponent = 4;
          else if (hrvRatio < 0.9) hrvComponent = 2;
          else if (hrvRatio < 1.0) hrvComponent = 1;
        }
        strainScore = Math.round((energyComponent + exerciseComponent + hrvComponent) * 10) / 10;
        strainScore = Math.min(21, strainScore); // Cap at 21
      }
      
      return res.json({
        date: targetDate,
        steps: todayMetrics?.stepsNormalized ?? todayMetrics?.stepsRawSum ?? null,
        stepsGoal: 10000,
        distance: todayMetrics?.distanceMeters ? Math.round(todayMetrics.distanceMeters) / 1000 : null,
        activeEnergy: todayMetrics?.activeEnergyKcal ?? null,
        exerciseMinutes: todayMetrics?.exerciseMinutes ?? null,
        exerciseGoal: 30,
        standHours: todayMetrics?.standHours ?? null,
        flightsClimbed: todayMetrics?.flightsClimbed ?? null,
        // Cardio fitness
        vo2Max: currentVo2,
        vo2Level,
        vo2Trend,
        restingHeartRate: todayMetrics?.restingHrBpm ?? null,
        // Recovery metrics
        hrv,
        hrvBaseline,
        hrvStatus,
        strainScore,
        // Movement quality (from HealthKit gait analysis)
        walkingSpeed: todayMetrics?.walkingSpeedMs != null ? Math.round(todayMetrics.walkingSpeedMs * 100) / 100 : null,
        stepLength: todayMetrics?.walkingStepLengthM != null ? Math.round(todayMetrics.walkingStepLengthM * 100) / 100 : null,
        doubleSupport: todayMetrics?.walkingDoubleSupportPct != null ? Math.round(todayMetrics.walkingDoubleSupportPct * 10) / 10 : null,
        asymmetry: todayMetrics?.walkingAsymmetryPct != null ? Math.round(todayMetrics.walkingAsymmetryPct * 10) / 10 : null,
        // User profile for personalization
        weight: profile?.weight ?? null,
        sex: profile?.sex ?? null,
        birthYear: profile?.birthYear ?? null,
      });
    } catch (error: any) {
      logger.error("[Activity] Error fetching summary:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get 7-day activity data for Activity Details modal
  app.get("/api/activity/weekly", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's timezone from their most recent daily metric
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const userTimezone = recentMetrics.length > 0 ? recentMetrics[0].timezone : 'UTC';
      
      // Get 14 days of metrics to ensure we have coverage for the last 7 days
      const weekMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 14 });
      
      // Create a map of localDate -> metric for fast lookup
      const metricsMap = new Map<string, typeof weekMetrics[0]>();
      for (const metric of weekMetrics) {
        if (metric.localDate) {
          metricsMap.set(metric.localDate, metric);
        }
      }
      
      // Helper function to format date as YYYY-MM-DD in user's timezone
      const formatDateAsLocal = (date: Date, tz: string): string => {
        const options: Intl.DateTimeFormatOptions = {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        };
        const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
        const year = parts.find(p => p.type === 'year')?.value || '2025';
        const month = parts.find(p => p.type === 'month')?.value || '01';
        const day = parts.find(p => p.type === 'day')?.value || '01';
        return `${year}-${month}-${day}`;
      };
      
      // Build day-by-day data for the last 7 days
      const today = new Date();
      
      const weekData: Array<{
        day: string;
        date: string;
        steps: number;
        distance: number;
        calories: number;
        exercise: number;
        standHours: number;
      }> = [];
      
      // Create entries for the last 7 days
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        // Format date in user's timezone as YYYY-MM-DD using stable formatter
        const localDateStr = formatDateAsLocal(date, userTimezone);
        
        const displayDate = date.toLocaleString('en-US', { 
          timeZone: userTimezone,
          month: 'short',
          day: 'numeric'
        });
        
        const dayOfWeek = date.toLocaleString('en-US', { 
          timeZone: userTimezone, 
          weekday: 'short' 
        });
        
        // Find matching metric for this date from the map
        const metric = metricsMap.get(localDateStr);
        
        weekData.push({
          day: i === 0 ? 'Today' : dayOfWeek,
          date: displayDate,
          steps: metric?.stepsNormalized ?? metric?.stepsRawSum ?? 0,
          distance: metric?.distanceMeters ? Math.round(metric.distanceMeters / 100) / 10 : 0,
          calories: Math.round(metric?.activeEnergyKcal ?? 0),
          exercise: Math.round(metric?.exerciseMinutes ?? 0),
          standHours: metric?.standHours ?? 0
        });
      }
      
      // Calculate averages (only for days with data)
      const daysWithData = weekData.filter(d => d.steps > 0 || d.calories > 0 || d.exercise > 0);
      const divisor = daysWithData.length || 1;
      
      const avgSteps = Math.round(weekData.reduce((sum, d) => sum + d.steps, 0) / divisor);
      const avgDistance = Math.round(weekData.reduce((sum, d) => sum + d.distance, 0) / divisor * 10) / 10;
      const avgCalories = Math.round(weekData.reduce((sum, d) => sum + d.calories, 0) / divisor);
      const totalExercise = weekData.reduce((sum, d) => sum + d.exercise, 0);
      
      // Find best day
      const maxStepsDay = weekData.reduce((best, day) => day.steps > best.steps ? day : best, weekData[0]);
      
      return res.json({
        weekData,
        averages: {
          steps: avgSteps,
          distance: avgDistance,
          calories: avgCalories,
          totalExercise
        },
        insights: {
          bestDay: maxStepsDay.day,
          bestDaySteps: maxStepsDay.steps,
          daysOverGoal: weekData.filter(d => d.steps >= 10000).length
        }
      });
    } catch (error: any) {
      logger.error("[Activity] Error fetching weekly data:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get 7-day macros data for Macros Details modal
  app.get("/api/nutrition/macros/weekly", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get 14 days of nutrition data to ensure coverage for timezone edge cases
      const nutritionData = await healthRouter.getNutritionDailyMetrics(userId, { limit: 14 });
      
      // Create a map of localDate -> nutrition record for fast lookup
      const nutritionMap = new Map<string, typeof nutritionData[0]>();
      for (const record of nutritionData) {
        if (record.localDate) {
          nutritionMap.set(record.localDate, record);
        }
      }
      
      // Get user's timezone from nutrition data or daily metrics
      let userTimezone = 'UTC';
      if (nutritionData.length > 0 && nutritionData[0].timezone) {
        userTimezone = nutritionData[0].timezone;
      } else {
        const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
        userTimezone = recentMetrics.length > 0 ? recentMetrics[0].timezone : 'UTC';
      }
      
      // Determine today's local date from user's perspective
      // CRITICAL: Use the most recent localDate from Supabase as our anchor point
      // This ensures we're aligned with the user's actual device-reported dates
      let todayLocalDate: string;
      if (nutritionData.length > 0 && nutritionData[0].localDate) {
        // Use the most recent localDate from Supabase as our reference
        todayLocalDate = nutritionData[0].localDate;
      } else {
        // Fallback: use formatToParts to get today in user's timezone
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: userTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).formatToParts(new Date());
        const year = parts.find(p => p.type === 'year')?.value || '2025';
        const month = parts.find(p => p.type === 'month')?.value || '01';
        const day = parts.find(p => p.type === 'day')?.value || '01';
        todayLocalDate = `${year}-${month}-${day}`;
      }
      
      // Helper to subtract days from a YYYY-MM-DD string
      const subtractDays = (dateStr: string, days: number): string => {
        const [y, m, d] = dateStr.split('-').map(Number);
        // Create date at noon UTC to avoid DST issues
        const date = new Date(Date.UTC(y, m - 1, d - days, 12, 0, 0, 0));
        return date.toISOString().split('T')[0];
      };
      
      // Helper to get day of week from YYYY-MM-DD
      const getDayOfWeek = (dateStr: string): string => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
        return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      };
      
      // Helper to get display date from YYYY-MM-DD
      const getDisplayDate = (dateStr: string): string => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      };
      
      const weekData: Array<{
        day: string;
        date: string;
        calories: number;
        carbs: number;
        protein: number;
        fat: number;
        satFat: number;
        sodium: number;
        cholesterol: number;
        fiber: number;
      }> = [];
      
      // Build week data starting from today (i=0) back to 6 days ago (i=6)
      for (let i = 6; i >= 0; i--) {
        const localDateStr = subtractDays(todayLocalDate, i);
        const record = nutritionMap.get(localDateStr);
        
        weekData.push({
          day: i === 0 ? 'Today' : getDayOfWeek(localDateStr),
          date: getDisplayDate(localDateStr),
          calories: Math.round(record?.energyKcal ?? 0),
          carbs: Math.round(record?.carbohydratesG ?? 0),
          protein: Math.round(record?.proteinG ?? 0),
          fat: Math.round(record?.fatTotalG ?? 0),
          satFat: Math.round(record?.fatSaturatedG ?? 0),
          sodium: Math.round(record?.sodiumMg ?? 0),
          cholesterol: Math.round(record?.cholesterolMg ?? 0),
          fiber: Math.round(record?.fiberG ?? 0)
        });
      }
      
      // Calculate averages (only for days with data)
      const daysWithData = weekData.filter(d => d.calories > 0);
      const divisor = daysWithData.length || 1;
      
      const avgCalories = Math.round(weekData.reduce((sum, d) => sum + d.calories, 0) / divisor);
      const avgProtein = Math.round(weekData.reduce((sum, d) => sum + d.protein, 0) / divisor);
      const avgCarbs = Math.round(weekData.reduce((sum, d) => sum + d.carbs, 0) / divisor);
      const avgFat = Math.round(weekData.reduce((sum, d) => sum + d.fat, 0) / divisor);
      
      return res.json({
        weekData,
        averages: {
          calories: avgCalories,
          protein: avgProtein,
          carbs: avgCarbs,
          fat: avgFat
        },
        daysTracked: daysWithData.length
      });
    } catch (error: any) {
      logger.error("[Nutrition] Error fetching weekly macros:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get today's workouts
  app.get("/api/activity/workouts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { date } = req.query;
      
      // Get user's timezone
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const userTimezone = recentMetrics.length > 0 ? recentMetrics[0].timezone : 'UTC';
      
      const targetDate = date 
        ? (date as string) 
        : new Date().toLocaleString('en-CA', { 
            timeZone: userTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).split(',')[0];
      
      const workouts = await healthRouter.getHealthkitWorkoutsByDate(userId, targetDate);
      
      // Helper to calculate workout duration in MINUTES with fallback
      // Note: w.duration is stored in MINUTES from iOS HealthKit
      const getWorkoutDurationMinutes = (w: any): number => {
        if (w.duration && w.duration > 0) {
          return w.duration; // Already in minutes
        }
        // Fallback: calculate from start_date and end_date (convert to minutes)
        if (w.start_date && w.end_date) {
          const start = new Date(w.start_date).getTime();
          const end = new Date(w.end_date).getTime();
          const durationMinutes = (end - start) / 1000 / 60;
          return Math.max(0, durationMinutes);
        }
        return 0;
      };
      
      // Aggregate workout stats - durations are in minutes
      const totalDurationMinutes = workouts.reduce((sum, w) => sum + getWorkoutDurationMinutes(w), 0);
      const totalEnergy = workouts.reduce((sum, w) => sum + (w.total_energy_burned || 0), 0);
      
      // Get last workout details
      const lastWorkout = workouts.length > 0 ? workouts[0] : null;
      
      return res.json({
        date: targetDate,
        count: workouts.length,
        totalDurationMinutes: Math.round(totalDurationMinutes),
        totalEnergyKcal: Math.round(totalEnergy),
        lastWorkout: lastWorkout ? {
          type: lastWorkout.workout_type,
          distanceKm: lastWorkout.total_distance ? Math.round(lastWorkout.total_distance / 1000 * 10) / 10 : null,
          avgHeartRate: lastWorkout.average_heart_rate,
          durationMinutes: Math.round(getWorkoutDurationMinutes(lastWorkout)),
          energyKcal: lastWorkout.total_energy_burned ? Math.round(lastWorkout.total_energy_burned) : null,
        } : null,
        workouts: workouts.map(w => ({
          id: w.id,
          type: w.workout_type,
          startDate: w.start_date,
          endDate: w.end_date,
          durationMinutes: Math.round(getWorkoutDurationMinutes(w)),
          distanceKm: w.total_distance ? Math.round(w.total_distance / 1000 * 10) / 10 : null,
          energyKcal: w.total_energy_burned ? Math.round(w.total_energy_burned) : null,
          avgHeartRate: w.average_heart_rate,
          maxHeartRate: w.max_heart_rate,
        })),
      });
    } catch (error: any) {
      logger.error("[Activity] Error fetching workouts:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get weekly workouts data (for Workout Details modal)
  app.get("/api/activity/workouts/weekly", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's timezone
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const userTimezone = recentMetrics.length > 0 ? recentMetrics[0].timezone : 'UTC';
      
      // Calculate date range for last 7 days
      const today = new Date();
      const endDate = today.toLocaleString('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split(',')[0];
      
      const startDateObj = new Date(today);
      startDateObj.setDate(startDateObj.getDate() - 6);
      const startDate = startDateObj.toLocaleString('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split(',')[0];
      
      // Helper to calculate workout duration in MINUTES
      const getWorkoutDurationMinutes = (w: any): number => {
        if (w.duration && w.duration > 0) {
          return w.duration;
        }
        if (w.start_date && w.end_date) {
          const start = new Date(w.start_date).getTime();
          const end = new Date(w.end_date).getTime();
          const durationMinutes = (end - start) / 1000 / 60;
          return Math.max(0, durationMinutes);
        }
        return 0;
      };

      // Get workouts for the last 7 days
      const workouts = await healthRouter.getHealthkitWorkoutsByDateRange(userId, startDate, endDate);
      
      // Get all-time workouts for best week calculation (limit to last 365 days)
      const yearAgo = new Date(today);
      yearAgo.setDate(yearAgo.getDate() - 365);
      const yearAgoDate = yearAgo.toLocaleString('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split(',')[0];
      
      const allWorkouts = await healthRouter.getHealthkitWorkoutsByDateRange(userId, yearAgoDate, endDate);
      
      // Group workouts by day for the current week
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weekData: Array<{
        day: string;
        date: string;
        workouts: Array<{
          type: string;
          duration: number;
          distance: number;
          calories: number;
          avgHR: number | null;
          intensity: string;
        }>;
      }> = [];
      
      // Create entries for each of the last 7 days
      for (let i = 6; i >= 0; i--) {
        const dateObj = new Date(today);
        dateObj.setDate(dateObj.getDate() - i);
        const dateStr = dateObj.toLocaleString('en-CA', { 
          timeZone: userTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).split(',')[0];
        
        const dayOfWeek = dateObj.getDay();
        const displayDay = i === 0 ? 'Today' : dayNames[dayOfWeek];
        const displayDate = dateObj.toLocaleString('en-US', { 
          timeZone: userTimezone,
          month: 'short',
          day: 'numeric'
        });
        
        // Filter workouts for this day
        const dayWorkouts = workouts.filter(w => {
          const workoutDate = new Date(w.start_date).toLocaleString('en-CA', { 
            timeZone: userTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).split(',')[0];
          return workoutDate === dateStr;
        });
        
        // Determine intensity based on heart rate zones
        const getIntensity = (avgHR: number | null): string => {
          if (!avgHR) return 'Moderate';
          if (avgHR >= 150) return 'High';
          if (avgHR >= 120) return 'Moderate';
          return 'Light';
        };
        
        weekData.push({
          day: displayDay,
          date: displayDate,
          workouts: dayWorkouts.map(w => ({
            type: w.workout_type || 'Unknown',
            duration: Math.round(getWorkoutDurationMinutes(w)),
            distance: w.total_distance ? Math.round(w.total_distance / 1000 * 10) / 10 : 0,
            calories: Math.round(w.total_energy_burned || 0),
            avgHR: w.average_heart_rate || null,
            intensity: getIntensity(w.average_heart_rate),
          })),
        });
      }
      
      // Calculate weekly totals
      const totalWorkouts = weekData.reduce((sum, day) => sum + day.workouts.length, 0);
      const totalDuration = weekData.reduce((sum, day) => 
        sum + day.workouts.reduce((s, w) => s + w.duration, 0), 0
      );
      const totalCalories = weekData.reduce((sum, day) => 
        sum + day.workouts.reduce((s, w) => s + w.calories, 0), 0
      );
      const totalDistance = weekData.reduce((sum, day) => 
        sum + day.workouts.reduce((s, w) => s + w.distance, 0), 0
      );
      const avgDuration = totalWorkouts > 0 ? Math.round(totalDuration / totalWorkouts) : 0;
      
      // Calculate workout type breakdown
      const workoutTypes: Record<string, number> = {};
      weekData.forEach(day => {
        day.workouts.forEach(w => {
          workoutTypes[w.type] = (workoutTypes[w.type] || 0) + 1;
        });
      });
      
      // Calculate best week ever from historical data
      // Group all workouts by ISO week
      const weeklyStats: Record<string, { workouts: number; duration: number; calories: number; distance: number; weekStart: string }> = {};
      
      allWorkouts.forEach(w => {
        const workoutDate = new Date(w.start_date);
        // Get the Monday of the week
        const weekStart = new Date(workoutDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!weeklyStats[weekKey]) {
          weeklyStats[weekKey] = { 
            workouts: 0, 
            duration: 0, 
            calories: 0, 
            distance: 0,
            weekStart: weekKey
          };
        }
        
        weeklyStats[weekKey].workouts++;
        weeklyStats[weekKey].duration += getWorkoutDurationMinutes(w);
        weeklyStats[weekKey].calories += w.total_energy_burned || 0;
        weeklyStats[weekKey].distance += w.total_distance ? w.total_distance / 1000 : 0;
      });
      
      // Find best week by total workouts (or duration as tiebreaker)
      let bestWeek = { workouts: 0, duration: 0, calories: 0, distance: 0, date: '' };
      Object.entries(weeklyStats).forEach(([weekKey, stats]) => {
        if (stats.workouts > bestWeek.workouts || 
            (stats.workouts === bestWeek.workouts && stats.duration > bestWeek.duration)) {
          bestWeek = {
            workouts: stats.workouts,
            duration: Math.round(stats.duration),
            calories: Math.round(stats.calories),
            distance: Math.round(stats.distance * 10) / 10,
            date: `Week of ${new Date(weekKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          };
        }
      });
      
      return res.json({
        weekData,
        thisWeek: {
          workouts: totalWorkouts,
          duration: totalDuration,
          calories: totalCalories,
          distance: Math.round(totalDistance * 10) / 10,
          avgDuration,
        },
        bestWeek: bestWeek.workouts > 0 ? bestWeek : null,
        workoutTypes,
      });
    } catch (error: any) {
      logger.error("[Activity] Error fetching weekly workouts:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Glucose Routes (for Activity Page - Glucose Tab)
  // ============================================

  // Get glucose summary for a date
  app.get("/api/glucose/daily", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { date, range = 'day' } = req.query;
      
      // Get user's timezone
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const userTimezone = recentMetrics.length > 0 ? recentMetrics[0].timezone : 'UTC';
      
      const targetDate = date 
        ? (date as string) 
        : new Date().toLocaleString('en-CA', { 
            timeZone: userTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).split(',')[0];
      
      // Fetch today's metrics for glucose data
      const todayMetrics = await healthRouter.getUserDailyMetricsByDate(userId, targetDate);
      
      // Get historical data for trend and 7-day averages
      const rangeLimit = range === '14d' ? 14 : range === '7d' ? 7 : 1;
      const historicalMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: rangeLimit });
      
      // Calculate 7-day time in range average
      const sevenDayMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 7 });
      const tirValues = sevenDayMetrics.filter(m => m.bloodGlucoseMgDl != null).map(m => m.bloodGlucoseMgDl!);
      const avgGlucose7d = tirValues.length > 0 
        ? Math.round(tirValues.reduce((a, b) => a + b, 0) / tirValues.length) 
        : null;
      
      // Current glucose from today's metrics (or most recent)
      const currentGlucose = todayMetrics?.bloodGlucoseMgDl ?? null;
      
      // Glucose status
      let glucoseStatus: 'low' | 'normal' | 'high' = 'normal';
      if (currentGlucose != null) {
        if (currentGlucose < 70) glucoseStatus = 'low';
        else if (currentGlucose > 140) glucoseStatus = 'high';
      }
      
      // Build trend data from historical metrics
      const trendData = historicalMetrics
        .filter(m => m.bloodGlucoseMgDl != null)
        .map(m => ({
          date: m.localDate,
          value: m.bloodGlucoseMgDl!,
        }))
        .reverse();
      
      return res.json({
        date: targetDate,
        currentGlucose,
        glucoseStatus,
        // Time in range (mock for now - would need continuous glucose data)
        timeInRangeToday: null,
        timeInRange7d: null,
        // Daily stats
        avgToday: currentGlucose,
        minToday: null,
        maxToday: null,
        // 7-day average
        avgGlucose7d,
        // Lows and highs events
        lowsToday: { count: 0, minutes: 0 },
        highsToday: { count: 0, minutes: 0 },
        // Trend data for chart
        trendData,
        // Target range
        targetMin: 70,
        targetMax: 140,
      });
    } catch (error: any) {
      logger.error("[Glucose] Error fetching daily summary:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Dev Import Endpoint (for HealthKit Importer iOS app)
  // ============================================
  
  // Dev-only endpoint to import HealthKit data from standalone importer app
  // Secured with DEV_IMPORT_API_KEY - not for production use
  app.post("/api/dev/import-healthkit", async (req: any, res) => {
    try {
      // Verify dev import API key
      const apiKey = req.headers['x-dev-import-key'];
      const expectedKey = process.env.DEV_IMPORT_API_KEY;
      
      if (!expectedKey) {
        logger.error("[DevImport] DEV_IMPORT_API_KEY not configured");
        return res.status(503).json({ error: "Dev import not configured" });
      }
      
      if (apiKey !== expectedKey) {
        logger.warn("[DevImport] Invalid API key attempt");
        return res.status(401).json({ error: "Invalid API key" });
      }
      
      // Get target user by email
      const { email, dailyMetrics, sleepNights, workouts, samples, nutritionData, mindfulnessSessions } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email required to identify target user" });
      }
      
      // Find user by email
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      
      if (!user) {
        return res.status(404).json({ error: `User not found: ${email}` });
      }
      
      const userId = user.id;
      logger.info(`[DevImport] Starting import for user ${email} (${userId})`);
      
      const results = {
        dailyMetrics: { inserted: 0, errors: 0 },
        sleepNights: { inserted: 0, errors: 0 },
        workouts: { inserted: 0, errors: 0 },
        samples: { inserted: 0, errors: 0 },
        nutrition: { inserted: 0, errors: 0 },
        mindfulness: { inserted: 0, errors: 0 },
      };
      
      // Import daily metrics
      if (dailyMetrics && Array.isArray(dailyMetrics)) {
        logger.info(`[DevImport] Importing ${dailyMetrics.length} daily metrics`);
        for (const metric of dailyMetrics) {
          try {
            const supabaseMetric = {
              local_date: metric.localDate,
              timezone: metric.timezone || 'Australia/Perth',
              utc_day_start: metric.utcDayStart,
              utc_day_end: metric.utcDayEnd,
              steps_normalized: metric.stepsNormalized ?? null,
              steps_raw_sum: metric.stepsRawSum ?? metric.stepCount ?? null,
              steps_sources: metric.stepsSources ?? null,
              active_energy_kcal: metric.activeEnergyKcal ?? null,
              exercise_minutes: metric.exerciseMinutes ?? null,
              sleep_hours: metric.sleepHours ?? null,
              resting_hr_bpm: metric.restingHrBpm ?? null,
              hrv_ms: metric.hrvMs ?? null,
              weight_kg: metric.weightKg ?? null,
              height_cm: metric.heightCm ?? null,
              bmi: metric.bmi ?? null,
              body_fat_percent: metric.bodyFatPercent ?? null,
              lean_body_mass_kg: metric.leanBodyMassKg ?? null,
              waist_circumference_cm: metric.waistCircumferenceCm ?? null,
              distance_meters: metric.distanceMeters ?? null,
              flights_climbed: metric.flightsClimbed ?? null,
              stand_hours: metric.standHours ?? null,
              stand_time_minutes: metric.standTimeMinutes ?? null,
              avg_heart_rate_bpm: metric.avgHeartRateBpm ?? null,
              systolic_bp: metric.systolicBp ?? null,
              diastolic_bp: metric.diastolicBp ?? null,
              blood_glucose_mg_dl: metric.bloodGlucoseMgDl ?? null,
              vo2_max: metric.vo2Max ?? null,
              basal_energy_kcal: metric.basalEnergyKcal ?? null,
              walking_hr_avg_bpm: metric.walkingHeartRateAvg ?? null,
              dietary_water_ml: metric.dietaryWaterMl ?? null,
              oxygen_saturation_pct: metric.oxygenSaturation ?? null,
              respiratory_rate_bpm: metric.respiratoryRate ?? null,
              body_temp_c: metric.bodyTemperatureCelsius ?? null,
              wrist_temperature: metric.wristTemperature ?? null,
              heart_rate_recovery_bpm: metric.heartRateRecoveryBpm ?? null,
              // Mobility metrics
              walking_speed_ms: metric.walkingSpeedMs ?? null,
              walking_step_length_m: metric.walkingStepLengthM ?? null,
              walking_double_support_pct: metric.walkingDoubleSupportPct ?? null,
              walking_asymmetry_pct: metric.walkingAsymmetryPct ?? null,
              apple_walking_steadiness: metric.appleWalkingSteadiness ?? null,
              six_minute_walk_distance_m: metric.sixMinuteWalkDistanceM ?? null,
              stair_ascent_speed_ms: metric.stairAscentSpeedMs ?? null,
              stair_descent_speed_ms: metric.stairDescentSpeedMs ?? null,
              // Audio exposure
              environmental_audio_exposure_dba: metric.environmentalAudioExposureDbA ?? null,
              normalization_version: 'dev_import_v2',
            };
            
            await healthRouter.upsertDailyMetrics(userId, supabaseMetric);
            results.dailyMetrics.inserted++;
          } catch (err: any) {
            logger.error(`[DevImport] Daily metric error for ${metric.localDate}:`, err.message);
            results.dailyMetrics.errors++;
          }
        }
      }
      
      // Import sleep nights
      if (sleepNights && Array.isArray(sleepNights)) {
        logger.info(`[DevImport] Importing ${sleepNights.length} sleep nights`);
        for (const sleep of sleepNights) {
          try {
            await healthRouter.upsertSleepNight(userId, {
              sleepDate: sleep.sleepDate,
              timezone: sleep.timezone || 'Australia/Perth',
              nightStart: sleep.nightStart ? new Date(sleep.nightStart) : null,
              finalWake: sleep.finalWake ? new Date(sleep.finalWake) : null,
              sleepOnset: sleep.sleepOnset ? new Date(sleep.sleepOnset) : null,
              timeInBedMin: sleep.timeInBedMin ?? null,
              totalSleepMin: sleep.totalSleepMin ?? null,
              sleepEfficiencyPct: sleep.sleepEfficiencyPct ?? null,
              sleepLatencyMin: sleep.sleepLatencyMin ?? null,
              wasoMin: sleep.wasoMin ?? null,
              numAwakenings: sleep.numAwakenings ?? null,
              coreSleepMin: sleep.coreSleepMin ?? null,
              deepSleepMin: sleep.deepSleepMin ?? null,
              remSleepMin: sleep.remSleepMin ?? null,
              unspecifiedSleepMin: sleep.unspecifiedSleepMin ?? null,
              awakeInBedMin: sleep.awakeInBedMin ?? null,
              midSleepTimeLocal: sleep.midSleepTimeLocal ?? null,
              fragmentationIndex: sleep.fragmentationIndex ?? null,
              deepPct: sleep.deepPct ?? null,
              remPct: sleep.remPct ?? null,
              corePct: sleep.corePct ?? null,
              bedtimeLocal: sleep.bedtimeLocal ?? null,
              waketimeLocal: sleep.waketimeLocal ?? null,
              restingHrBpm: sleep.restingHrBpm ?? null,
              hrvMs: sleep.hrvMs ?? null,
              respiratoryRate: sleep.respiratoryRate ?? null,
              wristTemperature: sleep.wristTemperature ?? null,
              oxygenSaturation: sleep.oxygenSaturation ?? null,
            });
            results.sleepNights.inserted++;
          } catch (err: any) {
            logger.error(`[DevImport] Sleep night error for ${sleep.sleepDate}:`, err.message);
            results.sleepNights.errors++;
          }
        }
      }
      
      // Import workouts
      if (workouts && Array.isArray(workouts)) {
        logger.info(`[DevImport] Importing ${workouts.length} workouts`);
        const formattedWorkouts = workouts.map(w => ({
          workout_type: w.workoutType || w.workout_type,
          start_date: w.startDate || w.start_date,
          end_date: w.endDate || w.end_date,
          duration_minutes: w.durationMinutes || w.duration_minutes,
          total_energy_kcal: w.totalEnergyKcal || w.total_energy_kcal || null,
          active_energy_kcal: w.activeEnergyKcal || w.active_energy_kcal || null,
          distance_meters: w.distanceMeters || w.distance_meters || null,
          avg_heart_rate_bpm: w.avgHeartRateBpm || w.avg_heart_rate_bpm || null,
          max_heart_rate_bpm: w.maxHeartRateBpm || w.max_heart_rate_bpm || null,
          elevation_ascended_m: w.elevationAscendedM || w.elevation_ascended_m || null,
          source_name: w.sourceName || w.source_name || 'DevImporter',
          source_bundle_id: w.sourceBundleId || w.source_bundle_id || 'com.flo.devimporter',
          metadata: w.metadata || null,
          healthkit_uuid: w.healthkitUuid || w.healthkit_uuid || null,
        }));
        
        try {
          const inserted = await healthRouter.createHealthkitWorkouts(userId, formattedWorkouts);
          results.workouts.inserted = inserted;
        } catch (err: any) {
          logger.error(`[DevImport] Workouts batch error:`, err.message);
          results.workouts.errors = workouts.length;
        }
      }
      
      // Import raw samples
      if (samples && Array.isArray(samples)) {
        logger.info(`[DevImport] Importing ${samples.length} samples`);
        const formattedSamples = samples.map(s => ({
          data_type: s.dataType || s.data_type,
          value: s.value,
          unit: s.unit,
          start_date: new Date(s.startDate || s.start_date).toISOString(),
          end_date: new Date(s.endDate || s.end_date).toISOString(),
          source_name: s.sourceName || s.source_name || 'DevImporter',
          source_bundle_id: s.sourceBundleId || s.source_bundle_id || 'com.flo.devimporter',
          device_name: s.deviceName || s.device_name || null,
          device_manufacturer: s.deviceManufacturer || s.device_manufacturer || null,
          device_model: s.deviceModel || s.device_model || null,
          metadata: s.metadata || null,
          uuid: s.uuid || null,
        }));
        
        try {
          const inserted = await healthRouter.createHealthkitSamples(userId, formattedSamples);
          results.samples.inserted = inserted;
        } catch (err: any) {
          logger.error(`[DevImport] Samples batch error:`, err.message);
          results.samples.errors = samples.length;
        }
      }
      
      // Import nutrition data (expanded with all 38 nutrients)
      if (nutritionData && Array.isArray(nutritionData)) {
        logger.info(`[DevImport] Importing ${nutritionData.length} nutrition records`);
        for (const nutrition of nutritionData) {
          try {
            await healthRouter.upsertNutritionDailyMetrics(userId, {
              localDate: nutrition.date,
              timezone: nutrition.timezone || 'Australia/Perth',
              // Macronutrients
              energyKcal: nutrition.energyKcal ?? nutrition.caloriesKcal ?? null,
              proteinG: nutrition.proteinG ?? null,
              carbohydratesG: nutrition.carbohydratesG ?? nutrition.carbsG ?? null,
              fatTotalG: nutrition.fatTotalG ?? nutrition.fatG ?? null,
              fiberG: nutrition.fiberG ?? null,
              sugarG: nutrition.sugarG ?? null,
              // Fat breakdown
              fatSaturatedG: nutrition.fatSaturatedG ?? null,
              fatMonounsaturatedG: nutrition.fatMonounsaturatedG ?? null,
              fatPolyunsaturatedG: nutrition.fatPolyunsaturatedG ?? null,
              cholesterolMg: nutrition.cholesterolMg ?? null,
              // Minerals
              sodiumMg: nutrition.sodiumMg ?? null,
              potassiumMg: nutrition.potassiumMg ?? null,
              calciumMg: nutrition.calciumMg ?? null,
              ironMg: nutrition.ironMg ?? null,
              magnesiumMg: nutrition.magnesiumMg ?? null,
              phosphorusMg: nutrition.phosphorusMg ?? null,
              zincMg: nutrition.zincMg ?? null,
              copperMg: nutrition.copperMg ?? null,
              manganeseMg: nutrition.manganeseMg ?? null,
              seleniumMcg: nutrition.seleniumMcg ?? null,
              chromiumMcg: nutrition.chromiumMcg ?? null,
              molybdenumMcg: nutrition.molybdenumMcg ?? null,
              iodineMcg: nutrition.iodineMcg ?? null,
              chlorideMg: nutrition.chlorideMg ?? null,
              // Vitamins
              vitaminAMcg: nutrition.vitaminAMcg ?? null,
              vitaminB6Mg: nutrition.vitaminB6Mg ?? null,
              vitaminB12Mcg: nutrition.vitaminB12Mcg ?? null,
              vitaminCMg: nutrition.vitaminCMg ?? null,
              vitaminDMcg: nutrition.vitaminDMcg ?? null,
              vitaminEMg: nutrition.vitaminEMg ?? null,
              vitaminKMcg: nutrition.vitaminKMcg ?? null,
              thiaminMg: nutrition.thiaminMg ?? null,
              riboflavinMg: nutrition.riboflavinMg ?? null,
              niacinMg: nutrition.niacinMg ?? null,
              folateMcg: nutrition.folateMcg ?? null,
              biotinMcg: nutrition.biotinMcg ?? null,
              pantothenicAcidMg: nutrition.pantothenicAcidMg ?? null,
              // Other
              caffeineMg: nutrition.caffeineMg ?? null,
              waterMl: nutrition.waterMl ?? null,
            });
            results.nutrition.inserted++;
          } catch (err: any) {
            logger.error(`[DevImport] Nutrition error for ${nutrition.date}:`, err.message);
            results.nutrition.errors++;
          }
        }
      }
      
      // Import mindfulness sessions
      if (mindfulnessSessions && Array.isArray(mindfulnessSessions)) {
        logger.info(`[DevImport] Importing ${mindfulnessSessions.length} mindfulness sessions`);
        const { processMindfulnessSession } = await import('./services/nutritionMindfulnessAggregator');
        
        for (const session of mindfulnessSessions) {
          try {
            const startTime = new Date(session.startTime);
            const endTime = new Date(session.endTime);
            
            await processMindfulnessSession(
              userId,
              startTime,
              endTime,
              session.sourceName || 'DevImporter',
              session.sourceBundleId || 'com.flo.devimporter',
              session.healthkitUuid || null,
              { timezone: session.timezone || 'Australia/Perth' }
            );
            results.mindfulness.inserted++;
          } catch (err: any) {
            logger.error(`[DevImport] Mindfulness error for ${session.sessionDate}:`, err.message);
            results.mindfulness.errors++;
          }
        }
      }
      
      logger.info(`[DevImport] Import complete for ${email}:`, results);
      
      return res.json({
        success: true,
        user: { email, userId },
        results,
      });
      
    } catch (error: any) {
      logger.error("[DevImport] Import error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Sleep Score Routes
  // Get today's sleep score and metrics
  app.get("/api/sleep/today", isAuthenticated, async (req: any, res) => {
    try {
      // CRITICAL: Prevent iOS overnight caching - force fresh data after HealthKit sync
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const userId = req.user.claims.sub;
      
      // TIMEZONE FIX: Get today's date in user's timezone, not UTC
      // Query the user's most recent daily metric to get their timezone via healthRouter (Supabase)
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const recentMetric = recentMetrics.length > 0 ? recentMetrics[0] : null;
      
      const userTimezone = recentMetric?.timezone || 'UTC';
      
      // Calculate today's date in the user's timezone
      const today = new Date().toLocaleString('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split(',')[0]; // Format: YYYY-MM-DD
      
      logger.info(`[Sleep] Querying for date ${today} in timezone ${userTimezone}`);

      // Check if already computed
      const existing = await db
        .select()
        .from(sleepSubscores)
        .where(
          and(
            eq(sleepSubscores.userId, userId),
            eq(sleepSubscores.sleepDate, today)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Return cached sleep score
        logger.info(`[Sleep] Returning cached sleep score for user ${userId}, ${today}`);
        const subscore = existing[0];

        // Fetch corresponding sleep night data via storage layer
        const night = await healthRouter.getSleepNightByDate(userId, today);

        if (!night) {
          return res.status(404).json({ error: "Sleep night data not found" });
        }

        // Format response
        const totalHours = Math.floor((night.totalSleepMin || 0) / 60);
        const totalMinutes = Math.round((night.totalSleepMin || 0) % 60);
        const bedHours = Math.floor((night.timeInBedMin || 0) / 60);
        const bedMinutes = Math.round((night.timeInBedMin || 0) % 60);

        return res.json({
          nightflo_score: subscore.nightfloScore,
          score_label: subscore.scoreLabel,
          score_delta_vs_baseline: subscore.scoreDeltaVsBaseline || 0,
          trend_direction: subscore.trendDirection || 'flat',
          total_sleep_duration: `${totalHours}h ${totalMinutes}m`,
          time_in_bed: `${bedHours}h ${bedMinutes}m`,
          sleep_efficiency_pct: Math.round(night.sleepEfficiencyPct || 0),
          deep_sleep_pct: Math.round(night.deepPct || 0),
          rem_sleep_pct: Math.round(night.remPct || 0),
          bedtime_local: night.bedtimeLocal || 'N/A',
          waketime_local: night.waketimeLocal || 'N/A',
          headline_insight: subscore.headlineInsight || 'Sleep data available',
        });
      }

      // No cached data - need to compute from latest sleep night
      // First, update baselines
      await calculateSleepBaselinesForUser(userId);

      // Get most recent sleep night (within last 2 days) via storage layer
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const recentNights = await healthRouter.getSleepNights(userId, { startDate: twoDaysAgo, limit: 1 });

      if (recentNights.length === 0) {
        return res.status(404).json({
          error: "No recent sleep data available",
          message: "Please ensure you have synced HealthKit sleep data"
        });
      }

      const night = recentNights[0];

      // Calculate sleep score
      const scoreResult = await calculateSleepScore({
        userId,
        sleepDate: night.sleepDate,
        totalSleepMin: night.totalSleepMin || 0,
        sleepEfficiencyPct: night.sleepEfficiencyPct || 0,
        sleepLatencyMin: night.sleepLatencyMin || undefined,
        wasoMin: night.wasoMin || undefined,
        deepPct: night.deepPct || 0,
        remPct: night.remPct || 0,
        midSleepTimeLocal: night.midSleepTimeLocal || undefined,
        restingHrBpm: night.restingHrBpm || undefined,
        hrvMs: night.hrvMs || undefined,
        respiratoryRate: night.respiratoryRate || undefined,
        wristTemperature: night.wristTemperature || undefined,
        oxygenSaturation: night.oxygenSaturation || undefined,
      });

      // Generate AI insight (simple for now, can enhance with OpenAI later)
      let headlineInsight = `Your sleep score is ${scoreResult.scoreLabel.toLowerCase()}.`;
      if (scoreResult.durationScore && scoreResult.durationScore < 60) {
        headlineInsight += ` Try to get more sleep tonight.`;
      } else if (scoreResult.structureScore && scoreResult.structureScore < 60) {
        headlineInsight += ` Consider improving your sleep environment for better deep sleep.`;
      } else if (scoreResult.efficiencyScore && scoreResult.efficiencyScore < 70) {
        headlineInsight += ` Focus on sleep hygiene to reduce wake time.`;
      } else {
        headlineInsight += ` Keep up the great sleep habits!`;
      }

      // Store the computed subscores (upsert to handle re-syncs)
      await db.insert(sleepSubscores).values({
        userId,
        sleepDate: night.sleepDate,
        durationScore: scoreResult.durationScore,
        efficiencyScore: scoreResult.efficiencyScore,
        structureScore: scoreResult.structureScore,
        consistencyScore: scoreResult.consistencyScore,
        recoveryScore: scoreResult.recoveryScore,
        nightfloScore: scoreResult.nightfloScore,
        scoreLabel: scoreResult.scoreLabel,
        scoreDeltaVsBaseline: scoreResult.scoreDeltaVsBaseline,
        trendDirection: scoreResult.trendDirection,
        headlineInsight,
      }).onConflictDoUpdate({
        target: [sleepSubscores.userId, sleepSubscores.sleepDate],
        set: {
          durationScore: scoreResult.durationScore,
          efficiencyScore: scoreResult.efficiencyScore,
          structureScore: scoreResult.structureScore,
          consistencyScore: scoreResult.consistencyScore,
          recoveryScore: scoreResult.recoveryScore,
          nightfloScore: scoreResult.nightfloScore,
          scoreLabel: scoreResult.scoreLabel,
          scoreDeltaVsBaseline: scoreResult.scoreDeltaVsBaseline,
          trendDirection: scoreResult.trendDirection,
          headlineInsight,
        },
      });

      logger.info(`[Sleep] Computed and stored sleep score for user ${userId}, ${night.sleepDate}: ${scoreResult.nightfloScore}`);

      // Format response
      const totalHours = Math.floor((night.totalSleepMin || 0) / 60);
      const totalMinutes = Math.round((night.totalSleepMin || 0) % 60);
      const bedHours = Math.floor((night.timeInBedMin || 0) / 60);
      const bedMinutes = Math.round((night.timeInBedMin || 0) % 60);

      res.json({
        nightflo_score: scoreResult.nightfloScore,
        score_label: scoreResult.scoreLabel,
        score_delta_vs_baseline: scoreResult.scoreDeltaVsBaseline || 0,
        trend_direction: scoreResult.trendDirection || 'flat',
        total_sleep_duration: `${totalHours}h ${totalMinutes}m`,
        time_in_bed: `${bedHours}h ${bedMinutes}m`,
        sleep_efficiency_pct: Math.round(night.sleepEfficiencyPct || 0),
        deep_sleep_pct: Math.round(night.deepPct || 0),
        rem_sleep_pct: Math.round(night.remPct || 0),
        bedtime_local: night.bedtimeLocal || 'N/A',
        waketime_local: night.waketimeLocal || 'N/A',
        headline_insight: headlineInsight,
      });
    } catch (error: any) {
      logger.error("[Sleep] Error getting today's sleep score:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ==================== MANUAL SLEEP TRACKING ====================
  
  // Get manual sleep entries (history)
  app.get("/api/sleep/manual", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const days = parseInt(req.query.days as string) || 14;
      
      const entries = await supabaseHealthStorage.getManualSleepEntries(userId, days);
      
      // Use the explicit source field from the database
      // Entries without source field default to 'healthkit' (conservative - protect wearable data)
      const entriesWithSource = entries.map((entry: any) => ({
        ...entry,
        source: entry.source || 'healthkit'
      }));
      
      res.json(entriesWithSource);
    } catch (error: any) {
      logger.error("[ManualSleep] Error getting entries:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get active sleep timer status
  app.get("/api/sleep/manual/timer", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const activeTimer = await supabaseHealthStorage.getActiveManualSleepTimer(userId);
      
      if (activeTimer) {
        const bedtime = new Date(activeTimer.bedtime);
        const now = new Date();
        const elapsedMinutes = Math.round((now.getTime() - bedtime.getTime()) / (1000 * 60));
        
        res.json({
          isActive: true,
          startedAt: activeTimer.bedtime,
          bedtimeLocal: activeTimer.bedtime_local,
          elapsedMinutes,
          timezone: activeTimer.timezone,
        });
      } else {
        res.json({ isActive: false });
      }
    } catch (error: any) {
      logger.error("[ManualSleep] Error getting timer status:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Start sleep timer
  app.post("/api/sleep/manual/timer/start", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Try to get timezone from body, query, or header (Capacitor may strip body)
      let timezone = req.body?.timezone || req.query?.timezone || req.headers['x-timezone'];
      
      // Fallback to UTC if not provided (better than failing)
      if (!timezone) {
        logger.warn(`[ManualSleep] No timezone provided for user ${userId}, using UTC fallback`);
        timezone = 'UTC';
      }
      
      // Check if timer already active
      const existing = await supabaseHealthStorage.getActiveManualSleepTimer(userId);
      if (existing) {
        return res.status(400).json({ 
          error: "Sleep timer already active",
          startedAt: existing.bedtime,
        });
      }
      
      const entry = await supabaseHealthStorage.startManualSleepTimer(userId, timezone);
      
      logger.info(`[ManualSleep] Started timer for user ${userId}`);
      
      res.json({
        success: true,
        entry,
        message: "Sleep timer started. Sweet dreams!",
      });
    } catch (error: any) {
      logger.error("[ManualSleep] Error starting timer:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Stop sleep timer and log sleep
  app.post("/api/sleep/manual/timer/stop", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { qualityRating, notes } = req.body;
      
      if (!qualityRating || qualityRating < 1 || qualityRating > 5) {
        return res.status(400).json({ error: "Quality rating must be between 1 and 5" });
      }
      
      const entry = await supabaseHealthStorage.stopManualSleepTimer(userId, qualityRating, notes);
      
      if (!entry) {
        return res.status(400).json({ error: "No active sleep timer found" });
      }
      
      logger.info(`[ManualSleep] Stopped timer for user ${userId}`, {
        duration: entry.duration_minutes,
        quality: entry.quality_rating,
        score: entry.nightflo_score,
      });
      
      res.json({
        success: true,
        entry,
        message: `Logged ${Math.floor(entry.duration_minutes / 60)}h ${entry.duration_minutes % 60}m of sleep with score ${entry.nightflo_score}`,
      });
    } catch (error: any) {
      logger.error("[ManualSleep] Error stopping timer:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Create manual sleep entry (without timer)
  app.post("/api/sleep/manual", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { bedtime, wakeTime, qualityRating, notes, timezone } = req.body;
      
      if (!bedtime || !wakeTime || !qualityRating || !timezone) {
        return res.status(400).json({ 
          error: "Missing required fields: bedtime, wakeTime, qualityRating, timezone" 
        });
      }
      
      if (qualityRating < 1 || qualityRating > 5) {
        return res.status(400).json({ error: "Quality rating must be between 1 and 5" });
      }
      
      const bedtimeDate = new Date(bedtime);
      const wakeTimeDate = new Date(wakeTime);
      
      if (wakeTimeDate <= bedtimeDate) {
        return res.status(400).json({ error: "Wake time must be after bedtime" });
      }
      
      const durationMinutes = Math.round((wakeTimeDate.getTime() - bedtimeDate.getTime()) / (1000 * 60));
      const sleepDate = wakeTimeDate.toISOString().split('T')[0];
      
      // Format local times
      const bedtimeLocal = bedtimeDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone,
      }).toLowerCase();
      
      const waketimeLocal = wakeTimeDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone,
      }).toLowerCase();
      
      // Calculate score
      const { score, label } = supabaseHealthStorage.calculateManualNightfloScore(durationMinutes, qualityRating);
      
      const entry = await supabaseHealthStorage.upsertManualSleepEntry(userId, {
        sleep_date: sleepDate,
        timezone,
        bedtime: bedtimeDate.toISOString(),
        wake_time: wakeTimeDate.toISOString(),
        bedtime_local: bedtimeLocal,
        waketime_local: waketimeLocal,
        duration_minutes: durationMinutes,
        quality_rating: qualityRating,
        notes: notes || null,
        nightflo_score: score,
        score_label: label,
        is_timer_active: false,
      });
      
      logger.info(`[ManualSleep] Created entry for user ${userId}`, {
        date: sleepDate,
        duration: durationMinutes,
        score,
      });
      
      res.json({ success: true, entry });
    } catch (error: any) {
      logger.error("[ManualSleep] Error creating entry:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Update manual sleep entry
  app.patch("/api/sleep/manual/:entryId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { entryId } = req.params;
      const { bedtime, wakeTime, qualityRating, notes } = req.body;
      
      // First, verify this is a manual entry
      const existingEntry = await supabaseHealthStorage.getManualSleepEntryById(userId, entryId);
      if (!existingEntry) {
        return res.status(404).json({ error: "Entry not found" });
      }
      
      // Check if this is a manual entry using the explicit source field
      // No heuristic fallback - entries without source field default to protected (not editable)
      const existingData = existingEntry as any;
      const isManualEntry = existingData.source === 'manual';
      
      if (!isManualEntry) {
        return res.status(403).json({ 
          error: "Cannot edit HealthKit entries. Only manually logged sleep can be edited." 
        });
      }
      
      const updates: any = {};
      if (bedtime) updates.bedtime = bedtime;
      if (wakeTime) updates.wake_time = wakeTime;
      if (qualityRating !== undefined) {
        if (qualityRating < 1 || qualityRating > 5) {
          return res.status(400).json({ error: "Quality rating must be between 1 and 5" });
        }
        updates.quality_rating = qualityRating;
      }
      if (notes !== undefined) updates.notes = notes;
      
      const updatedEntry = await supabaseHealthStorage.updateManualSleepEntry(userId, entryId, updates);
      
      if (!updatedEntry) {
        return res.status(404).json({ error: "Entry not found" });
      }
      
      logger.info(`[ManualSleep] Updated entry ${entryId} for user ${userId}`);
      
      res.json({ success: true, entry: updatedEntry });
    } catch (error: any) {
      logger.error("[ManualSleep] Error updating entry:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Delete manual sleep entry
  app.delete("/api/sleep/manual/:entryId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { entryId } = req.params;
      
      // First, verify this is a manual entry
      const existingEntry = await supabaseHealthStorage.getManualSleepEntryById(userId, entryId);
      if (!existingEntry) {
        return res.status(404).json({ error: "Entry not found" });
      }
      
      // Check if this is a manual entry using the explicit source field
      // No heuristic fallback - entries without source field default to protected (not deletable)
      const existingData = existingEntry as any;
      const isManualEntry = existingData.source === 'manual';
      
      if (!isManualEntry) {
        return res.status(403).json({ 
          error: "Cannot delete HealthKit entries. Only manually logged sleep can be deleted." 
        });
      }
      
      const success = await supabaseHealthStorage.deleteManualSleepEntry(userId, entryId);
      
      if (!success) {
        return res.status(404).json({ error: "Entry not found or could not be deleted" });
      }
      
      logger.info(`[ManualSleep] Deleted entry ${entryId} for user ${userId}`);
      
      res.json({ success: true });
    } catch (error: any) {
      logger.error("[ManualSleep] Error deleting entry:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Get combined sleep data (HealthKit + Manual) for dashboard
  app.get("/api/sleep/combined", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const days = parseInt(req.query.days as string) || 14;
      
      const combinedData = await supabaseHealthStorage.getCombinedSleepData(userId, days);
      
      // Format response for dashboard tile
      if (combinedData.length === 0) {
        return res.json({ 
          hasData: false,
          message: "No sleep data available. Start tracking your sleep!" 
        });
      }
      
      const latest = combinedData[0];
      const source = (latest as any).source;
      
      // Build response based on data source
      if (source === 'manual') {
        const manual = latest as supabaseHealthStorage.ManualSleepEntry;
        const totalHours = Math.floor(manual.duration_minutes / 60);
        const totalMinutes = Math.round(manual.duration_minutes % 60);
        
        res.json({
          hasData: true,
          source: 'manual',
          nightflo_score: manual.nightflo_score,
          score_label: manual.score_label,
          score_delta_vs_baseline: 0,
          trend_direction: 'flat',
          total_sleep_duration: `${totalHours}h ${totalMinutes}m`,
          time_in_bed: `${totalHours}h ${totalMinutes}m`,
          sleep_efficiency_pct: 100,
          deep_sleep_pct: null,
          rem_sleep_pct: null,
          bedtime_local: manual.bedtime_local,
          waketime_local: manual.waketime_local,
          headline_insight: `You rated your sleep ${manual.quality_rating}/5. ${manual.score_label} rest!`,
          quality_rating: manual.quality_rating,
        });
      } else {
        // HealthKit data - use existing format
        const hk = latest as supabaseHealthStorage.SleepNight;
        const totalHours = Math.floor((hk.total_sleep_min || 0) / 60);
        const totalMinutes = Math.round((hk.total_sleep_min || 0) % 60);
        const bedHours = Math.floor((hk.time_in_bed_min || 0) / 60);
        const bedMinutes = Math.round((hk.time_in_bed_min || 0) % 60);
        
        // Try to get subscores from DB
        const subscores = await db
          .select()
          .from(sleepSubscores)
          .where(
            and(
              eq(sleepSubscores.userId, userId),
              eq(sleepSubscores.sleepDate, hk.sleep_date)
            )
          )
          .limit(1);
        
        const subscore = subscores.length > 0 ? subscores[0] : null;
        
        res.json({
          hasData: true,
          source: 'healthkit',
          nightflo_score: subscore?.nightfloScore || 0,
          score_label: subscore?.scoreLabel || 'N/A',
          score_delta_vs_baseline: subscore?.scoreDeltaVsBaseline || 0,
          trend_direction: subscore?.trendDirection || 'flat',
          total_sleep_duration: `${totalHours}h ${totalMinutes}m`,
          time_in_bed: `${bedHours}h ${bedMinutes}m`,
          sleep_efficiency_pct: Math.round(hk.sleep_efficiency_pct || 0),
          deep_sleep_pct: Math.round(hk.deep_pct || 0),
          rem_sleep_pct: Math.round(hk.rem_pct || 0),
          bedtime_local: hk.bedtime_local || 'N/A',
          waketime_local: hk.waketime_local || 'N/A',
          headline_insight: subscore?.headlineInsight || 'Sleep data from HealthKit',
        });
      }
    } catch (error: any) {
      logger.error("[Sleep] Error getting combined sleep data:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // Diagnostic results routes
  // Upload calcium score PDF and extract data
  app.post("/api/diagnostics/calcium-score/upload", isAuthenticated, uploadRateLimiter, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileBuffer = file.buffer;

      // Extract calcium score data from PDF
      const extractionResult = await extractCalciumScoreFromPdf(fileBuffer);

      if (!extractionResult.success || !extractionResult.data) {
        return res.status(400).json({ 
          error: "Failed to extract calcium score data",
          details: extractionResult.error 
        });
      }

      const data = extractionResult.data;

      // Parse study date
      let studyDate: Date;
      if (data.study.study_date) {
        studyDate = new Date(data.study.study_date);
        if (isNaN(studyDate.getTime())) {
          studyDate = new Date();
        }
      } else {
        studyDate = new Date();
      }

      // Calculate age at scan if we have patient age
      let ageAtScan = data.patient_context.reported_age ?? null;

      // Determine risk category from total score
      let riskCategory = data.results.risk_category ?? null;
      if (!riskCategory && data.results.total_agatston !== null) {
        const score = data.results.total_agatston;
        if (score === 0) riskCategory = "zero";
        else if (score <= 10) riskCategory = "minimal";
        else if (score <= 100) riskCategory = "mild";
        else if (score <= 400) riskCategory = "moderate";
        else riskCategory = "severe";
      }

      // Insert study into database
      const study = await healthRouter.createDiagnosticStudy(userId, {
        userId,
        type: "coronary_calcium_score",
        source: "uploaded_pdf",
        studyDate,
        ageAtScan,
        totalScoreNumeric: data.results.total_agatston ?? null,
        riskCategory,
        agePercentile: data.results.age_matched_percentile ?? null,
        aiPayload: data,
        status: "parsed",
      });

      // Insert per-vessel metrics
      const metrics: any[] = [];
      if (data.results.per_vessel.lad !== null) {
        metrics.push({
          studyId: study.id,
          code: "lad",
          label: "Left Anterior Descending",
          valueNumeric: data.results.per_vessel.lad,
          unit: "agatston",
          extra: null,
        });
      }
      if (data.results.per_vessel.rca !== null) {
        metrics.push({
          studyId: study.id,
          code: "rca",
          label: "Right Coronary Artery",
          valueNumeric: data.results.per_vessel.rca,
          unit: "agatston",
          extra: null,
        });
      }
      if (data.results.per_vessel.lcx !== null) {
        metrics.push({
          studyId: study.id,
          code: "lcx",
          label: "Left Circumflex",
          valueNumeric: data.results.per_vessel.lcx,
          unit: "agatston",
          extra: null,
        });
      }
      if (data.results.per_vessel.lm !== null) {
        metrics.push({
          studyId: study.id,
          code: "lm",
          label: "Left Main",
          valueNumeric: data.results.per_vessel.lm,
          unit: "agatston",
          extra: null,
        });
      }



      // Bulk insert metrics
      if (metrics.length > 0) {
        await storage.createDiagnosticMetrics(metrics);
      }

      res.json({
        success: true,
        study,
        metricsCount: metrics.length,
      });
    } catch (error) {
      logger.error('Error uploading calcium score:', error);
      res.status(500).json({ error: "Failed to process calcium score upload" });
    }
  });

  // EXPERIMENTAL: Upload calcium score PDF using advanced AI model for difficult PDFs
  app.post("/api/diagnostics/calcium-score/upload-experimental", isAuthenticated, uploadRateLimiter, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileBuffer = file.buffer;
      const modelName = req.body.model || "gpt-5";

      // Extract calcium score data from PDF using experimental extractor
      const extractionResult = await extractCalciumScoreExperimental(fileBuffer, file.originalname, { model: modelName });

      if (!extractionResult.success || !extractionResult.data) {
        return res.status(400).json({ 
          error: "Failed to extract calcium score data",
          details: extractionResult.error,
          modelUsed: extractionResult.modelUsed,
        });
      }

      const data = extractionResult.data;

      // Parse study date
      let studyDate: Date;
      if (data.study.study_date) {
        studyDate = new Date(data.study.study_date);
        if (isNaN(studyDate.getTime())) {
          studyDate = new Date();
        }
      } else {
        studyDate = new Date();
      }

      // Calculate age at scan if we have patient age
      let ageAtScan = data.patient_context.reported_age ?? null;

      // Determine risk category from total score
      let riskCategory = data.results.risk_category ?? null;
      if (!riskCategory && data.results.total_agatston !== null) {
        const score = data.results.total_agatston;
        if (score === 0) riskCategory = "zero";
        else if (score <= 10) riskCategory = "minimal";
        else if (score <= 100) riskCategory = "mild";
        else if (score <= 400) riskCategory = "moderate";
        else riskCategory = "severe";
      }

      // Insert study into database
      const study = await healthRouter.createDiagnosticStudy(userId, {
        userId,
        type: "coronary_calcium_score",
        source: "uploaded_pdf_experimental",
        studyDate,
        ageAtScan,
        totalScoreNumeric: data.results.total_agatston ?? null,
        riskCategory,
        agePercentile: data.results.age_matched_percentile ?? null,
        aiPayload: data,
        status: "parsed",
      });

      // Insert per-vessel metrics
      const metrics: any[] = [];
      if (data.results.per_vessel.lad !== null) {
        metrics.push({
          studyId: study.id,
          code: "lad",
          label: "Left Anterior Descending",
          valueNumeric: data.results.per_vessel.lad,
          unit: "agatston",
          extra: null,
        });
      }
      if (data.results.per_vessel.rca !== null) {
        metrics.push({
          studyId: study.id,
          code: "rca",
          label: "Right Coronary Artery",
          valueNumeric: data.results.per_vessel.rca,
          unit: "agatston",
          extra: null,
        });
      }
      if (data.results.per_vessel.lcx !== null) {
        metrics.push({
          studyId: study.id,
          code: "lcx",
          label: "Left Circumflex",
          valueNumeric: data.results.per_vessel.lcx,
          unit: "agatston",
          extra: null,
        });
      }
      if (data.results.per_vessel.lm !== null) {
        metrics.push({
          studyId: study.id,
          code: "lm",
          label: "Left Main",
          valueNumeric: data.results.per_vessel.lm,
          unit: "agatston",
          extra: null,
        });
      }



      // Bulk insert metrics
      if (metrics.length > 0) {
        await storage.createDiagnosticMetrics(metrics);
      }

      res.json({
        success: true,
        study,
        metricsCount: metrics.length,
        modelUsed: extractionResult.modelUsed,
        experimental: true,
      });
    } catch (error) {
      logger.error('Error uploading calcium score (experimental):', error);
      res.status(500).json({ error: "Failed to process calcium score upload" });
    }
  });

  // Upload DEXA scan PDF and extract data
  app.post("/api/diagnostics/dexa/upload", isAuthenticated, uploadRateLimiter, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileBuffer = file.buffer;

      // Extract DEXA scan data from PDF
      const extractionResult = await extractDexaScan(fileBuffer, file.originalname);

      if (!extractionResult.success || !extractionResult.data) {
        return res.status(400).json({ 
          error: "Failed to extract DEXA scan data",
          details: extractionResult.error 
        });
      }

      const data = extractionResult.data;

      // Parse study date
      let studyDate: Date;
      if (data.study.study_date) {
        studyDate = new Date(data.study.study_date);
        if (isNaN(studyDate.getTime())) {
          studyDate = new Date();
        }
      } else {
        studyDate = new Date();
      }

      // Calculate age at scan if we have patient age
      let ageAtScan = data.patient_context.reported_age ?? null;

      // Use WHO classification if available
      const whoClassification = data.bone_density.who_classification;

      // Insert study into database
      const study = await healthRouter.createDiagnosticStudy(userId, {
        userId,
        type: "dexa_scan",
        source: "uploaded_pdf",
        studyDate,
        ageAtScan,
        totalScoreNumeric: data.bone_density.spine_t_score,
        riskCategory: whoClassification,
        agePercentile: null,
        aiPayload: data,
        status: "parsed",
      });

      // Create individual metrics
      const metrics: any[] = [];

      // Bone density metrics
      if (data.bone_density.spine_t_score !== null) {
        metrics.push({
          studyId: study.id,
          code: "spine_t_score",
          label: "Spine T-Score",
          valueNumeric: data.bone_density.spine_t_score,
          unit: "t-score",
          extra: null,
        });
      }
      if (data.bone_density.total_hip_t_score !== null) {
        metrics.push({
          studyId: study.id,
          code: "total_hip_t_score",
          label: "Total Hip T-Score",
          valueNumeric: data.bone_density.total_hip_t_score,
          unit: "t-score",
          extra: null,
        });
      }
      if (data.bone_density.femoral_neck_t_score !== null) {
        metrics.push({
          studyId: study.id,
          code: "femoral_neck_t_score",
          label: "Femoral Neck T-Score",
          valueNumeric: data.bone_density.femoral_neck_t_score,
          unit: "t-score",
          extra: null,
        });
      }

      // Body composition metrics
      if (data.body_composition.fat_percent_total !== null) {
        metrics.push({
          studyId: study.id,
          code: "fat_percent_total",
          label: "Body Fat %",
          valueNumeric: data.body_composition.fat_percent_total,
          unit: "%",
          extra: null,
        });
      }
      if (data.body_composition.vat_area_cm2 !== null) {
        metrics.push({
          studyId: study.id,
          code: "vat_area_cm2",
          label: "Visceral Fat Area",
          valueNumeric: data.body_composition.vat_area_cm2,
          unit: "cm²",
          extra: null,
        });
      }
      if (data.body_composition.lean_mass_kg !== null) {
        metrics.push({
          studyId: study.id,
          code: "lean_mass_kg",
          label: "Lean Mass",
          valueNumeric: data.body_composition.lean_mass_kg,
          unit: "kg",
          extra: null,
        });
      }
      if (data.body_composition.bone_mass_kg !== null) {
        metrics.push({
          studyId: study.id,
          code: "bone_mass_kg",
          label: "Bone Mass",
          valueNumeric: data.body_composition.bone_mass_kg,
          unit: "kg",
          extra: null,
        });
      }

      // Bulk insert metrics
      if (metrics.length > 0) {
        await storage.createDiagnosticMetrics(metrics);
      }

      // Trigger ClickHouse body composition sync (non-blocking background task)
      (async () => {
        try {
          const { isClickHouseEnabled } = await import('./services/clickhouseService');
          if (isClickHouseEnabled()) {
            const { clickhouseBaselineEngine } = await import('./services/clickhouseBaselineEngine');
            const { getHealthId } = await import('./services/supabaseHealthStorage');
            const healthId = await getHealthId(userId);
            
            const syncedCount = await clickhouseBaselineEngine.syncBodyCompositionData(healthId, 365);
            logger.info(`[ClickHouseML] Auto-synced ${syncedCount} body composition records for ${userId} after DEXA upload`);
          }
        } catch (clickhouseError: any) {
          logger.warn(`[ClickHouseML] Body composition sync failed for ${userId}:`, clickhouseError.message);
        }
      })();

      res.json({
        success: true,
        study,
        metricsCount: metrics.length,
        modelUsed: extractionResult.modelUsed,
      });
    } catch (error) {
      logger.error('Error uploading DEXA scan:', error);
      res.status(500).json({ error: "Failed to process DEXA scan upload" });
    }
  });

  // Upload DEXA scan PDF with OCR + GPT-5 (Experimental)
  app.post("/api/diagnostics/dexa/upload-experimental", isAuthenticated, uploadRateLimiter, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const fileBuffer = file.buffer;

      // Extract DEXA scan data from PDF using OCR + GPT-5
      const extractionResult = await extractDexaScanExperimental(fileBuffer, file.originalname);

      if (!extractionResult.success || !extractionResult.data) {
        return res.status(400).json({ 
          error: "Failed to extract DEXA scan data",
          details: extractionResult.error 
        });
      }

      const data = extractionResult.data;

      // Parse study date
      let studyDate: Date;
      if (data.study.study_date) {
        studyDate = new Date(data.study.study_date);
        if (isNaN(studyDate.getTime())) {
          studyDate = new Date();
        }
      } else {
        studyDate = new Date();
      }

      // Calculate age at scan if we have patient age
      let ageAtScan = data.patient_context.reported_age ?? null;

      // Use WHO classification if available
      const whoClassification = data.bone_density.who_classification;

      // Insert study into database
      const study = await healthRouter.createDiagnosticStudy(userId, {
        userId,
        type: "dexa_scan",
        source: "uploaded_pdf_experimental",
        studyDate,
        ageAtScan,
        totalScoreNumeric: data.bone_density.spine_t_score,
        riskCategory: whoClassification,
        agePercentile: null,
        aiPayload: data,
        status: "parsed",
      });

      // Create individual metrics
      const metrics: any[] = [];

      // Bone density metrics
      if (data.bone_density.spine_t_score !== null) {
        metrics.push({
          studyId: study.id,
          code: "spine_t_score",
          label: "Spine T-Score",
          valueNumeric: data.bone_density.spine_t_score,
          unit: "t-score",
          extra: null,
        });
      }
      if (data.bone_density.total_hip_t_score !== null) {
        metrics.push({
          studyId: study.id,
          code: "total_hip_t_score",
          label: "Total Hip T-Score",
          valueNumeric: data.bone_density.total_hip_t_score,
          unit: "t-score",
          extra: null,
        });
      }
      if (data.bone_density.femoral_neck_t_score !== null) {
        metrics.push({
          studyId: study.id,
          code: "femoral_neck_t_score",
          label: "Femoral Neck T-Score",
          valueNumeric: data.bone_density.femoral_neck_t_score,
          unit: "t-score",
          extra: null,
        });
      }

      // Body composition metrics
      if (data.body_composition.fat_percent_total !== null) {
        metrics.push({
          studyId: study.id,
          code: "fat_percent_total",
          label: "Body Fat %",
          valueNumeric: data.body_composition.fat_percent_total,
          unit: "%",
          extra: null,
        });
      }
      if (data.body_composition.vat_area_cm2 !== null) {
        metrics.push({
          studyId: study.id,
          code: "vat_area_cm2",
          label: "Visceral Fat Area",
          valueNumeric: data.body_composition.vat_area_cm2,
          unit: "cm²",
          extra: null,
        });
      }
      if (data.body_composition.lean_mass_kg !== null) {
        metrics.push({
          studyId: study.id,
          code: "lean_mass_kg",
          label: "Lean Mass",
          valueNumeric: data.body_composition.lean_mass_kg,
          unit: "kg",
          extra: null,
        });
      }
      if (data.body_composition.bone_mass_kg !== null) {
        metrics.push({
          studyId: study.id,
          code: "bone_mass_kg",
          label: "Bone Mass",
          valueNumeric: data.body_composition.bone_mass_kg,
          unit: "kg",
          extra: null,
        });
      }

      // Bulk insert metrics
      if (metrics.length > 0) {
        await storage.createDiagnosticMetrics(metrics);
      }

      res.json({
        success: true,
        study,
        metricsCount: metrics.length,
        modelUsed: extractionResult.modelUsed,
        experimental: true,
      });
    } catch (error) {
      logger.error('Error uploading DEXA scan (experimental):', error);
      res.status(500).json({ error: "Failed to process DEXA scan upload" });
    }
  });

  // Get diagnostic summary for dashboard
  app.get("/api/diagnostics/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get latest calcium score
      const latestCalciumScore = await storage.getLatestDiagnosticStudy(userId, "coronary_calcium_score");

      // Get latest DEXA scan
      const latestDexaScan = await storage.getLatestDiagnosticStudy(userId, "dexa_scan");

      const summary: any = {
        calciumScore: null,
        dexaScan: null,
      };

      if (latestCalciumScore) {
        summary.calciumScore = {
          totalScore: latestCalciumScore.totalScoreNumeric,
          riskLevel: latestCalciumScore.riskCategory,
          agePercentile: latestCalciumScore.agePercentile,
          studyDate: latestCalciumScore.studyDate.toISOString(),
        };
      }

      if (latestDexaScan) {
        const payload = latestDexaScan.aiPayload as any;
        summary.dexaScan = {
          spineTScore: payload?.bone_density?.spine_t_score ?? latestDexaScan.totalScoreNumeric,
          hipTScore: payload?.bone_density?.total_hip_t_score,
          whoClassification: latestDexaScan.riskCategory,
          bodyFatPercent: payload?.body_composition?.fat_percent_total,
          vatArea: payload?.body_composition?.vat_area_cm2,
          studyDate: latestDexaScan.studyDate.toISOString(),
        };
      }

      res.json(summary);
    } catch (error) {
      logger.error('Error fetching diagnostic summary:', error);
      res.status(500).json({ error: "Failed to fetch diagnostic summary" });
    }
  });

  // Body composition endpoint - HealthKit data ONLY (no DEXA fallback)
  // Returns null if no HealthKit data available - tile should not render
  // Uses age-and-sex-adjusted scoring algorithm v1
  app.get("/api/body-composition", isAuthenticated, async (req: any, res) => {
    try {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const userId = req.user.claims.sub;
      
      // Get user's profile for sex and age
      const profile = await storage.getProfile(userId);
      const sex = profile?.sex === 'Female' ? 'female' : 'male';
      
      // Calculate age from birth year using mid-year (July 1st) assumption
      let age: number | null = calculateAgeFromBirthYear(profile?.birthYear);
      if (age !== null) {
        age = Math.max(18, Math.min(100, age)); // Clamp to valid range
      }
      
      // Query HealthKit data from health_daily_metrics (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

      const healthData = await db
        .select()
        .from(healthDailyMetrics)
        .where(
          and(
            eq(healthDailyMetrics.userId, userId),
            gte(healthDailyMetrics.date, ninetyDaysAgoStr)
          )
        )
        .orderBy(desc(healthDailyMetrics.date));

      // Check if we have body composition data
      // Support TWO scenarios:
      // 1. Direct bodyFatPct from HealthKit (most common)
      // 2. Weight + Lean Mass to calculate body fat
      const hasBodyCompData = healthData.some(d => 
        d.bodyFatPct !== null || (d.weightKg !== null && d.leanMassKg !== null)
      );

      if (!hasBodyCompData) {
        // No body composition data - tile should not render
        return res.json({ hasData: false, data: null, history: [] });
      }

      // Get most recent values for each metric
      const mostRecentBodyFatDirect = healthData.find(d => d.bodyFatPct !== null);
      const mostRecentWithBothMetrics = healthData.find(d => d.weightKg !== null && d.leanMassKg !== null);
      const mostRecentWeight = healthData.find(d => d.weightKg !== null);
      const mostRecentBmi = healthData.find(d => d.bmi !== null);

      // Calculate body fat and lean mass percentages
      // Priority: Use weight+leanMass calculation if available, else use direct bodyFatPct
      let bodyFatPercent: number;
      let leanMassPercent: number;
      let weightKg: number | null = mostRecentWeight?.weightKg ?? null;
      let leanMassKg: number | null = null;
      let lastUpdated: string;

      if (mostRecentWithBothMetrics) {
        // Best case: We have both weight and lean mass
        weightKg = mostRecentWithBothMetrics.weightKg!;
        leanMassKg = mostRecentWithBothMetrics.leanMassKg!;
        leanMassPercent = (leanMassKg / weightKg) * 100;
        const rawBodyFatPercent = 100 * (1 - leanMassKg / weightKg);
        bodyFatPercent = Math.max(3, Math.min(60, rawBodyFatPercent));
        lastUpdated = mostRecentWithBothMetrics.date;
      } else if (mostRecentBodyFatDirect) {
        // Fallback: Direct body fat percentage from HealthKit
        bodyFatPercent = Math.max(3, Math.min(60, mostRecentBodyFatDirect.bodyFatPct!));
        leanMassPercent = 100 - bodyFatPercent; // Derived (approximate)
        lastUpdated = mostRecentBodyFatDirect.date;
      } else {
        // Should not reach here due to hasBodyCompData check, but safety fallback
        return res.json({ hasData: false, data: null, history: [] });
      }

      // Age-and-sex-adjusted ideal body fat ranges
      const getIdealBodyFatRange = (userAge: number, userSex: 'male' | 'female'): { min: number; max: number } => {
        const ranges = {
          male: [
            { ageMin: 18, ageMax: 39.999, idealMin: 8, idealMax: 18 },
            { ageMin: 40, ageMax: 59.999, idealMin: 11, idealMax: 21 },
            { ageMin: 60, ageMax: 120, idealMin: 13, idealMax: 24 },
          ],
          female: [
            { ageMin: 18, ageMax: 39.999, idealMin: 21, idealMax: 32 },
            { ageMin: 40, ageMax: 59.999, idealMin: 23, idealMax: 33 },
            { ageMin: 60, ageMax: 120, idealMin: 24, idealMax: 35 },
          ],
        };
        
        const sexRanges = ranges[userSex];
        for (const r of sexRanges) {
          if (userAge >= r.ageMin && userAge <= r.ageMax) {
            return { min: r.idealMin, max: r.idealMax };
          }
        }
        // Fallback to last range
        const last = sexRanges[sexRanges.length - 1];
        return { min: last.idealMin, max: last.idealMax };
      };

      // Scoring algorithm parameters
      // Modified: Very lean individuals get EXCELLENT scores since being lean is healthy
      // Being below ideal has minimal penalty (max 5 points); being above ideal has steeper penalty
      const PARAMS = {
        underSpanPercent: 10,  // How far below ideal before max penalty (10%)
        overSpanPercent: 20,   // How far above ideal before score reaches 0
        insideRangeMinScore: 80,
        insideRangeMaxScore: 100,
        tooLeanFloorScore: 90, // Minimum score for being too lean (being lean is EXCELLENT)
        tooLeanMaxPenalty: 10, // Maximum penalty for being too lean (only lose 10 points max)
      };

      // Calculate body composition score
      let bodyCompositionScore: number | null = null;
      
      if (age !== null) {
        const { min: idealMin, max: idealMax } = getIdealBodyFatRange(age, sex);
        const idealMid = (idealMin + idealMax) / 2;
        
        if (bodyFatPercent >= idealMin && bodyFatPercent <= idealMax) {
          // Within ideal range: score 80-100 based on how central
          const halfRange = (idealMax - idealMin) / 2;
          if (halfRange === 0) {
            bodyCompositionScore = PARAMS.insideRangeMaxScore;
          } else {
            const distanceFromMid = Math.abs(bodyFatPercent - idealMid);
            const centralness = 1 - distanceFromMid / halfRange;
            bodyCompositionScore = PARAMS.insideRangeMinScore + 
              (PARAMS.insideRangeMaxScore - PARAMS.insideRangeMinScore) * centralness;
          }
        } else if (bodyFatPercent < idealMin) {
          // Too lean: very soft penalty (being very lean is still excellent!)
          // Score ranges from 90-100 for being under ideal
          // At ideal edge: 100, at extreme lean: 90 (never lower than 90)
          const deficit = idealMin - bodyFatPercent;
          const normalizedDeficit = Math.max(0, Math.min(1, deficit / PARAMS.underSpanPercent));
          // Use square root for even softer penalty curve
          const softPenalty = Math.sqrt(normalizedDeficit);
          bodyCompositionScore = PARAMS.insideRangeMaxScore - (PARAMS.tooLeanMaxPenalty * softPenalty);
        } else {
          // Too much fat: score 0-80 based on how far above ideal (steeper penalty)
          const excess = bodyFatPercent - idealMax;
          const normalizedExcess = Math.max(0, Math.min(1, excess / PARAMS.overSpanPercent));
          bodyCompositionScore = PARAMS.insideRangeMinScore * (1 - normalizedExcess);
        }
        
        // Clamp and round final score
        bodyCompositionScore = Math.max(0, Math.min(100, Math.round(bodyCompositionScore)));
      }

      // Build history array for charts
      // Include entries with either direct bodyFatPct OR weight+leanMass
      const history = healthData
        .filter(d => d.bodyFatPct !== null || (d.weightKg !== null && d.leanMassKg !== null))
        .map(d => {
          let fat: number;
          let lean: number;
          
          if (d.weightKg !== null && d.leanMassKg !== null) {
            // Calculate from weight and lean mass
            fat = Math.max(3, Math.min(60, 100 * (1 - d.leanMassKg / d.weightKg)));
            lean = (d.leanMassKg / d.weightKg) * 100;
          } else if (d.bodyFatPct !== null) {
            // Use direct body fat percentage
            fat = Math.max(3, Math.min(60, d.bodyFatPct));
            lean = 100 - fat;
          } else {
            // Should not reach here due to filter, but safety
            return null;
          }
          
          return {
            date: d.date,
            bodyFatPercent: parseFloat(fat.toFixed(1)),
            leanMassPercent: parseFloat(lean.toFixed(1)),
            weightKg: d.weightKg ? parseFloat(d.weightKg.toFixed(1)) : null,
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);

      // Determine score context for UI labeling
      let scoreContext: 'optimal' | 'athletic_lean' | 'above_optimal' | null = null;
      let scoreLabel: string | null = null;
      
      if (age !== null) {
        const { min: idealMin, max: idealMax } = getIdealBodyFatRange(age, sex);
        
        if (bodyFatPercent >= idealMin && bodyFatPercent <= idealMax) {
          scoreContext = 'optimal';
          scoreLabel = 'Optimal Range';
        } else if (bodyFatPercent < idealMin) {
          scoreContext = 'athletic_lean';
          scoreLabel = 'Athletic Leanness';
        } else {
          scoreContext = 'above_optimal';
          scoreLabel = bodyFatPercent > idealMax + 10 ? 'Above Optimal' : 'Slightly Above Optimal';
        }
      }

      res.json({
        hasData: true,
        data: {
          body_composition_score: bodyCompositionScore,
          body_fat_percent: parseFloat(bodyFatPercent.toFixed(1)),
          lean_mass_percent: parseFloat(leanMassPercent.toFixed(1)),
          weight_kg: weightKg ? parseFloat(weightKg.toFixed(1)) : null,
          lean_mass_kg: leanMassKg ? parseFloat(leanMassKg.toFixed(1)) : null,
          bmi: mostRecentBmi?.bmi ? parseFloat(mostRecentBmi.bmi.toFixed(1)) : null,
          last_updated: lastUpdated,
          score_context: scoreContext,
          score_label: scoreLabel,
        },
        history,
      });
    } catch (error) {
      logger.error('Error fetching body composition:', error);
      res.status(500).json({ error: "Failed to fetch body composition data" });
    }
  });

  // Dashboard API endpoints
  app.get("/api/dashboard/overview", isAuthenticated, async (req: any, res) => {
    try {
      // CRITICAL: Prevent iOS overnight caching - force fresh data after HealthKit sync
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const userId = req.user.claims.sub;
      const { calculateDashboardScores } = await import("./services/scoreCalculator");

      // Get scores
      const scores = await calculateDashboardScores(userId);

      // Get user profile for birth year
      const profile = await storage.getProfile(userId);

      let calendarAge: number | null = null;
      let bioAge: number | null = null;
      let bioAgeDelta: number | null = null;

      // Calculate age using mid-year (July 1st) assumption for ±6 month accuracy
      calendarAge = calculateAgeFromBirthYear(profile?.birthYear);

      // Biological age will be fetched separately on the client
      // For now, we'll leave it null and the client can fetch it from /api/biological-age

      // Get latest data dates
      const latestCalciumScore = await storage.getLatestDiagnosticStudy(userId, "coronary_calcium_score");
      const latestDexaScan = await storage.getLatestDiagnosticStudy(userId, "dexa_scan");

      res.json({
        bioAge,
        calendarAge,
        bioAgeDelta,
        floScore: scores.floScore,
        componentScores: {
          cardiometabolic: scores.cardiometabolic,
          bodyComposition: scores.bodyComposition,
          readiness: scores.readiness,
          inflammation: scores.inflammation,
        },
        lastFullCheckin: scores.lastUpdated?.toISOString() ?? null,
        dataAvailability: {
          labs: scores.lastUpdated !== null,
          cac: latestCalciumScore !== null,
          dexa: latestDexaScan !== null,
        },
        details: scores.details,
      });
    } catch (error) {
      logger.error('Error fetching dashboard overview:', error);
      res.status(500).json({ error: "Failed to fetch dashboard overview" });
    }
  });

  // Flōmentum API endpoints
  app.post("/api/health/daily-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const summaryData = req.body;
      
      // Validate payload
      if (!summaryData.date || typeof summaryData.date !== 'string') {
        return res.status(400).json({ error: "Invalid date format" });
      }

      logger.info('Received daily summary from iOS', { userId, date: summaryData.date });

      // SUPABASE-ONLY: Store daily metrics in Supabase exclusively
      const { isSupabaseHealthEnabled, upsertDailyMetrics: upsertSupabaseDailyMetrics } = await import('./services/healthStorageRouter');
      
      if (!isSupabaseHealthEnabled()) {
        return res.status(503).json({ error: "Health data storage not available - Supabase not enabled" });
      }

      // Convert to Supabase snake_case format for user_daily_metrics table
      const supabaseMetrics = {
        local_date: summaryData.date,
        timezone: summaryData.timezone || 'UTC',
        utc_day_start: new Date(summaryData.date + 'T00:00:00Z'),
        utc_day_end: new Date(summaryData.date + 'T23:59:59Z'),
        sleep_hours: summaryData.sleep_total_minutes ? summaryData.sleep_total_minutes / 60 : null,
        hrv_ms: summaryData.hrv_sdnn_ms ?? null,
        resting_hr_bpm: summaryData.resting_hr ?? null,
        respiratory_rate_bpm: summaryData.respiratory_rate ?? null,
        oxygen_saturation_pct: summaryData.oxygen_saturation_avg ?? null,
        steps_raw_sum: summaryData.steps ?? null,
        active_energy_kcal: summaryData.active_kcal ?? null,
        exercise_minutes: summaryData.exercise_minutes ?? null,
        stand_hours: summaryData.stand_hours ?? null,
        normalization_version: 'norm_v1',
      };

      await upsertSupabaseDailyMetrics(userId, supabaseMetrics);
      logger.info(`[HealthKit] Stored daily summary in Supabase for ${userId}, ${summaryData.date}`);

      // Calculate baselines
      const { calculateFlomentumBaselines } = await import("./services/flomentumBaselineCalculator");
      const baselines = await calculateFlomentumBaselines(userId, summaryData.date);

      // Get user settings for targets
      const [userSettings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
      
      if (!userSettings || !userSettings.flomentumEnabled) {
        logger.debug('Flōmentum not enabled for user', { userId });
        return res.json({ success: true, flomentumEnabled: false });
      }

      // Calculate Flōmentum score
      const { calculateFlomentumScore } = await import("./services/flomentumScoringEngine");
      
      const metrics: any = {
        sleepTotalMinutes: summaryData.sleep_total_minutes ?? null,
        hrvSdnnMs: summaryData.hrv_sdnn_ms ?? null,
        restingHr: summaryData.resting_hr ?? null,
        respiratoryRate: summaryData.respiratory_rate ?? null,
        bodyTempDeviationC: summaryData.body_temp_deviation_c ?? null,
        oxygenSaturationAvg: summaryData.oxygen_saturation_avg ?? null,
        steps: summaryData.steps ?? null,
        activeKcal: summaryData.active_kcal ?? null,
        exerciseMinutes: summaryData.exercise_minutes ?? null,
        standHours: summaryData.stand_hours ?? null,
      };

      const context: any = {
        stepsTarget: userSettings.stepsTarget,
        sleepTargetMinutes: userSettings.sleepTargetMinutes,
        restingHrBaseline: baselines.restingHrBaseline,
        hrvBaseline: baselines.hrvBaseline,
        respRateBaseline: baselines.respRateBaseline,
      };

      const scoreResult = calculateFlomentumScore(metrics, context);

      // Store the daily score via healthRouter to Supabase
      await healthRouter.upsertFlomentumDaily(userId, {
        date: summaryData.date,
        userId,
        score: scoreResult.score,
        zone: scoreResult.zone,
        factors: scoreResult.factors,
        dailyFocus: scoreResult.dailyFocus,
      });

      logger.info('Flōmentum score calculated', { 
        userId, 
        date: summaryData.date, 
        score: scoreResult.score,
        zone: scoreResult.zone,
      });

      res.json({ 
        success: true, 
        flomentumEnabled: true,
        score: scoreResult.score,
        zone: scoreResult.zone,
      });
    } catch (error) {
      logger.error('Error processing daily summary:', error);
      res.status(500).json({ error: "Failed to process daily summary" });
    }
  });

  app.get("/api/flomentum/weekly", isAuthenticated, canAccessFlomentum, async (req: any, res) => {
    try {
      // CRITICAL: Prevent iOS overnight caching - force fresh data after HealthKit sync
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const userId = req.user.claims.sub;
      
      // Get user settings
      const [userSettings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
      
      if (!userSettings || !userSettings.flomentumEnabled) {
        return res.status(404).json({ error: "Flōmentum not enabled" });
      }

      // Get this week's start date (Monday)
      const { getMondayOfWeek } = await import("./services/flomentumWeeklyAggregator");
      const weekStartDate = getMondayOfWeek(new Date());

      // Get weekly insight
      const [weeklyData] = await db
        .select()
        .from(flomentumWeekly)
        .where(
          and(
            eq(flomentumWeekly.userId, userId),
            eq(flomentumWeekly.weekStartDate, weekStartDate)
          )
        )
        .limit(1);

      if (!weeklyData) {
        return res.json(null);
      }

      res.json({
        weekStartDate: weeklyData.weekStartDate,
        averageScore: weeklyData.averageScore,
        dailyScores: weeklyData.dailyScores,
        whatHelped: weeklyData.whatHelped,
        whatHeldBack: weeklyData.whatHeldBack,
        focusNextWeek: weeklyData.focusNextWeek,
      });
    } catch (error) {
      logger.error('Error fetching Flōmentum weekly:', error);
      res.status(500).json({ error: "Failed to fetch weekly Flōmentum data" });
    }
  });

  app.get("/api/flomentum/today", isAuthenticated, canAccessFlomentum, async (req: any, res) => {
    try {
      // CRITICAL: Prevent iOS overnight caching - force fresh data after HealthKit sync
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const userId = req.user.claims.sub;
      
      // Get user settings
      const [userSettings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
      
      if (!userSettings || !userSettings.flomentumEnabled) {
        return res.status(404).json({ error: "Flōmentum not enabled" });
      }

      // TIMEZONE FIX: Get today's date in user's timezone, not UTC
      // Query the user's most recent daily metric to get their timezone via healthRouter (Supabase)
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const recentMetric = recentMetrics.length > 0 ? recentMetrics[0] : null;
      
      const userTimezone = recentMetric?.timezone || 'UTC';
      
      // Calculate today's date in the user's timezone
      const today = new Date().toLocaleString('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split(',')[0]; // Format: YYYY-MM-DD

      // Get today's Flōmentum score via healthRouter to Supabase
      const dailyScore = await healthRouter.getFlomentumDailyByDate(userId, today);

      if (!dailyScore) {
        return res.json(null);
      }

      // Get quick snapshot (recent 3 scores for trend) via healthRouter to Supabase
      const recentScores = await healthRouter.getFlomentumDaily(userId, { limit: 3 });

      const quickSnapshot = recentScores.map(s => ({
        date: s.date,
        score: s.score,
      }));

      // Always calculate streak from consecutive Flomentum scores via healthRouter to Supabase
      const allScores = await healthRouter.getFlomentumDaily(userId, { limit: 90 });

      // If no scores exist, no gamification data
      if (allScores.length === 0) {
        return res.json({
          date: dailyScore.date,
          score: dailyScore.score,
          zone: dailyScore.zone,
          factors: dailyScore.factors,
          dailyFocus: dailyScore.dailyFocus,
          quickSnapshot,
          gamification: null,
        });
      }
      
      // Check for consecutive days to calculate streak
      let currentStreak = 0;
      let prevDate: Date | null = null;
      for (const s of allScores) {
        const date = new Date(s.date);
        if (!prevDate) {
          currentStreak = 1;
        } else {
          const diffDays = Math.round((prevDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
        prevDate = date;
      }
      
      // Get longest streak from user's historical max
      const [prevEngagement] = await db
        .select({ longestStreak: userDailyEngagement.longestStreak })
        .from(userDailyEngagement)
        .where(eq(userDailyEngagement.userId, userId))
        .orderBy(sql`${userDailyEngagement.date} DESC`)
        .limit(1);
      
      const longestStreak = Math.max(currentStreak, prevEngagement?.longestStreak || 1);
      
      // Calculate XP: streak * daily score
      const totalXP = currentStreak * dailyScore.score;
      const level = Math.floor(totalXP / 500) + 1;
      
      // Get or create today's engagement record
      let [engagement] = await db
        .select()
        .from(userDailyEngagement)
        .where(and(
          eq(userDailyEngagement.userId, userId),
          eq(userDailyEngagement.date, today)
        ))
        .limit(1);

      // Always update streak/XP values to keep them current
      await db.insert(userDailyEngagement).values({
        userId,
        date: today,
        currentStreak,
        longestStreak,
        totalXP,
        level,
        insightsViewed: engagement?.insightsViewed ?? false,
        actionsChecked: engagement?.actionsChecked ?? false,
        aiChatUsed: engagement?.aiChatUsed ?? false,
      }).onConflictDoUpdate({
        target: [userDailyEngagement.userId, userDailyEngagement.date],
        set: {
          currentStreak,
          longestStreak,
          totalXP,
          level,
          updatedAt: new Date(),
        }
      });
      
      // Refresh engagement data after update
      [engagement] = await db
        .select()
        .from(userDailyEngagement)
        .where(and(
          eq(userDailyEngagement.userId, userId),
          eq(userDailyEngagement.date, today)
        ))
        .limit(1);

      // Get today's health metrics for activity bars via healthRouter (Supabase)
      // Use userDailyMetrics as primary source (where iOS HealthKit sync stores data)
      // Also check healthDailyMetrics as fallback
      const dailyMetrics = await healthRouter.getUserDailyMetricsByDate(userId, today);
      
      const [healthMetrics] = await db
        .select()
        .from(healthDailyMetrics)
        .where(and(
          eq(healthDailyMetrics.userId, userId),
          eq(healthDailyMetrics.date, today)
        ))
        .limit(1);
      
      // Query sleep_nights for reliable sleep data via storage layer (same as Flōmentum score calculation)
      const sleepNight = await healthRouter.getSleepNightByDate(userId, today);
      
      // Query healthkit workouts for today's exercise from Supabase via healthRouter
      // (workouts are stored in Supabase, not Neon)
      const todayWorkouts = await healthRouter.getHealthkitWorkoutsByDate(userId, today);
      
      const workoutMinutes = todayWorkouts.reduce((sum, w: any) => sum + (w.duration || 0), 0);

      // Activity goals - prioritize userDailyMetrics (stepsRawSum for actual count, not normalized score)
      // Then fall back to healthDailyMetrics if available
      // Use explicit null checks to ensure fallback works correctly
      let stepsValue = 0;
      if (dailyMetrics?.stepsRawSum != null) {
        stepsValue = dailyMetrics.stepsRawSum;
      } else if (dailyMetrics?.stepsNormalized != null) {
        stepsValue = dailyMetrics.stepsNormalized;
      } else if (healthMetrics?.steps != null) {
        stepsValue = healthMetrics.steps;
      }
      
      // Exercise minutes: check userDailyMetrics, healthDailyMetrics, then workout sessions
      let activeMinutesValue = 0;
      if (dailyMetrics?.exerciseMinutes != null && dailyMetrics.exerciseMinutes > 0) {
        activeMinutesValue = Math.round(dailyMetrics.exerciseMinutes);
      } else if (healthMetrics?.exerciseMinutes != null && healthMetrics.exerciseMinutes > 0) {
        activeMinutesValue = Math.round(healthMetrics.exerciseMinutes);
      } else if (workoutMinutes > 0) {
        activeMinutesValue = Math.round(workoutMinutes);
      }
      
      // Sleep hours: prioritize sleep_nights (more reliable), then userDailyMetrics, then healthDailyMetrics
      let sleepHoursValue = 0;
      if (sleepNight?.totalSleepMin != null && sleepNight.totalSleepMin > 0) {
        sleepHoursValue = Math.round((sleepNight.totalSleepMin / 60) * 10) / 10;
      } else if (dailyMetrics?.sleepHours != null && dailyMetrics.sleepHours > 0) {
        sleepHoursValue = Math.round(dailyMetrics.sleepHours * 10) / 10;
      } else if (healthMetrics?.sleepTotalMinutes != null && healthMetrics.sleepTotalMinutes > 0) {
        sleepHoursValue = Math.round((healthMetrics.sleepTotalMinutes / 60) * 10) / 10;
      }
      
      // Auto-detect if user has insights/actions today to mark checklist
      // Check for today's insights - SUPABASE-ONLY for PHI privacy
      const todaysInsights = await healthRouter.getDailyInsightsByDate(userId, today);
      const hasInsights = todaysInsights.length > 0;
      
      // Check for any active action items (actionPlanItems table already imported)
      const [hasActionsToday] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(actionPlanItems)
        .where(and(
          eq(actionPlanItems.userId, userId),
          eq(actionPlanItems.status, 'active')
        ));
      const hasActions = (hasActionsToday?.count || 0) > 0;
      
      // Use auto-detection OR manual marking (whichever is true)
      const insightsViewed = engagement.insightsViewed || hasInsights;
      const actionsChecked = engagement.actionsChecked || hasActions;
      
      const activityGoals = {
        steps: { current: stepsValue, goal: 10000 },
        activeMinutes: { current: activeMinutesValue, goal: 60 },
        sleepHours: { current: sleepHoursValue, goal: 8 },
      };
      
      // Fix stale workout factors: If we have workout data now but factors show "No workout",
      // update the intensity factor to reflect current data
      // Note: The scoring engine uses componentKey 'intensity' for exercise/workout factors
      let factors = dailyScore.factors as any[];
      if (activeMinutesValue > 0 && factors) {
        factors = factors.map((factor: any) => {
          if (factor.componentKey === 'intensity' && factor.title === 'No workout data today') {
            // Update the factor with current workout data
            const isGood = activeMinutesValue >= 30;
            const isModerate = activeMinutesValue >= 10;
            return {
              ...factor,
              status: isGood ? 'positive' : isModerate ? 'neutral' : 'negative',
              title: isGood ? 'Good workout / activity today' : isModerate ? 'Light activity today' : 'Low exercise intensity',
              detail: `${activeMinutesValue} min of exercise`,
            };
          }
          return factor;
        });
      }

      res.json({
        date: dailyScore.date,
        score: dailyScore.score,
        zone: dailyScore.zone,
        factors,
        dailyFocus: dailyScore.dailyFocus,
        quickSnapshot,
        // Gamification data
        gamification: {
          level: engagement.level,
          currentStreak: engagement.currentStreak,
          longestStreak: engagement.longestStreak,
          totalXP: engagement.totalXP,
          xpToNextLevel: 500 - (engagement.totalXP % 500),
          xpProgress: (engagement.totalXP % 500) / 500,
          checklist: {
            insightsViewed: insightsViewed,
            actionsChecked: actionsChecked,
            aiChatUsed: engagement.aiChatUsed,
          },
          activity: activityGoals,
        },
      });
    } catch (error) {
      logger.error('Error fetching Flōmentum today:', error);
      res.status(500).json({ error: "Failed to fetch Flōmentum data" });
    }
  });

  // Update engagement checklist for gamification
  const engagementFieldSchema = z.object({
    field: z.enum(['insightsViewed', 'actionsChecked', 'aiChatUsed']),
    value: z.boolean(),
  });

  app.patch("/api/flomentum/engagement", isAuthenticated, canAccessFlomentum, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const parseResult = engagementFieldSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request: field must be one of insightsViewed, actionsChecked, aiChatUsed" });
      }
      
      const { field, value } = parseResult.data;

      // Get user timezone via healthRouter (Supabase)
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const recentMetric = recentMetrics.length > 0 ? recentMetrics[0] : null;
      
      const userTimezone = recentMetric?.timezone || 'UTC';
      const today = new Date().toLocaleString('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split(',')[0];

      // Check if engagement record exists
      const [existing] = await db
        .select()
        .from(userDailyEngagement)
        .where(and(
          eq(userDailyEngagement.userId, userId),
          eq(userDailyEngagement.date, today)
        ))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "No engagement record for today. View your Flomentum score first." });
      }

      // Map field to database column name
      const dbFieldMap: Record<string, keyof typeof userDailyEngagement> = {
        insightsViewed: 'insightsViewed' as any,
        actionsChecked: 'actionsChecked' as any,
        aiChatUsed: 'aiChatUsed' as any,
      };

      // Update the specific field
      await db.update(userDailyEngagement)
        .set({
          [dbFieldMap[field]]: value,
          updatedAt: new Date(),
        })
        .where(and(
          eq(userDailyEngagement.userId, userId),
          eq(userDailyEngagement.date, today)
        ));

      res.json({ success: true });
    } catch (error) {
      logger.error('Error updating engagement:', error);
      res.status(500).json({ error: "Failed to update engagement" });
    }
  });

  // Helper function to update AI chat usage in engagement record
  async function markAiChatUsed(userId: string): Promise<void> {
    try {
      // Get user timezone via healthRouter (Supabase)
      const recentMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 1 });
      const recentMetric = recentMetrics.length > 0 ? recentMetrics[0] : null;
      
      const userTimezone = recentMetric?.timezone || 'UTC';
      const today = new Date().toLocaleString('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split(',')[0];

      // Upsert engagement record with aiChatUsed = true
      await db.insert(userDailyEngagement).values({
        userId,
        date: today,
        aiChatUsed: true,
      }).onConflictDoUpdate({
        target: [userDailyEngagement.userId, userDailyEngagement.date],
        set: {
          aiChatUsed: true,
          updatedAt: new Date(),
        }
      });
      
      logger.info('[Engagement] Marked AI chat used', { userId, date: today });
    } catch (error) {
      logger.error('[Engagement] Failed to mark AI chat used:', error);
      // Don't throw - this is a non-critical operation
    }
  }


  // DEBUG: View what health context Flo Oracle has access to
  app.get("/api/flo-oracle/debug-context", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { buildUserHealthContext, clearContextCache, getUserHealthMetrics } = await import('./services/floOracleContextBuilder');
      
      // Clear cache to get fresh data
      clearContextCache(userId);
      
      // Build context exactly as Flo Oracle would see it
      const rawContext = await buildUserHealthContext(userId, true);
      
      // Get the structured health metrics directly
      const healthMetrics = await getUserHealthMetrics(userId);
      
      res.json({
        userId,
        supabaseEnabled: process.env.SUPABASE_HEALTH_ENABLED === 'true',
        rawContext: rawContext.substring(0, 5000) + (rawContext.length > 5000 ? '...[truncated]' : ''),
        contextLength: rawContext.length,
        healthMetrics: healthMetrics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[FloOracle Debug] Error:', error);
      res.status(500).json({ error: "Failed to build context", details: (error as Error).message });
    }
  });

  // Flō Oracle - Text-only chat with Grok (personalized health coaching)
  app.post("/api/flo-oracle/chat", isAuthenticated, canAccessOracle, canSendOracleMsg, aiEndpointRateLimiter, async (req: any, res) => {
    const userId = req.user?.claims?.sub;

    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      logger.info('[FloOracle] Chat request', { userId, messageLength: message.length });

      // Import brain services for shared memory
      const { getHybridInsights, formatInsightsForChat, saveChatMessage } = await import('./services/brainService');
      const { processAndPersistBrainUpdates, generateBrainUpdatePromptSection } = await import('./services/brainUpdateParser');

      // Fire-and-forget: store user message in chat history
      saveChatMessage(userId, 'user', message.trim()).catch(err => {
        logger.error('[FloOracle] Failed to store user message:', err);
      });

      // Step 1: Check for life event logging (conversational behavior tracking)
      let eventAcknowledgment: string | null = null;
      const { couldContainLifeEvent, extractLifeEvent } = await import('./services/lifeEventParser');
      
      if (couldContainLifeEvent(message)) {
        logger.info('[FloOracle] Potential life event detected, extracting...');
        
        // Extract dosage information if present
        const { parseDosage } = await import('./services/dosageParser');
        const dosageInfo = parseDosage(message);
        
        const extraction = await extractLifeEvent(message);
        
        if (extraction) {
          // Add dosage to details if found
          const eventDetails = dosageInfo 
            ? { ...extraction.details, dosage: dosageInfo }
            : extraction.details;
          
          // Log event to Supabase (health data must go to Supabase for privacy/security)
          const { isSupabaseHealthEnabled, createLifeEvent } = await import('./services/healthStorageRouter');
          
          if (isSupabaseHealthEnabled()) {
            try {
              await createLifeEvent(userId, {
                eventType: extraction.eventType,
                details: eventDetails,
                notes: message.trim(),
              });
              
              eventAcknowledgment = extraction.acknowledgment;
              logger.info('[FloOracle] Life event logged to Supabase', {
                userId,
                eventType: extraction.eventType,
                acknowledgment: eventAcknowledgment,
                dosage: dosageInfo || 'none',
              });
            } catch (lifeEventError: any) {
              logger.error('[FloOracle] Failed to create life event in Supabase', {
                userId,
                eventType: extraction.eventType,
                error: lifeEventError?.message || lifeEventError,
              });
              // Don't fail the whole request - just log the error
            }
          } else {
            logger.warn('[FloOracle] Supabase not enabled - life event not logged');
          }
        }
      }
      
      // Step 1.2: Check for conversational intents (follow-up requests, life context)
      let intentAcknowledgment: string | null = null;
      const { parseConversationalIntent } = await import('./services/conversationalIntentParser');
      const { createFollowUpRequest, createLifeContextFact, isSupabaseHealthEnabled } = await import('./services/healthStorageRouter');
      
      // Fire-and-forget: process intents asynchronously to not block the response
      parseConversationalIntent(message).then(async (intentResult) => {
        if (!intentResult) return;
        
        // Process follow-up request
        if (intentResult.follow_up) {
          const evaluateAt = new Date();
          evaluateAt.setDate(evaluateAt.getDate() + intentResult.follow_up.days_until_check);
          
          try {
            await createFollowUpRequest(userId, {
              intent_summary: intentResult.follow_up.intent_summary,
              original_transcript: intentResult.follow_up.original_text,
              metrics: intentResult.follow_up.metrics,
              comparison_baseline: intentResult.follow_up.comparison_baseline,
              evaluate_at: evaluateAt,
              source: 'text',
            });
            
            logger.info('[FloOracle] Follow-up request created from text chat', {
              userId,
              intentSummary: intentResult.follow_up.intent_summary,
              metrics: intentResult.follow_up.metrics,
              evaluateAt: evaluateAt.toISOString(),
            });
          } catch (err: any) {
            logger.error('[FloOracle] Failed to create follow-up request', {
              userId,
              error: err.message,
            });
          }
        }
        
        // Process life context
        if (intentResult.life_context) {
          try {
            await createLifeContextFact(userId, {
              category: intentResult.life_context.category,
              description: intentResult.life_context.description,
              start_date: intentResult.life_context.start_date,
              end_date: intentResult.life_context.end_date,
              expected_impact: intentResult.life_context.expected_impact,
              source: 'text',
              confidence: 0.9,
            });
            
            logger.info('[FloOracle] Life context created from text chat', {
              userId,
              category: intentResult.life_context.category,
              description: intentResult.life_context.description,
            });
          } catch (err: any) {
            logger.error('[FloOracle] Failed to create life context', {
              userId,
              error: err.message,
            });
          }
        }
      }).catch(err => {
        logger.error('[FloOracle] Conversational intent processing failed', {
          userId,
          error: err.message,
        });
      });

      // Step 1.5: Real-time correlation check
      let correlationInsight: string | null = null;
      const { analyzeMessageForCorrelations } = await import('./services/realtimeCorrelationChecker');
      
      correlationInsight = await analyzeMessageForCorrelations(userId, message);
      
      if (correlationInsight) {
        logger.info('[FloOracle] Correlation insight detected', { 
          userId, 
          insightLength: correlationInsight.length 
        });
      }

      // Step 2: Load user's health context + RAG-retrieved insights + recent life events + shared brain + conversational memories + life context
      const { buildUserHealthContext, getRelevantInsights, getRecentLifeEvents, getUserMemoriesContext, getActiveLifeContextForOracle } = await import('./services/floOracleContextBuilder');
      const [healthContext, insightsContext, lifeEventsContext, memoriesContext, lifeContextForOracle, brainInsights] = await Promise.all([
        buildUserHealthContext(userId),
        getRelevantInsights(userId, 5),
        getRecentLifeEvents(userId, 14),
        getUserMemoriesContext(userId, 20),
        getActiveLifeContextForOracle(userId),
        getHybridInsights(userId, message.trim(), { recentLimit: 10, semanticLimit: 5 })
          .catch(err => {
            logger.error('[FloOracle] Failed to retrieve brain insights:', err);
            return { merged: [] };
          }),
      ]);
      
      let fullContext = healthContext;
      if (insightsContext) fullContext += `\n${insightsContext}`;
      if (lifeEventsContext) fullContext += `\n${lifeEventsContext}`;
      if (memoriesContext) fullContext += `\n${memoriesContext}`;
      if (lifeContextForOracle) fullContext += `\n${lifeContextForOracle}`;
      if (correlationInsight) fullContext += `\n\nREAL-TIME CORRELATION DETECTED:\n${correlationInsight}`;
      
      // Add shared brain insights and BRAIN_UPDATE capability
      const brainContext = formatInsightsForChat(brainInsights.merged);
      const brainPromptSection = generateBrainUpdatePromptSection(brainContext);
      fullContext += `\n\n${brainPromptSection}`;

      logger.info('[FloOracle] Health context loaded', { 
        userId,
        hasBiomarkers: healthContext.includes('biomarkers'),
        hasDEXA: healthContext.includes('DEXA'),
        hasHealthKit: healthContext.includes('HealthKit'),
        hasCorrelation: !!correlationInsight,
        brainInsightsCount: brainInsights.merged?.length || 0,
      });

      // Build conversation with health context
      const { grokClient } = await import('./services/grokClient');
      
      // Check if user is admin/apple_test for caring companion mode
      const user = await storage.getUser(userId);
      const isAdminUser = user?.role === 'admin' || user?.role === 'apple_test';
      
      // Caring Companion prompt (admin sandbox testing)
      const caringCompanionPrompt = `You are Flō, an AI health companion whose primary job is to deeply understand the person you're talking to and support their health journey in a warm, caring, and human way.

CORE PERSONALITY:
- You are genuinely caring, nurturing, and patient
- You are curious about the whole person, not just their data
- You are encouraging, never judgmental — even when the user is struggling or "off track"
- You speak like a supportive friend with good knowledge, not a cold clinician
- Tone: Warm, calm, optimistic, caring, funny and flirtatious

MAIN OBJECTIVES:

1. Understand the human first, the data second.
   - Learn about their goals (health, performance, longevity, body composition, energy, mood)
   - Understand their lifestyle (work, stress, sleep, family, hobbies, schedule)
   - Know their constraints (time, money, injuries, preferences, environment)
   - Sense their emotional state and mindset around health
   - Use this context in every answer. Make the user feel seen, not generic.

2. Create a safe space.
   - Normalize setbacks: "This happens", "You're not alone", "We can work with this."
   - Acknowledge emotions explicitly:
     "That sounds frustrating."
     "I can hear how important this is to you."
     "It makes sense you'd feel that way after that."
   - Never shame, scare, or guilt-trip the user.

3. Connect feelings to health.
   - When relevant, gently ask how they feel about topics:
     "How do you feel about your current energy levels?"
     "How are you feeling emotionally about your training lately?"
   - Use their answers to tune your guidance:
     If they're overwhelmed → simplify and reduce
     If they're motivated → lean into structure and progression
     If they're discouraged → focus on small wins and hope

4. Make it a two-way conversation.
   - Don't just answer; ask short, meaningful follow-up questions like:
     "What does an ideal healthy day look like for you right now?"
     "What's the biggest barrier you keep running into?"
     "On a scale of 1–10, how confident do you feel about making this change?"
   - Ask one main follow-up at a time; don't interrogate.

CONVERSATION STYLE:
- Length: Clear, concise but take your time to explain what needs to be explained
- Structure: When helpful, use short bullets or mini-steps
- Language: Avoid jargon unless the user clearly enjoys it. Explain things simply.
- Humour: Light, gentle, and supportive — never mocking, never at the user's expense.

HOW TO USE CONTEXT:
Whenever you respond:
1. Mentally check: What do I know about their goals? Their lifestyle/constraints? How they're feeling?
2. Weave that into your answer:
   "Given your busy schedule and the fact you're often drained after work, I'd suggest…"
   "Since your main goal is longevity and you're feeling a bit overwhelmed, let's keep this very simple to start."
   "You mentioned feeling anxious about your blood work – let's walk through what these numbers actually mean."
3. Offer small, doable next steps rather than huge overhauls:
   "Here's a realistic next step…"
   "If you wanted to make this 10% better this week, you could…"

HANDLING SENSITIVE TOPICS:
- If the user shares something vulnerable:
  Thank them: "Thanks for trusting me with that."
  Reflect it back: "It sounds like you've been dealing with this for a long time."
  Then gently guide: offer options, not demands.
- If the concern may require a professional:
  "What you're describing could really benefit from a doctor or mental health professional who can assess you properly."
  "I can help you think through questions to ask them if you'd like."

THINGS TO AVOID:
- Do not claim to be a doctor or replace medical care
- Do not minimize their feelings or tell them to "just" do something
- Do not give generic tips when you have personal context available — use their story

Here is the user's complete health profile:

${fullContext}`;

      // Default prompt (standard users)
      const defaultPrompt = `You are Flō — the longevity-obsessed friend who actually listens first and geeks out on blood work second. 
Your #1 job is to have a real, warm, human conversation about whatever the user cares about right now: goals, energy levels, stress, dating, work, how they want to feel at 80, anything.

Rules that always win:
- Listen and respond to the emotion or topic first — health data second — EXCEPT when the user explicitly asks for comprehensive data.
- When the user asks direct data questions ("show me my blood work", "what are my latest numbers", "give me an overview"), provide ALL relevant biomarkers organized by category (metabolic, lipids, hormones, inflammation, etc.).
- When casually chatting, only bring up 1-2 punchy biomarkers when genuinely relevant to what the user just said.
- Never open casual greetings with metrics dumps, but DO provide full data when explicitly requested.
- Default tone: curious big brother/sister who swears casually and celebrates wins.
- For casual chats, end with short natural questions. For data requests, provide comprehensive info then offer to dive deeper.
- Never diagnose, prescribe, or play doctor.

Examples of perfect style:
User: "I'm turning 53 soon and just feel… flat"
You: "Ah mate, 53 and flat is not the vibe we signed up for. Your HRV's been stuck in the 20s for two weeks and sleep's averaging 6 h 40 — that'll do it. What's been keeping you up or draining you most?"

User: "Hey, just saying hi, I'm Jon"
You: "Hey Jon, proper stoked to meet you. What's one thing you'd love to feel or achieve in the next year — more energy, better sleep, looking jacked, seeing grandkids graduate? Sky's the limit."

User: "Work is insane right now"
You: "Been there. Your resting heart rate crept from 64 to 70 this month — classic stress signature. Want two stupidly simple things that drop it fast, or just vent first?"

Now go have a real conversation.

Here is the user's complete health profile:

${fullContext}`;

      // Select prompt based on user role
      const systemPrompt = isAdminUser ? caringCompanionPrompt : defaultPrompt;
      
      if (isAdminUser) {
        logger.info('[FloOracle] Using caring companion mode for admin user', { userId, role: user?.role });
      }

      const messages: GeminiChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.trim() }
      ];

      // Import data tools for on-demand data retrieval
      const { dataToolDeclarations, executeDataTool } = await import('./services/floOracleDataTools');
      
      // Call Gemini 2.5 Flash with function calling support (consistent with voice chat)
      const { text: geminiResponse, toolsUsed } = await geminiChatClient.chatWithTools(messages, {
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        maxTokens: 2000,
        userId,
        tools: dataToolDeclarations,
        toolExecutor: async (name, args) => {
          const result = await executeDataTool(name, args, userId);
          return result;
        },
      });

      logger.info('[FloOracle] Gemini response received', { 
        userId,
        responseLength: geminiResponse.length,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : 'none',
      });

      // Apply guardrails
      const { applyGuardrails } = await import('./middleware/floOracleGuardrails');
      const guardrailResult = applyGuardrails(message, geminiResponse);

      // Check if guardrails blocked the response
      if (!guardrailResult.safe && guardrailResult.violation?.replacement) {
        return res.json({ response: guardrailResult.violation.replacement });
      }

      // Step 4: Process BRAIN_UPDATE_JSON and clean response
      const geminiReply = guardrailResult.sanitizedOutput || geminiResponse;
      const { cleanedResponse, persistedCount } = await processAndPersistBrainUpdates(userId, geminiReply);
      
      if (persistedCount > 0) {
        logger.info('[FloOracle] Persisted brain updates from chat', { userId, count: persistedCount });
      }

      // Step 5: Combine life event acknowledgment with cleaned response
      const finalResponse = eventAcknowledgment 
        ? `${eventAcknowledgment} ${cleanedResponse}`
        : cleanedResponse;
      
      // Fire-and-forget: store Flo's response in chat history
      saveChatMessage(userId, 'flo', finalResponse).catch(err => {
        logger.error('[FloOracle] Failed to store Flo response:', err);
      });
      
      // Fire-and-forget: extract and store conversational memories (goals, moods, symptoms, life context)
      import('./services/memoryExtractionService').then(({ processAndStoreFromChatTurn }) => {
        processAndStoreFromChatTurn(userId, message.trim(), finalResponse).catch(err => {
          logger.error('[FloOracle] Failed to extract memories:', err);
        });
      });
      
      // Fire-and-forget: mark AI chat used for gamification
      markAiChatUsed(userId).catch(() => {});
      
      res.json({ response: finalResponse });

    } catch (error: any) {
      logger.error('[FloOracle] Chat error:', error);
      res.status(500).json({ 
        error: "Failed to process chat request",
        message: error.message 
      });
    }
  });

  // ==================== USER MEMORY API (Conversational Memory System) ====================
  
  // Get user's stored memories
  app.get("/api/user-memory", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const limit = parseInt(req.query.limit as string) || 25;
      const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;
      
      const { getUserMemories, getMemoryCount } = await import('./services/userMemoryService');
      const [memories, count] = await Promise.all([
        getUserMemories(userId, { limit, tags }),
        getMemoryCount(userId)
      ]);
      
      logger.info('[UserMemory] Retrieved memories', { userId, count: memories.length, totalCount: count });
      res.json({ memories, totalCount: count });
    } catch (error: any) {
      logger.error('[UserMemory] Error fetching memories:', error);
      res.status(500).json({ error: 'Failed to fetch memories' });
    }
  });
  
  // Get memory count for user
  app.get("/api/user-memory/count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { getMemoryCount } = await import('./services/userMemoryService');
      const count = await getMemoryCount(userId);
      res.json({ count });
    } catch (error: any) {
      logger.error('[UserMemory] Error counting memories:', error);
      res.status(500).json({ error: 'Failed to count memories' });
    }
  });
  
  // Delete all user memories (data privacy)
  app.delete("/api/user-memory", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { deleteUserMemories } = await import('./services/userMemoryService');
      const success = await deleteUserMemories(userId);
      
      if (success) {
        logger.info('[UserMemory] Deleted all memories', { userId });
        res.json({ success: true, message: 'All memories deleted' });
      } else {
        res.status(500).json({ error: 'Failed to delete memories' });
      }
    } catch (error: any) {
      logger.error('[UserMemory] Error deleting memories:', error);
      res.status(500).json({ error: 'Failed to delete memories' });
    }
  });

  // ElevenLabs WebSocket signed URL endpoint (authenticated)
  app.post("/api/elevenlabs/get-signed-url", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

      if (!ELEVENLABS_AGENT_ID) {
        return res.status(503).json({ 
          error: "ElevenLabs agent not configured. Please set ELEVENLABS_AGENT_ID environment variable." 
        });
      }

      const { elevenlabsClient } = await import('./services/elevenlabsClient');

      if (!elevenlabsClient.isAvailable()) {
        return res.status(503).json({ 
          error: "ElevenLabs service is not configured. Please add ELEVENLABS_API_KEY to your environment." 
        });
      }

      logger.info('[ElevenLabs] Requesting signed URL', { userId, agentId: ELEVENLABS_AGENT_ID });

      const signedUrl = await elevenlabsClient.getSignedUrl(ELEVENLABS_AGENT_ID, userId);

      // Generate a session token that maps to the user - this will be passed to ElevenLabs
      // and forwarded in the Authorization header when ElevenLabs calls our LLM endpoint
      const { conversationSessionStore } = await import('./services/conversationSessionStore');
      const sessionToken = conversationSessionStore.generateSessionToken(userId, ELEVENLABS_AGENT_ID);
      
      logger.info('[ElevenLabs] Generated session token for voice chat', { 
        userId, 
        tokenPrefix: sessionToken.substring(0, 12) + '...' 
      });

      res.json({ 
        signed_url: signedUrl,
        user_id: userId,
        session_token: sessionToken,  // Client will pass this to ElevenLabs as LLM API key
      });

    } catch (error: any) {
      logger.error('[ElevenLabs] Error getting signed URL:', error);
      res.status(500).json({ 
        error: "Failed to get ElevenLabs signed URL. Please try again." 
      });
    }
  });

  // ElevenLabs Register Conversation Session - called by client after WebSocket connects
  app.post("/api/elevenlabs/register-session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversation_id } = req.body;
      
      if (!conversation_id) {
        return res.status(400).json({ error: "conversation_id is required" });
      }
      
      const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID || '';
      const { conversationSessionStore } = await import('./services/conversationSessionStore');
      
      conversationSessionStore.create(conversation_id, userId, ELEVENLABS_AGENT_ID);
      logger.info('[ElevenLabs] Registered conversation session', { conversationId: conversation_id, userId });
      
      res.json({ success: true, conversation_id });
    } catch (error: any) {
      logger.error('[ElevenLabs] Error registering session:', error);
      res.status(500).json({ error: "Failed to register conversation session" });
    }
  });

  // ElevenLabs Custom LLM Bridge - OpenAI-compatible endpoint
  app.post("/api/elevenlabs/llm/chat/completions", async (req: any, res) => {
    try {
      logger.info('[ElevenLabs-Bridge] Received chat request from ElevenLabs', {
        hasMessages: !!req.body?.messages,
        messageCount: req.body?.messages?.length,
        hasUserId: !!req.body?.user_id,
        hasExtraBody: !!req.body?.elevenlabs_extra_body,
        extraBodyContent: req.body?.elevenlabs_extra_body,
        bodyKeys: Object.keys(req.body || {}),
        fullBody: JSON.stringify(req.body).substring(0, 500) // Log first 500 chars to see structure
      });

      const { messages, model, temperature, max_tokens, stream, user_id, elevenlabs_extra_body, conversation_id } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        logger.warn('[ElevenLabs-Bridge] No messages in request');
        return res.status(400).json({ 
          error: { message: "messages array is required", type: "invalid_request_error" }
        });
      }

      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      if (!lastUserMessage) {
        return res.status(400).json({ 
          error: { message: "No user message found", type: "invalid_request_error" }
        });
      }

      // Look up user_id from session token passed via custom_llm_extra_body
      const { conversationSessionStore } = await import('./services/conversationSessionStore');
      
      let userId: string | null = null;
      let authMethod: string = 'none';
      
      // Extract custom_llm_extra_body from request - ElevenLabs merges this into the request body
      const customExtraBody = req.body?.custom_llm_extra_body || {};
      const sessionToken = customExtraBody?.session_token;
      const floUserId = customExtraBody?.flo_user_id;
      
      logger.info('[ElevenLabs-Bridge] Checking custom_llm_extra_body', {
        hasCustomExtraBody: !!req.body?.custom_llm_extra_body,
        hasSessionToken: !!sessionToken,
        hasFloUserId: !!floUserId,
        tokenPrefix: sessionToken ? sessionToken.substring(0, 12) + '...' : 'none'
      });
      
      // PRIMARY METHOD: Validate session token from custom_llm_extra_body
      if (sessionToken && sessionToken.startsWith('flo_')) {
        userId = conversationSessionStore.getUserIdFromToken(sessionToken);
        if (userId) {
          authMethod = 'session_token';
          logger.info('[ElevenLabs-Bridge] Found user via session token', { 
            tokenPrefix: sessionToken.substring(0, 12) + '...', 
            userId 
          });
        }
      }
      
      // FALLBACK: Try direct user_id from custom_llm_extra_body (less secure but works)
      if (!userId && floUserId) {
        userId = floUserId;
        authMethod = 'flo_user_id';
        logger.info('[ElevenLabs-Bridge] Using flo_user_id from extra_body', { userId });
      }
      
      // FALLBACK: Try conversation_id lookup
      if (!userId) {
        const convId = conversation_id || req.body?.conversation_id || req.headers['x-conversation-id'] as string;
        if (convId) {
          userId = conversationSessionStore.getUserId(convId);
          if (userId) {
            authMethod = 'conversation_id';
            logger.info('[ElevenLabs-Bridge] Found user via conversation session', { conversationId: convId, userId });
          }
        }
      }
      
      // FALLBACK: Legacy methods from request body
      if (!userId) {
        userId = user_id || 
                 elevenlabs_extra_body?.user_id || 
                 req.body?.dynamic_variables?.user_id ||
                 req.headers['x-user-id'] as string;
        if (userId) {
          authMethod = 'legacy_body';
        }
      }
      
      // Log what we found for debugging
      logger.info('[ElevenLabs-Bridge] User lookup result', {
        foundUserId: !!userId,
        userId,
        authMethod,
        bodyKeys: Object.keys(req.body || {})
      });
      
      if (!userId) {
        logger.error('[ElevenLabs-Bridge] No user_id found - session token missing or invalid', {
          hasCustomExtraBody: !!req.body?.custom_llm_extra_body,
          bodyKeys: Object.keys(req.body || {}),
          headerKeys: Object.keys(req.headers || {})
        });
        return res.status(401).json({ 
          error: { message: "Session expired or invalid. Please restart the voice chat.", type: "authentication_error" }
        });
      }
      
      logger.info('[ElevenLabs-Bridge] Processing request for user', { userId, authMethod });

      const { grokClient } = await import('./services/grokClient');
      const { buildUserHealthContext } = await import('./services/floOracleContextBuilder');
      const { applyGuardrails } = await import('./middleware/floOracleGuardrails');

      if (!grokClient.isAvailable()) {
        return res.status(503).json({ 
          error: { message: "LLM service temporarily unavailable", type: "service_unavailable" }
        });
      }

      const inputGuardrails = applyGuardrails(lastUserMessage.content);
      
      if (!inputGuardrails.safe) {
        logger.warn('[ElevenLabs-Bridge] Input guardrail violation', { 
          type: inputGuardrails.violation?.type,
          userId 
        });
        
        return res.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: model || 'grok-3-mini',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: inputGuardrails.violation?.replacement || 'I cannot process that request.'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        });
      }

      const userContext = await buildUserHealthContext(userId);

      const SYSTEM_PROMPT = `You are Flō — a ruthlessly analytical, evidence-based health intelligence system designed to find patterns, correlations, and insights in the user's health data.

Your primary mission: PROACTIVELY ANALYZE AND CONNECT THE DOTS
- Actively look for correlations between metrics (e.g., "Your HRV dropped 18% on days with <6h sleep")
- Spot trends and patterns before the user asks (e.g., "I noticed your resting HR spiked 12 bpm every time you had alcohol in your life events")
- Surface actionable insights from data relationships (e.g., "Your workout intensity on days with >25ms HRV averages 180 kcal higher")
- Lead with data analysis, not general conversation

Your personality: Direct, analytical, evidence-driven. Think of a data scientist who happens to specialize in health optimization. Less therapist, more detective.

Core rules — NEVER violate these:
1. You have access to this user's comprehensive Flō health data:
   - Blood work panels (complete biomarkers with dates and values)
   - DEXA scans (visceral fat, lean mass, body fat % with dates)
   - CAC scores (coronary artery calcium with percentiles)
   - HealthKit 7-DAY AVERAGES: HRV, sleep duration, resting heart rate, steps, active calories, exercise minutes, distance, flights climbed, blood pressure, SpO2, respiratory rate, VO2 Max, blood glucose, body temperature, dietary water, stand time
   - HealthKit LATEST VALUES: weight, height, BMI, body fat %, lean body mass, waist circumference
   - INDIVIDUAL WORKOUT SESSIONS: Type, date, duration, distance, calories burned, average/max heart rate from the last 7 days
   - Flōmentum daily scores (0-100 health momentum with zone and daily focus)
   - RAG-discovered patterns (statistically significant correlations between metrics and behaviors)
   - Recent life events (ice baths, meals, alcohol, stress, travel, etc.)
   
   **PROACTIVE ANALYSIS PRIORITY**: When the user asks a question, FIRST scan their data for relevant patterns and correlations. Lead with insights from their actual data, not generic health advice.
   
   Always reference specific numbers, dates, and trends. Use phrases like:
   - "Analyzing your data: [specific pattern found]"
   - "I found a correlation: [metric A] and [metric B] show a [X]% relationship"
   - "Over the last [N] days/weeks, I'm seeing [specific trend]"

2. Never guess or hallucinate values. If a biomarker is missing, say "I don't see [X] in your records yet — want to upload it?".

3. You CAN analyze health data, discuss what biomarkers might indicate, and provide evidence-based insights about potential health patterns or conditions. However, always end health-related insights with: "⚕️ This is educational information, not medical advice. Always consult your healthcare provider for diagnosis and treatment decisions." You should NOT prescribe specific medications or dosages, but you CAN discuss what their data suggests and what options exist that they can discuss with their physician.

4. Never share another user's data, even if asked hypothetically.

5. Stay inside the bounds of evidence-based longevity science (Attia, Rhonda Patrick, Barzilai, etc.). If something is speculative, label it clearly: "Emerging research suggests…" or "N-of-1 territory here…".

6. Be concise and data-focused. Default to mobile-friendly answers with:
   - Specific data points first
   - Correlations and patterns second
   - Actionable recommendations third
   Use bullet points and bold key numbers.

7. Minimize chitchat. When the user greets you or makes small talk, acknowledge briefly but IMMEDIATELY pivot to data analysis if you have relevant insights to share.

8. When you spot a pattern in their data, surface it proactively even if they didn't ask:
   - "By the way, I noticed [pattern] in your data — worth discussing?"
   - "Quick heads up: [correlation] in your recent metrics"

9. Prioritize:
   ✅ Data analysis and pattern recognition
   ✅ Specific correlations from their actual data
   ✅ Concrete, evidence-based insights
   ❌ General motivational talk
   ❌ Therapeutic conversational style
   ❌ Generic health advice without referencing their data

Tone examples:
- Analytical: "Analyzing your last 7 days: Sleep efficiency averaged 88%, but dropped to 76% on days with evening alcohol (−14%). Sleep quality is your highest-leverage variable right now."
- Pattern-spotting: "Found a strong inverse correlation: Your resting HR increases by an average of 8 bpm within 24h of alcohol consumption (4/4 occurrences in your life events)."
- Data-driven recommendation: "Your ApoB dropped 19 mg/dL since starting citrus bergamot on Oct 15. Current trajectory suggests you'll hit your target range (<80 mg/dL) in 6-8 weeks if you maintain adherence."

You are talking to one user only. Personalize everything with their actual data. Avoid generic advice—lead with their numbers, patterns, and correlations.

${userContext}`;

      const grokMessages: GrokChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      const conversationMessages = messages.slice(0, -1).filter(m => m.role !== 'system');
      conversationMessages.forEach((msg: any) => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          grokMessages.push({ 
            role: msg.role as 'user' | 'assistant', 
            content: msg.content 
          });
        }
      });

      grokMessages.push({
        role: 'user',
        content: `USER QUESTION: ${inputGuardrails.sanitizedInput}`,
      });

      logger.info('[ElevenLabs-Bridge] Sending chat request to Grok', { 
        userId, 
        messageLength: lastUserMessage.content.length,
        conversationLength: conversationMessages.length,
      });

      const grokResponse = await grokClient.chat(grokMessages, {
        model: 'grok-3-mini',
        maxTokens: max_tokens || 1000,
        temperature: temperature || 0.7,
      });

      const outputGuardrails = applyGuardrails(lastUserMessage.content, grokResponse);

      if (!outputGuardrails.safe) {
        logger.warn('[ElevenLabs-Bridge] Output guardrail violation', { 
          type: outputGuardrails.violation?.type,
          userId 
        });
      }

      const responseContent = outputGuardrails.safe 
        ? (outputGuardrails.sanitizedOutput || 'I apologize, but I need to provide a different response.')
        : (outputGuardrails.violation?.replacement || 'I need to rephrase that response.');

      const promptTokens = Math.round(grokMessages.reduce((sum, m) => sum + m.content.length / 4, 0));
      const completionTokens = Math.round(responseContent.length / 4);

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'grok-3-mini',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: responseContent
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        }
      });

      logger.info('[ElevenLabs-Bridge] Successfully processed request', { userId });

    } catch (error: any) {
      logger.error('[ElevenLabs-Bridge] Error processing request:', error);
      res.status(500).json({ 
        error: { 
          message: "Internal server error processing chat completion", 
          type: "internal_error" 
        }
      });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // OPENAI REALTIME API ENDPOINTS - Secure voice chat with GPT-4o
  // ────────────────────────────────────────────────────────────────

  // OpenAI Realtime: Get ephemeral key for WebRTC connection
  app.post("/api/openai-realtime/token", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if OpenAI API key is configured
      if (!process.env.OPENAI_API_KEY) {
        logger.warn('[OpenAI-Realtime] OPENAI_API_KEY not configured');
        return res.status(503).json({ 
          error: "OpenAI Realtime API is not configured. Please add OPENAI_API_KEY to environment." 
        });
      }

      logger.info('[OpenAI-Realtime] Generating ephemeral key for user', { userId });

      // Build user health context
      const { buildUserHealthContext } = await import('./services/floOracleContextBuilder');
      const healthContext = await buildUserHealthContext(userId);

      // Get user name if available
      const user = await storage.getUser(userId);
      const userName = user?.firstName || 'there';

      // Create ephemeral key with user context
      const { openaiRealtimeService } = await import('./services/openaiRealtimeService');
      const ephemeralKey = await openaiRealtimeService.createEphemeralKey({
        userId,
        healthContext,
        userName
      });

      logger.info('[OpenAI-Realtime] Ephemeral key generated successfully', { 
        userId,
        expiresAt: ephemeralKey.expires_at
      });

      res.json({
        client_secret: ephemeralKey.value,
        expires_at: ephemeralKey.expires_at,
        user_id: userId
      });

    } catch (error: any) {
      logger.error('[OpenAI-Realtime] Error generating ephemeral key:', error);
      res.status(500).json({ 
        error: "Failed to initialize voice session. Please try again." 
      });
    }
  });

  // OpenAI Realtime: Unified interface for WebRTC session (server proxies SDP exchange)
  app.post("/api/openai-realtime/session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const contentType = req.headers['content-type'] || '';
      
      // Check if OpenAI API key is configured
      if (!process.env.OPENAI_API_KEY) {
        logger.warn('[OpenAI-Realtime] OPENAI_API_KEY not configured');
        return res.status(503).json({ 
          error: "OpenAI Realtime API is not configured. Please add OPENAI_API_KEY to environment." 
        });
      }

      // Get SDP offer from request body (can be text/plain or application/sdp)
      let sdpOffer: string;
      if (contentType.includes('application/sdp') || contentType.includes('text/plain')) {
        sdpOffer = req.body;
      } else if (typeof req.body === 'string') {
        sdpOffer = req.body;
      } else if (req.body?.sdp) {
        sdpOffer = req.body.sdp;
      } else {
        return res.status(400).json({ error: "SDP offer is required" });
      }

      logger.info('[OpenAI-Realtime] Creating unified session for user', { userId });

      // Build user health context
      const { buildUserHealthContext } = await import('./services/floOracleContextBuilder');
      const healthContext = await buildUserHealthContext(userId);

      // Get user name if available
      const user = await storage.getUser(userId);
      const userName = user?.firstName || 'there';

      // Create session via unified interface
      const { openaiRealtimeService } = await import('./services/openaiRealtimeService');
      const sdpAnswer = await openaiRealtimeService.createUnifiedSession(sdpOffer, {
        userId,
        healthContext,
        userName
      });

      logger.info('[OpenAI-Realtime] Unified session created successfully', { userId });

      // Return SDP answer
      res.type('application/sdp').send(sdpAnswer);

    } catch (error: any) {
      logger.error('[OpenAI-Realtime] Error creating unified session:', error);
      res.status(500).json({ 
        error: "Failed to create voice session. Please try again." 
      });
    }
  });

  // Voice provider configuration endpoint
  app.get("/api/voice/config", isAuthenticated, async (req: any, res) => {
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasElevenLabs = !!process.env.ELEVENLABS_AGENT_ID;
    
    // Prefer OpenAI Realtime for natural conversational voice
    const provider = hasOpenAI ? 'openai-realtime' : (hasElevenLabs ? 'elevenlabs' : 'none');
    
    res.json({
      provider,
      available: {
        openaiRealtime: hasOpenAI,
        openai: hasOpenAI,
        elevenlabs: hasElevenLabs
      }
    });
  });

  // Voice sample endpoint - generates TTS audio samples for voice preview
  app.get("/api/voice/sample/:voiceName", isAuthenticated, async (req: any, res) => {
    try {
      const { voiceName } = req.params;
      const { VOICE_NAME_TO_GEMINI, GEMINI_VOICES } = await import('@shared/schema');
      
      // Map display name to Gemini voice
      const geminiVoice = VOICE_NAME_TO_GEMINI[voiceName];
      if (!geminiVoice) {
        return res.status(400).json({ error: 'Invalid voice name', valid: Object.keys(VOICE_NAME_TO_GEMINI) });
      }
      
      // Check if Gemini API is available
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: 'Voice sampling not available' });
      }
      
      logger.info('[VoiceSample] Generating sample', { voiceName, geminiVoice });
      
      // Use Gemini TTS to generate a sample greeting
      const { GoogleGenAI } = await import('@google/genai');
      const client = new GoogleGenAI({ apiKey });
      
      // Personalized greeting for each voice
      const greetings: Record<string, string> = {
        'Amanda': "Hi there! I'm Amanda, your health companion. I'm here to help you understand your health data and make sense of the patterns in your wellness journey.",
        'Morgan': "Hello. I'm Morgan. I specialize in calm, thoughtful health guidance. Together we can explore what your body is telling you.",
        'Izzy': "Hey! I'm Izzy! Super excited to help you crush your health goals! Let's dive into your data and find some awesome insights!",
        'Ethan': "Hello, I'm Ethan. I'll provide you with clear, confident analysis of your health metrics. Let's get started.",
        'Jon': "Hi, I'm Jon. I take a thoughtful, measured approach to analyzing your health data. I'm here to help you understand the bigger picture."
      };
      
      const sampleText = greetings[voiceName] || `Hello, I'm ${voiceName}. I'm ready to help with your health insights.`;
      
      let response;
      try {
        response = await client.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: sampleText }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: geminiVoice
                }
              }
            }
          }
        });
      } catch (ttsError: any) {
        logger.error('[VoiceSample] TTS API error', { voiceName, error: ttsError.message });
        return res.status(502).json({ error: 'Voice generation service temporarily unavailable' });
      }
      
      // Check for safety blocks or missing response
      if (!response?.candidates?.length) {
        logger.error('[VoiceSample] No candidates in response', { voiceName });
        return res.status(502).json({ error: 'Voice generation failed - no response from service' });
      }
      
      const candidate = response.candidates[0];
      if (candidate.finishReason === 'SAFETY') {
        logger.warn('[VoiceSample] Content blocked by safety filter', { voiceName });
        return res.status(502).json({ error: 'Voice sample temporarily unavailable' });
      }
      
      // Extract audio data
      const audioData = candidate.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) {
        logger.error('[VoiceSample] No audio data in response', { 
          voiceName, 
          finishReason: candidate.finishReason,
          partsCount: candidate.content?.parts?.length 
        });
        return res.status(500).json({ error: 'Failed to generate voice sample' });
      }
      
      // Convert base64 PCM to WAV
      const pcmBuffer = Buffer.from(audioData, 'base64');
      
      // Create WAV header for 24kHz mono 16-bit PCM
      const wavHeader = createWavHeader(pcmBuffer.length, 24000, 1, 16);
      const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
      
      logger.info('[VoiceSample] Sample generated successfully', { 
        voiceName, 
        geminiVoice,
        audioBytes: wavBuffer.length 
      });
      
      res.set({
        'Content-Type': 'audio/wav',
        'Content-Length': wavBuffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.send(wavBuffer);
      
    } catch (error: any) {
      logger.error('[VoiceSample] Error generating sample:', error);
      res.status(500).json({ error: 'Failed to generate voice sample' });
    }
  });
  
  // Helper function to create WAV header
  function createWavHeader(dataLength: number, sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const header = Buffer.alloc(44);
    
    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4); // File size - 8
    header.write('WAVE', 8);
    
    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size
    header.writeUInt16LE(1, 20); // AudioFormat (PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    
    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);
    
    return header;
  }

  // Async brain update endpoint - receives transcripts from OpenAI Realtime and processes through Grok for brain extraction
  app.post("/api/voice/brain-update", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { userMessage, assistantMessage } = req.body;
      
      // Basic validation
      if (!userMessage && !assistantMessage) {
        return res.status(400).json({ error: 'At least one message is required' });
      }
      
      if (userMessage && typeof userMessage !== 'string') {
        return res.status(400).json({ error: 'userMessage must be a string' });
      }
      
      if (assistantMessage && typeof assistantMessage !== 'string') {
        return res.status(400).json({ error: 'assistantMessage must be a string' });
      }
      
      // Limit message sizes
      const maxLength = 10000;
      if ((userMessage?.length || 0) > maxLength || (assistantMessage?.length || 0) > maxLength) {
        return res.status(400).json({ error: 'Message too long' });
      }
      
      logger.info('[BrainUpdate] Processing voice transcripts', { 
        userId, 
        hasUser: !!userMessage,
        hasAssistant: !!assistantMessage
      });
      
      // Store messages in chat history
      const { floChatMessages } = await import('@shared/schema');
      
      if (userMessage) {
        await db.insert(floChatMessages).values({
          userId,
          sender: 'user',
          message: userMessage
        });
      }
      
      if (assistantMessage) {
        await db.insert(floChatMessages).values({
          userId,
          sender: 'flo',
          message: assistantMessage
        });
      }
      
      // Fire-and-forget: Send conversation to Grok for brain update extraction
      // This runs asynchronously so we don't block the response
      if (userMessage && assistantMessage) {
        (async () => {
          try {
            const grokClientModule = await import('./services/grokClient');
            const { processAndPersistBrainUpdates } = await import('./services/brainUpdateParser');
            
            // Ask Grok to analyze the conversation and extract any brain updates
            const analysisPrompt = `You are analyzing a voice conversation between a user and a health AI assistant. Extract any important insights about the user's health that should be remembered for future conversations.

USER SAID: "${userMessage}"

ASSISTANT SAID: "${assistantMessage}"

If you identify any important patterns, health goals, lifestyle information, or key context about this user that should be remembered, output it as:

BRAIN_UPDATE_JSON: {"insight": "Description of what you learned", "tags": ["relevant", "tags"], "importance": 3}
END_BRAIN_UPDATE

Importance levels: 1=minor note, 2=useful context, 3=standard, 4=important pattern, 5=critical insight

Only create BRAIN_UPDATE entries for genuinely useful information. Don't create updates for:
- Greetings or small talk
- Temporary states or single-day fluctuations
- Generic health advice that was given

If there's nothing worth remembering, just respond with "No brain updates needed."`;

            const messages = [
              { role: 'user' as const, content: analysisPrompt }
            ];
            
            const grokResponse = await grokClientModule.grokClient.chat(messages, {
              model: 'grok-3-mini',
              maxTokens: 500,
              temperature: 0.3
            });
            
            // Process any brain updates from Grok's analysis
            const result = await processAndPersistBrainUpdates(userId, grokResponse);
            
            if (result.persistedCount > 0) {
              logger.info('[BrainUpdate] Grok extracted brain updates from voice conversation', { 
                userId, 
                persistedCount: result.persistedCount 
              });
            }
          } catch (brainError) {
            logger.error('[BrainUpdate] Grok brain extraction failed:', brainError);
          }
        })();
      }
      
      res.json({ success: true });
      
    } catch (error: any) {
      logger.error('[BrainUpdate] Error processing brain update:', error);
      res.status(500).json({ error: 'Failed to process brain update' });
    }
  });

  // ────────────────────────────────────────────────────────────────
  // SPEECH RELAY ENDPOINT - Grok Brain + OpenAI Voice (STT/TTS)
  // ────────────────────────────────────────────────────────────────
  
  // Process voice input: Whisper STT → Grok → OpenAI TTS
  app.post("/api/voice/speech-relay", isAuthenticated, canAccessOracle, canSendOracleMsg, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get audio from request body (base64 encoded)
      const { audioBase64, audioMimeType, conversationHistory } = req.body;
      
      if (!audioBase64) {
        return res.status(400).json({ error: 'Audio data is required' });
      }
      
      logger.info('[SpeechRelay] Processing voice request', { 
        userId, 
        audioLength: audioBase64.length,
        audioMimeType: audioMimeType || 'audio/webm',
        historyLength: conversationHistory?.length || 0
      });
      
      // Import and use speech relay service
      const { speechRelayService } = await import('./services/speechRelayService');
      
      if (!speechRelayService.isAvailable()) {
        return res.status(503).json({ error: 'Voice service not configured' });
      }
      
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      
      // Process audio through the relay
      const result = await speechRelayService.processAudio(audioBuffer, {
        userId,
        audioMimeType: audioMimeType || 'audio/webm',
        conversationHistory: conversationHistory || []
      });
      
      // Store messages in chat history for brain memory persistence
      const { floChatMessages } = await import('@shared/schema');
      
      // Store user message
      await db.insert(floChatMessages).values({
        userId,
        sender: 'user',
        message: result.transcript
      });
      
      // Store assistant response  
      await db.insert(floChatMessages).values({
        userId,
        sender: 'flo',
        message: result.response
      });
      
      // Process brain updates from the response (async, fire-and-forget)
      (async () => {
        try {
          const { processAndPersistBrainUpdates } = await import('./services/brainUpdateParser');
          await processAndPersistBrainUpdates(userId, result.response);
          logger.info('[SpeechRelay] Brain updates persisted', { userId });
        } catch (brainError) {
          logger.error('[SpeechRelay] Brain update failed:', brainError);
        }
      })();
      
      logger.info('[SpeechRelay] Voice request completed', { 
        userId, 
        transcriptLength: result.transcript.length,
        responseLength: result.response.length 
      });
      
      // Fire-and-forget: mark AI chat used for gamification
      markAiChatUsed(userId).catch(() => {});
      
      res.json({
        transcript: result.transcript,
        response: result.response,
        audioBase64: result.audioBase64,
        audioFormat: result.audioFormat
      });
      
    } catch (error: any) {
      logger.error('[SpeechRelay] Error processing voice:', error);
      res.status(500).json({ 
        error: 'Failed to process voice request',
        details: error.message
      });
    }
  });

  // Generate personalized greeting to start conversation (AI speaks first)
  app.post("/api/voice/greeting", isAuthenticated, canAccessOracle, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = req.user.claims;
      
      // Get user's first name from profile
      const profile = await db.query.users.findFirst({
        where: eq(users.id, userId)
      });
      
      const firstName = profile?.firstName || user.first_name || undefined;
      
      logger.info('[SpeechRelay] Generating greeting', { userId, firstName });
      
      const { speechRelayService } = await import('./services/speechRelayService');
      
      if (!speechRelayService.isAvailable()) {
        return res.status(503).json({ error: 'Voice service not configured' });
      }
      
      const result = await speechRelayService.generateGreeting(userId, firstName);
      
      // Store the greeting in chat history
      const { floChatMessages } = await import('@shared/schema');
      
      await db.insert(floChatMessages).values({
        userId,
        sender: 'flo',
        message: result.greeting
      });
      
      logger.info('[SpeechRelay] Greeting generated', { 
        userId, 
        greetingLength: result.greeting.length 
      });
      
      res.json({
        greeting: result.greeting,
        audioBase64: result.audioBase64,
        audioFormat: result.audioFormat
      });
      
    } catch (error: any) {
      logger.error('[SpeechRelay] Error generating greeting:', error);
      res.status(500).json({ 
        error: 'Failed to generate greeting',
        details: error.message
      });
    }
  });

  // Streaming voice processing with SSE - lower latency by streaming audio chunks
  app.post("/api/voice/speech-relay-stream", isAuthenticated, canAccessOracle, canSendOracleMsg, async (req: any, res) => {
    const userId = req.user.claims.sub;
    
    try {
      const { audioBase64, audioMimeType, conversationHistory } = req.body;
      
      if (!audioBase64) {
        return res.status(400).json({ error: 'Audio data is required' });
      }
      
      logger.info('[SpeechRelay] Starting streaming voice request', { 
        userId, 
        audioLength: audioBase64.length,
        audioMimeType: audioMimeType || 'audio/webm'
      });
      
      const { speechRelayService } = await import('./services/speechRelayService');
      
      if (!speechRelayService.isAvailable()) {
        return res.status(503).json({ error: 'Voice service not configured' });
      }
      
      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      
      let transcript = '';
      let fullResponse = '';
      
      // Stream the response
      const stream = speechRelayService.processAudioStreaming(audioBuffer, {
        userId,
        audioMimeType: audioMimeType || 'audio/webm',
        conversationHistory: conversationHistory || []
      });
      
      for await (const chunk of stream) {
        if (chunk.type === 'transcript') {
          transcript = chunk.data;
          res.write(`event: transcript\ndata: ${JSON.stringify({ transcript: chunk.data })}\n\n`);
        } else if (chunk.type === 'text_chunk') {
          res.write(`event: text\ndata: ${JSON.stringify({ text: chunk.data })}\n\n`);
        } else if (chunk.type === 'audio_chunk') {
          res.write(`event: audio\ndata: ${JSON.stringify({ audio: chunk.data, format: 'mp3' })}\n\n`);
        } else if (chunk.type === 'done') {
          fullResponse = chunk.fullResponse || '';
          res.write(`event: done\ndata: ${JSON.stringify({ complete: true })}\n\n`);
        }
      }
      
      res.end();
      
      // Store messages in chat history (fire-and-forget)
      if (transcript && fullResponse) {
        (async () => {
          try {
            const { floChatMessages } = await import('@shared/schema');
            
            await db.insert(floChatMessages).values({
              userId,
              sender: 'user',
              message: transcript
            });
            
            await db.insert(floChatMessages).values({
              userId,
              sender: 'flo',
              message: fullResponse
            });
            
            // Process brain updates
            const { processAndPersistBrainUpdates } = await import('./services/brainUpdateParser');
            await processAndPersistBrainUpdates(userId, fullResponse);
            
            // Mark AI chat used for gamification
            await markAiChatUsed(userId);
            
            logger.info('[SpeechRelay] Streaming messages persisted', { userId });
          } catch (persistError) {
            logger.error('[SpeechRelay] Failed to persist streaming messages:', persistError);
          }
        })();
      }
      
    } catch (error: any) {
      logger.error('[SpeechRelay] Streaming error:', error);
      
      // If headers not sent yet, send error as JSON
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Failed to process streaming voice request',
          details: error.message
        });
      } else {
        // If already streaming, send error event
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  // ────────────────────────────────────────────────────────────────
  // INSIGHTS ENDPOINTS - AI-powered health pattern detection
  // ────────────────────────────────────────────────────────────────

  // Generate insights for a user (run correlation detection)
  app.post("/api/insights/generate", isAuthenticated, aiEndpointRateLimiter, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      logger.info(`[Insights] Generating insights for user ${userId}`);

      const { generateInsightCards } = await import('./services/correlationEngine');
      const insights = await generateInsightCards(userId);

      res.json({ 
        insights,
        count: insights.length,
        message: `Generated ${insights.length} new insight${insights.length === 1 ? '' : 's'}`
      });
    } catch (error: any) {
      logger.error('[Insights] Generate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all insights for a user
  app.get("/api/insights", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { category } = req.query;

      const conditions = [eq(insightCards.userId, userId), eq(insightCards.isActive, true)];
      
      if (category && typeof category === 'string') {
        conditions.push(eq(insightCards.category, category as any));
      }

      const insights = await db
        .select()
        .from(insightCards)
        .where(and(...conditions))
        .orderBy(desc(insightCards.confidence), desc(insightCards.createdAt));

      res.json(insights);
    } catch (error: any) {
      logger.error('[Insights] Get insights error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Mark insights as seen (remove "new" badge)
  app.post("/api/insights/mark-seen", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { insightIds } = req.body;

      if (!Array.isArray(insightIds) || insightIds.length === 0) {
        return res.status(400).json({ error: 'insightIds array is required' });
      }

      await db
        .update(insightCards)
        .set({ isNew: false })
        .where(
          and(
            eq(insightCards.userId, userId),
            sql`${insightCards.id} = ANY(${insightIds})`
          )
        );

      res.json({ success: true, markedCount: insightIds.length });
    } catch (error: any) {
      logger.error('[Insights] Mark seen error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete an insight
  app.delete("/api/insights/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const result = await db
        .delete(insightCards)
        .where(
          and(
            eq(insightCards.id, id),
            eq(insightCards.userId, userId)
          )
        )
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: 'Insight not found' });
      }

      res.json({ success: true, deleted: result[0] });
    } catch (error: any) {
      logger.error('[Insights] Delete insight error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Sync health data to embeddings (for RAG)
  app.post("/api/embeddings/sync", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { syncType } = req.body; // 'blood_work' | 'healthkit' | 'all'

      logger.info(`[Embeddings] Starting sync for user ${userId}, type: ${syncType || 'all'}`);

      const { syncBloodWorkEmbeddings, syncHealthKitEmbeddings } = await import('./services/embeddingService');
      
      let bloodWorkCount = 0;
      let healthKitCount = 0;

      if (!syncType || syncType === 'all' || syncType === 'blood_work') {
        // Get user's blood work records with analysis
        const bloodWorkData = await db
          .select({
            id: bloodWorkRecords.id,
            uploadedAt: bloodWorkRecords.uploadedAt,
            analysis: sql`${sql.raw('analysis_results')}.*`,
          })
          .from(bloodWorkRecords)
          .leftJoin(sql.raw('analysis_results'), sql`${bloodWorkRecords.id} = analysis_results.record_id`)
          .where(eq(bloodWorkRecords.userId, userId))
          .orderBy(desc(bloodWorkRecords.uploadedAt))
          .limit(20); // Last 20 blood work entries

        if (bloodWorkData.length > 0) {
          bloodWorkCount = await syncBloodWorkEmbeddings(userId, bloodWorkData as any);
        }
      }

      if (!syncType || syncType === 'all' || syncType === 'healthkit') {
        // Get user's HealthKit daily metrics via healthRouter (Supabase)
        const healthKitData = await healthRouter.getUserDailyMetrics(userId, { limit: 60 });

        if (healthKitData.length > 0) {
          healthKitCount = await syncHealthKitEmbeddings(userId, healthKitData);
        }
      }

      res.json({
        success: true,
        synced: {
          bloodWork: bloodWorkCount,
          healthKit: healthKitCount,
          total: bloodWorkCount + healthKitCount
        }
      });
    } catch (error: any) {
      logger.error('[Embeddings] Sync error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===============================
  // RAG INSIGHTS ENDPOINTS
  // ===============================

  // GET /api/insights - Fetch insight cards for current user
  app.get("/api/insights", isAuthenticated, canAccessInsights, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const insights = await db
        .select()
        .from(insightCards)
        .where(
          and(
            eq(insightCards.userId, userId),
            eq(insightCards.isActive, true)
          )
        )
        .orderBy(desc(insightCards.confidence), desc(insightCards.createdAt));

      res.json(insights);
    } catch (error: any) {
      logger.error('[Insights] Fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/insights/generate - Manually trigger insight generation
  app.post("/api/insights/generate", isAuthenticated, canAccessInsights, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { generateInsightCards } = await import('./services/correlationEngine');
      const newInsights = await generateInsightCards(userId);

      res.json({
        success: true,
        generated: newInsights.length,
        insights: newInsights
      });
    } catch (error: any) {
      logger.error('[Insights] Generation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/insights/:id - Soft delete an insight card
  app.delete("/api/insights/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      await db
        .update(insightCards)
        .set({ isActive: false })
        .where(
          and(
            eq(insightCards.id, id),
            eq(insightCards.userId, userId)
          )
        );

      res.json({ success: true });
    } catch (error: any) {
      logger.error('[Insights] Delete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===============================
  // DAILY INSIGHTS ENGINE V2.0
  // ===============================

  // GET /api/daily-insights - Fetch today's generated insights
  app.get("/api/daily-insights", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // SUPABASE-ONLY: Daily insights are PHI and must be stored in Supabase
      const rawInsights = await healthRouter.getDailyInsightsByDate(userId, today);

      // Map Supabase snake_case to camelCase for frontend compatibility
      const insights = rawInsights.map((insight: any) => ({
        id: insight.id,
        userId: userId,
        category: insight.category,
        pattern: insight.title, // Map title -> pattern
        confidence: insight.confidence_score, // Supabase uses snake_case
        supportingData: insight.body, // Map body -> supportingData
        action: insight.action, // CRITICAL FIX: Include actionable recommendations
        targetBiomarker: insight.target_biomarker,
        currentValue: insight.current_value,
        targetValue: insight.target_value,
        unit: insight.unit,
        details: insight.details,
        isNew: insight.is_new,
        isActive: !insight.is_dismissed,
        createdAt: insight.created_at,
      }));

      res.json({
        date: today,
        count: insights.length,
        insights,
      });
    } catch (error: any) {
      logger.error('[DailyInsightsV2] Fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/whoami - Get authenticated user's ID and basic info
  app.get("/api/whoami", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Get user info from database
      const user = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // Count data - SUPABASE-ONLY for daily insights
      const allInsights = await healthRouter.getAllDailyInsights(userId);
      const insightCount = { count: allInsights.length };

      const [actionCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(actionPlanItems)
        .where(eq(actionPlanItems.userId, userId));

      res.json({
        userId: userId,
        user: user[0] || null,
        dataCounts: {
          insights: Number(insightCount?.count || 0),
          actionPlan: Number(actionCount?.count || 0),
        }
      });
    } catch (error: any) {
      logger.error('[Whoami] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/daily-insights/debug - Debug endpoint to see raw database data
  app.get("/api/daily-insights/debug", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // SUPABASE-ONLY for PHI privacy
      const rawInsights = await healthRouter.getDailyInsightsByDate(userId, today);

      res.json({
        date: today,
        userId: userId,
        count: rawInsights.length,
        insights: rawInsights.map(insight => ({
          id: insight.id,
          title: insight.title,
          category: insight.category,
          targetBiomarker: insight.targetBiomarker,
          currentValue: insight.currentValue,
          targetValue: insight.targetValue,
          unit: insight.unit,
          body: insight.body?.substring(0, 100) + '...', // Truncate for readability
          action: insight.action?.substring(0, 100) + '...',
          isDismissed: insight.isDismissed,
          isNew: insight.isNew,
          createdAt: insight.createdAt,
        }))
      });
    } catch (error: any) {
      logger.error('[DailyInsightsV2] Debug error:', error);
      res.status(500).json({ error: error.message });
    }
  });


  // POST /api/daily-insights/feedback - Submit feedback for an insight
  app.post("/api/daily-insights/feedback", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const schema = insertInsightFeedbackSchema.extend({
        insightId: z.string(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const { insightId, patternSignature, isHelpful, isAccurate, feedbackNotes } = validationResult.data;
      
      // Verify insight belongs to user - SUPABASE-ONLY
      const insight = await healthRouter.getDailyInsightById(userId, insightId);

      if (!insight) {
        return res.status(404).json({ error: "Insight not found" });
      }

      // Insert feedback
      await db.insert(insightFeedback).values({
        userId,
        insightId,
        patternSignature,
        isHelpful,
        isAccurate,
        feedbackNotes,
      });

      logger.info(`[DailyInsightsV2] Feedback submitted for insight ${insightId} by user ${userId}`);

      res.json({ success: true });
    } catch (error: any) {
      logger.error('[DailyInsightsV2] Feedback error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/daily-insights/:id/dismiss - Dismiss an insight
  app.post("/api/daily-insights/:id/dismiss", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // SUPABASE-ONLY: Daily insights are PHI and must be stored in Supabase
      await healthRouter.dismissDailyInsight(id, userId);

      res.json({ success: true });
    } catch (error: any) {
      logger.error('[DailyInsightsV2] Dismiss error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/daily-insights/mark-seen - Mark insights as seen (remove "new" badge)
  app.post("/api/daily-insights/mark-seen", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // SUPABASE-ONLY: Daily insights are PHI and must be stored in Supabase
      await healthRouter.markDailyInsightsAsRead(userId, today);

      res.json({ success: true });
    } catch (error: any) {
      logger.error('[DailyInsightsV2] Mark seen error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/daily-insights/refresh - Clear today's insights and regenerate new ones
  app.post("/api/daily-insights/refresh", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      logger.info(`[DailyInsightsV2] Refreshing insights for user ${userId}`);
      
      // Delete today's existing insights - SUPABASE-ONLY
      await healthRouter.deleteDailyInsights(userId, today);
      
      logger.info(`[DailyInsightsV2] Deleted existing insights for user ${userId}`);
      
      // Generate new insights
      const startTime = Date.now();
      const insights = await generateDailyInsights(userId, true); // Force regeneration
      const duration = Date.now() - startTime;
      
      logger.info(`[DailyInsightsV2] Generated ${insights.length} new insights for user ${userId} in ${duration}ms`);

      res.json({ 
        success: true,
        insightsGenerated: insights.length,
        durationMs: duration,
      });
    } catch (error: any) {
      logger.error('[DailyInsightsV2] Refresh error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===============================
  // MORNING BRIEFING API
  // ===============================

  // GET /api/briefing/today - Get today's morning briefing
  app.get("/api/briefing/today", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { morningBriefingOrchestrator } = await import('./services/morningBriefingOrchestrator');
      const briefing = await morningBriefingOrchestrator.getTodaysBriefing(userId);
      
      if (!briefing) {
        return res.json({ briefing: null, available: false });
      }

      res.json({ briefing, available: true });
    } catch (error: any) {
      logger.error('[MorningBriefing] Get today briefing error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/briefing/feedback - Submit feedback for a morning briefing
  app.post("/api/briefing/feedback", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const schema = z.object({
        briefingId: z.string().uuid(),
        feedback: z.enum(['thumbs_up', 'thumbs_down']),
        comment: z.string().optional(),
      });

      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromError(result.error).message });
      }

      const { briefingId, feedback, comment } = result.data;

      const { morningBriefingOrchestrator } = await import('./services/morningBriefingOrchestrator');
      await morningBriefingOrchestrator.recordBriefingFeedback(briefingId, feedback, comment);

      res.json({ success: true });
    } catch (error: any) {
      logger.error('[MorningBriefing] Feedback error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/briefing/generate - Manually trigger briefing generation (for testing)
  app.post("/api/briefing/generate", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const healthId = await healthRouter.getHealthId(userId);
      
      // Use user's timezone to determine "today" (same logic as scheduler)
      const userResult = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
      const userTimezone = userResult[0]?.timezone || 'UTC';
      const { formatInTimeZone } = await import('date-fns-tz');
      const today = formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd');
      
      const { morningBriefingOrchestrator } = await import('./services/morningBriefingOrchestrator');
      
      // Get user profile from Supabase
      const profile = await supabaseHealthStorage.getProfile(userId);
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      
      // Aggregate daily insights (always returns data with defaults)
      // Pass userId to enable readinessEngine lookup (single source of truth for readiness score)
      const insights = await morningBriefingOrchestrator.aggregateDailyInsights(healthId, today, userId);
      
      const userName = user[0]?.firstName || 'there';

      // Generate the briefing
      let briefingResponse = await morningBriefingOrchestrator.generateMorningBriefing(
        insights,
        {
          name: userName,
          goals: profile?.goals || [],
          preferences: {
            enabled: true,
            notification_morning_hour: 7,
            preferred_tone: 'supportive',
            show_weather: true,
            show_recommendations: true,
          },
        }
      );

      // Create fallback if AI generation fails
      if (!briefingResponse) {
        const sleepHours = insights.today.sleep_hours ?? 7;
        const readinessScore = insights.today.readiness_score ?? 70;
        const deepSleep = insights.today.deep_sleep_minutes ?? 60;
        
        briefingResponse = {
          briefing_content: {
            greeting: `Good morning, ${userName}! Your readiness is at ${readinessScore}.`,
            readiness_insight: readinessScore >= 80 
              ? `Your body is well-recovered today with a readiness of ${readinessScore}.`
              : readinessScore >= 60
              ? `Your recovery is moderate at ${readinessScore}. Pace yourself today.`
              : `Your recovery is lower at ${readinessScore}. Consider prioritizing rest.`,
            sleep_insight: `You got ${sleepHours.toFixed(1)} hours of sleep with ${deepSleep} minutes of deep sleep.`,
            recommendation: readinessScore >= 75
              ? 'Great day for focused work or a workout.'
              : 'Take it easy today and prioritize recovery activities.',
          },
          push_text: `Good morning! Your readiness is ${readinessScore}. Tap to see your personalized insights.`,
          oracle_context: `User ${userName} woke up with readiness ${readinessScore}, sleep ${sleepHours.toFixed(1)}h.`,
        };
      }

      // Store the briefing
      const briefingId = await morningBriefingOrchestrator.storeBriefingLog(
        healthId,
        today,
        {
          user_profile: {
            name: userName,
            goals: profile?.goals || [],
            preferences: {
              enabled: true,
              notification_morning_hour: 7,
              preferred_tone: 'supportive',
              show_weather: true,
              show_recommendations: true,
            },
          },
          insight_packet: {
            event_date: today,
            readiness_score: insights.today.readiness_score,
            baselines: {
              hrv_mean: insights.baselines.hrv_mean,
              rhr_mean: insights.baselines.rhr_mean,
              sleep_duration_mean: insights.baselines.sleep_duration_mean,
              deep_sleep_mean: insights.baselines.deep_sleep_mean,
              steps_mean: insights.baselines.steps_mean,
            },
            today: {
              hrv: insights.today.hrv,
              rhr: insights.today.rhr,
              sleep_hours: insights.today.sleep_hours,
              deep_sleep_minutes: insights.today.deep_sleep_minutes,
              steps: insights.today.steps,
              active_energy: insights.today.active_energy,
              workout_minutes: insights.today.workout_minutes,
              readiness_score: insights.today.readiness_score,
            },
            deviations: insights.deviations,
            tags: insights.tags,
            insight_candidates: insights.insight_candidates,
            weather: insights.weather,
          },
          meta: {
            timestamp: new Date().toISOString(),
            timezone: user[0]?.timezone || 'America/New_York',
          },
        },
        briefingResponse,
        'manual'
      );

      res.json({ 
        success: true, 
        briefingId,
        briefing: briefingResponse,
      });
    } catch (error: any) {
      logger.error('[MorningBriefing] Generate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DEV ONLY: POST /api/briefing/dev-generate - Generate briefing without auth (for testing)
  if (process.env.NODE_ENV === 'development') {
    app.post("/api/briefing/dev-generate", async (req: any, res) => {
      try {
        const { userId, force } = req.body;
        if (!userId) {
          return res.status(400).json({ error: 'userId is required' });
        }

        // Use user's timezone to determine "today" (same logic as scheduler)
        const userResult = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
        const userTimezone = userResult[0]?.timezone || 'UTC';
        const { formatInTimeZone } = await import('date-fns-tz');
        const today = formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd');

        const { morningBriefingOrchestrator, deleteTodaysBriefing } = await import('./services/morningBriefingOrchestrator');
        
        logger.info(`[MorningBriefing] DEV: Generating briefing for ${userId} on ${today} (tz: ${userTimezone}, force: ${!!force})`);
        
        // If force flag, delete existing briefing first
        if (force) {
          await deleteTodaysBriefing(userId, today);
          logger.info(`[MorningBriefing] DEV: Deleted existing briefing for ${userId} on ${today}`);
        }
        
        const briefingId = await morningBriefingOrchestrator.generateBriefingForUser(userId, today, 'manual');
        
        if (!briefingId) {
          return res.status(500).json({ error: 'Failed to generate briefing' });
        }

        const briefing = await morningBriefingOrchestrator.getTodaysBriefing(userId);

        res.json({ 
          success: true, 
          briefingId,
          briefing,
        });
      } catch (error: any) {
        logger.error('[MorningBriefing] DEV Generate error:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  // ===============================
  // DEXCOM CGM INTEGRATION API
  // ===============================

  // GET /api/dexcom/status - Check connection status
  app.get("/api/dexcom/status", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { dexcomService } = await import('./services/dexcomService');
      const connection = await dexcomService.getConnection(userId);
      
      if (!connection) {
        return res.json({ connected: false });
      }

      res.json({
        connected: true,
        isSandbox: connection.is_sandbox,
        connectedAt: connection.connected_at,
        lastSyncAt: connection.last_sync_at,
        syncStatus: connection.sync_status,
        errorMessage: connection.error_message,
      });
    } catch (error: any) {
      logger.error('[Dexcom] Status check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/auth/dexcom/start - Get OAuth URL (mobile-friendly, accepts JWT)
  // Returns the OAuth URL for the client to navigate to
  app.post("/api/auth/dexcom/start", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { dexcomService, generateSecureState } = await import('./services/dexcomService');
      // Generate cryptographically secure state stored server-side
      const state = generateSecureState(userId);
      const authUrl = dexcomService.getAuthorizationUrl(state);
      
      logger.info(`[Dexcom] Generated OAuth URL for user ${userId}`);
      res.json({ authUrl });
    } catch (error: any) {
      logger.error('[Dexcom] Start error:', error);
      res.status(500).json({ error: 'Failed to initiate Dexcom connection' });
    }
  });

  // GET /api/auth/dexcom/connect - Initiate OAuth flow (legacy/web browser flow)
  app.get("/api/auth/dexcom/connect", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { dexcomService, generateSecureState } = await import('./services/dexcomService');
      // Generate cryptographically secure state stored server-side
      const state = generateSecureState(userId);
      const authUrl = dexcomService.getAuthorizationUrl(state);
      
      logger.info(`[Dexcom] Initiating OAuth for user ${userId}`);
      res.redirect(authUrl);
    } catch (error: any) {
      logger.error('[Dexcom] Connect error:', error);
      res.status(500).json({ error: 'Failed to initiate Dexcom connection' });
    }
  });

  // GET /api/auth/dexcom/callback - Handle OAuth callback
  app.get("/api/auth/dexcom/callback", async (req: any, res) => {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        logger.warn('[Dexcom] OAuth error:', oauthError);
        return res.redirect('/?dexcom=error&reason=' + encodeURIComponent(oauthError));
      }

      if (!code || !state) {
        return res.redirect('/?dexcom=error&reason=missing_params');
      }

      // Validate state server-side (cryptographically secure, one-time use)
      const { validateAndConsumeState, dexcomService } = await import('./services/dexcomService');
      const stateValidation = validateAndConsumeState(state as string);
      
      if (!stateValidation.valid || !stateValidation.userId) {
        logger.warn('[Dexcom] Invalid or expired OAuth state');
        return res.redirect('/?dexcom=error&reason=invalid_state');
      }

      const userId = stateValidation.userId;
      const tokens = await dexcomService.exchangeCodeForTokens(code as string);
      await dexcomService.saveConnection(userId, tokens);
      
      logger.info(`[Dexcom] Successfully connected for user ${userId}`);
      
      const syncResult = await dexcomService.syncUserData(userId);
      logger.info(`[Dexcom] Initial sync: ${syncResult.recordsCount} readings`);

      res.redirect('/?dexcom=connected');
    } catch (error: any) {
      logger.error('[Dexcom] Callback error:', error);
      res.redirect('/?dexcom=error&reason=' + encodeURIComponent(error.message));
    }
  });

  // DELETE /api/dexcom/disconnect - Disconnect Dexcom
  app.delete("/api/dexcom/disconnect", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { dexcomService } = await import('./services/dexcomService');
      await dexcomService.deleteConnection(userId);
      
      logger.info(`[Dexcom] Disconnected for user ${userId}`);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('[Dexcom] Disconnect error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/dexcom/sync - Manually trigger sync
  app.post("/api/dexcom/sync", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { dexcomService } = await import('./services/dexcomService');
      const result = await dexcomService.syncUserData(userId);
      
      res.json(result);
    } catch (error: any) {
      logger.error('[Dexcom] Manual sync error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/dexcom/readings - Get glucose readings
  app.get("/api/dexcom/readings", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { dexcomService } = await import('./services/dexcomService');
      const hours = parseInt(req.query.hours as string) || 24;
      
      const endDate = new Date();
      const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      const readings = await dexcomService.getReadingsForRange(userId, startDate, endDate);
      const latest = readings.length > 0 ? readings[readings.length - 1] : null;
      const timeInRange = await dexcomService.calculateTimeInRange(userId, hours);
      
      res.json({
        readings,
        latest,
        timeInRange,
        hours,
      });
    } catch (error: any) {
      logger.error('[Dexcom] Get readings error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/dexcom/latest - Get latest glucose reading
  app.get("/api/dexcom/latest", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { dexcomService } = await import('./services/dexcomService');
      const latest = await dexcomService.getLatestReading(userId);
      
      if (!latest) {
        return res.json({ reading: null });
      }

      res.json({ reading: latest });
    } catch (error: any) {
      logger.error('[Dexcom] Get latest error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/cgm/data - Get CGM data for the CGM screen (formatted for frontend)
  app.get("/api/cgm/data", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const { dexcomService } = await import('./services/dexcomService');
      const range = req.query.range as string || '6h';
      
      // Calculate hours from range
      const hours = range === '3h' ? 3 : range === '24h' ? 24 : 6;
      
      // Get readings for the time range
      const endDate = new Date();
      const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      const readings = await dexcomService.getReadingsForRange(userId, startDate, endDate);
      
      // Get latest reading
      const latestReading = await dexcomService.getLatestReading(userId);
      
      // Target range in mmol/L
      const targetRange = { low: 3.9, high: 7.8 };
      
      // Convert mg/dL to mmol/L: mmol/L = mg/dL / 18.0182
      const convertToMmol = (mgdL: number) => mgdL / 18.0182;
      
      // Extract and convert values to mmol/L
      const valuesMmol = readings.map(r => convertToMmol(r.glucose_value || 0));
      
      const avgGlucose = valuesMmol.length > 0 
        ? valuesMmol.reduce((sum, v) => sum + v, 0) / valuesMmol.length 
        : 0;
      const minGlucose = valuesMmol.length > 0 ? Math.min(...valuesMmol) : 0;
      const maxGlucose = valuesMmol.length > 0 ? Math.max(...valuesMmol) : 0;
      const inRangeCount = valuesMmol.filter(v => v >= targetRange.low && v <= targetRange.high).length;
      const timeInRange = valuesMmol.length > 0 ? (inRangeCount / valuesMmol.length) * 100 : 0;
      
      // Calculate estimated A1c from average glucose (mmol/L)
      // Formula: A1c = (avgGlucose + 2.59) / 1.59
      const estimatedA1c = avgGlucose > 0 ? (avgGlucose + 2.59) / 1.59 : 0;
      
      // Count low alerts (readings below 3.0 mmol/L)
      const lowAlerts = valuesMmol.filter(v => v < 3.0).length;
      
      // Format readings for chart with proper mmol/L conversion
      const formattedReadings = readings.map(r => ({
        valueMmol: parseFloat(convertToMmol(r.glucose_value || 0).toFixed(1)),
        timestamp: r.recorded_at,
        timeLabel: new Date(r.recorded_at).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }));
      
      // Format current reading with mmol/L conversion
      // Note: trend_rate from Dexcom is in mg/dL/min, convert to mmol/L/min
      const currentReading = latestReading ? {
        value: latestReading.glucose_value,
        valueMmol: parseFloat(convertToMmol(latestReading.glucose_value || 0).toFixed(1)),
        trend: latestReading.trend || 'flat',
        trendRate: latestReading.trend_rate ? parseFloat(convertToMmol(latestReading.trend_rate).toFixed(2)) : 0,
        recordedAt: latestReading.recorded_at,
        source: 'dexcom',
      } : null;
      
      res.json({
        currentReading,
        readings: formattedReadings,
        stats: {
          avgGlucose: parseFloat(avgGlucose.toFixed(1)),
          minGlucose: parseFloat(minGlucose.toFixed(1)),
          maxGlucose: parseFloat(maxGlucose.toFixed(1)),
          timeInRange: parseFloat(timeInRange.toFixed(0)),
          estimatedA1c: parseFloat(estimatedA1c.toFixed(1)),
          lowAlerts,
        },
        targetRange,
      });
    } catch (error: any) {
      logger.error('[CGM] Get data error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===============================
  // ACTION PLAN API
  // ===============================

  // GET /api/action-plan - List user's action plan items (SUPABASE ONLY)
  app.get("/api/action-plan", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Validate status query parameter using schema enum
      let validatedStatus: string | undefined;
      if (req.query.status) {
        const statusResult = ActionPlanStatusEnum.safeParse(req.query.status);
        if (!statusResult.success) {
          return res.status(400).json({ error: "Invalid status. Must be one of: active, completed, dismissed" });
        }
        validatedStatus = statusResult.data;
      }
      
      // SUPABASE ONLY - Health data must be stored in Supabase for privacy
      const supabaseItems = await healthRouter.getActionPlanItems(userId, validatedStatus);
      
      // Normalize Supabase snake_case to camelCase
      const items = (supabaseItems || []).map((item: any) => ({
        id: item.id,
        userId: userId,
        dailyInsightId: item.daily_insight_id,
        snapshotTitle: item.snapshot_title,
        snapshotInsight: item.snapshot_insight,
        snapshotAction: item.snapshot_action,
        category: item.category,
        status: item.status,
        priority: item.priority,
        targetBiomarker: item.target_biomarker,
        currentValue: item.current_value,
        targetValue: item.target_value,
        unit: item.target_unit,
        biomarkerId: item.biomarker_id,
        title: item.title,
        description: item.description,
        addedAt: item.added_at || item.created_at,
        completedAt: item.completed_at,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));
      
      res.json({ items });
    } catch (error: any) {
      logger.error('[ActionPlan] List error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/action-plan - Add insight to action plan
  app.post("/api/action-plan", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Validate required fields (accept null values from JSON as well as undefined)
      const schema = z.object({
        dailyInsightId: z.string().optional().nullable(),
        snapshotTitle: z.string(),
        snapshotInsight: z.string(),
        snapshotAction: z.string(),
        category: z.string(),
        targetBiomarker: z.string().optional().nullable(),
        currentValue: z.number().optional().nullable(),
        targetValue: z.number().optional().nullable(),
        unit: z.string().optional().nullable(),
        metadata: z.any().optional().nullable(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const data = validationResult.data;
      
      // If dailyInsightId provided, verify it exists and belongs to user - SUPABASE-ONLY
      if (data.dailyInsightId) {
        const insight = await healthRouter.getDailyInsightById(userId, data.dailyInsightId);

        if (!insight) {
          return res.status(404).json({ error: "Insight not found" });
        }
      }

      // Lookup biomarkerId if targetBiomarker is provided (with synonym matching)
      let biomarkerId: string | undefined;
      if (data.targetBiomarker) {
        // Try exact match first
        const exactMatch = await db
          .select({ id: biomarkers.id })
          .from(biomarkers)
          .where(eq(biomarkers.name, data.targetBiomarker))
          .limit(1);
        
        if (exactMatch.length > 0) {
          biomarkerId = exactMatch[0].id;
          logger.info(`[ActionPlan] Exact match: "${data.targetBiomarker}" → ID ${biomarkerId}`);
        } else {
          // Try synonym match (case-insensitive)
          const synonymMatch = await db
            .select({ biomarkerId: biomarkerSynonyms.biomarkerId })
            .from(biomarkerSynonyms)
            .where(sql`LOWER(${biomarkerSynonyms.label}) = LOWER(${data.targetBiomarker})`)
            .limit(1);
          
          if (synonymMatch.length > 0) {
            biomarkerId = synonymMatch[0].biomarkerId;
            logger.info(`[ActionPlan] Synonym match: "${data.targetBiomarker}" → ID ${biomarkerId}`);
          } else {
            logger.warn(`[ActionPlan] No biomarker found for "${data.targetBiomarker}" (tried exact + synonyms)`);
          }
        }
      }

      // Prepare data for Supabase (snake_case)
      // Note: 'title' is required NOT NULL in Supabase - use snapshotTitle
      const supabaseItem = {
        title: data.snapshotTitle,
        description: data.snapshotAction,
        daily_insight_id: data.dailyInsightId || null,
        snapshot_title: data.snapshotTitle,
        snapshot_insight: data.snapshotInsight,
        snapshot_action: data.snapshotAction,
        category: data.category,
        target_biomarker: data.targetBiomarker || null,
        current_value: data.currentValue ?? null,
        target_value: data.targetValue ?? null,
        target_unit: data.unit || null,
        unit: data.unit || null,
        biomarker_id: biomarkerId || null,
        status: 'active',
        priority: 1,
      };
      
      logger.info(`[ActionPlan] Saving item to Supabase:`, {
        targetBiomarker: supabaseItem.target_biomarker,
        currentValue: supabaseItem.current_value,
        targetValue: supabaseItem.target_value,
        unit: supabaseItem.target_unit,
        biomarkerId: supabaseItem.biomarker_id
      });
      
      // SUPABASE ONLY - Health data must be stored in Supabase for privacy
      const result = await healthRouter.createActionPlanItem(userId, supabaseItem);
      
      // Normalize response to camelCase
      const item = {
        id: result.id,
        userId: userId,
        dailyInsightId: result.daily_insight_id,
        snapshotTitle: result.snapshot_title,
        snapshotInsight: result.snapshot_insight,
        snapshotAction: result.snapshot_action,
        category: result.category,
        status: result.status,
        priority: result.priority,
        targetBiomarker: result.target_biomarker,
        currentValue: result.current_value,
        targetValue: result.target_value,
        unit: result.target_unit,
        biomarkerId: result.biomarker_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      };
      
      logger.info(`[ActionPlan] Item added to Supabase - ID: ${item.id}, biomarkerId: ${item.biomarkerId}, targetBiomarker: ${item.targetBiomarker}`);
      res.json({ item });
    } catch (error: any) {
      logger.error('[ActionPlan] Add error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/action-plan/:id - Update action plan item status (SUPABASE ONLY)
  app.patch("/api/action-plan/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const schema = z.object({
        status: ActionPlanStatusEnum,
        completedAt: z.string().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const { status, completedAt } = validationResult.data;
      const completedDate = completedAt ? new Date(completedAt) : (status === 'completed' ? new Date() : undefined);

      // SUPABASE ONLY - Health data must be stored in Supabase for privacy
      const item = await healthRouter.updateActionPlanItemStatus(id, userId, status, completedDate);
      
      if (!item) {
        return res.status(404).json({ error: "Action plan item not found" });
      }

      logger.info(`[ActionPlan] Item ${id} status updated to ${status} by user ${userId}`);
      res.json({ item });
    } catch (error: any) {
      logger.error('[ActionPlan] Update error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/action-plan/:id - Remove action plan item (SUPABASE ONLY)
  app.delete("/api/action-plan/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // SUPABASE ONLY - Health data must be stored in Supabase for privacy
      const item = await healthRouter.getActionPlanItem(id, userId);
      
      if (!item) {
        return res.status(404).json({ error: "Action plan item not found" });
      }

      await healthRouter.deleteActionPlanItem(id, userId);
      
      logger.info(`[ActionPlan] Item ${id} removed by user ${userId} from Supabase`);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('[ActionPlan] Delete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/action-plan/:id/progress - Get biomarker/activity progress data for chart
  app.get("/api/action-plan/:id/progress", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const { id } = req.params;
    const { timeframe } = req.query;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Get the action plan item
      const item = await healthRouter.getActionPlanItem(id, userId);
      if (!item) {
        return res.status(404).json({ error: "Action plan item not found" });
      }

      // Only return progress if tracking is set up
      if (!item.targetBiomarker || item.currentValue === null || item.targetValue === null) {
        return res.json({ dataPoints: [] });
      }

      const dataPoints: Array<{ date: string; value: number; source: string }> = [];
      const startDate = new Date(item.addedAt);
      
      // Calculate end date based on timeframe
      const monthsMap: Record<string, number> = { '3M': 3, '6M': 6, '9M': 9, '12M': 12 };
      const months = timeframe && monthsMap[timeframe as string] ? monthsMap[timeframe as string] : 3;
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);
      const now = new Date();
      const queryEndDate = now < endDate ? now : endDate;

      // Map targetBiomarker to HealthKit daily metrics column names
      // Include many synonyms to catch various stored formats
      const activityMetricsMap: Record<string, string> = {
        // Steps variations
        'steps': 'steps_normalized',
        'steps_normalized': 'steps_normalized',
        'daily_steps': 'steps_normalized',
        'step_count': 'steps_normalized',
        'stepcount': 'steps_normalized',
        'activity_steps': 'steps_normalized',
        'total_steps': 'steps_normalized',
        'steps_per_day': 'steps_normalized',
        'average_steps': 'steps_normalized',
        'avg_steps': 'steps_normalized',
        // HRV variations
        'hrv': 'hrv_avg',
        'hrv_avg': 'hrv_avg',
        'heart_rate_variability': 'hrv_avg',
        'heartratevariability': 'hrv_avg',
        'average_hrv': 'hrv_avg',
        'avg_hrv': 'hrv_avg',
        // Resting HR variations
        'resting_hr': 'resting_hr',
        'resting_heart_rate': 'resting_hr',
        'restingheartrate': 'resting_hr',
        'rhr': 'resting_hr',
        // Sleep variations
        'sleep_duration': 'sleep_duration_hours',
        'sleep_duration_hours': 'sleep_duration_hours',
        'sleep': 'sleep_duration_hours',
        'total_sleep': 'sleep_duration_hours',
        'sleep_hours': 'sleep_duration_hours',
        'hours_of_sleep': 'sleep_duration_hours',
        'average_sleep': 'sleep_duration_hours',
        'avg_sleep': 'sleep_duration_hours',
        'deep_sleep': 'deep_sleep_hours',
        'deep_sleep_hours': 'deep_sleep_hours',
        'rem_sleep': 'rem_sleep_hours',
        'rem_sleep_hours': 'rem_sleep_hours',
        // Exercise variations
        'exercise_minutes': 'exercise_minutes',
        'exercise': 'exercise_minutes',
        'workout_minutes': 'exercise_minutes',
        'activity_minutes': 'exercise_minutes',
        'active_minutes': 'exercise_minutes',
        // Energy variations
        'active_energy': 'active_energy_kcal',
        'active_energy_kcal': 'active_energy_kcal',
        'calories_burned': 'active_energy_kcal',
        'active_calories': 'active_energy_kcal',
        // Distance variations
        'distance': 'distance_meters',
        'distance_meters': 'distance_meters',
        'walking_distance': 'distance_meters',
        'daily_distance': 'distance_meters',
        // Other metrics
        'vo2_max': 'vo2_max',
        'vo2max': 'vo2_max',
        'respiratory_rate': 'respiratory_rate',
        'breathing_rate': 'respiratory_rate',
        'oxygen_saturation': 'oxygen_saturation',
        'spo2': 'oxygen_saturation',
        'blood_oxygen': 'oxygen_saturation',
        'body_temperature': 'body_temperature_celsius',
        'temperature': 'body_temperature_celsius',
      };

      // Normalize the biomarker name: lowercase, replace spaces/hyphens with underscores
      const biomarkerLower = item.targetBiomarker.toLowerCase().trim().replace(/[\s-]+/g, '_');
      const healthKitColumn = activityMetricsMap[biomarkerLower];
      
      // Debug logging to help identify unmapped biomarkers
      logger.info(`[ActionPlan] Progress request for item ${id}: targetBiomarker="${item.targetBiomarker}", normalized="${biomarkerLower}", mapped=${healthKitColumn || 'NOT_FOUND'}, currentValue=${item.currentValue}, targetValue=${item.targetValue}, addedAt=${item.addedAt}`);

      // Check if this is an activity/HealthKit metric
      if (healthKitColumn) {
        logger.info(`[ActionPlan] Activity metric detected: ${item.targetBiomarker} -> ${healthKitColumn}`);
        
        // Query HealthKit daily metrics from Supabase
        const dailyMetrics = await healthRouter.getUserDailyMetrics(userId, { limit: 365 });
        
        // Filter and map the metrics
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = queryEndDate.toISOString().split('T')[0];
        
        for (const metric of dailyMetrics) {
          const metricDate = metric.local_date || metric.localDate;
          if (!metricDate) continue;
          
          // Check if date is within range
          if (metricDate >= startDateStr && metricDate <= endDateStr) {
            // Get the value from the appropriate column (handle both snake_case and camelCase)
            let value: number | null = null;
            
            // Try snake_case first (Supabase format)
            if (metric[healthKitColumn] !== undefined && metric[healthKitColumn] !== null) {
              value = Number(metric[healthKitColumn]);
            } else {
              // Try camelCase version
              const camelKey = healthKitColumn.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
              if (metric[camelKey] !== undefined && metric[camelKey] !== null) {
                value = Number(metric[camelKey]);
              }
            }
            
            if (value !== null && !isNaN(value) && value > 0) {
              dataPoints.push({
                date: new Date(metricDate).toISOString(),
                value: value,
                source: 'healthkit'
              });
            }
          }
        }
        
        logger.info(`[ActionPlan] Found ${dataPoints.length} HealthKit data points for ${item.targetBiomarker}`);
      } else if (item.biomarkerId) {
        // This is a blood work biomarker - use existing logic
        logger.info(`[ActionPlan] Blood work biomarker detected: ${item.targetBiomarker}`);
        
        // Add baseline point from when action was added (uses currentValue snapshot)
        dataPoints.push({
          date: startDate.toISOString(),
          value: item.currentValue,
          source: 'baseline'
        });

        // Query blood work measurements AFTER action was added using deterministic biomarkerId join
        const bloodWorkMeasurements = await db
          .select({
            value: biomarkerMeasurements.valueCanonical,
            unit: biomarkerMeasurements.unitCanonical,
            testDate: biomarkerTestSessions.testDate,
          })
          .from(biomarkerMeasurements)
          .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
          .where(
            and(
              eq(biomarkerMeasurements.biomarkerId, item.biomarkerId),
              eq(biomarkerTestSessions.userId, userId),
              gt(biomarkerTestSessions.testDate, startDate),
              sql`${biomarkerTestSessions.testDate} <= ${endDate}`
            )
          )
          .orderBy(biomarkerTestSessions.testDate);

        for (const measurement of bloodWorkMeasurements) {
          dataPoints.push({
            date: measurement.testDate.toISOString(),
            value: measurement.value,
            source: 'blood_work'
          });
        }
        
        logger.info(`[ActionPlan] Found ${dataPoints.length} blood work data points`);
      } else {
        logger.warn(`[ActionPlan] Item ${id} has unknown biomarker type: ${item.targetBiomarker}`);
        return res.json({ dataPoints: [] });
      }

      // Sort by date
      dataPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      logger.info(`[ActionPlan] Progress data fetched for item ${id}: ${dataPoints.length} total data points`);
      res.json({ dataPoints });
    } catch (error: any) {
      logger.error('[ActionPlan] Progress data error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/daily-insights/trigger-check - Manually trigger scheduler check (admin only)
  app.post("/api/daily-insights/trigger-check", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      logger.info('[DailyInsightsV2] Manual scheduler check triggered');
      
      // Trigger the scheduler check (non-blocking)
      triggerInsightsGenerationCheck().catch(error => {
        logger.error('[DailyInsightsV2] Scheduler check error:', error);
      });

      res.json({ 
        success: true,
        message: "Scheduler check triggered. Check logs for results."
      });
    } catch (error: any) {
      logger.error('[DailyInsightsV2] Trigger check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/daily-insights/generate - Force generate insights for current user (admin only, for testing)
  app.post("/api/daily-insights/generate", isAuthenticated, requireAdmin, async (req: any, res) => {
    // Debug logging
    logger.info('[DailyInsightsV2] req.user structure:', {
      hasUser: !!req.user,
      hasClaims: !!req.user?.claims,
      sub: req.user?.claims?.sub,
      id: req.user?.id,
      fullUser: req.user
    });
    
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized - no user ID found" });
    }

    try {
      logger.info(`[DailyInsightsV2] Force generating insights for user ${userId} (type: ${typeof userId})`);
      const startTime = Date.now();
      
      const insights = await generateDailyInsights(userId, true); // Force regeneration
      const duration = Date.now() - startTime;

      res.json({ 
        success: true,
        insightsGenerated: insights.length,
        durationMs: duration,
        insights: insights.map((i: any) => ({
          title: i.title,
          category: i.category,
          confidenceScore: i.confidenceScore
        }))
      });
    } catch (error: any) {
      logger.error('[DailyInsightsV2] Force generate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/action-plan/debug - Debug action plan items (admin only)
  app.get("/api/action-plan/debug", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.query.userId as string;
      
      const items = await db
        .select({
          id: actionPlanItems.id,
          targetBiomarker: actionPlanItems.targetBiomarker,
          biomarkerId: actionPlanItems.biomarkerId,
          currentValue: actionPlanItems.currentValue,
          targetValue: actionPlanItems.targetValue,
          unit: actionPlanItems.unit,
          addedAt: actionPlanItems.addedAt,
        })
        .from(actionPlanItems)
        .where(userId ? eq(actionPlanItems.userId, userId) : sql`true`)
        .orderBy(desc(actionPlanItems.addedAt))
        .limit(10);

      res.json({ items });
    } catch (error: any) {
      logger.error('[ActionPlan Debug] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/action-plan/backfill-biomarker-ids - Backfill biomarkerId for existing action plan items (admin only)
  app.post("/api/action-plan/backfill-biomarker-ids", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      // Get all action plan items without biomarkerId
      const itemsWithoutId = await db
        .select()
        .from(actionPlanItems)
        .where(
          and(
            isNull(actionPlanItems.biomarkerId),
            isNotNull(actionPlanItems.targetBiomarker)
          )
        );

      logger.info(`[ActionPlan Backfill] Found ${itemsWithoutId.length} items without biomarkerId`);

      let matched = 0;
      let unmatched = 0;
      const unmatchedNames: string[] = [];

      for (const item of itemsWithoutId) {
        const targetName = item.targetBiomarker!;

        // Try exact match on biomarkers.name
        let biomarkerId: string | null = null;
        const exactMatch = await db
          .select({ id: biomarkers.id })
          .from(biomarkers)
          .where(eq(biomarkers.name, targetName))
          .limit(1);

        if (exactMatch.length > 0) {
          biomarkerId = exactMatch[0].id;
          logger.info(`[ActionPlan Backfill] Exact match for "${targetName}"`);
        } else {
          // Try exact match on biomarkerSynonyms.label
          const synonymMatch = await db
            .select({ biomarkerId: biomarkerSynonyms.biomarkerId })
            .from(biomarkerSynonyms)
            .where(eq(biomarkerSynonyms.label, targetName))
            .limit(1);

          if (synonymMatch.length > 0) {
            biomarkerId = synonymMatch[0].biomarkerId;
            logger.info(`[ActionPlan Backfill] Synonym match for "${targetName}"`);
          } else {
            // Try case-insensitive fuzzy match
            const fuzzyMatch = await db
              .select({ biomarkerId: biomarkerSynonyms.biomarkerId })
              .from(biomarkerSynonyms)
              .where(sql`LOWER(${biomarkerSynonyms.label}) = LOWER(${targetName})`)
              .limit(1);

            if (fuzzyMatch.length > 0) {
              biomarkerId = fuzzyMatch[0].biomarkerId;
              logger.info(`[ActionPlan Backfill] Fuzzy match for "${targetName}"`);
            } else {
              // Also try fuzzy match on biomarkers.name
              const biomarkerFuzzyMatch = await db
                .select({ id: biomarkers.id })
                .from(biomarkers)
                .where(sql`LOWER(${biomarkers.name}) = LOWER(${targetName})`)
                .limit(1);

              if (biomarkerFuzzyMatch.length > 0) {
                biomarkerId = biomarkerFuzzyMatch[0].id;
                logger.info(`[ActionPlan Backfill] Fuzzy biomarker name match for "${targetName}"`);
              }
            }
          }
        }

        // Update item if biomarkerId found
        if (biomarkerId) {
          await db
            .update(actionPlanItems)
            .set({ biomarkerId })
            .where(eq(actionPlanItems.id, item.id));
          matched++;
        } else {
          unmatched++;
          unmatchedNames.push(targetName);
          logger.warn(`[ActionPlan Backfill] No match found for "${targetName}"`);
        }
      }

      logger.info(`[ActionPlan Backfill] Complete: ${matched} matched, ${unmatched} unmatched`);
      
      res.json({ 
        success: true,
        totalItems: itemsWithoutId.length,
        matched,
        unmatched,
        unmatchedNames
      });
    } catch (error: any) {
      logger.error('[ActionPlan Backfill] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  registerAdminRoutes(app);
  
  // Mobile auth routes (Apple, Google, Email/Password)
  app.use(mobileAuthRouter);
  
  // Public billing routes (webhooks - no authentication required)
  // These must be registered BEFORE the authenticated routes
  const { publicBillingRouter } = await import('./routes/billing');
  app.use('/api/billing', publicBillingRouter);
  
  // Authenticated billing routes (Stripe subscription management)
  app.use('/api/billing', isAuthenticated, billingRouter);

  const httpServer = createServer(app);
  
  // ────────────────────────────────────────────────────────────────
  // GEMINI LIVE WEBSOCKET - Real-time bidirectional voice streaming
  // ────────────────────────────────────────────────────────────────
  
  const WebSocket = await import('ws');
  // Single WebSocket server with noServer mode for manual upgrade handling
  const wss = new WebSocket.WebSocketServer({ noServer: true });
  
  // Upgrade handler to route based on path
  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    
    if (pathname === '/api/voice/gemini-live' || pathname === '/api/voice/admin-sandbox' || pathname === '/api/voice/sie-brainstorm') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });
  
  wss.on('connection', async (ws: any, req: any) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    // Route to admin sandbox handler if that's the path
    if (pathname === '/api/voice/admin-sandbox') {
      handleAdminSandboxConnection(ws, req, WebSocket);
      return;
    }
    
    // Route to SIE brainstorm handler if that's the path
    if (pathname === '/api/voice/sie-brainstorm') {
      handleSIEBrainstormConnection(ws, req, WebSocket);
      return;
    }
    
    // Regular Gemini Live handler
    logger.info('[GeminiLive WS] New connection attempt');
    
    let userId: string | null = null;
    let sessionId: string | null = null;
    
    try {
      // Parse auth from URL params (mobile app passes JWT)
      const token = url.searchParams.get('token');
      
      // Use SESSION_SECRET for JWT verification (same secret used to sign mobile tokens)
      const jwtSecret = process.env.SESSION_SECRET;
      if (!jwtSecret) {
        logger.error('[GeminiLive WS] SESSION_SECRET not configured');
        ws.close(4003, 'Server configuration error');
        return;
      }
      
      if (token) {
        // Verify JWT token with actual secret
        const jwt = await import('jsonwebtoken');
        try {
          const decoded = jwt.default.verify(token, jwtSecret) as { sub: string };
          userId = decoded.sub; // Mobile tokens use 'sub' for user ID
        } catch (jwtError: any) {
          logger.error('[GeminiLive WS] JWT verification failed', { error: jwtError.message });
          ws.close(4001, 'Invalid token');
          return;
        }
      } else {
        // No token provided
        logger.warn('[GeminiLive WS] No token provided');
        ws.close(4001, 'Authentication required');
        return;
      }
      
      if (!userId) {
        ws.close(4001, 'Invalid authentication');
        return;
      }
      
      // Get device timezone from URL params (iOS app sends this)
      const deviceTimezone = url.searchParams.get('timezone') || undefined;
      
      logger.info('[GeminiLive WS] Authenticated user', { userId, deviceTimezone });
      
      // Import and start Gemini voice session
      const { geminiVoiceService } = await import('./services/geminiVoiceService');
      
      if (!geminiVoiceService.isAvailable()) {
        ws.send(JSON.stringify({ type: 'error', message: 'Gemini Live not available' }));
        ws.close(4003, 'Service unavailable');
        return;
      }
      
      // Start the voice session with device timezone
      sessionId = await geminiVoiceService.startSession(userId, {
        onAudioChunk: (audioData: Buffer) => {
          // Send audio back to client as base64
          if (ws.readyState === WebSocket.default.OPEN) {
            ws.send(JSON.stringify({
              type: 'audio',
              data: audioData.toString('base64'),
            }));
          }
        },
        onTranscript: (text: string, isFinal: boolean) => {
          if (ws.readyState === WebSocket.default.OPEN) {
            ws.send(JSON.stringify({
              type: 'transcript',
              text,
              isFinal,
            }));
          }
        },
        onModelText: (text: string) => {
          // Send model's text response to client
          if (ws.readyState === WebSocket.default.OPEN && text) {
            ws.send(JSON.stringify({
              type: 'response_text',
              text,
            }));
          }
        },
        onError: (error: Error) => {
          if (ws.readyState === WebSocket.default.OPEN) {
            ws.send(JSON.stringify({
              type: 'error',
              message: error.message,
            }));
          }
        },
        onClose: () => {
          if (ws.readyState === WebSocket.default.OPEN) {
            ws.close(1000, 'Session ended');
          }
        },
      }, deviceTimezone);
      
      ws.send(JSON.stringify({ type: 'connected', sessionId }));
      logger.info('[GeminiLive WS] Session started', { userId, sessionId });
      
      // Handle incoming messages (audio data from client)
      ws.on('message', async (data: any) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'audio' && message.data && sessionId) {
            // Decode base64 audio and send to Gemini
            const audioBuffer = Buffer.from(message.data, 'base64');
            await geminiVoiceService.sendAudio(sessionId, audioBuffer);
          } else if (message.type === 'text' && message.text && sessionId) {
            // Send text input (for accessibility/testing)
            await geminiVoiceService.sendText(sessionId, message.text);
          } else if (message.type === 'end') {
            // End the session
            if (sessionId) {
              await geminiVoiceService.endSession(sessionId);
            }
            ws.close(1000, 'Session ended by client');
          }
        } catch (error: any) {
          logger.error('[GeminiLive WS] Message processing error', { error: error.message });
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
        }
      });
      
      // Handle close - ensure session cleanup
      ws.on('close', async () => {
        logger.info('[GeminiLive WS] Connection closed', { userId, sessionId });
        if (sessionId) {
          try {
            await geminiVoiceService.endSession(sessionId);
            sessionId = null; // Prevent double cleanup
            
            // Mark AI chat used for gamification (voice counts as AI chat)
            if (userId) {
              markAiChatUsed(userId).catch(() => {});
            }
          } catch (cleanupError: any) {
            logger.error('[GeminiLive WS] Session cleanup error', { error: cleanupError.message });
          }
        }
      });
      
      // Handle errors
      ws.on('error', async (error: Error) => {
        logger.error('[GeminiLive WS] WebSocket error', { userId, sessionId, error: error.message });
        if (sessionId) {
          try {
            await geminiVoiceService.endSession(sessionId);
            sessionId = null;
          } catch (cleanupError: any) {
            logger.error('[GeminiLive WS] Session cleanup error on error', { error: cleanupError.message });
          }
        }
      });
      
    } catch (error: any) {
      logger.error('[GeminiLive WS] Connection error', { error: error.message });
      ws.close(4002, 'Server error');
    }
  });

  // Admin sandbox connection handler function
  async function handleAdminSandboxConnection(ws: any, req: any, WebSocket: any) {
    logger.info('[AdminSandbox WS] New connection attempt');
    
    let userId: string | null = null;
    let sessionId: string | null = null;
    
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      
      const jwtSecret = process.env.SESSION_SECRET;
      if (!jwtSecret) {
        logger.error('[AdminSandbox WS] SESSION_SECRET not configured');
        ws.close(4003, 'Server configuration error');
        return;
      }
      
      if (token) {
        const jwt = await import('jsonwebtoken');
        try {
          const decoded = jwt.default.verify(token, jwtSecret) as { sub: string };
          userId = decoded.sub;
        } catch (jwtError: any) {
          logger.error('[AdminSandbox WS] JWT verification failed', { error: jwtError.message });
          ws.close(4001, 'Invalid token');
          return;
        }
      } else {
        logger.warn('[AdminSandbox WS] No token provided');
        ws.close(4001, 'Authentication required');
        return;
      }
      
      if (!userId) {
        ws.close(4001, 'Invalid authentication');
        return;
      }
      
      // CRITICAL: Verify user is an admin
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.role !== 'admin') {
        logger.warn('[AdminSandbox WS] Non-admin access attempt', { userId, role: user?.role });
        ws.close(4003, 'Admin access required');
        return;
      }
      
      logger.info('[AdminSandbox WS] Admin authenticated', { userId });
      
      const { geminiVoiceService } = await import('./services/geminiVoiceService');
      
      if (!geminiVoiceService.isAvailable()) {
        ws.send(JSON.stringify({ type: 'error', message: 'Gemini Live not available' }));
        ws.close(4003, 'Service unavailable');
        return;
      }
      
      // Start the admin sandbox session with unrestricted prompts
      try {
        sessionId = await geminiVoiceService.startAdminSandboxSession(userId, {
          onAudioChunk: (audioData: Buffer) => {
            if (ws.readyState === WebSocket.default.OPEN) {
              ws.send(JSON.stringify({
                type: 'audio',
                data: audioData.toString('base64'),
              }));
            }
          },
          onTranscript: (text: string, isFinal: boolean) => {
            if (ws.readyState === WebSocket.default.OPEN) {
              ws.send(JSON.stringify({
                type: 'transcript',
                text,
                isFinal,
              }));
            }
          },
          onModelText: (text: string) => {
            if (ws.readyState === WebSocket.default.OPEN && text) {
              ws.send(JSON.stringify({
                type: 'response_text',
                text,
              }));
            }
          },
          onError: (error: Error) => {
            logger.error('[AdminSandbox WS] Session error callback', { error: error.message });
            if (ws.readyState === WebSocket.default.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: error.message,
              }));
            }
          },
          onClose: () => {
            logger.info('[AdminSandbox WS] Session closed callback');
            if (ws.readyState === WebSocket.default.OPEN) {
              ws.close(1000, 'Session ended');
            }
          },
        });
        
        ws.send(JSON.stringify({ type: 'connected', sessionId }));
        logger.info('[AdminSandbox WS] Session started successfully', { userId, sessionId });
      } catch (sessionError: any) {
        logger.error('[AdminSandbox WS] Failed to start session', { 
          userId, 
          error: sessionError.message,
          stack: sessionError.stack 
        });
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to start voice session: ' + sessionError.message }));
        ws.close(4004, 'Session start failed');
        return;
      }
      
      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'audio' && sessionId) {
            const audioBuffer = Buffer.from(message.data, 'base64');
            await geminiVoiceService.sendAudio(sessionId, audioBuffer);
          } else if (message.type === 'text' && sessionId) {
            await geminiVoiceService.sendText(sessionId, message.text);
          } else if (message.type === 'end') {
            if (sessionId) {
              await geminiVoiceService.endSession(sessionId);
              sessionId = null;
            }
            ws.close(1000, 'Session ended by client');
          }
        } catch (error: any) {
          logger.error('[AdminSandbox WS] Message error', { error: error.message });
        }
      });
      
      // Handle close
      ws.on('close', async () => {
        logger.info('[AdminSandbox WS] Connection closed', { userId, sessionId });
        if (sessionId) {
          try {
            await geminiVoiceService.endSession(sessionId);
            sessionId = null;
          } catch (cleanupError: any) {
            logger.error('[AdminSandbox WS] Session cleanup error', { error: cleanupError.message });
          }
        }
      });
      
      // Handle errors
      ws.on('error', async (error: Error) => {
        logger.error('[AdminSandbox WS] WebSocket error', { userId, sessionId, error: error.message });
        if (sessionId) {
          try {
            await geminiVoiceService.endSession(sessionId);
            sessionId = null;
          } catch (cleanupError: any) {
            logger.error('[AdminSandbox WS] Session cleanup error on error', { error: cleanupError.message });
          }
        }
      });
      
    } catch (error: any) {
      logger.error('[AdminSandbox WS] Connection error', { error: error.message });
      ws.close(4002, 'Server error');
    }
  }

  // SIE Brainstorm connection handler function
  async function handleSIEBrainstormConnection(ws: any, req: any, WebSocket: any) {
    logger.info('[SIE Brainstorm WS] New connection attempt');
    
    let userId: string | null = null;
    let sessionId: string | null = null;
    
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      
      const jwtSecret = process.env.SESSION_SECRET;
      if (!jwtSecret) {
        logger.error('[SIE Brainstorm WS] SESSION_SECRET not configured');
        ws.close(4003, 'Server configuration error');
        return;
      }
      
      if (token) {
        const jwt = await import('jsonwebtoken');
        try {
          const decoded = jwt.default.verify(token, jwtSecret) as { sub: string };
          userId = decoded.sub;
        } catch (jwtError: any) {
          logger.error('[SIE Brainstorm WS] JWT verification failed', { error: jwtError.message });
          ws.close(4001, 'Invalid token');
          return;
        }
      } else {
        logger.warn('[SIE Brainstorm WS] No token provided');
        ws.close(4001, 'Authentication required');
        return;
      }
      
      if (!userId) {
        ws.close(4001, 'Invalid authentication');
        return;
      }
      
      // CRITICAL: Verify user is an admin
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.role !== 'admin') {
        logger.warn('[SIE Brainstorm WS] Non-admin access attempt', { userId, role: user?.role });
        ws.close(4003, 'Admin access required');
        return;
      }
      
      logger.info('[SIE Brainstorm WS] Admin authenticated', { userId });
      
      const { geminiVoiceService } = await import('./services/geminiVoiceService');
      
      if (!geminiVoiceService.isAvailable()) {
        ws.send(JSON.stringify({ type: 'error', message: 'Gemini Live not available' }));
        ws.close(4003, 'Service unavailable');
        return;
      }
      
      // Start the SIE brainstorm voice session
      try {
        sessionId = await geminiVoiceService.startSIEBrainstormSession(userId, {
          onAudioChunk: (audioData: Buffer) => {
            if (ws.readyState === WebSocket.default.OPEN) {
              ws.send(JSON.stringify({
                type: 'audio',
                data: audioData.toString('base64'),
              }));
            }
          },
          onTranscript: (text: string, isFinal: boolean) => {
            if (ws.readyState === WebSocket.default.OPEN) {
              ws.send(JSON.stringify({
                type: 'transcript',
                text,
                isFinal,
              }));
            }
          },
          onModelText: (text: string) => {
            if (ws.readyState === WebSocket.default.OPEN && text) {
              ws.send(JSON.stringify({
                type: 'response_text',
                text,
              }));
            }
          },
          onError: (error: Error) => {
            logger.error('[SIE Brainstorm WS] Session error callback', { error: error.message });
            if (ws.readyState === WebSocket.default.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: error.message,
              }));
            }
          },
          onClose: () => {
            logger.info('[SIE Brainstorm WS] Session closed callback');
            if (ws.readyState === WebSocket.default.OPEN) {
              ws.close(1000, 'Session ended');
            }
          },
        });
        
        ws.send(JSON.stringify({ type: 'connected', sessionId }));
        logger.info('[SIE Brainstorm WS] Session started successfully', { userId, sessionId });
      } catch (sessionError: any) {
        logger.error('[SIE Brainstorm WS] Failed to start session', { 
          userId, 
          error: sessionError.message,
          stack: sessionError.stack 
        });
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to start voice session: ' + sessionError.message }));
        ws.close(4004, 'Session start failed');
        return;
      }
      
      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'audio' && sessionId) {
            const audioBuffer = Buffer.from(message.data, 'base64');
            await geminiVoiceService.sendAudio(sessionId, audioBuffer);
          } else if (message.type === 'text' && sessionId) {
            await geminiVoiceService.sendText(sessionId, message.text);
          } else if (message.type === 'end') {
            if (sessionId) {
              await geminiVoiceService.endSession(sessionId);
              sessionId = null;
            }
            ws.close(1000, 'Session ended by client');
          }
        } catch (error: any) {
          logger.error('[SIE Brainstorm WS] Message error', { error: error.message });
        }
      });
      
      // Handle close
      ws.on('close', async () => {
        logger.info('[SIE Brainstorm WS] Connection closed', { userId, sessionId });
        if (sessionId) {
          try {
            await geminiVoiceService.endSession(sessionId);
            sessionId = null;
          } catch (cleanupError: any) {
            logger.error('[SIE Brainstorm WS] Session cleanup error', { error: cleanupError.message });
          }
        }
      });
      
      // Handle errors
      ws.on('error', async (error: Error) => {
        logger.error('[SIE Brainstorm WS] WebSocket error', { userId, sessionId, error: error.message });
        if (sessionId) {
          try {
            await geminiVoiceService.endSession(sessionId);
            sessionId = null;
          } catch (cleanupError: any) {
            logger.error('[SIE Brainstorm WS] Session cleanup error on error', { error: cleanupError.message });
          }
        }
      });
      
    } catch (error: any) {
      logger.error('[SIE Brainstorm WS] Connection error', { error: error.message });
      ws.close(4002, 'Server error');
    }
  }
  
  return httpServer;
}
