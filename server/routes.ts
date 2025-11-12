// Reference: javascript_log_in_with_replit and javascript_object_storage blueprints
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { analyzeBloodWork } from "./openai";
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
          visibility: "private", // Blood work files are private
        }
      );

      // Create blood work record
      const record = await storage.createBloodWorkRecord({
        userId,
        fileName,
        fileUrl: normalizedPath,
        status: "processing",
      });

      // Start analysis (this could be async in production, but for MVP we'll do it synchronously)
      try {
        // For MVP: simulating file content extraction
        // In production, you'd download the file from storage and extract text
        const mockFileContent = `Blood Test Results
        
Patient: User
Date: ${new Date().toLocaleDateString()}

Complete Blood Count (CBC):
- Hemoglobin: 14.5 g/dL (Normal: 13.5-17.5)
- White Blood Cells: 7.2 K/uL (Normal: 4.5-11.0)
- Platelets: 250 K/uL (Normal: 150-400)

Metabolic Panel:
- Glucose: 95 mg/dL (Normal: 70-100)
- Cholesterol Total: 180 mg/dL (Normal: <200)
- HDL: 55 mg/dL (Normal: >40)
- LDL: 110 mg/dL (Normal: <130)
- Triglycerides: 120 mg/dL (Normal: <150)

Inflammation Markers:
- CRP: 1.2 mg/L (Normal: <3.0)
- ESR: 8 mm/hr (Normal: 0-20)`;

        const analysis = await analyzeBloodWork(mockFileContent);

        // Save analysis result
        await storage.createAnalysisResult({
          recordId: record.id,
          biologicalAge: analysis.biologicalAge,
          chronologicalAge: analysis.chronologicalAge,
          insights: analysis.insights as any,
          metrics: analysis.metrics as any,
          recommendations: analysis.recommendations as any,
        });

        // Update record status
        await storage.updateBloodWorkRecordStatus(record.id, "completed");

        res.json({ 
          success: true, 
          recordId: record.id,
          analysis 
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
        canonical: unit === biomarker.canonicalUnit,
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
            age = today.getFullYear() - birthDate.getFullYear();
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

  // Admin routes - User management
  app.get("/api/admin/users", requireAdmin, async (req: any, res) => {
    try {
      // Validate query parameters
      const validationResult = listUsersQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        const validationError = fromError(validationResult.error);
        return res.status(400).json({ error: validationError.toString() });
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

  const httpServer = createServer(app);
  return httpServer;
}
