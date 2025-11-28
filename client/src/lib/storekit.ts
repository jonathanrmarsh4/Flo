import { Capacitor } from '@capacitor/core';
import { Subscriptions as SubscriptionsPlugin } from '@squareetlabs/capacitor-subscriptions';

// Cast as any to avoid TypeScript type mismatches with native bridge
const Subscriptions = SubscriptionsPlugin as any;

console.log('[StoreKit] Module loaded, Subscriptions:', typeof Subscriptions);

export interface StoreKitProduct {
  productId: string;
  displayName: string;
  description: string;
  price: number;
  priceLocale: string;
  displayPrice: string;
  subscriptionPeriod?: string;
}

export interface StoreKitTransaction {
  transactionId: string;
  productId: string;
  purchaseDate: string;
  expiresDate?: string;
  originalTransactionId: string;
  jwsRepresentation?: string;
}

export interface PurchaseResult {
  success: boolean;
  transaction?: StoreKitTransaction;
  error?: string;
}

export const PRODUCT_IDS = {
  PREMIUM_MONTHLY: 'premium_monthly',
  PREMIUM_YEARLY: 'flo_premium_yearly',
};

export async function isNativePlatform(): Promise<boolean> {
  return Capacitor.isNativePlatform();
}

export async function getPlatform(): Promise<string> {
  return Capacitor.getPlatform();
}

export async function isStoreKitAvailable(): Promise<boolean> {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  
  console.log('[StoreKit] Checking availability:', { isNative, platform });
  
  if (!isNative || platform !== 'ios') {
    console.log('[StoreKit] Not iOS native - StoreKit unavailable');
    return false;
  }
  
  console.log('[StoreKit] iOS detected, Subscriptions available:', !!Subscriptions);
  return !!Subscriptions;
}

export async function getProducts(productIds: string[]): Promise<StoreKitProduct[]> {
  if (!Subscriptions) {
    console.warn('[StoreKit] Plugin not available');
    return [];
  }
  
  console.log('[StoreKit] Requesting products with IDs:', productIds);
  
  try {
    // Add timeout to prevent hanging if App Store is slow/unavailable
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Product fetch timed out after 15s. Check: 1) Paid Apps Agreement signed in App Store Connect, 2) Bundle ID matches, 3) Products have localizations')), 15000);
    });
    
    const fetchPromise = Subscriptions.getProductDetails({ productIds });
    const result = await Promise.race([fetchPromise, timeoutPromise]);
    
    console.log('[StoreKit] Raw result from App Store:', JSON.stringify(result));
    
    if (!result.products || result.products.length === 0) {
      console.warn('[StoreKit] No products returned. Checklist:');
      console.warn('1. Sign "Paid Applications Agreement" in App Store Connect → Agreements');
      console.warn('2. Bundle ID must match: com.flo.healthapp');
      console.warn('3. Products need at least one localization');
      console.warn('4. Products must be in "Ready to Submit" or approved status');
      console.warn('5. Use Sandbox Apple ID for testing, not regular account');
      console.warn('Requested IDs:', productIds);
      
      // Return empty but don't throw - let the UI show the error state
      return [];
    }
    
    console.log('[StoreKit] Successfully fetched', result.products.length, 'products');
    
    return (result.products || []).map((product: any) => ({
      productId: product.productId,
      displayName: product.displayName || product.title || product.productId,
      description: product.description || '',
      price: product.price,
      priceLocale: product.currencyCode || 'AUD',
      displayPrice: product.localizedPrice || `$${product.price}`,
      subscriptionPeriod: product.subscriptionPeriod,
    }));
  } catch (error: any) {
    console.error('[StoreKit] Failed to fetch products:', error);
    console.error('[StoreKit] Error details:', JSON.stringify(error));
    // Rethrow with helpful message
    throw new Error(error.message || 'Failed to load products from App Store. Please check App Store Connect configuration.');
  }
}

export async function purchaseSubscription(productId: string): Promise<PurchaseResult> {
  if (!Subscriptions) {
    return { success: false, error: 'StoreKit not available' };
  }
  
  try {
    console.log('[StoreKit] Starting purchase for:', productId);
    
    const result = await Subscriptions.purchaseProduct({ productId });
    console.log('[StoreKit] Purchase result:', result);
    
    if (result.transactionId) {
      const transaction: StoreKitTransaction = {
        transactionId: result.transactionId,
        productId: result.productId || productId,
        purchaseDate: result.purchaseDate || new Date().toISOString(),
        expiresDate: result.expiresDate,
        originalTransactionId: result.originalTransactionId || result.transactionId,
        jwsRepresentation: result.jwsRepresentation,
      };
      
      const verified = await verifyAndSyncTransaction(transaction);
      
      if (verified) {
        return { success: true, transaction };
      } else {
        return { success: false, error: 'Transaction verification failed' };
      }
    }
    
    return { success: false, error: 'Purchase was cancelled or failed' };
  } catch (error: any) {
    console.error('[StoreKit] Purchase error:', error);
    
    if (error.message?.includes('cancelled') || error.message?.includes('canceled')) {
      return { success: false, error: 'Purchase was cancelled' };
    }
    
    return { success: false, error: error.message || 'Purchase failed' };
  }
}

export async function restorePurchases(): Promise<StoreKitTransaction[]> {
  if (!Subscriptions) {
    console.warn('[StoreKit] Plugin not available for restore');
    return [];
  }
  
  try {
    console.log('[StoreKit] Restoring purchases...');
    const result = await Subscriptions.restorePurchases();
    console.log('[StoreKit] Restore result:', result);
    
    const transactions: StoreKitTransaction[] = (result.transactions || []).map((t: any) => ({
      transactionId: t.transactionId,
      productId: t.productId,
      purchaseDate: t.purchaseDate,
      expiresDate: t.expiresDate,
      originalTransactionId: t.originalTransactionId || t.transactionId,
      jwsRepresentation: t.jwsRepresentation,
    }));
    
    for (const transaction of transactions) {
      await verifyAndSyncTransaction(transaction);
    }
    
    return transactions;
  } catch (error) {
    console.error('[StoreKit] Restore error:', error);
    return [];
  }
}

export async function getCurrentSubscription(): Promise<StoreKitTransaction | null> {
  if (!Subscriptions) {
    return null;
  }
  
  try {
    const monthlyResult = await Subscriptions.getLatestTransaction({ 
      productId: PRODUCT_IDS.PREMIUM_MONTHLY 
    });
    
    if (monthlyResult?.transactionId) {
      return {
        transactionId: monthlyResult.transactionId,
        productId: monthlyResult.productId || PRODUCT_IDS.PREMIUM_MONTHLY,
        purchaseDate: monthlyResult.purchaseDate,
        expiresDate: monthlyResult.expiresDate,
        originalTransactionId: monthlyResult.originalTransactionId || monthlyResult.transactionId,
        jwsRepresentation: monthlyResult.jwsRepresentation,
      };
    }
    
    const yearlyResult = await Subscriptions.getLatestTransaction({ 
      productId: PRODUCT_IDS.PREMIUM_YEARLY 
    });
    
    if (yearlyResult?.transactionId) {
      return {
        transactionId: yearlyResult.transactionId,
        productId: yearlyResult.productId || PRODUCT_IDS.PREMIUM_YEARLY,
        purchaseDate: yearlyResult.purchaseDate,
        expiresDate: yearlyResult.expiresDate,
        originalTransactionId: yearlyResult.originalTransactionId || yearlyResult.transactionId,
        jwsRepresentation: yearlyResult.jwsRepresentation,
      };
    }
    
    return null;
  } catch (error) {
    console.error('[StoreKit] Failed to get current subscription:', error);
    return null;
  }
}

async function verifyAndSyncTransaction(transaction: StoreKitTransaction): Promise<boolean> {
  try {
    console.log('[StoreKit] Verifying transaction with backend:', transaction.transactionId);
    
    const response = await fetch('/api/billing/verify-app-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        transactionId: transaction.transactionId,
        productId: transaction.productId,
        originalTransactionId: transaction.originalTransactionId,
        purchaseDate: transaction.purchaseDate,
        expiresDate: transaction.expiresDate,
        jwsRepresentation: transaction.jwsRepresentation,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[StoreKit] Verification failed:', errorData);
      return false;
    }
    
    const result = await response.json();
    console.log('[StoreKit] Verification result:', result);
    return result.verified === true;
  } catch (error) {
    console.error('[StoreKit] Verification error:', error);
    return false;
  }
}

export async function checkAndSyncSubscriptionStatus(): Promise<void> {
  if (!await isStoreKitAvailable()) {
    return;
  }
  
  const subscription = await getCurrentSubscription();
  if (subscription) {
    await verifyAndSyncTransaction(subscription);
  }
}
