import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  FlaskConical, 
  Target, 
  Pill, 
  Settings, 
  BarChart3,
  Search,
  Scan,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap
} from "lucide-react";
import { SUPPLEMENT_CONFIGURATIONS, PRIMARY_INTENTS, getSupplementsByIntent, type SupplementTypeConfig } from "@shared/supplementConfig";

// Default dosage recommendations for supplements
const DEFAULT_DOSAGES: Record<string, { amount: number; unit: string; frequency: string; timing: string }> = {
  'magnesium': { amount: 400, unit: 'mg', frequency: 'daily', timing: 'evening' },
  'vitamin-d3': { amount: 5000, unit: 'IU', frequency: 'daily', timing: 'morning' },
  'omega-3': { amount: 2000, unit: 'mg', frequency: 'daily', timing: 'morning' },
  'l-theanine': { amount: 200, unit: 'mg', frequency: 'daily', timing: 'morning' },
  'ashwagandha': { amount: 600, unit: 'mg', frequency: 'daily', timing: 'evening' },
  'creatine': { amount: 5, unit: 'g', frequency: 'daily', timing: 'anytime' },
  'melatonin': { amount: 3, unit: 'mg', frequency: 'daily', timing: 'evening' },
  'coq10': { amount: 200, unit: 'mg', frequency: 'daily', timing: 'morning' },
  'curcumin': { amount: 500, unit: 'mg', frequency: 'twice daily', timing: 'morning' },
  'berberine': { amount: 500, unit: 'mg', frequency: 'three times daily', timing: 'with meals' },
};

function getDefaultDosage(supplementId: string) {
  return DEFAULT_DOSAGES[supplementId] || { amount: 500, unit: 'mg', frequency: 'daily', timing: 'morning' };
}

type WizardStep = 'intent' | 'supplement' | 'product' | 'configuration' | 'review';

interface ProductInfo {
  name: string;
  brand?: string;
  barcode?: string;
  imageUrl?: string;
  strength?: string;
  servingSize?: string;
  dsldId?: string;
}

interface AssessmentConfig {
  intent: string;
  supplementTypeId: string;
  product: ProductInfo;
  dosageAmount: number;
  dosageUnit: string;
  dosageFrequency: string;
  dosageTiming: string;
  assessmentDays: number;
}

const STEPS: { id: WizardStep; label: string; icon: typeof Target }[] = [
  { id: 'intent', label: 'Goal', icon: Target },
  { id: 'supplement', label: 'Supplement', icon: Pill },
  { id: 'product', label: 'Product', icon: Search },
  { id: 'configuration', label: 'Setup', icon: Settings },
  { id: 'review', label: 'Review', icon: BarChart3 },
];

export default function NewAssessmentWizard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<WizardStep>('intent');
  const [config, setConfig] = useState<AssessmentConfig>({
    intent: '',
    supplementTypeId: '',
    product: { name: '' },
    dosageAmount: 0,
    dosageUnit: 'mg',
    dosageFrequency: 'daily',
    dosageTiming: 'morning',
    assessmentDays: 30,
  });
  const [productSearch, setProductSearch] = useState('');

  // Validate baseline data when supplement is selected
  const { data: baselineValidation, isLoading: isValidatingBaseline } = useQuery<{
    hasEnoughData: boolean;
    metrics: { metric: string; daysAvailable: number; daysRequired: number; sufficient: boolean }[];
  }>({
    queryKey: ['/api/n1/baseline/validate', config.supplementTypeId],
    enabled: !!config.supplementTypeId,
  });

  // Create assessment mutation
  const createAssessmentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/n1/experiments', {
        supplementTypeId: config.supplementTypeId,
        productName: config.product.name,
        productBrand: config.product.brand,
        productBarcode: config.product.barcode,
        productImageUrl: config.product.imageUrl,
        productStrength: config.product.strength,
        productServingSize: config.product.servingSize,
        productDsldId: config.product.dsldId,
        dosageAmount: config.dosageAmount,
        dosageUnit: config.dosageUnit,
        dosageFrequency: config.dosageFrequency,
        dosageTiming: config.dosageTiming,
        primaryIntent: config.intent,
        experimentDays: config.assessmentDays,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/n1/experiments'] });
      toast({
        title: "Assessment Created",
        description: "Your N-of-1 assessment has been set up. Ready to start!",
      });
      setLocation(`/assessments/${data.experiment.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create assessment",
        variant: "destructive",
      });
    },
  });

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const canProceed = () => {
    switch (currentStep) {
      case 'intent':
        return !!config.intent;
      case 'supplement':
        return !!config.supplementTypeId;
      case 'product':
        return !!config.product.name;
      case 'configuration':
        return config.dosageAmount > 0;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    } else {
      // Submit
      createAssessmentMutation.mutate();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].id);
    } else {
      setLocation('/actions');
    }
  };

  const selectedSupplementConfig = config.supplementTypeId 
    ? SUPPLEMENT_CONFIGURATIONS[config.supplementTypeId] 
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b bg-white/5 border-white/10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleBack}
              className="text-white/70 hover:text-white hover:bg-white/10"
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg text-white font-medium">New Assessment</h1>
              <p className="text-xs text-white/50">
                Step {currentStepIndex + 1} of {STEPS.length}: {STEPS[currentStepIndex].label}
              </p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-3">
            <Progress value={progress} className="h-1.5 bg-white/10" />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="overflow-y-auto px-4 py-6" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Step 1: Intent Selection */}
        {currentStep === 'intent' && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Target className="w-8 h-8 text-cyan-400" />
              </div>
              <h2 className="text-xl text-white font-semibold">What do you want to improve?</h2>
              <p className="text-sm text-white/60 mt-1">
                Select your primary health goal for this assessment
              </p>
            </div>
            
            <div className="grid gap-3">
              {PRIMARY_INTENTS.map((intent) => (
                <Card
                  key={intent.id}
                  className={`p-4 cursor-pointer transition-all ${
                    config.intent === intent.id
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                  onClick={() => setConfig({ ...config, intent: intent.id, supplementTypeId: '' })}
                  data-testid={`intent-${intent.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      config.intent === intent.id 
                        ? 'bg-cyan-500/30' 
                        : 'bg-white/10'
                    }`}>
                      <Zap className={`w-5 h-5 ${config.intent === intent.id ? 'text-cyan-400' : 'text-white/60'}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-medium">{intent.label}</h3>
                      <p className="text-xs text-white/50">{intent.description}</p>
                    </div>
                    {config.intent === intent.id && (
                      <Check className="w-5 h-5 text-cyan-400" />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Supplement Selection */}
        {currentStep === 'supplement' && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Pill className="w-8 h-8 text-cyan-400" />
              </div>
              <h2 className="text-xl text-white font-semibold">Choose a supplement</h2>
              <p className="text-sm text-white/60 mt-1">
                Recommended supplements for {PRIMARY_INTENTS.find(i => i.id === config.intent)?.label}
              </p>
            </div>
            
            <div className="grid gap-3">
              {getSupplementsByIntent(config.intent).map((supp) => {
                const defaultDosage = getDefaultDosage(supp.id);
                return (
                  <Card
                    key={supp.id}
                    className={`p-4 cursor-pointer transition-all ${
                      config.supplementTypeId === supp.id
                        ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-cyan-500/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                    onClick={() => setConfig({ 
                      ...config, 
                      supplementTypeId: supp.id,
                      dosageAmount: defaultDosage.amount,
                      dosageUnit: defaultDosage.unit,
                      dosageFrequency: defaultDosage.frequency,
                      dosageTiming: defaultDosage.timing,
                      assessmentDays: supp.recommendedDuration,
                    })}
                    data-testid={`supplement-${supp.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        config.supplementTypeId === supp.id 
                          ? 'bg-cyan-500/30' 
                          : 'bg-white/10'
                      }`}>
                        <FlaskConical className={`w-5 h-5 ${config.supplementTypeId === supp.id ? 'text-cyan-400' : 'text-white/60'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-medium">{supp.name}</h3>
                          {config.supplementTypeId === supp.id && (
                            <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-white/50 mt-0.5">{supp.protocolDescription}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge className="bg-white/10 text-white/70 border-0 text-xs">
                            {defaultDosage.amount}{defaultDosage.unit}
                          </Badge>
                          <Badge className="bg-white/10 text-white/70 border-0 text-xs">
                            {supp.recommendedDuration} days
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Product Details */}
        {currentStep === 'product' && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Search className="w-8 h-8 text-cyan-400" />
              </div>
              <h2 className="text-xl text-white font-semibold">Product Details</h2>
              <p className="text-sm text-white/60 mt-1">
                Enter the specific product you'll be testing
              </p>
            </div>

            {/* Barcode Scanner Button (placeholder) */}
            <Card className="p-4 bg-white/5 border-white/10 border-dashed">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Scan className="w-5 h-5 text-white/60" />
                </div>
                <div className="flex-1">
                  <p className="text-white/60 text-sm">Barcode scanning coming soon</p>
                  <p className="text-xs text-white/40">Enter product details manually below</p>
                </div>
              </div>
            </Card>

            {/* Manual Entry */}
            <div className="space-y-4 mt-4">
              <div>
                <Label className="text-white/70 text-sm">Product Name *</Label>
                <Input
                  value={config.product.name}
                  onChange={(e) => setConfig({ 
                    ...config, 
                    product: { ...config.product, name: e.target.value } 
                  })}
                  placeholder={`e.g., ${selectedSupplementConfig?.name || 'Supplement'} 500mg`}
                  className="mt-1 bg-white/5 border-white/20 text-white placeholder:text-white/30"
                  data-testid="input-product-name"
                />
              </div>
              
              <div>
                <Label className="text-white/70 text-sm">Brand (Optional)</Label>
                <Input
                  value={config.product.brand || ''}
                  onChange={(e) => setConfig({ 
                    ...config, 
                    product: { ...config.product, brand: e.target.value } 
                  })}
                  placeholder="e.g., Nature Made, NOW Foods"
                  className="mt-1 bg-white/5 border-white/20 text-white placeholder:text-white/30"
                  data-testid="input-product-brand"
                />
              </div>
              
              <div>
                <Label className="text-white/70 text-sm">Strength (Optional)</Label>
                <Input
                  value={config.product.strength || ''}
                  onChange={(e) => setConfig({ 
                    ...config, 
                    product: { ...config.product, strength: e.target.value } 
                  })}
                  placeholder="e.g., 500mg, 1000 IU"
                  className="mt-1 bg-white/5 border-white/20 text-white placeholder:text-white/30"
                  data-testid="input-product-strength"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Configuration */}
        {currentStep === 'configuration' && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <Settings className="w-8 h-8 text-cyan-400" />
              </div>
              <h2 className="text-xl text-white font-semibold">Experiment Setup</h2>
              <p className="text-sm text-white/60 mt-1">
                Configure your dosage and experiment duration
              </p>
            </div>

            {/* Dosage Settings */}
            <Card className="p-4 bg-white/5 border-white/10">
              <h3 className="text-white font-medium mb-3">Dosage</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white/70 text-xs">Amount</Label>
                  <Input
                    type="number"
                    value={config.dosageAmount}
                    onChange={(e) => setConfig({ ...config, dosageAmount: parseFloat(e.target.value) || 0 })}
                    className="mt-1 bg-white/5 border-white/20 text-white"
                    data-testid="input-dosage-amount"
                  />
                </div>
                <div>
                  <Label className="text-white/70 text-xs">Unit</Label>
                  <Input
                    value={config.dosageUnit}
                    onChange={(e) => setConfig({ ...config, dosageUnit: e.target.value })}
                    className="mt-1 bg-white/5 border-white/20 text-white"
                    data-testid="input-dosage-unit"
                  />
                </div>
              </div>
              
              <div className="mt-3">
                <Label className="text-white/70 text-xs">Timing</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {['morning', 'afternoon', 'evening'].map((timing) => (
                    <Button
                      key={timing}
                      variant="outline"
                      size="sm"
                      className={`capitalize ${
                        config.dosageTiming === timing
                          ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                          : 'bg-white/5 border-white/20 text-white/70'
                      }`}
                      onClick={() => setConfig({ ...config, dosageTiming: timing })}
                      data-testid={`timing-${timing}`}
                    >
                      {timing}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>

            {/* Duration */}
            <Card className="p-4 bg-white/5 border-white/10">
              <h3 className="text-white font-medium mb-3">Assessment Duration</h3>
              <div className="grid grid-cols-3 gap-2">
                {[21, 30, 45].map((days) => (
                  <Button
                    key={days}
                    variant="outline"
                    className={`${
                      config.assessmentDays === days
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'bg-white/5 border-white/20 text-white/70'
                    }`}
                    onClick={() => setConfig({ ...config, assessmentDays: days })}
                    data-testid={`duration-${days}`}
                  >
                    {days} days
                  </Button>
                ))}
              </div>
            </Card>

            {/* Baseline Data Status */}
            <Card className="p-4 bg-white/5 border-white/10">
              <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Baseline Data Status
              </h3>
              
              {isValidatingBaseline ? (
                <div className="flex items-center gap-2 text-white/60">
                  <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-cyan-400 rounded-full" />
                  <span className="text-sm">Checking your data...</span>
                </div>
              ) : baselineValidation ? (
                <div className="space-y-2">
                  {baselineValidation.hasEnoughData ? (
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">Ready! You have enough baseline data.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-yellow-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">We'll use retroactive baseline from your history.</span>
                    </div>
                  )}
                  
                  <div className="space-y-1 mt-2">
                    {baselineValidation.metrics.slice(0, 3).map((metric) => (
                      <div key={metric.metric} className="flex items-center justify-between text-xs">
                        <span className="text-white/60">{metric.metric}</span>
                        <span className={metric.sufficient ? 'text-green-400' : 'text-white/40'}>
                          {metric.daysAvailable}/{metric.daysRequired} days
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
        )}

        {/* Step 5: Review */}
        {currentStep === 'review' && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <FlaskConical className="w-8 h-8 text-cyan-400" />
              </div>
              <h2 className="text-xl text-white font-semibold">Review Your Assessment</h2>
              <p className="text-sm text-white/60 mt-1">
                Confirm the details before starting
              </p>
            </div>

            {/* Baseline Status Card - Prominent */}
            <Card className={`p-4 border ${
              baselineValidation?.hasEnoughData 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-yellow-500/10 border-yellow-500/30'
            }`}>
              <div className="flex items-start gap-3">
                {baselineValidation?.hasEnoughData ? (
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className={`font-medium ${baselineValidation?.hasEnoughData ? 'text-green-400' : 'text-yellow-400'}`}>
                    {baselineValidation?.hasEnoughData 
                      ? 'Baseline Data Ready' 
                      : 'Retroactive Baseline Mode'
                    }
                  </h4>
                  <p className="text-sm text-white/60 mt-1">
                    {baselineValidation?.hasEnoughData 
                      ? 'You have sufficient historical data for accurate comparison.' 
                      : 'We\'ll use your last 30 days of health data as baseline. This is valid but more data gives more reliable results.'
                    }
                  </p>
                  {baselineValidation?.metrics && baselineValidation.metrics.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {baselineValidation.metrics.slice(0, 3).map((metric) => (
                        <div key={metric.metric} className="flex items-center justify-between text-xs">
                          <span className="text-white/50">{metric.metric}</span>
                          <Badge className={`text-xs border-0 ${
                            metric.sufficient 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-white/10 text-white/50'
                          }`}>
                            {metric.daysAvailable}/{metric.daysRequired} days
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-white/5 border-white/10">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Goal</span>
                  <span className="text-white font-medium">
                    {PRIMARY_INTENTS.find(i => i.id === config.intent)?.label}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Supplement</span>
                  <span className="text-white font-medium">
                    {selectedSupplementConfig?.name}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Product</span>
                  <span className="text-white font-medium">{config.product.name}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Dosage</span>
                  <span className="text-white font-medium">
                    {config.dosageAmount}{config.dosageUnit} ({config.dosageTiming})
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-sm">Duration</span>
                  <span className="text-white font-medium">{config.assessmentDays} days</span>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
              <div className="flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-white font-medium">How We Calculate Results</h4>
                  <p className="text-sm text-white/60 mt-1">
                    We use Cohen's d effect size: (Average During - Average Before) / Standard Deviation.
                    A score above 0.8 indicates strong evidence, 0.2-0.8 is moderate, below 0.2 suggests no effect.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 border-t bg-slate-900/95 backdrop-blur border-white/10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
        <Button
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
          size="lg"
          disabled={!canProceed() || createAssessmentMutation.isPending}
          onClick={handleNext}
          data-testid="button-next"
        >
          {createAssessmentMutation.isPending ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
              Creating...
            </div>
          ) : currentStep === 'review' ? (
            <>
              <FlaskConical className="w-4 h-4 mr-2" />
              Start Assessment
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </footer>
    </div>
  );
}
