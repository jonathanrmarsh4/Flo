import { Router } from 'express';
import { isAuthenticated } from '../replitAuth';
import { n1ExperimentService, type CreateExperimentInput } from '../services/n1ExperimentService';
import { dsldService } from '../services/dsldService';
import { SUPPLEMENT_CONFIGURATIONS, PRIMARY_INTENTS, getSupplementsByIntent, getSupplementConfig } from '../../shared/supplementConfig';
import { createLogger } from '../utils/logger';
import { z } from 'zod';

const logger = createLogger('N1ExperimentRoutes');
const router = Router();

// ========== PUBLIC ROUTES (no auth required) ==========

// Search DSLD products (public - accessing NIH database)
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

// Lookup DSLD product by barcode (public - accessing NIH database)
router.get('/dsld/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    logger.info(`Public barcode lookup: ${barcode}`);
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

// ========== AUTHENTICATED ROUTES ==========
// Apply authentication to remaining routes
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

// Check experiment compatibility - returns which intents are allowed/blocked based on active experiments
router.get('/experiments/compatibility', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const compatibility = await n1ExperimentService.checkExperimentCompatibility(userId);
    res.json(compatibility);
  } catch (error: any) {
    logger.error('Compatibility check failed', { error: error.message });
    res.status(500).json({ error: 'Failed to check experiment compatibility' });
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
    
    // Accept timezone query param to determine user's local "today"
    const timezone = req.query.timezone as string | undefined;
    const experiments = await n1ExperimentService.getExperimentsNeedingCheckin(userId, timezone);
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

// Get objective HealthKit metrics for experiment date range
router.get('/experiments/:id/objective-metrics', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    const metrics = await n1ExperimentService.getObjectiveMetrics(id, userId);
    res.json({ metrics });
  } catch (error: any) {
    logger.error('Failed to get objective metrics', { error: error.message });
    res.status(500).json({ error: 'Failed to get objective metrics' });
  }
});

// Generate AI explanation for experiment progress (Why button)
router.post('/experiments/:id/explain', async (req, res) => {
  try {
    const userId = (req as any).user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { id } = req.params;
    
    // Get experiment details
    const experimentData = await n1ExperimentService.getExperiment(id, userId);
    if (!experimentData) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    
    // Get check-ins for progress data (limit to last 14 days to prevent token overflow)
    const allCheckins = await n1ExperimentService.getExperimentCheckins(id, userId);
    const checkins = allCheckins.slice(-14);
    
    // Get objective metrics (limit to last 14 days)
    const allObjectiveMetrics = await n1ExperimentService.getObjectiveMetrics(id, userId);
    const objectiveMetrics = allObjectiveMetrics.slice(-14);
    
    // Get supplement config
    const supplementConfig = getSupplementConfig(experimentData.experiment.supplement_type_id);
    
    // Calculate days elapsed
    const daysElapsed = experimentData.experiment.experiment_start_date 
      ? Math.floor((Date.now() - new Date(experimentData.experiment.experiment_start_date).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    // Build context for AI
    const context = {
      supplementName: supplementConfig?.name || experimentData.experiment.product_name,
      productName: experimentData.experiment.product_name,
      productBrand: experimentData.experiment.product_brand,
      primaryIntent: experimentData.experiment.primary_intent.replace(/_/g, ' '),
      dosage: `${experimentData.experiment.dosage_amount}${experimentData.experiment.dosage_unit}`,
      frequency: experimentData.experiment.dosage_frequency,
      timing: experimentData.experiment.dosage_timing,
      status: experimentData.experiment.status,
      daysElapsed,
      totalDays: experimentData.experiment.experiment_days,
      baselineDays: experimentData.experiment.baseline_days,
      checkinsCount: allCheckins.length,
      trackedMetrics: experimentData.metrics.map((m: { metric_name: string }) => m.metric_name),
      recommendedDuration: supplementConfig?.recommendedDuration || 28,
    };
    
    // Generate explanation using Gemini with timeout
    const { GoogleGenAI } = await import('@google/genai');
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY not configured');
    }
    const genAI = new GoogleGenAI({ apiKey });
    
    // Format check-in data (cap notes to 50 chars to reduce tokens)
    // Note: Subjective metrics use 0-10 scale as defined in supplementConfig.ts
    const checkinSummary = checkins.slice(-7).map((c: any) => {
      const notesTruncated = c.notes ? c.notes.slice(0, 50) + (c.notes.length > 50 ? '...' : '') : '';
      return `- ${c.checkin_date} (${c.phase}): ${Object.entries(c.ratings).map(([k, v]) => `${k}: ${v}/10`).join(', ')}${notesTruncated ? ` - "${notesTruncated}"` : ''}`;
    }).join('\n') || 'No check-ins recorded yet';
    
    // Format objective metrics
    const metricsSummary = objectiveMetrics.slice(-7).map((m: any) => 
      `- ${m.date}: HRV ${m.hrv || 'N/A'}ms, RHR ${m.restingHeartRate || 'N/A'}bpm, Deep Sleep ${m.deepSleepPct || 'N/A'}%`
    ).join('\n') || 'No biometric data available';
    
    const prompt = `You are a health data analyst helping a user understand their supplement experiment progress. Be encouraging but honest about what the data shows.

EXPERIMENT CONTEXT:
- Supplement: ${context.supplementName} (${context.productName}${context.productBrand ? ` by ${context.productBrand}` : ''})
- Goal: ${context.primaryIntent}
- Dosage: ${context.dosage} ${context.frequency}${context.timing ? ` (${context.timing})` : ''}
- Status: ${context.status}
- Progress: Day ${context.daysElapsed} of ${context.totalDays} (${context.baselineDays} baseline days)
- Check-ins completed: ${context.checkinsCount}
- Tracking: ${context.trackedMetrics.join(', ')}
- Recommended duration for this supplement: ${context.recommendedDuration} days

RECENT CHECK-IN DATA (last 7 days):
${checkinSummary}

OBJECTIVE BIOMETRIC DATA (last 7 days):
${metricsSummary}

Write a 2-3 paragraph explanation that:
1. Summarizes what the chart is showing (deviations from baseline)
2. Interprets whether the supplement appears to be having an effect based on the data
3. Provides context on what to expect (is it too early to tell? typical onset time?)
4. Offers encouragement and next steps

Keep it conversational, data-driven, and honest. If there isn't enough data yet, say so clearly.`;

    // Add timeout wrapper for Gemini call (30 second timeout)
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Gemini request timed out')), 30000)
    );
    
    const geminiPromise = genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        maxOutputTokens: 500,
        temperature: 0.7,
      },
    });
    
    const response = await Promise.race([geminiPromise, timeoutPromise]);
    const explanation = response.text || 'Unable to generate explanation at this time.';
    
    logger.info('Generated experiment explanation', { experimentId: id, userId });
    res.json({ explanation });
  } catch (error: any) {
    logger.error('Failed to generate experiment explanation', { error: error.message });
    
    // Provide fallback message on failure
    const fallbackMessage = 'We were unable to generate an analysis at this time. Your experiment is collecting data - check back later for AI-powered insights about your progress.';
    res.status(200).json({ explanation: fallbackMessage });
  }
});

export default router;
