// Reference: javascript_log_in_with_replit and javascript_object_storage blueprints
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { setupAuth, isAuthenticated } from "./replitAuth";
import type { GrokChatMessage } from "./services/grokClient";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { analyzeBloodWork, generateBiomarkerInsights } from "./openai";
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
import { logger } from "./logger";
import { eq, desc, and, gte, gt, sql, isNull, isNotNull } from "drizzle-orm";
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

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

  // Object storage routes
  const objectStorageService = new ObjectStorageService();

  // Get upload URL for blood work file
  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
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
      
      // Log event to database
      const { lifeEvents } = await import('@shared/schema');
      const [inserted] = await db.insert(lifeEvents).values({
        userId,
        eventType,
        details: eventDetails,
        notes: `Quick-logged via iOS Shortcut`, // Track source
      }).returning();
      
      logger.info(`[LifeEvents] Quick-logged ${eventType} for user ${userId} via API key`);
      
      res.status(201).json({
        success: true,
        event: {
          id: inserted.id,
          eventType: inserted.eventType,
          happenedAt: inserted.happenedAt,
        }
      });
    } catch (error) {
      logger.error('[LifeEvents] Error quick-logging event:', error);
      res.status(500).json({ error: 'Failed to log event' });
    }
  });

  // Blood work analysis endpoint
  app.post("/api/blood-work/analyze", isAuthenticated, canUploadLab, async (req: any, res) => {
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
        const userAgeY = profile?.dateOfBirth 
          ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
          : undefined;

        // Normalize biomarkers
        const normalizationResult = await normalizeBatch(extractionResult.data.biomarkers, {
          userSex,
          userAgeY,
          profileName: "Global Default",
        });
        const session = await storage.createTestSession({
          userId,
          source: "ai_extracted",
          testDate,
        });

        // Create measurements for successfully normalized biomarkers
        const measurementIds: string[] = [];
        if (normalizationResult.normalized && normalizationResult.normalized.length > 0) {
          for (const normalized of normalizationResult.normalized) {
            const measurement = await storage.createMeasurement({
              sessionId: session.id,
              biomarkerId: normalized.biomarkerId,
              recordId: record.id,
              source: "ai_extracted",
              valueRaw: normalized.valueRawNumeric,
              unitRaw: normalized.unitRaw,
              valueCanonical: normalized.valueCanonical,
              unitCanonical: normalized.unitCanonical,
              valueDisplay: `${normalized.valueRawString} ${normalized.unitRaw}`,
              referenceLow: normalized.referenceLow ?? undefined,
              referenceHigh: normalized.referenceHigh ?? undefined,
              flags: normalized.flags,
              warnings: normalized.warnings,
              normalizationContext: normalized.normalizationContext as any,
            });
            measurementIds.push(measurement.id);
          }
        }

        // Update record status
        await storage.updateBloodWorkRecordStatus(record.id, "completed");

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

      // Get all test sessions for user
      const sessions = await storage.getTestSessionsByUser(userId);
      
      if (sessions.length === 0) {
        return res.json({ overdue: [], upcoming: [], hasLabData: false });
      }

      // Get all measurements across sessions - track latest test date per biomarker
      const measurementsByBiomarker = new Map<string, { testDate: Date; biomarkerId: string; biomarkerName: string }>();
      
      for (const session of sessions) {
        const measurements = await storage.getMeasurementsBySession(session.id);
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
      
      // Parse dateOfBirth if present
      const requestData = {
        ...req.body,
        dateOfBirth: req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : undefined,
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

      // Get all test sessions for user
      const sessions = await storage.getTestSessionsByUser(userId);

      // For each session, fetch its measurements
      const sessionsWithMeasurements = await Promise.all(
        sessions.map(async (session) => {
          const measurements = await storage.getMeasurementsBySession(session.id);
          return {
            ...session,
            measurements,
          };
        })
      );

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
      if (!profile || !profile.dateOfBirth) {
        return res.status(400).json({ 
          error: "Date of birth not found. Please complete your profile to calculate biological age.",
          missingData: "dateOfBirth"
        });
      }

      // Calculate chronological age
      const today = new Date();
      const birthDate = new Date(profile.dateOfBirth);
      const ageYears = today.getFullYear() - birthDate.getFullYear() - 
        (today.getMonth() < birthDate.getMonth() || 
         (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0);

      // Get user's latest biomarker test session
      const sessions = await storage.getTestSessionsByUser(userId);
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
        const sessionMeasurements = await storage.getMeasurementsBySession(session.id);
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
      if (!profile?.dateOfBirth) missingFields.push("dateOfBirth");
      if (!profile?.sex) missingFields.push("sex");
      
      if (missingFields.length > 0 || !profile) {
        return res.status(422).json({ 
          error: "Insufficient profile data. Please complete your age and sex in your profile to generate comprehensive insights.",
          missingData: missingFields
        });
      }

      // Calculate age (profile is guaranteed to be defined and have dateOfBirth at this point)
      const today = new Date();
      const birthDate = new Date(profile.dateOfBirth!);
      const ageYears = today.getFullYear() - birthDate.getFullYear() - 
        (today.getMonth() < birthDate.getMonth() || 
         (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0);

      // Get all biomarker sessions
      const sessions = await storage.getTestSessionsByUser(userId);
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
        const measurements = await storage.getMeasurementsBySession(session.id);
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
      if (!profile?.dateOfBirth || !profile?.sex) {
        return res.status(422).json({ 
          error: "Insufficient profile data. Please complete your age and sex in your profile."
        });
      }

      // Calculate age
      const today = new Date();
      const birthDate = new Date(profile.dateOfBirth);
      const ageYears = today.getFullYear() - birthDate.getFullYear() - 
        (today.getMonth() < birthDate.getMonth() || 
         (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0);

      // Get biomarker sessions
      let sessions;
      if (sessionId) {
        // Get specific session only
        const session = await storage.getTestSessionById(sessionId);
        if (!session || session.userId !== userId) {
          return res.status(404).json({ 
            error: "Session not found or unauthorized"
          });
        }
        sessions = [session];
      } else {
        // Get all sessions
        sessions = await storage.getTestSessionsByUser(userId);
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
        const measurements = await storage.getMeasurementsBySession(session.id);
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

        panels.push({
          panel_id: session.id,
          timestamp: session.testDate.toISOString(),
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

      // Get daily insights (last 10 days)
      const { dailyInsights, lifeEvents, flomentumDaily, healthkitSamples, systemSettings } = await import("@shared/schema");
      
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      
      let dailyInsightsData: any[] = [];
      try {
        dailyInsightsData = await db
          .select()
          .from(dailyInsights)
          .where(
            and(
              eq(dailyInsights.userId, userId),
              gte(dailyInsights.createdAt, tenDaysAgo)
            )
          )
          .orderBy(desc(dailyInsights.createdAt))
          .limit(10);
      } catch (error) {
        logger.info('Daily insights fetch failed, continuing without them');
      }

      // Get life events (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      let lifeEventsData: any[] = [];
      try {
        lifeEventsData = await db
          .select()
          .from(lifeEvents)
          .where(
            and(
              eq(lifeEvents.userId, userId),
              gte(lifeEvents.happenedAt, thirtyDaysAgo)
            )
          )
          .orderBy(desc(lifeEvents.happenedAt))
          .limit(20);
      } catch (error) {
        logger.info('Life events fetch failed, continuing without them');
      }

      // Get Flōmentum data (last 7 days for average)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      let flomentumData: any = null;
      try {
        const recentScores = await db
          .select()
          .from(flomentumDaily)
          .where(
            and(
              eq(flomentumDaily.userId, userId),
              gte(flomentumDaily.createdAt, sevenDaysAgo)
            )
          )
          .orderBy(desc(flomentumDaily.createdAt))
          .limit(7);
        
        if (recentScores.length > 0) {
          const avgScore = recentScores.reduce((sum, s) => sum + (s.score || 0), 0) / recentScores.length;
          const latestScore = recentScores[0];
          flomentumData = {
            current_score: latestScore.score,
            trend_7d: avgScore,
            domain_scores: latestScore.factors, // factors JSONB contains domain data
          };
        }
      } catch (error) {
        logger.info('Flōmentum data fetch failed, continuing without it');
      }

      // Get HealthKit summary (7-day averages)
      let healthkitSummary: any = null;
      try {
        const recentSamples = await db
          .select()
          .from(healthkitSamples)
          .where(
            and(
              eq(healthkitSamples.userId, userId),
              gte(healthkitSamples.startDate, sevenDaysAgo)
            )
          )
          .limit(1000);
        
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
          confidence: insight.confidenceScore,
          evidenceSummary: {
            title: insight.title,
            action: insight.action,
            impactScore: insight.impactScore,
            actionabilityScore: insight.actionabilityScore,
          },
          createdAt: insight.createdAt.toISOString(),
        })),
        healthkit_summary: healthkitSummary,
        life_events: lifeEventsData.map((event: any) => ({
          eventType: event.eventType,
          eventDetails: event.details,
          timestamp: event.happenedAt.toISOString(),
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

  // GET /api/biomarkers/top-to-improve - Get top 3 biomarkers needing improvement
  app.get("/api/biomarkers/top-to-improve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { db } = await import("./db");
      const { biomarkers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      // Get all test sessions for the user
      const sessions = await storage.getTestSessionsByUser(userId);
      
      if (sessions.length === 0) {
        return res.json({ topBiomarkers: [] });
      }
      
      // Track latest measurement for each biomarker
      const biomarkerMap = new Map<string, any>();
      
      for (const session of sessions) {
        const measurements = await storage.getMeasurementsBySession(session.id);
        
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
        
        // Get measurement history for trend
        const history = await storage.getMeasurementHistory(userId, biomarker.id, 6);
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
          // Calculate age from date of birth if not provided
          if (!age && profile.dateOfBirth) {
            const today = new Date();
            const birthDate = new Date(profile.dateOfBirth);
            age = today.getFullYear() - birthDate.getFullYear() - 
              (today.getMonth() < birthDate.getMonth() || 
               (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0);
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

      // Get latest measurement (or specific one if measurementId provided)
      const measurement = await storage.getLatestMeasurementForBiomarker(userId, biomarkerId, measurementId);
      if (!measurement) {
        return res.status(404).json({ error: "No measurement found for this biomarker" });
      }

      // Get user profile for personalization
      const profile = await storage.getProfile(userId);
      
      // Build profile snapshot
      let calculatedAge: number | undefined = undefined;
      if (profile?.dateOfBirth) {
        const today = new Date();
        const birthDate = new Date(profile.dateOfBirth);
        calculatedAge = today.getFullYear() - birthDate.getFullYear() - 
          (today.getMonth() < birthDate.getMonth() || 
           (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate()) ? 1 : 0);
      }
      
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

      // Get historical measurements for trend
      const history = await storage.getMeasurementHistory(userId, biomarkerId, 5);
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

      // Generate insights using OpenAI with the correct reference range
      const insights = await generateBiomarkerInsights({
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
        model: "gpt-4o",
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
          model: "gpt-4o",
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

      const result = await storage.createMeasurementWithSession({
        userId,
        biomarkerId,
        value,
        unit,
        testDate: new Date(testDate),
        valueCanonical: normalized.value_canonical,
        unitCanonical: normalized.unit_canonical,
        valueDisplay: normalized.value_display,
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

      const measurements = await storage.getMeasurementHistory(userId, biomarkerId);

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

      const existingMeasurement = await storage.getMeasurementById(measurementId);
      if (!existingMeasurement) {
        return res.status(404).json({ error: "Measurement not found" });
      }

      const session = await storage.getTestSessionById(existingMeasurement.sessionId);
      if (!session || session.userId !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
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

      const updatedMeasurement = await storage.updateMeasurement(measurementId, {
        biomarkerId: targetBiomarkerId,
        valueRaw: targetValue,
        unitRaw: targetUnit,
        valueCanonical: normalized.value_canonical,
        unitCanonical: normalized.unit_canonical,
        valueDisplay: normalized.value_display,
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

      const existingMeasurement = await storage.getMeasurementById(measurementId);
      if (!existingMeasurement) {
        return res.status(404).json({ error: "Measurement not found" });
      }

      const session = await storage.getTestSessionById(existingMeasurement.sessionId);
      if (!session || session.userId !== userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      await storage.deleteMeasurement(measurementId);

      const remainingMeasurements = await storage.getMeasurementsBySession(session.id);
      if (remainingMeasurements.length === 0) {
        await storage.deleteTestSession(session.id);
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

  app.post("/api/labs/upload", isAuthenticated, upload.single('file'), async (req: any, res) => {
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
            
            const session = await storage.createTestSession({
              userId,
              source: "ai_extracted",
              testDate,
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

                const measurement = await storage.createMeasurement({
                  sessionId: session.id,
                  biomarkerId: normalized.biomarker_id,
                  source: "ai_extracted",
                  valueRaw: biomarker.value,
                  unitRaw: biomarker.unit,
                  valueCanonical: normalized.value_canonical,
                  unitCanonical: normalized.unit_canonical,
                  valueDisplay: normalized.value_display,
                  referenceLow: biomarker.referenceRangeLow ?? normalized.ref_range.low ?? undefined,
                  referenceHigh: biomarker.referenceRangeHigh ?? normalized.ref_range.high ?? undefined,
                  flags: biomarker.flags ?? normalized.flags,
                  warnings: normalized.warnings,
                  normalizationContext: normalized.context_used,
                });

                measurementIds.push(measurement.id);
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

  // Admin routes - User management
  app.get("/api/admin/users", requireAdmin, async (req: any, res) => {
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
  app.patch("/api/admin/users/:id", requireAdmin, async (req: any, res) => {
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

  app.get("/api/admin/users/:userId/billing", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const billingInfo = await storage.getBillingInfo(userId);
      res.json(billingInfo);
    } catch (error) {
      logger.error('Error fetching billing info:', error);
      res.status(500).json({ error: "Failed to fetch billing info" });
    }
  });

  // Admin notification trigger management
  app.get("/api/admin/notification-triggers", requireAdmin, async (req, res) => {
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

  app.post("/api/admin/notification-triggers", requireAdmin, async (req: any, res) => {
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

  app.patch("/api/admin/notification-triggers/:id", requireAdmin, async (req: any, res) => {
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

  app.delete("/api/admin/notification-triggers/:id", requireAdmin, async (req: any, res) => {
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
      const userId = req.user.claims.sub;
      const { insertDeviceTokenSchema } = await import("@shared/schema");
      
      const validation = insertDeviceTokenSchema.safeParse({
        userId,
        deviceToken: req.body.deviceToken,
        platform: req.body.platform || 'ios',
      });

      if (!validation.success) {
        return res.status(400).json({ error: "Invalid device token data" });
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
        
        logger.info(`[DeviceToken] Updated device token for user ${userId}`);
        return res.json(updated);
      }

      // Insert new token
      const [token] = await db
        .insert(deviceTokens)
        .values(validation.data)
        .returning();

      logger.info(`[DeviceToken] Registered new device token for user ${userId}`);
      res.json(token);
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

  // APNs configuration management (admin only)
  app.get("/api/admin/apns-config", requireAdmin, async (req, res) => {
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
          // Don't expose signingKey
        })
        .from(apnsConfiguration)
        .orderBy(apnsConfiguration.createdAt);

      res.json(configs);
    } catch (error) {
      logger.error('Error fetching APNs config:', error);
      res.status(500).json({ error: "Failed to fetch APNs configuration" });
    }
  });

  app.post("/api/admin/apns-config", requireAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      const { insertApnsConfigurationSchema } = await import("@shared/schema");
      
      const validation = insertApnsConfigurationSchema.safeParse(req.body);

      if (!validation.success) {
        const validationError = fromError(validation.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const [config] = await db
        .insert(apnsConfiguration)
        .values(validation.data)
        .returning();

      // Reset APNs client to pick up new configuration
      const { apnsService } = await import("./services/apnsService");
      await apnsService.reset();

      // Don't expose signingKey in response (security)
      const { signingKey, ...safeConfig } = config;

      logger.info(`[Admin] APNs configuration created by ${adminId}`);
      res.json(safeConfig);
    } catch (error) {
      logger.error('Error creating APNs config:', error);
      res.status(500).json({ error: "Failed to create APNs configuration" });
    }
  });

  app.patch("/api/admin/apns-config/:id", requireAdmin, async (req: any, res) => {
    try {
      const configId = req.params.id;
      const adminId = req.user.claims.sub;
      const { insertApnsConfigurationSchema } = await import("@shared/schema");
      
      const validation = insertApnsConfigurationSchema.partial().safeParse(req.body);

      if (!validation.success) {
        const validationError = fromError(validation.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const [config] = await db
        .update(apnsConfiguration)
        .set({
          ...validation.data,
          updatedAt: new Date(),
        })
        .where(eq(apnsConfiguration.id, configId))
        .returning();

      if (!config) {
        return res.status(404).json({ error: "APNs configuration not found" });
      }

      // Reset APNs client to pick up updated configuration
      const { apnsService } = await import("./services/apnsService");
      await apnsService.reset();

      // Don't expose signingKey in response (security)
      const { signingKey, ...safeConfig } = config;

      logger.info(`[Admin] APNs configuration updated: ${configId} by ${adminId}`);
      res.json(safeConfig);
    } catch (error) {
      logger.error('Error updating APNs config:', error);
      res.status(500).json({ error: "Failed to update APNs configuration" });
    }
  });

  app.delete("/api/admin/apns-config/:id", requireAdmin, async (req: any, res) => {
    try {
      const configId = req.params.id;
      const adminId = req.user.claims.sub;

      const [config] = await db
        .delete(apnsConfiguration)
        .where(eq(apnsConfiguration.id, configId))
        .returning();

      if (!config) {
        return res.status(404).json({ error: "APNs configuration not found" });
      }

      // Reset APNs client
      const { apnsService } = await import("./services/apnsService");
      await apnsService.reset();

      logger.info(`[Admin] APNs configuration deleted: ${configId} by ${adminId}`);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting APNs config:', error);
      res.status(500).json({ error: "Failed to delete APNs configuration" });
    }
  });

  // Test push notification endpoint (admin only)
  app.post("/api/admin/test-reminder", requireAdmin, async (req: any, res) => {
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

  app.post("/api/admin/test-push", requireAdmin, async (req: any, res) => {
    try {
      const { userId, title, body } = req.body;

      if (!userId || !title || !body) {
        return res.status(400).json({ error: "userId, title, and body are required" });
      }

      const { apnsService } = await import("./services/apnsService");
      const result = await apnsService.sendToUser(userId, { title, body });

      logger.info(`[Admin] Test push notification sent: ${result.devicesReached} devices reached`);
      res.json(result);
    } catch (error) {
      logger.error('Error sending test push notification:', error);
      res.status(500).json({ error: "Failed to send test push notification" });
    }
  });

  // Clear Flō Oracle context cache (admin only, for debugging)
  app.post("/api/admin/clear-oracle-cache", requireAdmin, async (req: any, res) => {
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

  // HealthKit Integration Routes
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

      let inserted = 0;
      let duplicates = 0;

      for (const sample of samples) {
        try {
          const insertData = {
            userId,
            dataType: sample.dataType,
            value: sample.value,
            unit: sample.unit,
            startDate: new Date(sample.startDate),
            endDate: new Date(sample.endDate),
            sourceName: sample.sourceName || null,
            sourceBundleId: sample.sourceBundleId || null,
            deviceName: sample.deviceName || null,
            deviceManufacturer: sample.deviceManufacturer || null,
            deviceModel: sample.deviceModel || null,
            metadata: sample.metadata || null,
            uuid: sample.uuid || null,
          };

          await db.insert(healthkitSamples).values(insertData);
          inserted++;
        } catch (error: any) {
          if (error.code === '23505') {
            duplicates++;
            logger.debug(`[HealthKit] Duplicate sample UUID: ${sample.uuid}`);
          } else {
            logger.error(`[HealthKit] Failed to insert sample:`, error);
            throw error;
          }
        }
      }

      logger.info(`[HealthKit] Batch upload complete: ${inserted} inserted, ${duplicates} duplicates`);

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

      let inserted = 0;
      let duplicates = 0;

      for (const workout of workouts) {
        try {
          const insertData = {
            userId,
            workoutType: workout.workoutType,
            startDate: new Date(workout.startDate),
            endDate: new Date(workout.endDate),
            duration: workout.duration,
            totalDistance: workout.totalDistance || null,
            totalDistanceUnit: workout.totalDistanceUnit || null,
            totalEnergyBurned: workout.totalEnergyBurned || null,
            totalEnergyBurnedUnit: workout.totalEnergyBurnedUnit || null,
            averageHeartRate: workout.averageHeartRate || null,
            maxHeartRate: workout.maxHeartRate || null,
            minHeartRate: workout.minHeartRate || null,
            sourceName: workout.sourceName || null,
            sourceBundleId: workout.sourceBundleId || null,
            deviceName: workout.deviceName || null,
            deviceManufacturer: workout.deviceManufacturer || null,
            deviceModel: workout.deviceModel || null,
            metadata: workout.metadata || null,
            uuid: workout.uuid || null,
          };

          await db.insert(healthkitWorkouts).values(insertData);
          inserted++;
        } catch (error: any) {
          if (error.code === '23505') {
            duplicates++;
            logger.debug(`[HealthKit] Duplicate workout UUID: ${workout.uuid}`);
          } else {
            logger.error(`[HealthKit] Failed to insert workout:`, error);
            throw error;
          }
        }
      }

      logger.info(`[HealthKit] Workout batch upload complete: ${inserted} inserted, ${duplicates} duplicates`);

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

      const { and } = await import("drizzle-orm");
      
      const conditions = [eq(healthkitSamples.userId, userId)];
      if (dataType) {
        conditions.push(eq(healthkitSamples.dataType, dataType as string));
      }

      const samples = await db
        .select()
        .from(healthkitSamples)
        .where(and(...conditions))
        .orderBy(desc(healthkitSamples.startDate))
        .limit(Math.min(parseInt(limit as string) || 100, 1000));

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

      // CRITICAL: Extract body composition fields BEFORE validation
      // They're not in userDailyMetrics schema, so validation would strip them
      const bodyCompFields = {
        weightKg: dailyMetrics.weightKg ?? null,
        bodyFatPercent: dailyMetrics.bodyFatPercent ?? null,
        leanBodyMassKg: dailyMetrics.leanBodyMassKg ?? null,
        bmi: dailyMetrics.bmi ?? null,
        waistCircumferenceCm: dailyMetrics.waistCircumferenceCm ?? null,
      };

      // PRODUCTION DEBUG: Log what was extracted
      console.log('🔍 [BODY COMP DEBUG] Extracted bodyCompFields:', JSON.stringify(bodyCompFields, null, 2));

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

      // Also populate health_daily_metrics for Flōmentum consistency and body composition tracking
      // Note: Body composition fields come from bodyCompFields (extracted before validation)
      const healthMetricsData = {
        userId,
        date: metrics.localDate,
        sleepTotalMinutes: metrics.sleepHours ? Math.round(metrics.sleepHours * 60) : null,
        hrvSdnnMs: metrics.hrvMs ? Math.round(metrics.hrvMs) : null,
        restingHr: metrics.restingHrBpm ? Math.round(metrics.restingHrBpm) : null,
        steps: metrics.stepsNormalized ?? null,
        activeKcal: metrics.activeEnergyKcal ? Math.round(metrics.activeEnergyKcal) : null,
        exerciseMinutes: metrics.exerciseMinutes ? Math.round(metrics.exerciseMinutes) : null,
        weightKg: bodyCompFields.weightKg,
        bodyFatPct: bodyCompFields.bodyFatPercent,
        leanMassKg: bodyCompFields.leanBodyMassKg,
        bmi: bodyCompFields.bmi,
        waistCircumferenceCm: bodyCompFields.waistCircumferenceCm,
      };

      console.log('💾 [BODY COMP DEBUG] Saving to health_daily_metrics:', JSON.stringify({
        weightKg: healthMetricsData.weightKg,
        bodyFatPct: healthMetricsData.bodyFatPct,
        leanMassKg: healthMetricsData.leanMassKg,
        bmi: healthMetricsData.bmi,
        waistCircumferenceCm: healthMetricsData.waistCircumferenceCm,
        date: healthMetricsData.date,
      }, null, 2));

      try {
        console.log('⏳ [BODY COMP DEBUG] Starting database insert...');
        await db.insert(healthDailyMetrics).values(healthMetricsData).onConflictDoUpdate({
          target: [healthDailyMetrics.userId, healthDailyMetrics.date],
          set: {
            sleepTotalMinutes: healthMetricsData.sleepTotalMinutes,
            hrvSdnnMs: healthMetricsData.hrvSdnnMs,
            restingHr: healthMetricsData.restingHr,
            steps: healthMetricsData.steps,
            activeKcal: healthMetricsData.activeKcal,
            exerciseMinutes: healthMetricsData.exerciseMinutes,
            weightKg: healthMetricsData.weightKg,
            bodyFatPct: healthMetricsData.bodyFatPct,
            leanMassKg: healthMetricsData.leanMassKg,
            bmi: healthMetricsData.bmi,
            waistCircumferenceCm: healthMetricsData.waistCircumferenceCm,
          },
        });
        console.log('✅ [BODY COMP DEBUG] Successfully saved to health_daily_metrics for date:', healthMetricsData.date);
      } catch (saveError: any) {
        console.log('❌ [BODY COMP DEBUG] SAVE FAILED! Error:', saveError.message);
        console.log('❌ [BODY COMP DEBUG] Error stack:', saveError.stack);
        console.log('❌ [BODY COMP DEBUG] Data that failed:', JSON.stringify(healthMetricsData, null, 2));
      }

      // Upsert: insert or update if already exists for this user+date
      const { and, sql: drizzleSql } = await import("drizzle-orm");
      
      // Check if record exists
      const existing = await db
        .select()
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            eq(userDailyMetrics.localDate, metrics.localDate)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing record
        await db
          .update(userDailyMetrics)
          .set({
            ...metrics,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userDailyMetrics.userId, userId),
              eq(userDailyMetrics.localDate, metrics.localDate)
            )
          );

        logger.info(`[HealthKit] Updated daily metrics for ${userId}, ${metrics.localDate}`);
      } else {
        // Insert new record
        await db.insert(userDailyMetrics).values(metrics);

        logger.info(`[HealthKit] Inserted daily metrics for ${userId}, ${metrics.localDate}`);
      }

      // Calculate Flōmentum score after storing metrics
      try {
        const { calculateFlomentumBaselines } = await import("./services/flomentumBaselineCalculator");
        const baselines = await calculateFlomentumBaselines(userId, metrics.localDate);

        // Get user settings
        const [userSettings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
        
        if (userSettings && userSettings.flomentumEnabled) {
          const { calculateFlomentumScore } = await import("./services/flomentumScoringEngine");
          
          // Query sleep data from sleep_nights table (more reliable than sleepHours from iOS)
          // sleepHours only captures "in bed" samples, but sleep_nights processes all sleep stages
          const [sleepNight] = await db
            .select()
            .from(sleepNights)
            .where(
              and(
                eq(sleepNights.userId, userId),
                eq(sleepNights.sleepDate, metrics.localDate)
              )
            )
            .limit(1);
          
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
            standHours: null, // Not available in userDailyMetrics
          };

          const context: any = {
            stepsTarget: userSettings.stepsTarget,
            sleepTargetMinutes: userSettings.sleepTargetMinutes,
            restingHrBaseline: baselines.restingHrBaseline,
            hrvBaseline: baselines.hrvBaseline,
            respRateBaseline: baselines.respRateBaseline,
          };

          const scoreResult = calculateFlomentumScore(flomentumMetrics, context);

          // Store the daily Flōmentum score
          await db.insert(flomentumDaily).values({
            date: metrics.localDate,
            userId,
            score: scoreResult.score,
            zone: scoreResult.zone,
            factors: scoreResult.factors,
            dailyFocus: scoreResult.dailyFocus,
          }).onConflictDoUpdate({
            target: [flomentumDaily.userId, flomentumDaily.date],
            set: {
              score: scoreResult.score,
              zone: scoreResult.zone,
              factors: scoreResult.factors,
              dailyFocus: scoreResult.dailyFocus,
            },
          });

          logger.info(`[Flōmentum] Score calculated for ${userId}, ${metrics.localDate}: ${scoreResult.score} (${scoreResult.zone})`);
          
          res.json({ 
            status: existing.length > 0 ? "updated" : "created", 
            date: metrics.localDate,
            flomentumScore: scoreResult.score,
            flomentumZone: scoreResult.zone,
          });
        } else {
          res.json({ status: existing.length > 0 ? "updated" : "created", date: metrics.localDate });
        }
      } catch (flomentumError: any) {
        logger.error(`[Flōmentum] Error calculating score for ${userId}, ${metrics.localDate}:`, flomentumError);
        // Return success for metrics storage even if Flōmentum fails
        res.json({ status: existing.length > 0 ? "updated" : "created", date: metrics.localDate });
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
      // Query the user's most recent daily metric to get their timezone
      const [recentMetric] = await db
        .select({ timezone: userDailyMetrics.timezone })
        .from(userDailyMetrics)
        .where(eq(userDailyMetrics.userId, userId))
        .orderBy(desc(userDailyMetrics.localDate))
        .limit(1);
      
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

      // Fetch today's metrics for freshness check and display data
      const todayMetricsData = await db
        .select()
        .from(userDailyMetrics)
        .where(
          and(
            eq(userDailyMetrics.userId, userId),
            eq(userDailyMetrics.localDate, today)
          )
        )
        .limit(1);

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
          
          const displayMetrics = {
            avgSleepHours: todayMetricsData[0].sleepHours ?? undefined,
            avgHRV: todayMetricsData[0].hrvMs ?? undefined,
            stepCount: todayMetricsData[0].stepsNormalized ?? undefined,
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

      // Check if sleep night already exists
      const existing = await db
        .select()
        .from(sleepNights)
        .where(
          and(
            eq(sleepNights.userId, userId),
            eq(sleepNights.sleepDate, sleepNightData.sleepDate)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing record
        await db
          .update(sleepNights)
          .set({
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
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(sleepNights.userId, userId),
              eq(sleepNights.sleepDate, sleepNightData.sleepDate)
            )
          );

        logger.info(`[Sleep] Updated sleep night for ${userId}, ${sleepNightData.sleepDate}`);
        return res.json({ status: "updated", sleepDate: sleepNightData.sleepDate });
      } else {
        // Insert new record
        await db.insert(sleepNights).values({
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

        logger.info(`[Sleep] Created sleep night for ${userId}, ${sleepNightData.sleepDate}`);
        return res.json({ status: "created", sleepDate: sleepNightData.sleepDate });
      }
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

      // Check if this sleep night already exists
      const existing = await db
        .select()
        .from(sleepNights)
        .where(
          and(
            eq(sleepNights.userId, userId),
            eq(sleepNights.sleepDate, sleepDate)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing record
        await db
          .update(sleepNights)
          .set({
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
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(sleepNights.userId, userId),
              eq(sleepNights.sleepDate, sleepDate)
            )
          );

        logger.info(`[Sleep] Updated sleep night from raw samples: ${userId}, ${sleepDate}`);
      } else {
        // Insert new record
        await db.insert(sleepNights).values({
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

        logger.info(`[Sleep] Created sleep night from raw samples: ${userId}, ${sleepDate}`);
      }

      // Recalculate Flōmentum score now that sleep data is available
      // This ensures the score includes sleep metrics even though they arrive after daily metrics
      try {
        const [userSettings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
        
        if (userSettings && userSettings.flomentumEnabled) {
          const { calculateFlomentumScore } = await import("./services/flomentumScoringEngine");
          const { calculateFlomentumBaselines } = await import("./services/flomentumBaselineCalculator");
          
          // Get daily metrics for this date
          const [dailyMetrics] = await db
            .select()
            .from(userDailyMetrics)
            .where(
              and(
                eq(userDailyMetrics.userId, userId),
                eq(userDailyMetrics.localDate, sleepDate)
              )
            )
            .limit(1);
          
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

            // Update the daily Flōmentum score with sleep data included
            await db.insert(flomentumDaily).values({
              date: sleepDate,
              userId,
              score: scoreResult.score,
              zone: scoreResult.zone,
              factors: scoreResult.factors,
              dailyFocus: scoreResult.dailyFocus,
            }).onConflictDoUpdate({
              target: [flomentumDaily.userId, flomentumDaily.date],
              set: {
                score: scoreResult.score,
                zone: scoreResult.zone,
                factors: scoreResult.factors,
                dailyFocus: scoreResult.dailyFocus,
              },
            });

            logger.info(`[Flōmentum] Score recalculated with sleep data for ${userId}, ${sleepDate}: ${scoreResult.score} (${scoreResult.zone})`);
          }
        }
      } catch (flomentumError: any) {
        logger.error(`[Flōmentum] Error recalculating score after sleep upload for ${userId}, ${sleepDate}:`, flomentumError);
        // Don't fail the sleep upload if Flōmentum fails
      }

      return res.json({ status: existing.length > 0 ? "updated" : "created", sleepDate });
    } catch (error: any) {
      logger.error("[Sleep] Error processing raw sleep samples:", error);
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
      // Query the user's most recent daily metric to get their timezone
      const [recentMetric] = await db
        .select({ timezone: userDailyMetrics.timezone })
        .from(userDailyMetrics)
        .where(eq(userDailyMetrics.userId, userId))
        .orderBy(desc(userDailyMetrics.localDate))
        .limit(1);
      
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

        // Fetch corresponding sleep night data
        const nightData = await db
          .select()
          .from(sleepNights)
          .where(
            and(
              eq(sleepNights.userId, userId),
              eq(sleepNights.sleepDate, today)
            )
          )
          .limit(1);

        if (nightData.length === 0) {
          return res.status(404).json({ error: "Sleep night data not found" });
        }

        const night = nightData[0];

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

      // Get most recent sleep night (within last 2 days)
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const cutoffDate = twoDaysAgo.toISOString().split('T')[0];

      const recentNight = await db
        .select()
        .from(sleepNights)
        .where(
          and(
            eq(sleepNights.userId, userId),
            gte(sleepNights.sleepDate, cutoffDate)
          )
        )
        .orderBy(desc(sleepNights.sleepDate))
        .limit(1);

      if (recentNight.length === 0) {
        return res.status(404).json({
          error: "No recent sleep data available",
          message: "Please ensure you have synced HealthKit sleep data"
        });
      }

      const night = recentNight[0];

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

  // Diagnostic results routes
  // Upload calcium score PDF and extract data
  app.post("/api/diagnostics/calcium-score/upload", isAuthenticated, upload.single('file'), async (req: any, res) => {
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
      const study = await storage.createDiagnosticStudy({
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
  app.post("/api/diagnostics/calcium-score/upload-experimental", isAuthenticated, upload.single('file'), async (req: any, res) => {
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
      const study = await storage.createDiagnosticStudy({
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
  app.post("/api/diagnostics/dexa/upload", isAuthenticated, upload.single('file'), async (req: any, res) => {
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
      const study = await storage.createDiagnosticStudy({
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
  app.post("/api/diagnostics/dexa/upload-experimental", isAuthenticated, upload.single('file'), async (req: any, res) => {
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
      const study = await storage.createDiagnosticStudy({
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

  // Body composition endpoint - unified DEXA + HealthKit data
  app.get("/api/body-composition", isAuthenticated, async (req: any, res) => {
    try {
      // Disable caching to ensure fresh HealthKit data is always fetched
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const userId = req.user.claims.sub;
      
      // PRODUCTION DEBUG: Log what we're about to query
      console.log('🔍 [BODY COMP API] Fetching body composition for userId:', userId);
      
      const { BodyCompositionService } = await import("./services/bodyCompositionService");
      
      const data = await BodyCompositionService.getBodyComposition(userId);
      
      // PRODUCTION DEBUG: Log what we got back
      console.log('📊 [BODY COMP API] Response:', JSON.stringify({
        hasSnapshot: !!data.snapshot,
        weightKg: data.snapshot?.weightKg,
        bodyFatPct: data.snapshot?.bodyFatPct,
        leanMassKg: data.snapshot?.leanMassKg,
        bmi: data.snapshot?.bmi,
        weightSource: data.snapshot?.weightSource,
        bodyFatSource: data.snapshot?.bodyFatSource,
        trendCount: data.trend?.length || 0,
      }, null, 2));
      
      res.json(data);
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

      // Get user profile for date of birth
      const profile = await storage.getProfile(userId);
      const dateOfBirth = profile?.dateOfBirth;

      let calendarAge: number | null = null;
      let bioAge: number | null = null;
      let bioAgeDelta: number | null = null;

      if (dateOfBirth) {
        const now = new Date();
        const birth = new Date(dateOfBirth);
        calendarAge = Math.floor((now.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      }

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

      // Store the daily metrics
      await db.insert(healthDailyMetrics).values({
        userId,
        date: summaryData.date,
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
      }).onConflictDoUpdate({
        target: [healthDailyMetrics.userId, healthDailyMetrics.date],
        set: {
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
        },
      });

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

      // Store the daily score
      await db.insert(flomentumDaily).values({
        date: summaryData.date,
        userId,
        score: scoreResult.score,
        zone: scoreResult.zone,
        factors: scoreResult.factors,
        dailyFocus: scoreResult.dailyFocus,
      }).onConflictDoUpdate({
        target: [flomentumDaily.userId, flomentumDaily.date],
        set: {
          score: scoreResult.score,
          zone: scoreResult.zone,
          factors: scoreResult.factors,
          dailyFocus: scoreResult.dailyFocus,
        },
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
        return res.status(404).json({ error: "No weekly data available yet" });
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
      // Query the user's most recent daily metric to get their timezone
      const [recentMetric] = await db
        .select({ timezone: userDailyMetrics.timezone })
        .from(userDailyMetrics)
        .where(eq(userDailyMetrics.userId, userId))
        .orderBy(desc(userDailyMetrics.localDate))
        .limit(1);
      
      const userTimezone = recentMetric?.timezone || 'UTC';
      
      // Calculate today's date in the user's timezone
      const today = new Date().toLocaleString('en-CA', { 
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).split(',')[0]; // Format: YYYY-MM-DD

      // Get today's Flōmentum score
      const [dailyScore] = await db
        .select()
        .from(flomentumDaily)
        .where(and(
          eq(flomentumDaily.userId, userId),
          eq(flomentumDaily.date, today)
        ))
        .limit(1);

      if (!dailyScore) {
        return res.status(404).json({ error: "No Flōmentum score for today" });
      }

      // Get quick snapshot (recent 3 scores for trend)
      const recentScores = await db
        .select({
          date: flomentumDaily.date,
          score: flomentumDaily.score,
        })
        .from(flomentumDaily)
        .where(eq(flomentumDaily.userId, userId))
        .orderBy(sql`${flomentumDaily.date} DESC`)
        .limit(3);

      const quickSnapshot = recentScores.map(s => ({
        date: s.date,
        score: s.score,
      }));

      res.json({
        date: dailyScore.date,
        score: dailyScore.score,
        zone: dailyScore.zone,
        factors: dailyScore.factors,
        dailyFocus: dailyScore.dailyFocus,
        quickSnapshot,
      });
    } catch (error) {
      logger.error('Error fetching Flōmentum today:', error);
      res.status(500).json({ error: "Failed to fetch Flōmentum data" });
    }
  });

  // Flō Oracle Chat Routes
  app.post("/api/chat/grok", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { message, conversationHistory } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }

      const { grokClient } = await import('./services/grokClient');
      const { buildUserHealthContext } = await import('./services/floOracleContextBuilder');
      const { applyGuardrails } = await import('./middleware/floOracleGuardrails');

      if (!grokClient.isAvailable()) {
        return res.status(503).json({ 
          error: "Flō Oracle is temporarily unavailable. Please try again later." 
        });
      }

      const inputGuardrails = applyGuardrails(message);
      
      if (!inputGuardrails.safe) {
        logger.warn('[FloOracle] Input guardrail violation', { type: inputGuardrails.violation?.type });
        return res.json({
          response: inputGuardrails.violation?.replacement || 'I cannot process that request.',
          violation: true,
        });
      }

      const userContext = await buildUserHealthContext(userId);

      const SYSTEM_PROMPT = `You are Flō Oracle — a ruthlessly analytical, evidence-based health intelligence system designed to find patterns, correlations, and insights in the user's health data.

      The examples below are ILLUSTRATIVE ONLY. They are NOT exhaustive and NOT templates you must follow. 
      Always reason from the actual data in front of you. Discover new patterns, new correlations, and new explanations that have never appeared in any example. 
      If a real, statistically meaningful insight exists in the data that is different from every example you were ever shown, prioritize that new insight.

Your primary mission: PROACTIVELY ANALYZE AND CONNECT THE DOTS
- Actively look for correlations between metrics (e.g., "Your sleep duration increases 45 min on days with 10k+ steps")
- Spot trends and patterns before the user asks (e.g., "I noticed your resting HR spiked 12 bpm every time you had alcohol in your life events")
- Surface actionable insights from data relationships (e.g., "Your workout intensity averages 180 kcal higher on well-rested days (>7.5h sleep)")
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

Never force-fit the data into one of the example patterns.
It is better to say “I don’t see a strong signal today” or “Today’s performance difference is not clearly explained by any single metric” than to shoehorn the explanation into HRV, RHR, sleep, etc. just because those appeared in examples.

You are talking to one user only. Personalize everything with their actual data. Avoid generic advice—lead with their numbers, patterns, and correlations.

${userContext}`;

      const messages: GrokChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      if (conversationHistory && Array.isArray(conversationHistory)) {
        conversationHistory.slice(-6).forEach((msg: any) => {
          if (msg.type === 'user') {
            messages.push({ role: 'user', content: msg.content });
          } else {
            messages.push({ role: 'assistant', content: msg.content });
          }
        });
      }

      messages.push({
        role: 'user',
        content: `USER QUESTION: ${inputGuardrails.sanitizedInput}`,
      });

      logger.info('[FloOracle] Sending chat request to Grok', { 
        userId, 
        messageLength: message.length,
        historyLength: conversationHistory?.length || 0,
      });

      const grokResponse = await grokClient.chat(messages, {
        model: 'grok-3-mini',
        maxTokens: 1000,
        temperature: 0.7,
      });

      const outputGuardrails = applyGuardrails(message, grokResponse);

      if (!outputGuardrails.safe) {
        logger.warn('[FloOracle] Output guardrail violation', { type: outputGuardrails.violation?.type });
        return res.json({
          response: outputGuardrails.violation?.replacement || 'I need to rephrase that response. Let me try again.',
          violation: true,
        });
      }

      res.json({
        response: outputGuardrails.sanitizedOutput,
        violation: false,
      });
    } catch (error: any) {
      logger.error('[FloOracle] Chat error:', error);
      res.status(500).json({ 
        error: "I'm having trouble connecting right now. Please try again in a moment." 
      });
    }
  });

  // Flō Oracle - Text-only chat with Grok (personalized health coaching)
  app.post("/api/flo-oracle/chat", isAuthenticated, canAccessOracle, canSendOracleMsg, async (req: any, res) => {
    const userId = req.user?.claims?.sub;

    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      logger.info('[FloOracle] Chat request', { userId, messageLength: message.length });

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
          
          // Log event to database
          const { lifeEvents } = await import('@shared/schema');
          await db.insert(lifeEvents).values({
            userId,
            eventType: extraction.eventType,
            details: eventDetails,
            notes: message.trim(),
          });
          
          eventAcknowledgment = extraction.acknowledgment;
          logger.info('[FloOracle] Life event logged', {
            userId,
            eventType: extraction.eventType,
            acknowledgment: eventAcknowledgment,
            dosage: dosageInfo || 'none',
          });
        }
      }

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

      // Step 2: Load user's health context + RAG-retrieved insights + recent life events
      const { buildUserHealthContext, getRelevantInsights, getRecentLifeEvents } = await import('./services/floOracleContextBuilder');
      const [healthContext, insightsContext, lifeEventsContext] = await Promise.all([
        buildUserHealthContext(userId),
        getRelevantInsights(userId, 5),
        getRecentLifeEvents(userId, 14),
      ]);
      
      let fullContext = healthContext;
      if (insightsContext) fullContext += `\n${insightsContext}`;
      if (lifeEventsContext) fullContext += `\n${lifeEventsContext}`;
      if (correlationInsight) fullContext += `\n\nREAL-TIME CORRELATION DETECTED:\n${correlationInsight}`;

      logger.info('[FloOracle] Health context loaded', { 
        userId,
        hasBiomarkers: healthContext.includes('biomarkers'),
        hasDEXA: healthContext.includes('DEXA'),
        hasHealthKit: healthContext.includes('HealthKit'),
        hasCorrelation: !!correlationInsight
      });

      // Build conversation with health context
      const { grokClient } = await import('./services/grokClient');
      
      const systemPrompt = `You are Flō Oracle — the longevity-obsessed friend who actually listens first and geeks out on blood work second. 
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

      const messages: GrokChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.trim() }
      ];

      // Call Grok
      const grokResponse = await grokClient.chat(messages, {
        temperature: 0.7,
        maxTokens: 1000,
      });

      logger.info('[FloOracle] Grok response received', { 
        userId,
        responseLength: grokResponse.length 
      });

      // Apply guardrails
      const { applyGuardrails } = await import('./middleware/floOracleGuardrails');
      const guardrailResult = applyGuardrails(message, grokResponse);

      // Check if guardrails blocked the response
      if (!guardrailResult.safe && guardrailResult.violation?.replacement) {
        return res.json({ response: guardrailResult.violation.replacement });
      }

      // Step 4: Combine life event acknowledgment with response
      const grokReply = guardrailResult.sanitizedOutput || grokResponse;
      const finalResponse = eventAcknowledgment 
        ? `${eventAcknowledgment} ${grokReply}`
        : grokReply;
      
      res.json({ response: finalResponse });

    } catch (error: any) {
      logger.error('[FloOracle] Chat error:', error);
      res.status(500).json({ 
        error: "Failed to process chat request",
        message: error.message 
      });
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

      // Extract conversation_id from signed URL and create session mapping
      const { conversationSessionStore } = await import('./services/conversationSessionStore');
      try {
        const urlObj = new URL(signedUrl);
        const conversationId = urlObj.searchParams.get('conversation_id');
        
        if (conversationId) {
          conversationSessionStore.create(conversationId, userId, ELEVENLABS_AGENT_ID);
          logger.info('[ElevenLabs] Created conversation session', { conversationId, userId });
        } else {
          logger.warn('[ElevenLabs] No conversation_id found in signed URL');
        }
      } catch (error) {
        logger.error('[ElevenLabs] Failed to parse signed URL', error);
      }

      res.json({ 
        signed_url: signedUrl,
        user_id: userId,
      });

    } catch (error: any) {
      logger.error('[ElevenLabs] Error getting signed URL:', error);
      res.status(500).json({ 
        error: "Failed to get ElevenLabs signed URL. Please try again." 
      });
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

      // Look up user_id from conversation session store
      const { conversationSessionStore } = await import('./services/conversationSessionStore');
      
      // Try to get conversation_id from multiple possible locations
      const convId = conversation_id || req.body?.conversation_id || req.headers['x-conversation-id'] as string;
      
      let userId: string | null = null;
      
      if (convId) {
        userId = conversationSessionStore.getUserId(convId);
        if (userId) {
          logger.info('[ElevenLabs-Bridge] Found user via conversation session', { conversationId: convId, userId });
        } else {
          logger.warn('[ElevenLabs-Bridge] Conversation ID not found in session store', { conversationId: convId });
        }
      }
      
      // Fallback to legacy methods if session lookup fails
      if (!userId) {
        userId = user_id || 
                 elevenlabs_extra_body?.user_id || 
                 req.body?.custom_llm_extra_body?.user_id ||
                 req.headers['x-user-id'] as string;
      }
      
      if (!userId) {
        logger.error('[ElevenLabs-Bridge] No user_id found', {
          conversationId: convId,
          bodyKeys: Object.keys(req.body || {}),
          headerKeys: Object.keys(req.headers || {})
        });
        return res.status(400).json({ 
          error: { message: "Unable to identify user for this conversation. Please restart the voice chat.", type: "invalid_request_error" }
        });
      }
      
      logger.info('[ElevenLabs-Bridge] Processing request for user', { userId, conversationId: convId });

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

      const SYSTEM_PROMPT = `You are Flō Oracle — a ruthlessly analytical, evidence-based health intelligence system designed to find patterns, correlations, and insights in the user's health data.

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
  // INSIGHTS ENDPOINTS - AI-powered health pattern detection
  // ────────────────────────────────────────────────────────────────

  // Generate insights for a user (run correlation detection)
  app.post("/api/insights/generate", isAuthenticated, async (req: any, res) => {
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
        // Get user's HealthKit daily metrics
        const healthKitData = await db
          .select()
          .from(userDailyMetrics)
          .where(eq(userDailyMetrics.userId, userId))
          .orderBy(desc(userDailyMetrics.localDate))
          .limit(60); // Last 60 days

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
      
      const rawInsights = await db
        .select()
        .from(dailyInsights)
        .where(
          and(
            eq(dailyInsights.userId, userId),
            eq(dailyInsights.generatedDate, today),
            eq(dailyInsights.isDismissed, false)
          )
        )
        .orderBy(desc(dailyInsights.overallScore));

      // Map new dailyInsights fields to old insightCards format for frontend compatibility
      const insights = rawInsights.map(insight => ({
        id: insight.id,
        userId: insight.userId,
        category: insight.category,
        pattern: insight.title, // Map title -> pattern
        confidence: insight.confidenceScore, // Already 0-1 range from scoring functions
        supportingData: insight.body, // Map body -> supportingData
        action: insight.action, // CRITICAL FIX: Include actionable recommendations
        targetBiomarker: insight.targetBiomarker,
        currentValue: insight.currentValue,
        targetValue: insight.targetValue,
        unit: insight.unit,
        details: insight.details,
        isNew: insight.isNew,
        isActive: !insight.isDismissed,
        createdAt: insight.createdAt,
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

      // Count data
      const [insightCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(dailyInsights)
        .where(eq(dailyInsights.userId, userId));

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
      
      const rawInsights = await db
        .select()
        .from(dailyInsights)
        .where(
          and(
            eq(dailyInsights.userId, userId),
            eq(dailyInsights.generatedDate, today)
          )
        )
        .orderBy(desc(dailyInsights.createdAt));

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
      
      // Verify insight belongs to user
      const insight = await db
        .select()
        .from(dailyInsights)
        .where(
          and(
            eq(dailyInsights.id, insightId),
            eq(dailyInsights.userId, userId)
          )
        )
        .limit(1);

      if (insight.length === 0) {
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
      await db
        .update(dailyInsights)
        .set({ isDismissed: true, isNew: false })
        .where(
          and(
            eq(dailyInsights.id, id),
            eq(dailyInsights.userId, userId)
          )
        );

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
      
      await db
        .update(dailyInsights)
        .set({ isNew: false })
        .where(
          and(
            eq(dailyInsights.userId, userId),
            eq(dailyInsights.generatedDate, today),
            eq(dailyInsights.isNew, true)
          )
        );

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
      
      // Delete today's existing insights
      await db
        .delete(dailyInsights)
        .where(
          and(
            eq(dailyInsights.userId, userId),
            eq(dailyInsights.generatedDate, today)
          )
        );
      
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
  // ACTION PLAN API
  // ===============================

  // GET /api/action-plan - List user's action plan items
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
      
      const items = await storage.listActionPlanItems(userId, validatedStatus);
      
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
      // Validate required fields
      const schema = z.object({
        dailyInsightId: z.string().optional(),
        snapshotTitle: z.string(),
        snapshotInsight: z.string(),
        snapshotAction: z.string(),
        category: z.string(),
        targetBiomarker: z.string().optional(),
        currentValue: z.number().optional(),
        targetValue: z.number().optional(),
        unit: z.string().optional(),
        metadata: z.any().optional(),
      });

      const validationResult = schema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
      }

      const data = validationResult.data;
      
      // If dailyInsightId provided, verify it exists and belongs to user
      if (data.dailyInsightId) {
        const insight = await db
          .select()
          .from(dailyInsights)
          .where(
            and(
              eq(dailyInsights.id, data.dailyInsightId),
              eq(dailyInsights.userId, userId)
            )
          )
          .limit(1);

        if (insight.length === 0) {
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

      // Log what we're about to save
      const itemData = { ...data, biomarkerId };
      logger.info(`[ActionPlan] Saving item:`, {
        targetBiomarker: itemData.targetBiomarker,
        currentValue: itemData.currentValue,
        targetValue: itemData.targetValue,
        unit: itemData.unit,
        biomarkerId: itemData.biomarkerId
      });
      
      const item = await storage.addActionPlanItem(userId, itemData as any);
      
      logger.info(`[ActionPlan] Item added - ID: ${item.id}, biomarkerId: ${item.biomarkerId}, targetBiomarker: ${item.targetBiomarker}, currentValue: ${item.currentValue}`);
      res.json({ item });
    } catch (error: any) {
      logger.error('[ActionPlan] Add error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/action-plan/:id - Update action plan item status
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

      const item = await storage.updateActionPlanItemStatus(id, userId, status, completedDate);
      
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

  // DELETE /api/action-plan/:id - Remove action plan item
  app.delete("/api/action-plan/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Verify ownership before deleting
      const item = await storage.getActionPlanItem(id, userId);
      if (!item) {
        return res.status(404).json({ error: "Action plan item not found" });
      }

      await storage.removeActionPlanItem(id, userId);
      
      logger.info(`[ActionPlan] Item ${id} removed by user ${userId}`);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('[ActionPlan] Delete error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/action-plan/:id/progress - Get biomarker progress data for chart
  app.get("/api/action-plan/:id/progress", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const { id } = req.params;
    const { timeframe } = req.query;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Get the action plan item
      const item = await storage.getActionPlanItem(id, userId);
      if (!item) {
        return res.status(404).json({ error: "Action plan item not found" });
      }

      // Only return progress if biomarker tracking is set up
      if (!item.targetBiomarker || item.currentValue === null || item.targetValue === null) {
        return res.json({ dataPoints: [] });
      }

      // Require biomarkerId for deterministic joins - legacy items without ID return empty until backfilled
      if (!item.biomarkerId) {
        logger.warn(`[ActionPlan] Item ${id} has no biomarkerId - returning empty progress (needs backfill)`);
        return res.json({ dataPoints: [] });
      }

      const dataPoints: Array<{ date: string; value: number; source: string }> = [];
      const startDate = new Date(item.addedAt);
      
      // Calculate end date based on timeframe
      const monthsMap: Record<string, number> = { '3M': 3, '6M': 6, '9M': 9, '12M': 12 };
      const months = timeframe && monthsMap[timeframe as string] ? monthsMap[timeframe as string] : 3;
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);

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
            gt(biomarkerTestSessions.testDate, startDate), // Changed to > (not >=) to exclude baseline
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
      
      logger.info(`[ActionPlan] Using deterministic biomarkerId ${item.biomarkerId}, found ${dataPoints.length} data points`);

      // Sort by date
      dataPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      logger.info(`[ActionPlan] Progress data fetched for item ${id}: ${dataPoints.length} data points`);
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
  
  // Billing routes (Stripe subscription management)
  app.use('/api/billing', isAuthenticated, billingRouter);

  const httpServer = createServer(app);
  return httpServer;
}
