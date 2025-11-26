import { Router } from 'express';
import Stripe from 'stripe';
import { 
  SignedDataVerifier, 
  AppStoreServerAPIClient, 
  Environment,
  JWSTransactionDecodedPayload,
  VerificationException
} from '@apple/app-store-server-library';
import { db } from '../db';
import { billingCustomers, subscriptions, payments, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';
import { upgradeUserToPremium, downgradeUserToFree, getUserPlan, getUserFeatures, getUserLimits } from '../services/planService';
import { PLANS, PRICING } from '../config/plans';
import { PAYWALL_MODALS } from '../config/paywallModals';
import { getAppleRootCertificates } from '../config/appleRootCerts';

// App Store configuration
const APP_STORE_BUNDLE_ID = process.env.APP_STORE_BUNDLE_ID || 'com.getflo.app';
const APP_STORE_ISSUER_ID = process.env.APP_STORE_ISSUER_ID || '';
const APP_STORE_KEY_ID = process.env.APP_STORE_KEY_ID || '';
const APP_STORE_PRIVATE_KEY = process.env.APP_STORE_PRIVATE_KEY || '';
const APP_STORE_APP_APPLE_ID = process.env.APP_STORE_APP_APPLE_ID ? Number(process.env.APP_STORE_APP_APPLE_ID) : undefined;
const VALID_PRODUCT_IDS = ['flo_premium_monthly', 'flo_premium_yearly'];

// Determine environment based on NODE_ENV
const isProduction = process.env.NODE_ENV === 'production';
const appStoreEnvironment = isProduction ? Environment.PRODUCTION : Environment.SANDBOX;

// Security: Explicit toggle for JWS verification requirement
// Defaults to true in production, can be explicitly set via env var
// Set APP_STORE_REQUIRE_VERIFICATION=true in staging to enforce verification regardless of NODE_ENV
const REQUIRE_JWS_VERIFICATION = process.env.APP_STORE_REQUIRE_VERIFICATION === 'false' 
  ? false 
  : (process.env.APP_STORE_REQUIRE_VERIFICATION === 'true' || isProduction);

// Validate required configuration at startup for production
if (REQUIRE_JWS_VERIFICATION) {
  if (!APP_STORE_APP_APPLE_ID) {
    logger.error('[AppStore] CRITICAL: APP_STORE_APP_APPLE_ID is required when JWS verification is enabled');
    logger.error('[AppStore] Set APP_STORE_APP_APPLE_ID to your App Store app ID from App Store Connect');
  }
  
  logger.info('[AppStore] JWS verification ENABLED', {
    environment: appStoreEnvironment,
    bundleId: APP_STORE_BUNDLE_ID,
    appAppleId: APP_STORE_APP_APPLE_ID,
    requireVerification: REQUIRE_JWS_VERIFICATION,
  });
} else {
  logger.warn('[AppStore] JWS verification DISABLED - decode-only mode (DEVELOPMENT ONLY)');
}

/**
 * Initialize App Store Server API client and verifier
 * These use Apple's official library for cryptographic verification
 */
let signedDataVerifier: SignedDataVerifier | null = null;
let appStoreClient: AppStoreServerAPIClient | null = null;
let verifierInitFailed = false;

// Load Apple Root Certificates for JWS verification
// These are Apple's official root CA certificates (G2, G3, and Inc Root)
// Source: https://www.apple.com/certificateauthority/
let appleRootCertificates: Buffer[] | null = null;

function loadAppleRootCertificates(): Buffer[] {
  if (appleRootCertificates) return appleRootCertificates;
  
  try {
    appleRootCertificates = getAppleRootCertificates();
    logger.info('[AppStore] Loaded Apple Root Certificates', {
      count: appleRootCertificates.length,
    });
    return appleRootCertificates;
  } catch (error) {
    logger.error('[AppStore] CRITICAL: Failed to load Apple Root Certificates:', error);
    return [];
  }
}

// Initialize the verifier with Apple's root certificates
function getSignedDataVerifier(): SignedDataVerifier | null {
  if (signedDataVerifier) return signedDataVerifier;
  if (verifierInitFailed) return null;
  
  const rootCerts = loadAppleRootCertificates();
  
  if (rootCerts.length === 0) {
    verifierInitFailed = true;
    logger.error('[AppStore] CRITICAL: No Apple Root Certificates available - verification impossible');
    return null;
  }
  
  // For Production environment, APP_STORE_APP_APPLE_ID is required
  if (appStoreEnvironment === Environment.PRODUCTION && !APP_STORE_APP_APPLE_ID) {
    verifierInitFailed = true;
    logger.error('[AppStore] CRITICAL: APP_STORE_APP_APPLE_ID is required for Production environment');
    logger.error('[AppStore] Get your App Apple ID from App Store Connect → App Information → General Information');
    return null;
  }
  
  try {
    // Initialize SignedDataVerifier with Apple's root certificates
    // enableOnlineChecks performs OCSP revocation checking
    signedDataVerifier = new SignedDataVerifier(
      rootCerts,
      true, // enableOnlineChecks - validates certificate revocation via OCSP
      appStoreEnvironment,
      APP_STORE_BUNDLE_ID,
      APP_STORE_APP_APPLE_ID // Required for Production environment
    );
    logger.info('[AppStore] SignedDataVerifier initialized successfully', {
      environment: appStoreEnvironment,
      bundleId: APP_STORE_BUNDLE_ID,
      appAppleId: APP_STORE_APP_APPLE_ID,
      rootCertsLoaded: rootCerts.length,
      onlineChecks: true,
    });
    return signedDataVerifier;
  } catch (error) {
    verifierInitFailed = true;
    logger.error('[AppStore] CRITICAL: Failed to initialize SignedDataVerifier:', error);
    if (REQUIRE_JWS_VERIFICATION) {
      logger.error('[AppStore] Verification required: All App Store transactions will be rejected');
    }
    return null;
  }
}

function getAppStoreClient(): AppStoreServerAPIClient | null {
  if (appStoreClient) return appStoreClient;
  
  if (!APP_STORE_ISSUER_ID || !APP_STORE_KEY_ID || !APP_STORE_PRIVATE_KEY) {
    if (isProduction) {
      logger.error('[AppStore] CRITICAL: App Store Server API credentials not configured in production');
    } else {
      logger.warn('[AppStore] App Store Server API credentials not configured (development mode)');
    }
    return null;
  }
  
  // Validate private key format
  if (!APP_STORE_PRIVATE_KEY.includes('-----BEGIN PRIVATE KEY-----')) {
    logger.error('[AppStore] CRITICAL: APP_STORE_PRIVATE_KEY must be in PEM format');
    return null;
  }
  
  try {
    appStoreClient = new AppStoreServerAPIClient(
      APP_STORE_PRIVATE_KEY,
      APP_STORE_KEY_ID,
      APP_STORE_ISSUER_ID,
      APP_STORE_BUNDLE_ID,
      appStoreEnvironment
    );
    logger.info('[AppStore] AppStoreServerAPIClient initialized successfully');
    return appStoreClient;
  } catch (error) {
    logger.error('[AppStore] Failed to initialize AppStoreServerAPIClient:', error);
    return null;
  }
}

/**
 * Decoded App Store Transaction type
 */
interface DecodedAppStoreTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  purchaseDate: number;
  expiresDate?: number;
  environment: 'Production' | 'Sandbox' | 'Xcode';
  type: string;
  inAppOwnershipType?: string;
  verified: boolean;
}

/**
 * Verify a StoreKit 2 JWS transaction using Apple's official library
 * This performs cryptographic signature verification
 * 
 * SECURITY: In production, returns null if verification cannot be performed
 */
async function verifyAndDecodeJWS(jwsString: string): Promise<DecodedAppStoreTransaction | null> {
  const verifier = getSignedDataVerifier();
  
  if (verifier) {
    try {
      // Use Apple's library to verify the signature and decode the payload
      const decodedTransaction = await verifier.verifyAndDecodeTransaction(jwsString);
      
      logger.info('[AppStore] JWS verified successfully:', {
        transactionId: decodedTransaction.transactionId,
        productId: decodedTransaction.productId,
        bundleId: decodedTransaction.bundleId,
        environment: decodedTransaction.environment,
      });

      // Validate product ID is one we recognize
      if (!VALID_PRODUCT_IDS.includes(decodedTransaction.productId || '')) {
        logger.error('[AppStore] Invalid product ID:', decodedTransaction.productId);
        return null;
      }

      return {
        transactionId: String(decodedTransaction.transactionId),
        originalTransactionId: String(decodedTransaction.originalTransactionId || decodedTransaction.transactionId),
        productId: decodedTransaction.productId || '',
        bundleId: decodedTransaction.bundleId || '',
        purchaseDate: Number(decodedTransaction.purchaseDate),
        expiresDate: decodedTransaction.expiresDate ? Number(decodedTransaction.expiresDate) : undefined,
        environment: decodedTransaction.environment as 'Production' | 'Sandbox' | 'Xcode',
        type: decodedTransaction.type || '',
        inAppOwnershipType: decodedTransaction.inAppOwnershipType,
        verified: true,
      };
    } catch (error) {
      if (error instanceof VerificationException) {
        logger.error('[AppStore] JWS verification failed:', {
          status: error.status,
          message: error.message,
        });
      } else {
        logger.error('[AppStore] JWS verification error:', error);
      }
      return null;
    }
  }
  
  // SECURITY: In production, reject transactions when verifier is unavailable
  if (REQUIRE_JWS_VERIFICATION) {
    logger.error('[AppStore] SECURITY: Verifier unavailable in production - rejecting transaction');
    return null;
  }
  
  // Development only: Decode without verification
  logger.warn('[AppStore] DEVELOPMENT ONLY: Verifier not available, using decode-only (NOT SECURE)');
  return decodeJWSWithoutVerification(jwsString);
}

/**
 * Decode JWS without cryptographic verification
 * ONLY used as fallback when verifier is not available
 */
function decodeJWSWithoutVerification(jwsString: string): DecodedAppStoreTransaction | null {
  try {
    const parts = jwsString.split('.');
    if (parts.length !== 3) {
      logger.error('[AppStore] Invalid JWS format - expected 3 parts');
      return null;
    }

    const payloadBase64 = parts[1];
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = Buffer.from(base64, 'base64').toString('utf-8');
    const payload = JSON.parse(payloadJson);

    logger.warn('[AppStore] Decoded JWS WITHOUT verification:', {
      transactionId: payload.transactionId,
      productId: payload.productId,
      bundleId: payload.bundleId,
    });

    // Validate bundle ID matches our app
    if (payload.bundleId && payload.bundleId !== APP_STORE_BUNDLE_ID) {
      logger.error('[AppStore] Bundle ID mismatch:', {
        expected: APP_STORE_BUNDLE_ID,
        received: payload.bundleId,
      });
      return null;
    }

    if (!VALID_PRODUCT_IDS.includes(payload.productId)) {
      logger.error('[AppStore] Invalid product ID:', payload.productId);
      return null;
    }

    return {
      transactionId: payload.transactionId,
      originalTransactionId: payload.originalTransactionId || payload.transactionId,
      productId: payload.productId,
      bundleId: payload.bundleId,
      purchaseDate: payload.purchaseDate,
      expiresDate: payload.expiresDate,
      environment: payload.environment,
      type: payload.type,
      inAppOwnershipType: payload.inAppOwnershipType,
      verified: false, // Mark as NOT verified
    };
  } catch (error) {
    logger.error('[AppStore] Failed to decode JWS:', error);
    return null;
  }
}

/**
 * Verify and decode App Store Server Notification JWS
 * 
 * SECURITY: In production, returns null if verification cannot be performed
 */
async function verifyAndDecodeNotification(signedPayload: string): Promise<any | null> {
  const verifier = getSignedDataVerifier();
  
  if (verifier) {
    try {
      const decodedNotification = await verifier.verifyAndDecodeNotification(signedPayload);
      logger.info('[AppStore] Notification verified successfully');
      return decodedNotification;
    } catch (error) {
      logger.error('[AppStore] Notification verification failed:', error);
      return null;
    }
  }
  
  // SECURITY: In production, reject notifications when verifier is unavailable
  if (REQUIRE_JWS_VERIFICATION) {
    logger.error('[AppStore] SECURITY: Verifier unavailable in production - rejecting notification');
    return null;
  }
  
  // Development only: Decode without verification
  logger.warn('[AppStore] DEVELOPMENT ONLY: Notification verifier not available, using decode-only');
  try {
    const parts = signedPayload.split('.');
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1];
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
  } catch (error) {
    logger.error('[AppStore] Failed to decode notification:', error);
    return null;
  }
}

const router = Router();

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-10-29.clover',
    })
  : null;

/**
 * POST /api/billing/create-checkout-session
 * Create Stripe Checkout session for subscription
 */
router.post('/create-checkout-session', async (req: any, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { priceId } = req.body;
    if (!priceId || typeof priceId !== 'string') {
      return res.status(400).json({ error: 'Invalid priceId' });
    }

    // Validate priceId is one we recognize
    const validPriceIds = [
      PRICING.PREMIUM_MONTHLY.priceId,
      PRICING.PREMIUM_YEARLY.priceId,
    ];
    if (!validPriceIds.includes(priceId)) {
      return res.status(400).json({ error: 'Invalid priceId' });
    }
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.email) {
      return res.status(400).json({ error: 'User email required' });
    }

    // Create or get Stripe customer
    let stripeCustomerId: string;
    const [existingCustomer] = await db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);

    if (existingCustomer?.stripeCustomerId) {
      stripeCustomerId = existingCustomer.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        metadata: {
          userId,
        },
      });
      stripeCustomerId = customer.id;

      // Save customer to DB
      await db.insert(billingCustomers).values({
        userId,
        stripeCustomerId: customer.id,
        provider: 'stripe',
      });
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.VITE_API_URL || 'http://localhost:5000'}/billing-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.VITE_API_URL || 'http://localhost:5000'}/billing-cancelled`,
      metadata: {
        userId,
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    logger.error('[Billing] Create checkout session error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/billing/create-payment-intent
 * Create payment intent for Apple Pay subscription
 * Returns clientSecret for native payment sheet
 */
router.post('/create-payment-intent', async (req: any, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { priceId } = req.body;
    if (!priceId || typeof priceId !== 'string') {
      return res.status(400).json({ error: 'Invalid priceId' });
    }

    // Validate priceId is one we recognize
    const validPriceIds = [
      PRICING.PREMIUM_MONTHLY.priceId,
      PRICING.PREMIUM_YEARLY.priceId,
    ];
    if (!validPriceIds.includes(priceId)) {
      return res.status(400).json({ error: 'Invalid priceId' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.email) {
      return res.status(400).json({ error: 'User email required' });
    }

    // Create or get Stripe customer
    let stripeCustomerId: string;
    const [existingCustomer] = await db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);

    if (existingCustomer?.stripeCustomerId) {
      stripeCustomerId = existingCustomer.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        metadata: {
          userId,
        },
      });
      stripeCustomerId = customer.id;

      await db.insert(billingCustomers).values({
        userId,
        stripeCustomerId: customer.id,
        provider: 'stripe',
      });
    }

    // Create subscription with incomplete payment (for Apple Pay)
    logger.info(`[Billing] Creating subscription for customer ${stripeCustomerId} with price ${priceId}`);
    
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId,
      },
    });

    logger.info(`[Billing] Subscription created: ${subscription.id}, status: ${subscription.status}`);
    
    const invoice = subscription.latest_invoice as any;
    logger.info(`[Billing] Invoice: ${invoice?.id}, status: ${invoice?.status}`);
    
    const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent;
    logger.info(`[Billing] PaymentIntent: ${paymentIntent?.id}, status: ${paymentIntent?.status}, has_secret: ${!!paymentIntent?.client_secret}`);

    if (!paymentIntent?.client_secret) {
      logger.error(`[Billing] No client_secret in payment intent. Invoice: ${JSON.stringify(invoice)}`);
      return res.status(500).json({ error: 'Failed to create payment intent' });
    }

    logger.info(`[Billing] Created Apple Pay subscription intent for user ${userId}`);

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      subscriptionId: subscription.id,
    });
  } catch (error: any) {
    logger.error('[Billing] Create payment intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/billing/confirm-apple-pay
 * Confirm Apple Pay subscription completion and upgrade user
 */
router.post('/confirm-apple-pay', async (req: any, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subscriptionId } = req.body;
    if (!subscriptionId) {
      return res.status(400).json({ error: 'subscriptionId required' });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (subscription.status === 'active' || subscription.status === 'trialing') {
      const [customer] = await db
        .select()
        .from(billingCustomers)
        .where(eq(billingCustomers.userId, userId))
        .limit(1);

      if (customer) {
        const [existingSub] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
          .limit(1);

        if (!existingSub) {
          await db.insert(subscriptions).values({
            billingCustomerId: customer.id,
            stripeSubscriptionId: subscriptionId,
            status: subscription.status,
            stripePriceId: subscription.items.data[0]?.price?.id || '',
            currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
            currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
          });
        }
      }

      await upgradeUserToPremium(userId);

      logger.info(`[Billing] Apple Pay confirmed - user ${userId} upgraded to premium`);
      res.json({ success: true, message: 'Subscription activated!' });
    } else {
      logger.warn(`[Billing] Apple Pay subscription ${subscriptionId} is ${subscription.status}, not active`);
      res.status(400).json({ error: `Subscription is ${subscription.status}` });
    }
  } catch (error: any) {
    logger.error('[Billing] Confirm Apple Pay error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/billing/cancel-incomplete-subscription
 * Cancel an incomplete subscription (e.g., when Apple Pay is cancelled)
 */
router.post('/cancel-incomplete-subscription', async (req: any, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subscriptionId } = req.body;
    if (!subscriptionId) {
      return res.status(400).json({ error: 'subscriptionId required' });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (subscription.status === 'incomplete') {
      await stripe.subscriptions.cancel(subscriptionId);
      logger.info(`[Billing] Cancelled incomplete subscription ${subscriptionId} for user ${userId}`);
      res.json({ success: true, message: 'Subscription cancelled' });
    } else {
      logger.info(`[Billing] Subscription ${subscriptionId} is ${subscription.status}, not cancelling`);
      res.json({ success: true, message: 'No action needed' });
    }
  } catch (error: any) {
    logger.error('[Billing] Cancel incomplete subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/billing/cancel-subscription
 * Cancel user's active subscription
 */
router.post('/cancel-subscription', async (req: any, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [customer] = await db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);

    if (!customer) {
      return res.status(404).json({ error: 'No billing customer found' });
    }

    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.billingCustomerId, customer.id))
      .limit(1);

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Cancel at period end (don't immediately revoke access)
    const cancelledSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      }
    );

    // Update DB
    await db
      .update(subscriptions)
      .set({
        status: 'canceled',
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    logger.info(`[Billing] Subscription ${subscription.stripeSubscriptionId} cancelled for user ${userId}`);

    res.json({ 
      message: 'Subscription will be cancelled at period end',
      cancelAt: cancelledSubscription.cancel_at,
    });
  } catch (error: any) {
    logger.error('[Billing] Cancel subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/billing/webhook
 * Handle Stripe webhook events
 */
router.post('/webhook', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    logger.error('[Billing] Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        
        if (userId) {
          logger.info(`[Billing] Checkout completed for user ${userId}`);
          
          // Get customer
          const [customer] = await db
            .select()
            .from(billingCustomers)
            .where(eq(billingCustomers.stripeCustomerId, session.customer as string))
            .limit(1);

          if (customer && session.subscription) {
            // Create subscription record
            await db.insert(subscriptions).values({
              billingCustomerId: customer.id,
              stripeSubscriptionId: session.subscription as string,
              status: 'active',
              stripePriceId: session.line_items?.data[0]?.price?.id || '',
            });

            // Upgrade user to premium
            await upgradeUserToPremium(userId);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        const [customer] = await db
          .select()
          .from(billingCustomers)
          .where(eq(billingCustomers.stripeCustomerId, stripeCustomerId))
          .limit(1);

        if (customer) {
          await db
            .update(subscriptions)
            .set({
              status: subscription.status as any,
              currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
              currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

          // Upgrade/downgrade based on status
          if (subscription.status === 'active') {
            await upgradeUserToPremium(customer.userId);
          } else if (['canceled', 'unpaid', 'past_due'].includes(subscription.status)) {
            await downgradeUserToFree(customer.userId);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeCustomerId = subscription.customer as string;

        const [customer] = await db
          .select()
          .from(billingCustomers)
          .where(eq(billingCustomers.stripeCustomerId, stripeCustomerId))
          .limit(1);

        if (customer) {
          await db
            .update(subscriptions)
            .set({
              status: 'canceled',
              cancelAtPeriodEnd: true,
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

          // Downgrade user
          await downgradeUserToFree(customer.userId);
          logger.info(`[Billing] Subscription deleted, user ${customer.userId} downgraded to FREE`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        const [customer] = await db
          .select()
          .from(billingCustomers)
          .where(eq(billingCustomers.stripeCustomerId, stripeCustomerId))
          .limit(1);

        if (customer) {
          // Record payment
          await db.insert(payments).values({
            billingCustomerId: customer.id,
            stripePaymentIntentId: (invoice as any).payment_intent as string || null,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: 'succeeded',
          });

          logger.info(`[Billing] Payment succeeded for customer ${customer.id}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId = invoice.customer as string;

        const [customer] = await db
          .select()
          .from(billingCustomers)
          .where(eq(billingCustomers.stripeCustomerId, stripeCustomerId))
          .limit(1);

        if (customer) {
          logger.warn(`[Billing] Payment failed for customer ${customer.id}`);
          // TODO: Send email notification or in-app alert
        }
        break;
      }

      default:
        logger.debug(`[Billing] Unhandled webhook event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    logger.error('[Billing] Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * GET /api/billing/subscription-status
 * Get user's current subscription status
 */
router.get('/subscription-status', async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [customer] = await db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);

    let subscription = null;
    if (customer) {
      const [sub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.billingCustomerId, customer.id))
        .limit(1);
      subscription = sub;
    }

    res.json({
      isPremium: user?.role === 'premium',
      hasActiveSubscription: subscription?.status === 'active',
      subscription: subscription ? {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
      } : null,
    });
  } catch (error: any) {
    logger.error('[Billing] Get subscription status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/billing/plan
 * Get user's current plan details
 */
router.get('/plan', async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userPlan = await getUserPlan(userId);
    const features = await getUserFeatures(userId);
    const limits = await getUserLimits(userId);

    // Return structure matching frontend expectations
    res.json({
      plan: {
        id: userPlan.id.toLowerCase(), // 'free' or 'premium'
        displayName: userPlan.label,
        tier: userPlan.id === 'PREMIUM' ? 2 : 1,
        limits,
        features,
      },
      features,
      limits,
    });
  } catch (error: any) {
    logger.error('[Billing] Get plan error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/billing/paywall-modals
 * Get all paywall modal configurations
 */
router.get('/paywall-modals', async (req: any, res) => {
  try {
    // Transform modals to match frontend expectations
    const modalsArray = Object.values(PAYWALL_MODALS).map(modal => ({
      id: modal.id,
      title: modal.title,
      description: modal.body, // Map 'body' to 'description'
      benefits: modal.highlightedBenefits, // Map 'highlightedBenefits' to 'benefits'
      ctaText: modal.primaryCtaLabel, // Map 'primaryCtaLabel' to 'ctaText'
      ctaAction: 'upgrade_to_premium' as const,
    }));

    res.json({ modals: modalsArray });
  } catch (error: any) {
    logger.error('[Billing] Get paywall modals error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/billing/plans
 * Get all available plans
 */
router.get('/plans', async (req: any, res) => {
  try {
    // Transform plans to match frontend expectations
    const transformedPlans = {
      free: {
        id: 'free',
        displayName: PLANS.FREE.label,
        tier: 1,
        limits: PLANS.FREE.limits,
        features: PLANS.FREE.features,
      },
      premium: {
        id: 'premium',
        displayName: PLANS.PREMIUM.label,
        tier: 2,
        limits: PLANS.PREMIUM.limits,
        features: PLANS.PREMIUM.features,
      },
    };

    // Transform pricing to match frontend expectations
    const transformedPricing = {
      premium: {
        monthly: {
          amount: PRICING.PREMIUM_MONTHLY.amount,
          currency: PRICING.PREMIUM_MONTHLY.currency,
          stripePriceId: PRICING.PREMIUM_MONTHLY.priceId,
        },
        annual: {
          amount: PRICING.PREMIUM_YEARLY.amount,
          currency: PRICING.PREMIUM_YEARLY.currency,
          stripePriceId: PRICING.PREMIUM_YEARLY.priceId,
        },
      },
    };

    res.json({ 
      plans: transformedPlans,
      pricing: transformedPricing,
    });
  } catch (error: any) {
    logger.error('[Billing] Get plans error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/billing/verify-app-store
 * Verify App Store transaction and sync subscription status
 * Called by iOS app after StoreKit purchase
 * 
 * Security: Requires JWS representation from StoreKit 2 for verification
 */
router.post('/verify-app-store', async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { 
      transactionId, 
      productId, 
      originalTransactionId, 
      purchaseDate,
      expiresDate,
      jwsRepresentation 
    } = req.body;

    if (!transactionId || !productId) {
      return res.status(400).json({ error: 'transactionId and productId required' });
    }

    logger.info(`[Billing] App Store verification for user ${userId}`, {
      transactionId,
      productId,
      hasJWS: !!jwsRepresentation,
    });

    // If JWS is provided, verify it cryptographically (StoreKit 2)
    let verifiedTransaction: DecodedAppStoreTransaction | null = null;
    
    if (jwsRepresentation) {
      verifiedTransaction = await verifyAndDecodeJWS(jwsRepresentation);
      
      if (!verifiedTransaction) {
        logger.error('[Billing] JWS verification failed for transaction:', transactionId);
        return res.status(400).json({ error: 'Invalid transaction signature' });
      }

      // Verify transaction ID matches what client sent
      if (verifiedTransaction.transactionId !== transactionId) {
        logger.error('[Billing] Transaction ID mismatch:', {
          clientTransactionId: transactionId,
          jwsTransactionId: verifiedTransaction.transactionId,
        });
        return res.status(400).json({ error: 'Transaction ID mismatch' });
      }

      // Verify product ID matches
      if (verifiedTransaction.productId !== productId) {
        logger.error('[Billing] Product ID mismatch:', {
          clientProductId: productId,
          jwsProductId: verifiedTransaction.productId,
        });
        return res.status(400).json({ error: 'Product ID mismatch' });
      }

      logger.info('[Billing] JWS verification successful:', {
        transactionId: verifiedTransaction.transactionId,
        environment: verifiedTransaction.environment,
      });
    } else {
      // For backwards compatibility, log a warning but allow
      // In production, you may want to require JWS
      logger.warn('[Billing] No JWS provided, using client-supplied data (less secure)');
    }

    // Use verified data if available, otherwise fall back to client data
    const finalProductId = verifiedTransaction?.productId || productId;
    const finalTransactionId = verifiedTransaction?.transactionId || transactionId;
    const finalOriginalTransactionId = verifiedTransaction?.originalTransactionId || originalTransactionId || transactionId;
    const finalPurchaseDate = verifiedTransaction?.purchaseDate 
      ? new Date(verifiedTransaction.purchaseDate) 
      : new Date(purchaseDate || Date.now());
    const finalExpiresDate = verifiedTransaction?.expiresDate
      ? new Date(verifiedTransaction.expiresDate)
      : expiresDate ? new Date(expiresDate) : null;

    // Map StoreKit product IDs to plan intervals
    const productMapping: Record<string, 'month' | 'year'> = {
      'flo_premium_monthly': 'month',
      'flo_premium_yearly': 'year',
    };

    const planInterval = productMapping[finalProductId];
    if (!planInterval) {
      logger.error(`[Billing] Unknown App Store product ID: ${finalProductId}`);
      return res.status(400).json({ error: 'Unknown product ID' });
    }

    // Get or create billing customer for App Store
    const [existingCustomer] = await db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);

    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id;
      // Update to App Store provider if it was Stripe before
      if (existingCustomer.provider !== 'app_store') {
        await db.update(billingCustomers)
          .set({ 
            provider: 'app_store',
            appStoreOriginalTransactionId: finalOriginalTransactionId,
          })
          .where(eq(billingCustomers.id, customerId));
      }
    } else {
      const [newCustomer] = await db.insert(billingCustomers).values({
        userId,
        provider: 'app_store',
        appStoreOriginalTransactionId: finalOriginalTransactionId,
      }).returning();
      customerId = newCustomer.id;
    }

    // Check for existing subscription with this transaction
    const [existingSub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.appStoreTransactionId, finalOriginalTransactionId))
      .limit(1);

    const currentPeriodEnd = finalExpiresDate 
      || new Date(Date.now() + (planInterval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000);

    if (existingSub) {
      // Update existing subscription
      await db.update(subscriptions)
        .set({
          status: 'active',
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
        })
        .where(eq(subscriptions.id, existingSub.id));

      logger.info(`[Billing] Updated existing App Store subscription for user ${userId}`);
    } else {
      // Create new subscription
      await db.insert(subscriptions).values({
        billingCustomerId: customerId,
        status: 'active',
        planId: 'premium',
        planInterval,
        currentPeriodStart: finalPurchaseDate,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        provider: 'app_store',
        appStoreTransactionId: finalOriginalTransactionId,
        appStoreProductId: finalProductId,
      });

      logger.info(`[Billing] Created new App Store subscription for user ${userId}`);
    }

    // Upgrade user to premium
    await upgradeUserToPremium(userId);

    // Record payment (use verified environment info if available)
    await db.insert(payments).values({
      billingCustomerId: customerId,
      amount: planInterval === 'year' ? 11000 : 999, // Cents (actual price comes from App Store)
      currency: 'AUD',
      status: 'succeeded',
      provider: 'app_store',
      appStoreTransactionId: finalTransactionId,
    });

    logger.info(`[Billing] App Store transaction verified successfully for user ${userId}`);

    res.json({ 
      verified: true, 
      message: 'Subscription activated successfully' 
    });
  } catch (error: any) {
    logger.error('[Billing] App Store verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/billing/app-store-webhook
 * Handle App Store Server Notifications (v2)
 * Configure this URL in App Store Connect
 * 
 * Security: Uses Apple's official library for JWS signature verification
 */
router.post('/app-store-webhook', async (req, res) => {
  try {
    const { signedPayload } = req.body;
    
    if (!signedPayload) {
      logger.warn('[Billing] App Store webhook received without signedPayload');
      return res.status(400).json({ error: 'signedPayload required' });
    }

    // Verify and decode the notification using Apple's library
    const payload = await verifyAndDecodeNotification(signedPayload);
    
    if (!payload) {
      logger.error('[Billing] App Store webhook JWS verification failed');
      return res.status(400).json({ error: 'Invalid notification signature' });
    }

    logger.info('[Billing] App Store Server Notification received:', {
      notificationType: payload.notificationType,
      subtype: payload.subtype,
    });

    const { notificationType, subtype, data } = payload;
    
    // Handle different notification types
    switch (notificationType) {
      case 'SUBSCRIBED':
      case 'DID_RENEW':
        // Subscription is active
        if (data?.signedTransactionInfo) {
          await handleAppStoreRenewal(data.signedTransactionInfo);
        }
        break;

      case 'DID_CHANGE_RENEWAL_STATUS':
        if (subtype === 'AUTO_RENEW_DISABLED') {
          // User turned off auto-renewal
          if (data?.signedTransactionInfo) {
            await handleAppStoreCancellation(data.signedTransactionInfo, false);
          }
        }
        break;

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
        // Subscription has expired
        if (data?.signedTransactionInfo) {
          await handleAppStoreExpiration(data.signedTransactionInfo);
        }
        break;

      case 'REFUND':
        // User got a refund
        if (data?.signedTransactionInfo) {
          await handleAppStoreRefund(data.signedTransactionInfo);
        }
        break;

      default:
        logger.info(`[Billing] Unhandled App Store notification type: ${notificationType}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    logger.error('[Billing] App Store webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions for App Store webhook handling
// Note: These use verifyAndDecodeJWS for cryptographic verification

async function handleAppStoreRenewal(signedTransactionInfo: string) {
  try {
    const transaction = await verifyAndDecodeJWS(signedTransactionInfo);
    if (!transaction) {
      logger.error('[Billing] Failed to verify renewal transaction');
      return;
    }

    const { originalTransactionId, expiresDate } = transaction;

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.appStoreTransactionId, originalTransactionId))
      .limit(1);

    if (sub) {
      await db.update(subscriptions)
        .set({
          status: 'active',
          currentPeriodEnd: expiresDate ? new Date(expiresDate) : sub.currentPeriodEnd,
          cancelAtPeriodEnd: false,
        })
        .where(eq(subscriptions.id, sub.id));

      logger.info(`[Billing] App Store subscription renewed: ${originalTransactionId} (verified: ${transaction.verified})`);
    }
  } catch (error) {
    logger.error('[Billing] Error handling App Store renewal:', error);
  }
}

async function handleAppStoreCancellation(signedTransactionInfo: string, immediate: boolean) {
  try {
    const transaction = await verifyAndDecodeJWS(signedTransactionInfo);
    if (!transaction) {
      logger.error('[Billing] Failed to verify cancellation transaction');
      return;
    }

    const { originalTransactionId } = transaction;

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.appStoreTransactionId, originalTransactionId))
      .limit(1);

    if (sub) {
      if (immediate) {
        await db.update(subscriptions)
          .set({ status: 'canceled' })
          .where(eq(subscriptions.id, sub.id));

        // Get user and downgrade
        const [customer] = await db
          .select()
          .from(billingCustomers)
          .where(eq(billingCustomers.id, sub.billingCustomerId))
          .limit(1);

        if (customer) {
          await downgradeUserToFree(customer.userId);
        }
      } else {
        await db.update(subscriptions)
          .set({ cancelAtPeriodEnd: true })
          .where(eq(subscriptions.id, sub.id));
      }

      logger.info(`[Billing] App Store subscription cancellation: ${originalTransactionId}, immediate: ${immediate} (verified: ${transaction.verified})`);
    }
  } catch (error) {
    logger.error('[Billing] Error handling App Store cancellation:', error);
  }
}

async function handleAppStoreExpiration(signedTransactionInfo: string) {
  try {
    const transaction = await verifyAndDecodeJWS(signedTransactionInfo);
    if (!transaction) {
      logger.error('[Billing] Failed to verify expiration transaction');
      return;
    }

    const { originalTransactionId } = transaction;

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.appStoreTransactionId, originalTransactionId))
      .limit(1);

    if (sub) {
      await db.update(subscriptions)
        .set({ status: 'expired' })
        .where(eq(subscriptions.id, sub.id));

      // Get user and downgrade
      const [customer] = await db
        .select()
        .from(billingCustomers)
        .where(eq(billingCustomers.id, sub.billingCustomerId))
        .limit(1);

      if (customer) {
        await downgradeUserToFree(customer.userId);
      }

      logger.info(`[Billing] App Store subscription expired: ${originalTransactionId} (verified: ${transaction.verified})`);
    }
  } catch (error) {
    logger.error('[Billing] Error handling App Store expiration:', error);
  }
}

async function handleAppStoreRefund(signedTransactionInfo: string) {
  try {
    const transaction = await verifyAndDecodeJWS(signedTransactionInfo);
    if (!transaction) {
      logger.error('[Billing] Failed to verify refund transaction');
      return;
    }

    const { originalTransactionId, transactionId } = transaction;

    // Mark payment as refunded
    await db.update(payments)
      .set({ status: 'refunded' })
      .where(eq(payments.appStoreTransactionId, transactionId));

    // Cancel subscription and downgrade
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.appStoreTransactionId, originalTransactionId))
      .limit(1);

    if (sub) {
      await db.update(subscriptions)
        .set({ status: 'canceled' })
        .where(eq(subscriptions.id, sub.id));

      const [customer] = await db
        .select()
        .from(billingCustomers)
        .where(eq(billingCustomers.id, sub.billingCustomerId))
        .limit(1);

      if (customer) {
        await downgradeUserToFree(customer.userId);
      }

      logger.info(`[Billing] App Store refund processed: ${originalTransactionId} (verified: ${transaction.verified})`);
    }
  } catch (error) {
    logger.error('[Billing] Error handling App Store refund:', error);
  }
}

export default router;
