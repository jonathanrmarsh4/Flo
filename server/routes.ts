// Reference: javascript_log_in_with_replit and javascript_object_storage blueprints
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { analyzeBloodWork } from "./openai";

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

  const httpServer = createServer(app);
  return httpServer;
}
