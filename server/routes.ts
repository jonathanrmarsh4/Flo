// Reference: javascript_log_in_with_replit and javascript_object_storage blueprints
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { analyzeBloodWork, generateBiomarkerInsights } from "./openai";
import { enrichBiomarkerData } from "./utils/biomarker-enrichment";
import { registerAdminRoutes } from "./routes/admin";
import mobileAuthRouter from "./routes/mobileAuth";
import { 
  updateDemographicsSchema, 
  updateHealthBaselineSchema, 
  updateGoalsSchema, 
  updateAIPersonalizationSchema,
  listUsersQuerySchema,
  updateUserSchema,
  normalizationInputSchema,
  bulkNormalizationInputSchema,
  getBiomarkersQuerySchema,
  getBiomarkerUnitsQuerySchema,
  getBiomarkerReferenceRangeQuerySchema,
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
import { normalizeMeasurement } from "@shared/domain/biomarkers";
import { 
  calculatePhenoAge, 
  calculatePhenoAgeAccel, 
  UnitConverter,
  validatePhenoAgeInputs,
  type PhenoAgeInputs
} from "@shared/utils/phenoage";

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
      console.error("Error fetching user:", error);
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
      console.error("Error deleting user data:", error);
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
      console.error("Error getting upload URL:", error);
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
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Blood work analysis endpoint
  app.post("/api/blood-work/analyze", isAuthenticated, async (req: any, res) => {
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

        // Create test session
        const testDate = new Date();
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
        console.error("Analysis error:", analysisError);
        await storage.updateBloodWorkRecordStatus(record.id, "failed");
        throw analysisError;
      }
    } catch (error) {
      console.error("Error analyzing blood work:", error);
      res.status(500).json({ error: "Failed to analyze blood work" });
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
      console.error("Error fetching latest blood work:", error);
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
      console.error("Error fetching blood work records:", error);
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
      console.error("Error fetching blood work record:", error);
      res.status(500).json({ error: "Failed to fetch blood work record" });
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
      console.error("Error fetching profile:", error);
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
      console.error("Error updating demographics:", error);
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
      console.error("Error updating health baseline:", error);
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
      console.error("Error updating goals:", error);
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
      console.error("Error updating AI personalization:", error);
      res.status(500).json({ error: "Failed to update AI personalization" });
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
      console.error("Error normalizing measurement:", error);
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
      console.error("Error in bulk normalization:", error);
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
      console.error("Error fetching biomarkers:", error);
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
      console.error("Error fetching biomarker sessions:", error);
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

      // Get the most recent session
      const latestSession = sessions.sort((a, b) => 
        new Date(b.testDate).getTime() - new Date(a.testDate).getTime()
      )[0];

      // Fetch measurements for the latest session
      const measurements = await storage.getMeasurementsBySession(latestSession.id);

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

      // Required biomarkers for PhenoAge calculation
      const requiredBiomarkers = {
        'Albumin': 'albumin_g_L',
        'Creatinine': 'creatinine_umol_L',
        'Glucose': 'glucose_mmol_L',
        'CRP': 'crp_mg_dL',
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
        const measurement = measurementMap.get(biomarkerName);
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
          console.error(`Error converting ${biomarkerName}:`, error);
          return res.status(500).json({ 
            error: `Failed to convert ${biomarkerName}: ${error.message}` 
          });
        }
      }

      // Check if we have all required biomarkers
      if (missingBiomarkers.length > 0) {
        return res.status(400).json({ 
          error: "Missing required biomarkers for biological age calculation",
          missingBiomarkers,
          message: `The following biomarkers are required: ${missingBiomarkers.join(', ')}`
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

        res.json({
          biologicalAge: Math.round(phenoAge * 10) / 10, // Round to 1 decimal
          chronologicalAge: ageYears,
          ageDifference: Math.round(ageAcceleration * 10) / 10, // Round to 1 decimal
          testDate: latestSession.testDate,
          sessionId: latestSession.id,
        });

      } catch (error: any) {
        console.error("Error calculating PhenoAge:", error);
        res.status(500).json({ 
          error: "Failed to calculate biological age",
          message: error.message
        });
      }

    } catch (error) {
      console.error("Error in biological age endpoint:", error);
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
        console.log("Biological age calculation failed, continuing without it");
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
        console.error("OpenAI generation error:", aiError);
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
        console.error("Failed to cache insights:", saveError);
        // Still return the insights even if caching fails
      }

      res.json({
        cacheStatus: "miss",
        ...insights,
      });

    } catch (error: any) {
      console.error("Error generating comprehensive insights:", error);
      
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
        console.error("Failed to save error state:", saveError);
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
      console.error("Error fetching health insights:", error);
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
        console.log("Biological age calculation failed, continuing without it");
      }

      // Build report input
      const { generateFullHealthReport } = await import("./openai");
      const reportInput = {
        user_profile: {
          age_years: ageYears,
          sex: (profile.sex?.toLowerCase() || 'male') as 'male' | 'female',
          goals: profile.goals || [],
          medicalContext: profile.aiPersonalization?.medicalContext,
        },
        biomarker_panels: panels.slice(0, 3), // Limit to last 3 panels for token budget
        biological_age_data: bioageData,
      };

      // Generate report
      const report = await generateFullHealthReport(reportInput);

      res.json(report);

    } catch (error: any) {
      console.error("Error generating comprehensive report:", error);
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
      console.error("Error fetching top biomarkers to improve:", error);
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
      console.error("Error fetching biomarker units:", error);
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
      console.error("Error fetching reference range:", error);
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
      
      console.log(`[INSIGHTS DEBUG] Biomarker: ${biomarker.name}, Canonical Unit: ${measurement.unitCanonical}`);
      console.log(`[INSIGHTS DEBUG] Available ranges:`, biomarkerRanges.map(r => ({ unit: r.unit, low: r.low, high: r.high })));
      
      const correctRange = selectReferenceRange(
        biomarkerId,
        measurement.unitCanonical,
        contextForRange,
        biomarkerRanges
      );

      console.log(`[INSIGHTS DEBUG] Selected range:`, correctRange ? { unit: correctRange.unit, low: correctRange.low, high: correctRange.high } : 'null');

      // Use the correctly selected reference range instead of the stored one
      const referenceLow = correctRange?.low ?? null;
      const referenceHigh = correctRange?.high ?? null;
      
      console.log(`[INSIGHTS DEBUG] Passing to AI: low=${referenceLow}, high=${referenceHigh}, value=${measurement.valueCanonical}`);

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
      console.error("Error generating biomarker insights:", error);
      
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
        console.error("Failed to retrieve fallback insights:", fallbackError);
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
      console.error("Error creating measurement:", error);
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
      console.error("Error fetching measurement history:", error);
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
      console.error("Error updating measurement:", error);
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
      console.error("Error deleting measurement:", error);
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
                console.error(`Failed to normalize biomarker ${biomarker.name}:`, error);
                failedBiomarkers.push({
                  name: biomarker.name,
                  error: error.message || "Unknown error",
                });
              }
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
          console.error("Error processing lab upload:", error);
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
            console.error("Critical error updating job status:", updateError);
          }
        }
      });

      res.json({
        jobId: job.id,
        status: "pending",
        message: "Upload successful, processing started",
      });
    } catch (error: any) {
      console.error("Error uploading lab file:", error);
      
      if (job && job.id) {
        try {
          await storage.updateLabUploadJob(job.id, {
            status: "failed",
            errorDetails: { error: error.message || "Upload failed" },
          });
        } catch (updateError) {
          console.error("Failed to update job status:", updateError);
        }
      }
      
      if (bloodWorkRecord && bloodWorkRecord.id) {
        try {
          await storage.updateBloodWorkRecordStatus(bloodWorkRecord.id, "failed");
        } catch (updateError) {
          console.error("Failed to update blood work record status:", updateError);
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
      console.error("Error getting job status:", error);
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
      console.error("Error listing users:", error);
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
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.get("/api/admin/users/:userId/billing", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const billingInfo = await storage.getBillingInfo(userId);
      res.json(billingInfo);
    } catch (error) {
      console.error("Error fetching billing info:", error);
      res.status(500).json({ error: "Failed to fetch billing info" });
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

      // Insert any "other" vessels
      for (const [key, value] of Object.entries(data.results.per_vessel.other)) {
        metrics.push({
          studyId: study.id,
          code: key,
          label: key.toUpperCase(),
          valueNumeric: value,
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
      console.error("Error uploading calcium score:", error);
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
      const modelName = req.body.model || "chatgpt-4o-latest";

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

      // Insert any "other" vessels
      for (const [key, value] of Object.entries(data.results.per_vessel.other)) {
        metrics.push({
          studyId: study.id,
          code: key,
          label: key.toUpperCase(),
          valueNumeric: value,
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
      console.error("Error uploading calcium score (experimental):", error);
      res.status(500).json({ error: "Failed to process calcium score upload" });
    }
  });

  // Get diagnostic summary for dashboard
  app.get("/api/diagnostics/summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get latest calcium score
      const latestCalciumScore = await storage.getLatestDiagnosticStudy(userId, "coronary_calcium_score");

      const summary: any = {
        calciumScore: null,
      };

      if (latestCalciumScore) {
        summary.calciumScore = {
          totalScore: latestCalciumScore.totalScoreNumeric,
          riskLevel: latestCalciumScore.riskCategory,
          agePercentile: latestCalciumScore.agePercentile,
          studyDate: latestCalciumScore.studyDate.toISOString(),
        };
      }

      res.json(summary);
    } catch (error) {
      console.error("Error fetching diagnostic summary:", error);
      res.status(500).json({ error: "Failed to fetch diagnostic summary" });
    }
  });

  registerAdminRoutes(app);
  
  // Mobile auth routes (Apple, Google, Email/Password)
  app.use(mobileAuthRouter);

  const httpServer = createServer(app);
  return httpServer;
}
