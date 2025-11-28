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
  
  const products: StoreKitProduct[] = [];
  
  for (const productId of productIds) {
    try {
      console.log('[StoreKit] Fetching product:', productId);
      
      const result = await Subscriptions.getProductDetails({ productIdentifier: productId });
      console.log('[StoreKit] Result for', productId, ':', JSON.stringify(result));
      
      // responseCode 0 = success
      if (result.responseCode === 0 && result.data) {
        const product = result.data;
        products.push({
          productId: product.productIdentifier,
          displayName: product.displayName || product.productIdentifier,
          description: product.description || '',
          price: parseFloat(product.price?.replace(/[^0-9.]/g, '') || '0'),
          priceLocale: 'AUD',
          displayPrice: product.price || '$0',
          subscriptionPeriod: undefined,
        });
        console.log('[StoreKit] Added product:', product.displayName);
      } else {
        console.warn('[StoreKit] Product not found:', productId, 'responseCode:', result.responseCode);
      }
    } catch (error: any) {
      console.error('[StoreKit] Error fetching product', productId, ':', error?.message || error);
    }
  }
  
  if (products.length === 0) {
    console.warn('[StoreKit] No products returned. Checklist:');
    console.warn('1. Sign "Paid Applications Agreement" in App Store Connect → Agreements');
    console.warn('2. Bundle ID must match: com.flo.healthapp');
    console.warn('3. Products need at least one localization');
    console.warn('4. Products must be in "Ready to Submit" or approved status');
    console.warn('5. Use Sandbox Apple ID for testing');
  } else {
    console.log('[StoreKit] Successfully fetched', products.length, 'products');
  }
  
  return products;
}

export async function purchaseSubscription(productId: string): Promise<PurchaseResult> {
  if (!Subscriptions) {
    return { success: false, error: 'StoreKit not available' };
  }
  
  try {
    console.log('[StoreKit] Starting purchase for:', productId);
    
    const result = await Subscriptions.purchaseProduct({ productIdentifier: productId });
    console.log('[StoreKit] Purchase result:', JSON.stringify(result));
    
    // responseCode 0 = success
    if (result.responseCode === 0) {
      // After successful purchase, get the transaction details
      const txResult = await Subscriptions.getLatestTransaction({ productIdentifier: productId });
      console.log('[StoreKit] Transaction result:', JSON.stringify(txResult));
      
      if (txResult.responseCode === 0 && txResult.data) {
        const tx = txResult.data;
        const transaction: StoreKitTransaction = {
          transactionId: tx.transactionId,
          productId: tx.productIdentifier || productId,
          purchaseDate: tx.originalStartDate || new Date().toISOString(),
          expiresDate: tx.expiryDate,
          originalTransactionId: tx.originalId || tx.transactionId,
          jwsRepresentation: undefined, // Plugin doesn't return JWS directly
        };
        
        const verified = await verifyAndSyncTransaction(transaction);
        
        if (verified) {
          return { success: true, transaction };
        } else {
          return { success: false, error: 'Transaction verification failed' };
        }
      }
      
      return { success: true };
    }
    
    // responseCode 3 = user cancelled
    if (result.responseCode === 3) {
      return { success: false, error: 'Purchase was cancelled' };
    }
    
    return { success: false, error: result.responseMessage || 'Purchase failed' };
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
    console.log('[StoreKit] Restoring purchases via getCurrentEntitlements...');
    const result = await Subscriptions.getCurrentEntitlements();
    console.log('[StoreKit] Entitlements result:', JSON.stringify(result));
    
    if (result.responseCode !== 0 || !result.data) {
      console.warn('[StoreKit] No entitlements found');
      return [];
    }
    
    const transactions: StoreKitTransaction[] = result.data.map((t: any) => ({
      transactionId: t.transactionId,
      productId: t.productIdentifier,
      purchaseDate: t.originalStartDate,
      expiresDate: t.expiryDate,
      originalTransactionId: t.originalId || t.transactionId,
      jwsRepresentation: undefined,
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
    // Check monthly subscription
    const monthlyResult = await Subscriptions.getLatestTransaction({ 
      productIdentifier: PRODUCT_IDS.PREMIUM_MONTHLY 
    });
    
    if (monthlyResult.responseCode === 0 && monthlyResult.data) {
      const tx = monthlyResult.data;
      return {
        transactionId: tx.transactionId,
        productId: tx.productIdentifier || PRODUCT_IDS.PREMIUM_MONTHLY,
        purchaseDate: tx.originalStartDate,
        expiresDate: tx.expiryDate,
        originalTransactionId: tx.originalId || tx.transactionId,
        jwsRepresentation: undefined,
      };
    }
    
    // Check yearly subscription
    const yearlyResult = await Subscriptions.getLatestTransaction({ 
      productIdentifier: PRODUCT_IDS.PREMIUM_YEARLY 
    });
    
    if (yearlyResult.responseCode === 0 && yearlyResult.data) {
      const tx = yearlyResult.data;
      return {
        transactionId: tx.transactionId,
        productId: tx.productIdentifier || PRODUCT_IDS.PREMIUM_YEARLY,
        purchaseDate: tx.originalStartDate,
        expiresDate: tx.expiryDate,
        originalTransactionId: tx.originalId || tx.transactionId,
        jwsRepresentation: undefined,
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
