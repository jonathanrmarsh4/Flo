import { Router } from 'express';
import Stripe from 'stripe';
import { db } from '../db';
import { billingCustomers, subscriptions, payments, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';
import { upgradeUserToPremium, downgradeUserToFree, getUserPlan, getUserFeatures, getUserLimits } from '../services/planService';
import { PLANS, PRICING } from '../config/plans';
import { PAYWALL_MODALS } from '../config/paywallModals';

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
 * Create payment intent for one-time payment (if needed)
 */
router.post('/create-payment-intent', async (req: any, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  try {
    const { amount } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      payment_method_types: ['card'],
      // Apple Pay is automatically enabled in payment_method_types when card is included
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    logger.error('[Billing] Create payment intent error:', error);
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
      .where(eq(subscriptions.customerId, customer.id))
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
        cancelAtPeriodEnd: 'true',
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
              customerId: customer.id,
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
              cancelAtPeriodEnd: 'true',
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
            customerId: customer.id,
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
        .where(eq(subscriptions.customerId, customer.id))
        .limit(1);
      subscription = sub;
    }

    res.json({
      isPremium: user?.role === 'premium',
      hasActiveSubscription: subscription?.status === 'active',
      subscription: subscription ? {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === 'true',
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

export default router;
