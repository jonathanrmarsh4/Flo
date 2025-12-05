import { Capacitor } from '@capacitor/core';
import { Subscriptions as SubscriptionsPlugin } from '@squareetlabs/capacitor-subscriptions';
import { getAuthHeaders, getApiBaseUrl } from '@/lib/queryClient';

// Cast as any to avoid TypeScript type mismatches with native bridge
const Subscriptions = SubscriptionsPlugin as any;

console.log('[StoreKit] Module loaded, Subscriptions:', typeof Subscriptions);

// Helper function to extract currency code from a formatted price string
function extractCurrencyFromPrice(priceString: string): string {
  // Common currency symbol to code mappings
  const symbolToCode: Record<string, string> = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    'A$': 'AUD',
    'AU$': 'AUD',
    'C$': 'CAD',
    'CA$': 'CAD',
    'NZ$': 'NZD',
    'HK$': 'HKD',
    'S$': 'SGD',
    'R$': 'BRL',
    '₹': 'INR',
    '₩': 'KRW',
    '₽': 'RUB',
    'kr': 'SEK', // Could be SEK, NOK, DKK - default to SEK
    'CHF': 'CHF',
    'zł': 'PLN',
    'Kč': 'CZK',
    'Ft': 'HUF',
    '฿': 'THB',
    'RM': 'MYR',
    '₱': 'PHP',
    '₫': 'VND',
    '₪': 'ILS',
    'R': 'ZAR',
    'Mex$': 'MXN',
  };
  
  // Check for multi-character prefixes first (A$, C$, etc.)
  for (const [symbol, code] of Object.entries(symbolToCode)) {
    if (symbol.length > 1 && priceString.startsWith(symbol)) {
      return code;
    }
  }
  
  // Check for single character symbols
  const firstChar = priceString.charAt(0);
  if (symbolToCode[firstChar]) {
    return symbolToCode[firstChar];
  }
  
  // Default to USD if we can't determine
  return 'USD';
}

export interface StoreKitProduct {
  productId: string;
  displayName: string;
  description: string;
  price: number;
  priceLocale: string;
  currencyCode: string;
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
        
        // Log full product response to debug currency/locale fields
        console.log('[StoreKit] Full product data:', JSON.stringify(product, null, 2));
        
        // The plugin returns localized price as a formatted string (e.g., "$9.99", "A$12.99", "€8.99")
        // Some locales use comma as decimal separator (e.g., "8,99 €" in Germany)
        const priceString = product.price || product.localizedPrice || product.displayPrice || '0';
        
        // Try to get numeric price from plugin's numeric fields first (more reliable)
        // Then fall back to parsing the formatted string
        let numericPrice: number;
        if (typeof product.priceAmountMicros === 'number') {
          // micros = price * 1,000,000 (common in StoreKit/Google Play)
          numericPrice = product.priceAmountMicros / 1000000;
        } else if (typeof product.priceValue === 'number') {
          numericPrice = product.priceValue;
        } else if (typeof product.amount === 'number') {
          numericPrice = product.amount;
        } else {
          // Parse from string - handle both dot and comma decimals
          // Remove thousands separators (spaces, commas in US format, dots in EU format for thousands)
          // Then normalize comma decimal to dot
          let cleanPrice = priceString.replace(/[^\d.,]/g, ''); // Keep only digits, dots, commas
          
          // Determine if comma is decimal separator (e.g., "8,99") or thousands (e.g., "1,000.99")
          const lastComma = cleanPrice.lastIndexOf(',');
          const lastDot = cleanPrice.lastIndexOf('.');
          
          if (lastComma > lastDot && cleanPrice.length - lastComma <= 3) {
            // Comma appears to be the decimal separator (e.g., "8,99" or "1.000,99")
            cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
          } else if (lastDot > lastComma && cleanPrice.length - lastDot <= 3) {
            // Dot is decimal separator (e.g., "8.99" or "1,000.99")
            cleanPrice = cleanPrice.replace(/,/g, '');
          } else {
            // No decimal portion found, just remove all non-digits
            cleanPrice = cleanPrice.replace(/[^\d]/g, '');
          }
          
          numericPrice = parseFloat(cleanPrice) || 0;
        }
        
        // Try to get currency code from the product data
        // Different plugins may return this in different fields
        const currencyCode = product.currencyCode || 
                            product.currency || 
                            product.priceLocale?.currencyCode ||
                            extractCurrencyFromPrice(priceString);
        
        // The displayPrice should be the fully localized string from App Store
        // This already includes the correct currency symbol and formatting for the user's region
        const displayPrice = product.price || product.localizedPrice || product.displayPrice || `$${numericPrice.toFixed(2)}`;
        
        products.push({
          productId: product.productIdentifier,
          displayName: product.displayName || product.productIdentifier,
          description: product.description || '',
          price: numericPrice,
          priceLocale: product.priceLocale || product.locale || 'en_US',
          currencyCode: currencyCode,
          displayPrice: displayPrice,
          subscriptionPeriod: product.subscriptionPeriod || undefined,
        });
        console.log('[StoreKit] Added product:', product.displayName, 'displayPrice:', displayPrice, 'currency:', currencyCode);
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
    
    // Get auth headers (includes JWT for mobile or session for web)
    const authHeaders = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const baseUrl = getApiBaseUrl();
    
    console.log('[StoreKit] Using auth headers:', Object.keys(authHeaders));
    
    const response = await fetch(`${baseUrl}/api/billing/verify-app-store`, {
      method: 'POST',
      headers: authHeaders,
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
