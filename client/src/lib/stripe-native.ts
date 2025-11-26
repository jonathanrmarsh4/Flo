/**
 * @deprecated This module is deprecated for iOS subscriptions.
 * 
 * Apple App Store Guidelines require all digital subscriptions to use StoreKit (In-App Purchase).
 * Use `storekit.ts` instead for iOS subscription purchases.
 * 
 * This file is kept for potential web Stripe payments if needed in the future.
 * 
 * @see client/src/lib/storekit.ts for iOS subscription handling
 */

let Stripe: any = null;
let ApplePayEventsEnum: any = null;
let Capacitor: any = null;
let capacitorLoaded = false;

async function loadCapacitor() {
  if (capacitorLoaded) return Capacitor;
  try {
    const module = await import('@capacitor/core');
    Capacitor = module.Capacitor;
    capacitorLoaded = true;
    return Capacitor;
  } catch {
    capacitorLoaded = true;
    return null;
  }
}

async function loadStripePlugin() {
  if (Stripe) return { Stripe, ApplePayEventsEnum };
  
  try {
    const module = await import(/* @vite-ignore */ '@capacitor-community/stripe');
    Stripe = module.Stripe;
    ApplePayEventsEnum = module.ApplePayEventsEnum;
    return { Stripe, ApplePayEventsEnum };
  } catch (error) {
    console.warn('[Stripe Native] Plugin not available:', error);
    return { Stripe: null, ApplePayEventsEnum: null };
  }
}

export async function initializeStripeNative(): Promise<boolean> {
  const cap = await loadCapacitor();
  if (!cap || !cap.isNativePlatform()) {
    console.log('[Stripe Native] Not a native platform, skipping initialization');
    return false;
  }

  try {
    const { Stripe } = await loadStripePlugin();
    if (!Stripe) {
      console.warn('[Stripe Native] Plugin not loaded');
      return false;
    }

    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      console.warn('[Stripe Native] Missing VITE_STRIPE_PUBLISHABLE_KEY');
      return false;
    }

    await Stripe.initialize({
      publishableKey,
    });

    console.log('[Stripe Native] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[Stripe Native] Initialization failed:', error);
    return false;
  }
}

export async function isApplePayAvailable(): Promise<boolean> {
  const cap = await loadCapacitor();
  if (!cap || !cap.isNativePlatform() || cap.getPlatform() !== 'ios') {
    return false;
  }

  try {
    const { Stripe } = await loadStripePlugin();
    if (!Stripe) return false;

    await Stripe.isApplePayAvailable();
    console.log('[Stripe Native] Apple Pay is available');
    return true;
  } catch (error) {
    console.log('[Stripe Native] Apple Pay not available:', error);
    return false;
  }
}

export interface ApplePayResult {
  success: boolean;
  error?: string;
}

export async function payWithApplePay(
  priceId: string,
  amount: number,
  label: string
): Promise<ApplePayResult> {
  let subscriptionId: string | null = null;
  
  try {
    const { Stripe, ApplePayEventsEnum } = await loadStripePlugin();
    if (!Stripe) {
      return { success: false, error: 'Stripe plugin not available' };
    }

    const response = await fetch('/api/billing/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ priceId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.error || 'Failed to create payment intent' };
    }

    const data = await response.json();
    const { clientSecret } = data;
    subscriptionId = data.subscriptionId;

    if (!clientSecret) {
      return { success: false, error: 'No client secret returned' };
    }

    await Stripe.createApplePay({
      paymentIntentClientSecret: clientSecret,
      paymentSummaryItems: [
        { label, amount: amount / 100 }
      ],
      merchantIdentifier: 'merchant.com.getflo.app',
      countryCode: 'US',
      currency: 'USD',
    });

    const result = await Stripe.presentApplePay();

    if (result.paymentResult === ApplePayEventsEnum.Completed) {
      await Stripe.finalizeApplePayTransaction({ success: true });
      
      const confirmResponse = await fetch('/api/billing/confirm-apple-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subscriptionId }),
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        return { success: false, error: errorData.error || 'Failed to confirm payment' };
      }

      return { success: true };
    } else {
      await Stripe.finalizeApplePayTransaction({ success: false });
      
      if (subscriptionId) {
        await fetch('/api/billing/cancel-incomplete-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ subscriptionId }),
        });
      }
      
      return { success: false, error: 'Payment was cancelled or failed' };
    }
  } catch (error: any) {
    console.error('[Stripe Native] Apple Pay error:', error);
    
    if (subscriptionId) {
      try {
        await fetch('/api/billing/cancel-incomplete-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ subscriptionId }),
        });
      } catch (cancelError) {
        console.error('[Stripe Native] Failed to cancel subscription:', cancelError);
      }
    }
    
    return { success: false, error: error.message || 'Apple Pay failed' };
  }
}

export async function isNativePlatform(): Promise<boolean> {
  const cap = await loadCapacitor();
  return cap ? cap.isNativePlatform() : false;
}

export async function getPlatform(): Promise<string> {
  const cap = await loadCapacitor();
  return cap ? cap.getPlatform() : 'web';
}
