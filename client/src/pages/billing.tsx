import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, ArrowLeft, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { usePlan } from '@/hooks/usePlan';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  isStoreKitAvailable,
  getProducts,
  purchaseSubscription,
  restorePurchases,
  PRODUCT_IDS,
  type StoreKitProduct,
} from '@/lib/storekit';

interface ProductPricing {
  monthly: StoreKitProduct | null;
  yearly: StoreKitProduct | null;
  isLoading: boolean;
  error: string | null;
}

export default function BillingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [storeKitReady, setStoreKitReady] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pricing, setPricing] = useState<ProductPricing>({
    monthly: null,
    yearly: null,
    isLoading: true,
    error: null,
  });

  const loadProducts = async () => {
    console.log('[Billing] loadProducts() starting...');
    setPricing(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('[Billing] Calling isStoreKitAvailable()...');
      const available = await isStoreKitAvailable();
      console.log('[Billing] StoreKit available:', available);
      setStoreKitReady(available);
      
      if (available) {
        const products = await getProducts([
          PRODUCT_IDS.PREMIUM_MONTHLY,
          PRODUCT_IDS.PREMIUM_YEARLY,
        ]);
        
        console.log('[Billing] Products fetched:', products);
        
        const monthlyProduct = products.find(p => p.productId === PRODUCT_IDS.PREMIUM_MONTHLY) || null;
        const yearlyProduct = products.find(p => p.productId === PRODUCT_IDS.PREMIUM_YEARLY) || null;
        
        if (!monthlyProduct && !yearlyProduct) {
          setPricing({
            monthly: null,
            yearly: null,
            isLoading: false,
            error: 'Subscription products are not available yet. Please check back later.',
          });
        } else {
          setPricing({
            monthly: monthlyProduct,
            yearly: yearlyProduct,
            isLoading: false,
            error: null,
          });
        }
      } else {
        setPricing({
          monthly: null,
          yearly: null,
          isLoading: false,
          error: 'This app requires iOS to manage subscriptions through the App Store.',
        });
      }
    } catch (error: any) {
      console.error('[Billing] Init error:', error);
      setPricing({
        monthly: null,
        yearly: null,
        isLoading: false,
        error: error.message || 'Failed to load pricing. Please try again.',
      });
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const { data: planData, isLoading: planLoading } = usePlan();

  const handlePurchase = async () => {
    const productId = selectedPeriod === 'monthly' 
      ? PRODUCT_IDS.PREMIUM_MONTHLY 
      : PRODUCT_IDS.PREMIUM_YEARLY;
    
    setIsPurchasing(true);
    try {
      console.log('[Billing] Starting purchase for:', productId);
      const result = await purchaseSubscription(productId);
      
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['/api/billing/plan'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        toast({
          title: 'Welcome to Premium!',
          description: 'Your subscription is now active. Enjoy unlimited access!',
        });
        setLocation('/');
      } else {
        if (result.error !== 'Purchase was cancelled') {
          toast({
            title: 'Purchase Failed',
            description: result.error || 'Unable to complete purchase. Please try again.',
            variant: 'destructive',
          });
        }
      }
    } catch (error: any) {
      toast({
        title: 'Purchase Error',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      console.log('[Billing] Restoring purchases...');
      const transactions = await restorePurchases();
      
      if (transactions.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/billing/plan'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user'] });
        toast({
          title: 'Purchases Restored',
          description: 'Your previous purchases have been restored.',
        });
      } else {
        toast({
          title: 'No Purchases Found',
          description: 'No previous purchases were found to restore.',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Restore Failed',
        description: error.message || 'Unable to restore purchases',
        variant: 'destructive',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/billing/cancel-subscription', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to cancel subscription');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/billing/plan'] });
      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription has been cancelled successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Cancellation Failed',
        description: error.message || 'Failed to cancel subscription',
        variant: 'destructive',
      });
    },
  });

  if (planLoading || pricing.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-white" data-testid="loading-spinner" />
          <p className="text-white/70 text-sm">Loading subscription options...</p>
        </div>
      </div>
    );
  }

  if (pricing.error && !pricing.monthly && !pricing.yearly) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/5 border-b border-white/10">
          <div className="px-4 py-3 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              data-testid="button-back-error"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Subscription</h1>
            </div>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center px-6 py-20 gap-6">
          <AlertCircle className="w-12 h-12 text-amber-400" />
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">Unable to Load Products</h2>
            <p className="text-white/70 text-sm max-w-xs">{pricing.error}</p>
          </div>
          <Button 
            onClick={loadProducts}
            className="gap-2"
            data-testid="button-retry-products"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const currentPlan = planData?.plan;
  const isPremium = currentPlan?.id === 'premium';
  
  const selectedProduct = selectedPeriod === 'monthly' ? pricing.monthly : pricing.yearly;
  const monthlyProduct = pricing.monthly;
  const yearlyProduct = pricing.yearly;
  
  const monthlyCost = monthlyProduct?.price || 0;
  const yearlyCost = yearlyProduct?.price || 0;
  const yearlyMonthlyCost = yearlyCost / 12;
  const savings = monthlyCost > 0 ? Math.floor((1 - yearlyMonthlyCost / monthlyCost) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white pb-8">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/5 border-b border-white/10">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Subscription</h1>
            <p className="text-xs text-white/50">Manage your plan</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-6">
        <Card className="backdrop-blur-xl bg-white/5 border-white/10" data-testid="card-current-plan">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">Current Plan</CardTitle>
              <Badge variant={isPremium ? "default" : "secondary"} data-testid="badge-plan-type">
                {currentPlan?.displayName || 'Free'}
              </Badge>
            </div>
            <CardDescription className="text-white/70">
              {isPremium
                ? 'You have full access to all features'
                : 'Limited features - upgrade to unlock more'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-white mb-2">Features:</p>
              <div className="space-y-2">
                <FeatureItem
                  label="Lab Reports"
                  value={
                    currentPlan?.features?.labs?.allowUnlimitedLabUploads
                      ? 'Unlimited'
                      : `${currentPlan?.limits?.maxLabUploadsPerUser || 0} max`
                  }
                  unlimited={currentPlan?.features?.labs?.allowUnlimitedLabUploads}
                />
                <FeatureItem
                  label="Biomarkers"
                  value={
                    currentPlan?.features?.biomarkers?.allowUnlimitedBiomarkerDisplay
                      ? 'Unlimited'
                      : `${currentPlan?.limits?.maxVisibleBiomarkersPerUser || 0} visible`
                  }
                  unlimited={currentPlan?.features?.biomarkers?.allowUnlimitedBiomarkerDisplay}
                />
                <FeatureItem
                  label="Flō Chat"
                  value={
                    currentPlan?.features?.oracle?.allowOracleChat
                      ? currentPlan?.features?.oracle?.allowUnlimitedOracleMessages
                        ? 'Unlimited'
                        : `${currentPlan?.limits?.maxDailyOracleMessages || 0}/day`
                      : 'Not available'
                  }
                  unlimited={currentPlan?.features?.oracle?.allowOracleChat}
                />
                <FeatureItem
                  label="AI Insights"
                  value={currentPlan?.features?.insights?.allowAiGeneratedInsightCards ? 'Enabled' : 'Not available'}
                  unlimited={currentPlan?.features?.insights?.allowAiGeneratedInsightCards}
                />
                <FeatureItem
                  label="Flōmentum Scoring"
                  value={currentPlan?.features?.flomentum?.allowFlomentumScoring ? 'Enabled' : 'Not available'}
                  unlimited={currentPlan?.features?.flomentum?.allowFlomentumScoring}
                />
              </div>
            </div>

            {isPremium && (
              <div className="pt-4 border-t border-white/10 space-y-3">
                <p className="text-xs text-white/50 text-center">
                  To manage your subscription, go to Settings &gt; Apple ID &gt; Subscriptions on your device
                </p>
                <Button
                  variant="outline"
                  onClick={() => cancelSubscriptionMutation.mutate()}
                  disabled={cancelSubscriptionMutation.isPending}
                  data-testid="button-cancel-subscription"
                  className="w-full border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                >
                  {cancelSubscriptionMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Cancel Subscription'
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {!isPremium && (
          <>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Upgrade to Premium
              </h2>
              <p className="text-sm text-white/70">
                Unlock the full power of Flō with unlimited features
              </p>
            </div>

            {pricing.error ? (
              <Card className="backdrop-blur-xl bg-white/5 border-white/10" data-testid="card-error">
                <CardContent className="py-8 text-center">
                  <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                  <p className="text-white/70 mb-4">{pricing.error}</p>
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                    className="border-white/10"
                  >
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {monthlyProduct && yearlyProduct && (
                  <div className="flex items-center justify-center gap-2 p-1 backdrop-blur-xl bg-slate-800/50 rounded-xl border border-white/10" data-testid="toggle-billing-period">
                    <Button
                      variant={selectedPeriod === 'monthly' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedPeriod('monthly')}
                      className={selectedPeriod === 'monthly' ? 'flex-1 bg-blue-600 hover:bg-blue-700' : 'flex-1 text-white/70 hover:text-white hover:bg-white/5'}
                      data-testid="button-monthly"
                    >
                      Monthly
                    </Button>
                    <Button
                      variant={selectedPeriod === 'annual' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedPeriod('annual')}
                      className={selectedPeriod === 'annual' ? 'flex-1 gap-1 bg-blue-600 hover:bg-blue-700' : 'flex-1 gap-1 text-white/70 hover:text-white hover:bg-white/5'}
                      data-testid="button-annual"
                    >
                      Annual
                      {savings > 0 && (
                        <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-300 border-green-500/30">
                          Save {savings}%
                        </Badge>
                      )}
                    </Button>
                  </div>
                )}

                <Card className="backdrop-blur-xl bg-white/5 border-white/10" data-testid="card-premium-plan">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-white">
                        <Sparkles className="w-5 h-5 text-blue-400" />
                        Premium
                      </CardTitle>
                      <div className="text-right">
                        {selectedProduct ? (
                          <>
                            <div className="text-2xl font-bold text-white" data-testid="text-price">
                              {selectedProduct.displayPrice}
                            </div>
                            <div className="text-xs text-white/60">
                              {selectedPeriod === 'monthly' ? 'per month' : 'per year'}
                            </div>
                          </>
                        ) : (
                          <div className="text-white/50">Loading price...</div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <PremiumFeature text="Unlimited lab report uploads" />
                      <PremiumFeature text="View all biomarkers (unlimited)" />
                      <PremiumFeature text="Flō AI health coach (200 msgs/day)" />
                      <PremiumFeature text="AI-generated insight cards" />
                      <PremiumFeature text="Flōmentum daily momentum scoring" />
                      <PremiumFeature text="RAG-powered pattern detection" />
                      <PremiumFeature text="Advanced health analytics" />
                    </div>
                  </CardContent>
                  <CardFooter className="flex-col gap-3">
                    <Button
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      size="lg"
                      onClick={handlePurchase}
                      disabled={isPurchasing || !selectedProduct}
                      data-testid="button-subscribe"
                    >
                      {isPurchasing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Subscribe Now
                        </>
                      )}
                    </Button>
                    
                    <Button
                      variant="ghost"
                      className="w-full text-white/60 hover:text-white"
                      onClick={handleRestore}
                      disabled={isRestoring}
                      data-testid="button-restore"
                    >
                      {isRestoring ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Restoring...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Restore Purchases
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </>
            )}
          </>
        )}

        <Card className="backdrop-blur-xl bg-white/5 border-white/10" data-testid="card-help">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-white">
              <AlertCircle className="w-4 h-4" />
              Need Help?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-white/70 space-y-2">
            <p>
              Questions about billing? Contact us at support@get-flo.com
            </p>
            <p className="text-xs text-white/50">
              Subscriptions are billed through the App Store and auto-renew. 
              Manage your subscription in iOS Settings &gt; Apple ID &gt; Subscriptions.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function FeatureItem({ label, value, unlimited }: { label: string; value: string; unlimited?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm" data-testid={`feature-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <span className="text-white/60">{label}</span>
      <span className={unlimited ? 'text-blue-400 font-medium' : 'text-white'}>{value}</span>
    </div>
  );
}

function PremiumFeature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2" data-testid={`premium-feature-${text.toLowerCase().replace(/\s+/g, '-').substring(0, 20)}`}>
      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
      <span className="text-sm text-white/80">{text}</span>
    </div>
  );
}
