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
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
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
  Camera,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Loader2
} from "lucide-react";
import { SUPPLEMENT_CONFIGURATIONS, PRIMARY_INTENTS, getSupplementsByIntent, type SupplementTypeConfig } from "@shared/supplementConfig";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Ban } from "lucide-react";

// DSLD API response types
interface DSLDProduct {
  id: string;
  productName: string;
  brandName: string;
  servingSize?: string;
  upc?: string;
  ingredients: Array<{
    ingredientName: string;
    amount?: number;
    unit?: string;
  }>;
}

interface BarcodeLookupResponse {
  product: DSLDProduct;
  detectedSupplementType: string | null;
  primaryIngredient: {
    ingredientName: string;
    amount?: number;
    unit?: string;
  } | null;
}

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
  const { isAvailable: isCameraAvailable, isSupported: isScannerSupported, scanBarcode } = useBarcodeScanner();
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
  const [barcodeInput, setBarcodeInput] = useState('');
  const [showBarcodeInput, setShowBarcodeInput] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Barcode lookup mutation - uses variables parameter in onSuccess to avoid closure issues
  const barcodeLookupMutation = useMutation({
    mutationFn: async (barcode: string) => {
      const response = await fetch(`/api/n1/dsld/barcode/${encodeURIComponent(barcode)}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Product not found' }));
        throw new Error(error.error || 'Product not found');
      }
      return response.json() as Promise<BarcodeLookupResponse>;
    },
    onSuccess: (data, scannedBarcode) => {
      // Determine dosage from ingredient or fall back to defaults
      // Use getDefaultDosage for universal fallback to ensure we always have valid dosage values
      const fallbackDefaults = getDefaultDosage(data.detectedSupplementType || '');
      let dosageAmount = fallbackDefaults.amount;
      let dosageUnit = fallbackDefaults.unit;
      let dosageFrequency = fallbackDefaults.frequency;
      let dosageTiming = fallbackDefaults.timing;
      
      // Override with primary ingredient if available
      if (data.primaryIngredient?.amount) {
        dosageAmount = data.primaryIngredient.amount;
        dosageUnit = data.primaryIngredient.unit || 'mg';
      } else if (data.detectedSupplementType && DEFAULT_DOSAGES[data.detectedSupplementType]) {
        // Use supplement-specific defaults if available
        const defaults = DEFAULT_DOSAGES[data.detectedSupplementType];
        dosageAmount = defaults.amount;
        dosageUnit = defaults.unit;
        dosageFrequency = defaults.frequency;
        dosageTiming = defaults.timing;
      }

      // If a supplement type was detected, get its configuration
      const detectedSupp = data.detectedSupplementType 
        ? SUPPLEMENT_CONFIGURATIONS[data.detectedSupplementType] 
        : null;

      // Full state reset with new values - replaces all relevant fields
      // Use scannedBarcode from mutation variables to avoid closure issues with camera scans
      setConfig(prev => ({
        ...prev,
        // Reset supplement selection if detected type changed
        supplementTypeId: data.detectedSupplementType || '',
        // Auto-populate product fields
        product: {
          name: data.product.productName,
          brand: data.product.brandName,
          barcode: data.product.upc || scannedBarcode,
          servingSize: data.product.servingSize,
          dsldId: data.product.id,
          strength: data.primaryIngredient 
            ? `${data.primaryIngredient.amount || ''}${data.primaryIngredient.unit || ''}`
            : undefined,
        },
        // Set dosage (from ingredient or defaults)
        dosageAmount,
        dosageUnit,
        dosageFrequency,
        dosageTiming,
        // Update assessment duration if we detected a supplement type
        assessmentDays: detectedSupp?.recommendedDuration || prev.assessmentDays,
      }));

      toast({
        title: "Product Found",
        description: data.detectedSupplementType 
          ? `${data.product.productName} - ${SUPPLEMENT_CONFIGURATIONS[data.detectedSupplementType]?.name || 'Supplement'} detected`
          : `${data.product.productName} by ${data.product.brandName}`,
      });
      setShowBarcodeInput(false);
      setBarcodeInput('');
    },
    onError: (error: any) => {
      toast({
        title: "Product Not Found",
        description: error.message || "Could not find this product in our database. Please enter details manually.",
        variant: "destructive",
      });
    },
  });

  const handleBarcodeScan = () => {
    if (barcodeInput.trim()) {
      barcodeLookupMutation.mutate(barcodeInput.trim());
    }
  };

  const handleCameraScan = async () => {
    console.log('[BarcodeScanner] handleCameraScan called');
    console.log('[BarcodeScanner] isCameraAvailable:', isCameraAvailable);
    console.log('[BarcodeScanner] isScannerSupported:', isScannerSupported);
    
    if (!isCameraAvailable) {
      console.log('[BarcodeScanner] Camera not available (not native platform), showing manual input');
      setShowBarcodeInput(true);
      return;
    }

    // Skip isSupported check - try scanning directly since the plugin might work even if isSupported returns false
    setIsScanning(true);
    console.log('[BarcodeScanner] Starting scan (bypassing isSupported check)...');
    try {
      const result = await scanBarcode();
      console.log('[BarcodeScanner] Scan result:', result);
      if (result?.barcode) {
        setBarcodeInput(result.barcode);
        barcodeLookupMutation.mutate(result.barcode);
      } else {
        console.log('[BarcodeScanner] No barcode in result, user may have cancelled');
      }
    } catch (error: any) {
      console.error('[BarcodeScanner] Scan error:', error);
      toast({
        title: "Scanner Error",
        description: error.message || "Failed to scan barcode. Try manual entry.",
        variant: "destructive",
      });
      setShowBarcodeInput(true);
    } finally {
      setIsScanning(false);
    }
  };

  // Fetch experiment compatibility - which intents are blocked by active experiments
  const { data: compatibilityData, isError: compatibilityError, isLoading: compatibilityLoading } = useQuery<{
    activeIntents: string[];
    blockedIntents: { intentId: string; reason: string }[];
    allowedIntents: string[];
  }>({
    queryKey: ['/api/n1/experiments/compatibility'],
    retry: 2,
  });

  // Create a map of blocked intents for easy lookup
  const blockedIntentsMap = new Map(
    compatibilityData?.blockedIntents?.map(b => [b.intentId, b.reason]) || []
  );

  // If compatibility check failed, block ALL intents to be safe
  const safetyBlock = compatibilityError;

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
      <main className="overflow-y-auto px-4 pt-6 pb-24" style={{ height: 'calc(100vh - 120px)' }}>
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
            
            {/* Show error banner if compatibility check failed */}
            {compatibilityError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2">
                  <Ban className="w-4 h-4 text-red-400" />
                  <p className="text-sm text-red-300">
                    Unable to check experiment conflicts. Please try again later.
                  </p>
                </div>
              </div>
            )}

            {compatibilityLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                <span className="ml-2 text-sm text-white/60">Checking active experiments...</span>
              </div>
            )}

            <div className="grid gap-3">
              {PRIMARY_INTENTS.map((intent) => {
                const isBlocked = safetyBlock || blockedIntentsMap.has(intent.id);
                const blockReason = safetyBlock 
                  ? 'Unable to verify experiment compatibility - please try again later'
                  : blockedIntentsMap.get(intent.id);
                
                const cardContent = (
                  <Card
                    key={intent.id}
                    className={`p-4 transition-all ${
                      isBlocked 
                        ? 'bg-white/5 border-white/5 opacity-50 cursor-not-allowed'
                        : config.intent === intent.id
                          ? 'bg-white/10 border-cyan-400 border-2 cursor-pointer'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 cursor-pointer'
                    }`}
                    onClick={() => !isBlocked && setConfig({ ...config, intent: intent.id, supplementTypeId: '' })}
                    data-testid={`intent-${intent.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isBlocked
                          ? 'bg-red-500/10'
                          : config.intent === intent.id 
                            ? 'bg-cyan-500/30' 
                            : 'bg-white/10'
                      }`}>
                        {isBlocked ? (
                          <Ban className="w-5 h-5 text-red-400/60" />
                        ) : (
                          <Zap className={`w-5 h-5 ${config.intent === intent.id ? 'text-cyan-400' : 'text-white/60'}`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className={`font-medium ${isBlocked ? 'text-white/50' : 'text-white'}`}>{intent.label}</h3>
                        <p className={`text-xs ${
                          isBlocked 
                            ? 'text-white/30'
                            : config.intent === intent.id 
                              ? 'text-white/70' 
                              : 'text-white/50'
                        }`}>{intent.description}</p>
                        {isBlocked && (
                          <p className="text-xs text-red-400/70 mt-1">Blocked by active experiment</p>
                        )}
                      </div>
                      {config.intent === intent.id && !isBlocked && (
                        <Check className="w-5 h-5 text-cyan-400" />
                      )}
                    </div>
                  </Card>
                );
                
                if (isBlocked && blockReason) {
                  return (
                    <TooltipProvider key={intent.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {cardContent}
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">{blockReason}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                }
                
                return cardContent;
              })}
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
                        ? 'bg-white/10 border-cyan-400 border-2'
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
                        <p className={`text-xs mt-0.5 ${config.supplementTypeId === supp.id ? 'text-white/70' : 'text-white/50'}`}>{supp.protocolDescription}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge className={`border-0 text-xs ${config.supplementTypeId === supp.id ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/10 text-white/70'}`}>
                            {defaultDosage.amount}{defaultDosage.unit}
                          </Badge>
                          <Badge className={`border-0 text-xs ${config.supplementTypeId === supp.id ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/10 text-white/70'}`}>
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

            {/* Barcode Scanner */}
            {!showBarcodeInput ? (
              <div className="space-y-3">
                {/* Camera Scan - Primary Option */}
                <Card 
                  className="p-4 bg-white/5 border-white/10 cursor-pointer hover:bg-white/10 transition-all"
                  onClick={handleCameraScan}
                  data-testid="button-camera-scan"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                      {isScanning || barcodeLookupMutation.isPending ? (
                        <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                      ) : (
                        <Camera className="w-5 h-5 text-cyan-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">
                        {isScanning ? 'Opening Camera...' : barcodeLookupMutation.isPending ? 'Looking up...' : 'Scan Barcode'}
                      </p>
                      <p className="text-xs text-white/60">
                        {!isCameraAvailable 
                          ? 'Camera not available on web' 
                          : isScannerSupported 
                            ? 'Use camera to scan product barcode' 
                            : 'Checking scanner availability...'}
                      </p>
                    </div>
                    <Scan className="w-5 h-5 text-white/40" />
                  </div>
                </Card>

                {/* Manual Entry - Secondary Option */}
                <button
                  onClick={() => setShowBarcodeInput(true)}
                  className="w-full text-center text-sm text-white/50 hover:text-white/70 transition-colors py-2"
                  data-testid="button-manual-entry"
                >
                  Or enter barcode manually
                </button>
              </div>
            ) : (
              <Card className="p-4 bg-white/5 border-cyan-400 border-2">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                    <Scan className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">Enter Barcode (UPC)</p>
                    <p className="text-xs text-white/60">Found on product packaging</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setShowBarcodeInput(false);
                      setBarcodeInput('');
                    }}
                    className="text-white/60 hover:text-white"
                    data-testid="button-cancel-scan"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Input
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="e.g., 012345678901"
                    className="flex-1 bg-white/5 border-white/20 text-white placeholder:text-white/30"
                    onKeyDown={(e) => e.key === 'Enter' && handleBarcodeScan()}
                    autoFocus
                    data-testid="input-barcode"
                  />
                  <Button
                    onClick={handleBarcodeScan}
                    disabled={!barcodeInput.trim() || barcodeLookupMutation.isPending}
                    className="bg-cyan-500 hover:bg-cyan-600"
                    data-testid="button-lookup-barcode"
                  >
                    {barcodeLookupMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                
                {barcodeLookupMutation.isPending && (
                  <p className="text-xs text-cyan-400 mt-2 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Looking up product...
                  </p>
                )}

                {/* Quick switch to camera */}
                {isCameraAvailable && (
                  <button
                    onClick={() => {
                      setShowBarcodeInput(false);
                      handleCameraScan();
                    }}
                    className="w-full text-center text-sm text-cyan-400 hover:text-cyan-300 transition-colors pt-3 mt-2 border-t border-white/10"
                    data-testid="button-switch-to-camera"
                  >
                    <Camera className="w-4 h-4 inline mr-1" />
                    Use camera instead
                  </button>
                )}
              </Card>
            )}
            
            {/* Product found indicator */}
            {config.product.dsldId && (
              <Card className="p-3 bg-green-500/10 border-green-500/30">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400">Product imported from NIH database</span>
                </div>
              </Card>
            )}

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
              <h2 className="text-xl text-white font-semibold">Assessment Setup</h2>
              <p className="text-sm text-white/60 mt-1">
                Configure your dosage and assessment duration
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

            <Card className="p-4 bg-cyan-500/10 border-cyan-500/30">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h4 className="text-cyan-400 font-medium">How We Calculate Results</h4>
                  <p className="text-sm text-white/70 mt-1">
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
