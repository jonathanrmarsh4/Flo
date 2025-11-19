import { useState } from 'react';
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

export default function BillingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'annual'>('monthly');
  
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
      if (!res.ok) throw new Error('Failed to create checkout session');
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Checkout Failed',
        description: error.message || 'Failed to create checkout session',
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

  const monthlyPrice = premiumPricing?.monthly?.amount || 1999;
  const annualPrice = premiumPricing?.annual?.amount || 19999;
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
        <Card data-testid="card-current-plan">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Current Plan</CardTitle>
              <Badge variant={isPremium ? "default" : "secondary"} data-testid="badge-plan-type">
                {currentPlan?.displayName || 'Free'}
              </Badge>
            </div>
            <CardDescription>
              {isPremium
                ? 'You have full access to all features'
                : 'Limited features - upgrade to unlock more'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Features:</p>
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
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => cancelSubscriptionMutation.mutate()}
                  disabled={cancelSubscriptionMutation.isPending}
                  data-testid="button-cancel-subscription"
                  className="w-full"
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
                <p className="text-xs text-muted-foreground mt-2 text-center">
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
            <div className="flex items-center justify-center gap-2 p-1 bg-white/5 rounded-lg" data-testid="toggle-billing-period">
              <Button
                variant={selectedPeriod === 'monthly' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedPeriod('monthly')}
                className="flex-1"
                data-testid="button-monthly"
              >
                Monthly
              </Button>
              <Button
                variant={selectedPeriod === 'annual' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedPeriod('annual')}
                className="flex-1 gap-1"
                data-testid="button-annual"
              >
                Annual
                <Badge variant="secondary" className="text-xs">Save {Math.floor((1 - annualMonthly / monthlyPrice) * 100)}%</Badge>
              </Button>
            </div>

            {/* Premium Plan Card */}
            <Card className="border-primary/50" data-testid="card-premium-plan">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Premium
                  </CardTitle>
                  <div className="text-right">
                    <div className="text-2xl font-bold" data-testid="text-price">
                      ${selectedPeriod === 'monthly' ? (monthlyPrice / 100).toFixed(2) : (annualMonthly / 100).toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
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
              <CardFooter>
                <Button
                  className="w-full gap-2"
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
                      Subscribe Now
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </>
        )}

        {/* Help */}
        <Card data-testid="card-help">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Need Help?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Questions about billing? Contact us at support@get-flo.com
            </p>
            <p className="text-xs">
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
      <span className="text-muted-foreground">{label}</span>
      <span className={unlimited ? 'text-primary font-medium' : 'text-foreground'}>{value}</span>
    </div>
  );
}

function PremiumFeature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2" data-testid={`premium-feature-${text.toLowerCase().replace(/\s+/g, '-').substring(0, 20)}`}>
      <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
