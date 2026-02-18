import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startFlomentumWeeklyScheduler } from "./services/flomentumWeeklyScheduler";
import { startInsightsSchedulerV2 } from "./services/insightsSchedulerV2";
import { initializeDailyReminderScheduler } from "./services/dailyReminderScheduler";
import { initializeReminderDeliveryService } from "./services/reminderDeliveryService";
import { startFollowUpScheduler } from "./services/followUpScheduler";
import { startMorningBriefingScheduler } from "./services/morningBriefingScheduler";
import { startCGMSyncScheduler } from "./services/cgmSyncScheduler";
import { startOuraSyncScheduler } from "./services/ouraSyncScheduler";
import { centralizedNotificationService } from "./services/centralizedNotificationService";

const app = express();

// Security headers middleware
app.use(helmet({
  // Enable HSTS - force HTTPS for 1 year
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },
  // Prevent clickjacking
  frameguard: {
    action: 'deny',
  },
  // Prevent MIME type sniffing
  noSniff: true,
  // Referrer policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  // Content Security Policy - relaxed for development, tighten in production
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://api.openai.com", "https://generativelanguage.googleapis.com", "wss:", "https:"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  } : false, // Disable CSP in development for easier debugging
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // XSS protection (legacy but still useful)
  xssFilter: true,
}));

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'capacitor://localhost',
      /^https:\/\/.*\.replit\.dev$/,
      /^https:\/\/.*\.repl\.co$/,
      'https://get-flo.com',
    ];
    
    if (!origin || allowedOrigins.some(allowed => 
      typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
    )) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  exposedHeaders: ['set-cookie'],
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Detect if running in Autoscale deployment (stateless - no background workers)
  // REPL_DEPLOYMENT_TYPE is set by Replit during deployments
  // For Autoscale, background schedulers violate stateless requirements
  const isAutoscaleDeployment = process.env.REPL_DEPLOYMENT_TYPE === 'autoscale';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // reusePort is not supported on macOS, only on Linux
  const listenOptions: any = {
    port,
    host: "0.0.0.0",
  };
  if (process.platform !== 'darwin') {
    listenOptions.reusePort = true;
  }
  
  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
    
    // Only start background schedulers if NOT in Autoscale deployment
    // Autoscale deployments are stateless and shouldn't run background workers
    // For production with background workers, use Reserved VM deployment instead
    if (isAutoscaleDeployment) {
      log(`Autoscale deployment detected - background schedulers disabled`);
      return;
    }
    
    // Start background schedulers immediately (no setTimeout delay)
    // This is safe for Reserved VM deployments and development
    try {
      // Start the weekly Flōmentum aggregation scheduler
      startFlomentumWeeklyScheduler();
      
      // Start the nightly insights generation scheduler (v2.0)
      startInsightsSchedulerV2();
      
      // Start the daily reminder scheduler (10am UTC)
      initializeDailyReminderScheduler();
      
      // Start the reminder delivery service (sends queued APNs + 3PM survey notifications)
      initializeReminderDeliveryService();
      
      // Start the follow-up request scheduler (evaluates pending follow-ups every 30 min)
      startFollowUpScheduler();
      
      // Start the morning briefing scheduler (7 AM local time delivery)
      startMorningBriefingScheduler();
      
      // Start the CGM sync scheduler (every 5 minutes for connected Dexcom users)
      startCGMSyncScheduler();
      
      // Start the Oura sync scheduler (hourly for connected Oura users)
      startOuraSyncScheduler();
      
      // Start the centralized notification service (queue-based, timezone-aware notifications)
      centralizedNotificationService.start().then(result => {
        if (result.success) {
          console.log('[CentralizedNotifications] Service auto-started successfully');
        }
      }).catch(err => {
        console.error('[CentralizedNotifications] Failed to auto-start:', err);
      });
      
      log(`Background schedulers started successfully`);
    } catch (err) {
      console.error('[Server] Failed to start background schedulers:', err);
    }
  });
})().catch(err => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
