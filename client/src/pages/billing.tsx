import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, Sparkles, CreditCard, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { usePlan, useAvailablePlans } from '@/hooks/usePlan';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { isApplePayAvailable, payWithApplePay, isNativePlatform, getPlatform } from '@/lib/stripe-native';

export default function BillingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [canUseApplePay, setCanUseApplePay] = useState(false);
  const [isProcessingApplePay, setIsProcessingApplePay] = useState(false);

  useEffect(() => {
    async function checkApplePay() {
      const isNative = await isNativePlatform();
      const platform = await getPlatform();
      if (isNative && platform === 'ios') {
        const available = await isApplePayAvailable();
        setCanUseApplePay(available);
        console.log('[Billing] Apple Pay available:', available);
      }
    }
    checkApplePay();
  }, []);
  
  const { data: planData, isLoading: planLoading } = usePlan();
  const { data: availablePlansData, isLoading: plansLoading } = useAvailablePlans();

  const createCheckoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ priceId }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: any) => {
      const errorMessage = error.message || 'Failed to create checkout session';
      const isConfigError = errorMessage.includes('No such price');
      
      toast({
        title: 'Checkout Failed',
        description: isConfigError 
          ? 'Billing system is not configured yet. Please contact support at support@get-flo.com'
          : errorMessage,
        variant: 'destructive',
      });
    },
  });

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

  const handleApplePaySubscription = async (priceId: string, amount: number) => {
    setIsProcessingApplePay(true);
    try {
      const label = selectedPeriod === 'monthly' ? 'Flō Premium (Monthly)' : 'Flō Premium (Annual)';
      const result = await payWithApplePay(priceId, amount, label);
      
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['/api/billing/plan'] });
        toast({
          title: 'Welcome to Premium!',
          description: 'Your subscription is now active.',
        });
        setLocation('/');
      } else {
        toast({
          title: 'Payment Failed',
          description: result.error || 'Apple Pay payment was not completed',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Payment Error',
        description: error.message || 'An error occurred during payment',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingApplePay(false);
    }
  };

  if (planLoading || plansLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" data-testid="loading-spinner" />
      </div>
    );
  }

  const currentPlan = planData?.plan;
  const isPremium = currentPlan?.id === 'premium';
  const premiumPlan = availablePlansData?.plans?.premium;
  const premiumPricing = availablePlansData?.pricing?.premium;

  const monthlyPrice = premiumPricing?.monthly?.amount || 999;
  const annualPrice = premiumPricing?.annual?.amount || 11000;
  const annualMonthly = Math.floor(annualPrice / 12);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white pb-8">
      {/* Header */}
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
        {/* Current Plan */}
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
                  label="Flō Oracle Chat"
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
              <div className="pt-4 border-t border-white/10">
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
                      Cancelling...
                    </>
                  ) : (
                    'Cancel Subscription'
                  )}
                </Button>
                <p className="text-xs text-white/50 mt-2 text-center">
                  Access continues until end of billing period
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upgrade to Premium */}
        {!isPremium && premiumPlan && (
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

            {/* Billing Period Toggle */}
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
                <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-300 border-green-500/30">Save {Math.floor((1 - annualMonthly / monthlyPrice) * 100)}%</Badge>
              </Button>
            </div>

            {/* Premium Plan Card */}
            <Card className="backdrop-blur-xl bg-white/5 border-white/10" data-testid="card-premium-plan">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Sparkles className="w-5 h-5 text-blue-400" />
                    Premium
                  </CardTitle>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white" data-testid="text-price">
                      ${selectedPeriod === 'monthly' ? (monthlyPrice / 100).toFixed(2) : (annualMonthly / 100).toFixed(2)}
                    </div>
                    <div className="text-xs text-white/60">
                      per month{selectedPeriod === 'annual' && ', billed annually'}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <PremiumFeature text="Unlimited lab report uploads" />
                  <PremiumFeature text="View all biomarkers (unlimited)" />
                  <PremiumFeature text="Flō Oracle AI health coach (200 msgs/day)" />
                  <PremiumFeature text="AI-generated insight cards" />
                  <PremiumFeature text="Flōmentum daily momentum scoring" />
                  <PremiumFeature text="RAG-powered pattern detection" />
                  <PremiumFeature text="Advanced health analytics" />
                </div>
              </CardContent>
              <CardFooter className="flex-col gap-3">
                {canUseApplePay && (
                  <Button
                    className="w-full gap-2 bg-black hover:bg-gray-900 text-white"
                    size="lg"
                    onClick={() => {
                      const priceId = selectedPeriod === 'monthly'
                        ? premiumPricing?.monthly?.stripePriceId
                        : premiumPricing?.annual?.stripePriceId;
                      const amount = selectedPeriod === 'monthly' ? monthlyPrice : annualPrice;
                      if (priceId) {
                        handleApplePaySubscription(priceId, amount);
                      }
                    }}
                    disabled={isProcessingApplePay}
                    data-testid="button-apple-pay"
                  >
                    {isProcessingApplePay ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="mr-1">
                          <path d="M20.5 8.5c-.8 0-1.5-.3-2.1-.8-.5-.5-.9-1.3-.9-2.2 0-.1 0-.2.1-.2.1 0 .2 0 .2.1 1.1.4 2 1.5 2 2.8 0 .1 0 .2-.1.2-.1.1-.1.1-.2.1zm3.9 1.8c-1.2 0-2.1.6-2.8.6-.7 0-1.8-.6-3-.6-1.5 0-2.9.9-3.7 2.3-1.5 2.7-.4 6.6 1.1 8.8.7 1.1 1.6 2.3 2.7 2.3 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.9.7 1.2 0 1.9-1.1 2.6-2.2.8-1.3 1.1-2.5 1.1-2.6 0 0-2.2-.8-2.2-3.2 0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3.1-1.6l-.2-.6z" fill="white"/>
                          <text x="16" y="27" fill="white" fontSize="8" fontWeight="600" textAnchor="middle" fontFamily="system-ui, -apple-system">Pay</text>
                        </svg>
                        Pay with Apple Pay
                      </>
                    )}
                  </Button>
                )}
                <Button
                  className={`w-full gap-2 ${canUseApplePay ? 'bg-slate-700 hover:bg-slate-600' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                  size="lg"
                  onClick={() => {
                    const priceId = selectedPeriod === 'monthly'
                      ? premiumPricing?.monthly?.stripePriceId
                      : premiumPricing?.annual?.stripePriceId;
                    if (priceId) {
                      createCheckoutMutation.mutate(priceId);
                    }
                  }}
                  disabled={createCheckoutMutation.isPending}
                  data-testid="button-subscribe"
                >
                  {createCheckoutMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Redirecting to checkout...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      {canUseApplePay ? 'Or Pay with Card' : 'Subscribe Now'}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </>
        )}

        {/* Help */}
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
              Subscriptions auto-renew. Cancel anytime before next billing period.
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
