import { Router } from 'express';
import { isAuthenticated } from '../replitAuth';
import { n1ExperimentService, type CreateExperimentInput } from '../services/n1ExperimentService';
import { dsldService } from '../services/dsldService';
import { SUPPLEMENT_CONFIGURATIONS, PRIMARY_INTENTS, getSupplementsByIntent, getSupplementConfig } from '../../shared/supplementConfig';
import { createLogger } from '../utils/logger';
import { z } from 'zod';

const logger = createLogger('N1ExperimentRoutes');
const router = Router();

// Apply authentication to all routes
router.use(isAuthenticated);

// Get supplement configuration data
router.get('/supplements/config', async (req, res) => {
  try {
    res.json({
      supplements: Object.values(SUPPLEMENT_CONFIGURATIONS),
      intents: PRIMARY_INTENTS,
    });
  } catch (error: any) {
    logger.error('Failed to get supplement config', { error: error.message });
    res.status(500).json({ error: 'Failed to get supplement configuration' });
  }
});

// Get supplements by intent
router.get('/supplements/by-intent/:intentId', async (req, res) => {
  try {
    const { intentId } = req.params;
    const supplements = getSupplementsByIntent(intentId);
    res.json({ supplements });
  } catch (error: any) {
    logger.error('Failed to get supplements by intent', { error: error.message });
    res.status(500).json({ error: 'Failed to get supplements' });
  }
});

// Search DSLD products
router.get('/dsld/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;
    
    if (!query || query.length < 2) {
      return res.json({ products: [], totalCount: 0 });
    }
    
    const results = await dsldService.searchProducts(query, limit);
    res.json(results);
  } catch (error: any) {
    logger.error('DSLD search failed', { error: error.message });
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// Lookup DSLD product by barcode
router.get('/dsld/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    const product = await dsldService.lookupByBarcode(barcode);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Detect which supplement type this product matches
    const supplementType = dsldService.detectSupplementType(product);
    const primaryIngredient = supplementType 
      ? dsldService.getPrimaryIngredient(product, supplementType)
      : null;
    
    res.json({ 
      product,
      detectedSupplementType: supplementType,
      primaryIngredient,
    });
  } catch (error: any) {
    logger.error('DSLD barcode lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to lookup product' });
  }
});

// Validate baseline data availability
router.get('/baseline/validate/:supplementTypeId', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { supplementTypeId } = req.params;
    const validation = await n1ExperimentService.validateBaselineData(userId, supplementTypeId);
    res.json(validation);
  } catch (error: any) {
    logger.error('Baseline validation failed', { error: error.message });
    res.status(500).json({ error: 'Failed to validate baseline data' });
  }
});

// Create experiment schema
const createExperimentSchema = z.object({
  supplementTypeId: z.string(),
  productName: z.string(),
  productBrand: z.string().optional(),
  productBarcode: z.string().optional(),
  productImageUrl: z.string().optional(),
  productStrength: z.string().optional(),
  productServingSize: z.string().optional(),
  productDsldId: z.string().optional(),
  dosageAmount: z.number(),
  dosageUnit: z.string().optional(),
  dosageFrequency: z.string().optional(),
  dosageTiming: z.string().optional(),
  primaryIntent: z.string(),
  experimentDays: z.number().optional(),
  selectedObjectiveMetrics: z.array(z.string()).optional(),
  selectedSubjectiveMetrics: z.array(z.string()).optional(),
});

// Create a new experiment
router.post('/experiments', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const parsed = createExperimentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }
    
    const experiment = await n1ExperimentService.createExperiment({
      userId,
      ...parsed.data,
    });
    
    res.status(201).json({ experiment });
  } catch (error: any) {
    logger.error('Failed to create experiment', { error: error.message });
    res.status(500).json({ error: 'Failed to create experiment' });
  }
});

// Get all user experiments
router.get('/experiments', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const experiments = await n1ExperimentService.getUserExperiments(userId);
    res.json({ experiments });
  } catch (error: any) {
    logger.error('Failed to get experiments', { error: error.message });
    res.status(500).json({ error: 'Failed to get experiments' });
  }
});

// Get experiments needing check-in today
router.get('/experiments/needing-checkin', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const experiments = await n1ExperimentService.getExperimentsNeedingCheckin(userId);
    res.json({ experiments });
  } catch (error: any) {
    logger.error('Failed to get experiments needing checkin', { error: error.message });
    res.status(500).json({ error: 'Failed to get experiments' });
  }
});

// Get a single experiment
router.get('/experiments/:id', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const data = await n1ExperimentService.getExperiment(id, userId);
    
    if (!data) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    res.json(data);
  } catch (error: any) {
    logger.error('Failed to get experiment', { error: error.message });
    res.status(500).json({ error: 'Failed to get experiment' });
  }
});

// Start an experiment
router.post('/experiments/:id/start', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const { useRetroactiveBaseline = true } = req.body;
    
    const experiment = await n1ExperimentService.startExperiment(id, userId, useRetroactiveBaseline);
    res.json({ experiment });
  } catch (error: any) {
    logger.error('Failed to start experiment', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to start experiment' });
  }
});

// Update experiment status
router.patch('/experiments/:id/status', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'paused', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const experiment = await n1ExperimentService.updateExperimentStatus(id, userId, status);
    res.json({ experiment });
  } catch (error: any) {
    logger.error('Failed to update experiment status', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to update status' });
  }
});

// Record daily check-in
const checkinSchema = z.object({
  ratings: z.record(z.string(), z.number()),
  notes: z.string().optional(),
  noiseFlags: z.array(z.string()).optional(),
  source: z.enum(['manual', 'push_notification', 'dashboard_popup', 'reminder']).optional(),
});

router.post('/experiments/:id/checkin', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const parsed = checkinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.errors });
    }
    
    const { ratings, notes, noiseFlags, source } = parsed.data;
    const checkin = await n1ExperimentService.recordDailyCheckin(
      id,
      userId,
      ratings,
      notes,
      noiseFlags,
      source
    );
    
    res.status(201).json({ checkin });
  } catch (error: any) {
    logger.error('Failed to record check-in', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to record check-in' });
  }
});

// Get experiment check-ins
router.get('/experiments/:id/checkins', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const checkins = await n1ExperimentService.getExperimentCheckins(id, userId);
    res.json({ checkins });
  } catch (error: any) {
    logger.error('Failed to get check-ins', { error: error.message });
    res.status(500).json({ error: 'Failed to get check-ins' });
  }
});

// Calculate experiment results
router.post('/experiments/:id/calculate', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const results = await n1ExperimentService.calculateResults(id, userId);
    res.json({ results });
  } catch (error: any) {
    logger.error('Failed to calculate results', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to calculate results' });
  }
});

// Get experiment results
router.get('/experiments/:id/results', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const results = await n1ExperimentService.getExperimentResults(id, userId);
    
    if (!results) {
      return res.status(404).json({ error: 'Results not found' });
    }
    
    res.json({ results });
  } catch (error: any) {
    logger.error('Failed to get results', { error: error.message });
    res.status(500).json({ error: 'Failed to get results' });
  }
});

export default router;
