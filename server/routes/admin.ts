import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { requireAdmin } from "../middleware/rbac";
import { logger } from "../logger";
import Stripe from "stripe";

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
}
