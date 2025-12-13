import { useState, useEffect } from 'react';
import { Target, TrendingDown, TrendingUp, Minus, ChevronRight, ChevronLeft, Loader2, Calendar, Check } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const goalFormSchema = z.object({
  goalType: z.enum(['LOSE', 'GAIN', 'MAINTAIN']),
  targetWeight: z.string().min(1, 'Target weight is required').refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0 && num < 500;
    },
    { message: 'Enter a valid weight' }
  ),
  timeframeWeeks: z.string().optional(),
  checkinCadence: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY']).default('WEEKLY'),
});

type GoalFormValues = z.infer<typeof goalFormSchema>;

interface GoalSetupFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  currentWeight?: number | null;
  existingGoal?: {
    goal_type: string | null;
    target_weight_kg: number | null;
  } | null;
}

const GOAL_TYPES = [
  {
    value: 'LOSE',
    label: 'Lose Weight',
    description: 'Reduce body weight',
    icon: TrendingDown,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
  },
  {
    value: 'MAINTAIN',
    label: 'Maintain',
    description: 'Keep current weight',
    icon: Minus,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
  },
  {
    value: 'GAIN',
    label: 'Gain Weight',
    description: 'Build muscle mass',
    icon: TrendingUp,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
  },
];

const TIMEFRAMES = [
  { value: '4', label: '1 month' },
  { value: '8', label: '2 months' },
  { value: '12', label: '3 months' },
  { value: '24', label: '6 months' },
  { value: '52', label: '1 year' },
];

const CADENCES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'BIWEEKLY', label: 'Every 2 weeks' },
];

export function GoalSetupFlow({
  open,
  onOpenChange,
  isDark,
  currentWeight,
  existingGoal,
}: GoalSetupFlowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  const form = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      goalType: (existingGoal?.goal_type as 'LOSE' | 'GAIN' | 'MAINTAIN') || undefined,
      targetWeight: existingGoal?.target_weight_kg?.toString() || '',
      timeframeWeeks: '12',
      checkinCadence: 'WEEKLY',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        goalType: (existingGoal?.goal_type as 'LOSE' | 'GAIN' | 'MAINTAIN') || undefined,
        targetWeight: existingGoal?.target_weight_kg?.toString() || '',
        timeframeWeeks: '12',
        checkinCadence: 'WEEKLY',
      });
      setStep(0);
      setShowSuccess(false);
    }
  }, [open, existingGoal?.goal_type, existingGoal?.target_weight_kg]);

  const goalType = form.watch('goalType');
  const targetWeight = form.watch('targetWeight');

  const goalMutation = useMutation({
    mutationFn: async (values: GoalFormValues) => {
      const targetWeightKg = parseFloat(values.targetWeight);
      const timeframeWeeks = values.timeframeWeeks ? parseInt(values.timeframeWeeks) : null;
      
      let targetDateLocal: string | null = null;
      if (timeframeWeeks) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + timeframeWeeks * 7);
        targetDateLocal = targetDate.toISOString().split('T')[0];
      }

      return apiRequest('POST', '/v1/weight/goal', {
        goal_type: values.goalType,
        target_weight_kg: targetWeightKg,
        target_date_local: targetDateLocal,
        timeframe_weeks: timeframeWeeks,
        checkin_cadence: values.checkinCadence,
        start_weight_kg: currentWeight || undefined,
      });
    },
    onSuccess: () => {
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['/v1/weight/tile'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/weight/overview'] });
      
      setTimeout(() => {
        setShowSuccess(false);
        onOpenChange(false);
        form.reset();
        setStep(0);
      }, 2000);

      toast({
        title: 'Goal set!',
        description: 'Your weight goal has been saved.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save goal',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (values: GoalFormValues) => {
    goalMutation.mutate(values);
  };

  const canProceed = () => {
    if (step === 0) return !!goalType;
    if (step === 1) return !!targetWeight && parseFloat(targetWeight) > 0;
    return true;
  };

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1);
    } else {
      form.handleSubmit(onSubmit)();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const calculateWeeklyRate = () => {
    if (!targetWeight || !currentWeight) return null;
    const timeframeWeeks = parseInt(form.getValues('timeframeWeeks') || '12');
    const diff = parseFloat(targetWeight) - currentWeight;
    const weeklyRate = Math.abs(diff / timeframeWeeks);
    return weeklyRate.toFixed(2);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={`${isDark ? 'bg-gray-900 border-white/10' : ''} max-h-[90vh]`}>
        <DrawerHeader className="text-center">
          <div className="mx-auto mb-2">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isDark ? 'bg-purple-500/20' : 'bg-purple-100'
            }`}>
              <Target className={`w-6 h-6 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
          </div>
          <DrawerTitle className={isDark ? 'text-white' : ''}>
            {showSuccess ? 'Goal Set!' : 'Set Your Weight Goal'}
          </DrawerTitle>
          <DrawerDescription>
            {showSuccess 
              ? 'Your personalized forecast is being calculated'
              : `Step ${step + 1} of 3`
            }
          </DrawerDescription>
        </DrawerHeader>

        {showSuccess ? (
          <div className="flex flex-col items-center justify-center py-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                isDark ? 'bg-green-500/20' : 'bg-green-100'
              }`}
            >
              <Check className={`w-10 h-10 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
            </motion.div>
            <p className={`mt-4 text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
              Your forecast will update shortly
            </p>
          </div>
        ) : (
          <Form {...form}>
            <form className="px-4 pb-4">
              <div className="min-h-[280px]">
                <AnimatePresence mode="wait">
                  {step === 0 && (
                    <motion.div
                      key="step-0"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-3"
                    >
                      <FormField
                        control={form.control}
                        name="goalType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={`sr-only ${isDark ? 'text-white/80' : ''}`}>
                              Goal Type
                            </FormLabel>
                            <div className="space-y-2">
                              {GOAL_TYPES.map((type) => (
                                <button
                                  key={type.value}
                                  type="button"
                                  onClick={() => field.onChange(type.value)}
                                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                                    field.value === type.value
                                      ? isDark
                                        ? 'border-purple-500 bg-purple-500/10'
                                        : 'border-purple-500 bg-purple-50'
                                      : isDark
                                      ? 'border-white/10 bg-white/5 hover:bg-white/10'
                                      : 'border-gray-200 hover:bg-gray-50'
                                  }`}
                                  data-testid={`button-goal-${type.value.toLowerCase()}`}
                                >
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${type.bgColor}`}>
                                    <type.icon className={`w-5 h-5 ${type.color}`} />
                                  </div>
                                  <div className="text-left">
                                    <div className={`font-medium ${isDark ? 'text-white' : ''}`}>
                                      {type.label}
                                    </div>
                                    <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                                      {type.description}
                                    </div>
                                  </div>
                                  {field.value === type.value && (
                                    <Check className={`ml-auto w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                                  )}
                                </button>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}

                  {step === 1 && (
                    <motion.div
                      key="step-1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      {currentWeight && (
                        <div className={`text-center py-3 rounded-lg ${
                          isDark ? 'bg-white/5' : 'bg-gray-50'
                        }`}>
                          <span className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                            Current weight:
                          </span>
                          <span className={`ml-2 font-semibold ${isDark ? 'text-white' : ''}`}>
                            {currentWeight} kg
                          </span>
                        </div>
                      )}

                      <FormField
                        control={form.control}
                        name="targetWeight"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={isDark ? 'text-white/80' : ''}>
                              Target Weight (kg)
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type="number"
                                  step="0.1"
                                  placeholder={goalType === 'LOSE' ? '70.0' : goalType === 'GAIN' ? '80.0' : currentWeight?.toString() || '75.0'}
                                  className={`text-2xl text-center h-14 ${
                                    isDark 
                                      ? 'bg-white/5 border-white/20 text-white placeholder:text-white/30' 
                                      : ''
                                  }`}
                                  data-testid="input-target-weight"
                                  {...field}
                                />
                                <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm ${
                                  isDark ? 'text-white/40' : 'text-gray-400'
                                }`}>
                                  kg
                                </span>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="timeframeWeeks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={isDark ? 'text-white/80' : ''}>
                              Timeframe
                            </FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger 
                                  className={isDark ? 'bg-white/5 border-white/20 text-white' : ''}
                                  data-testid="select-timeframe"
                                >
                                  <SelectValue placeholder="Select timeframe" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TIMEFRAMES.map((tf) => (
                                  <SelectItem key={tf.value} value={tf.value}>
                                    {tf.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />

                      {currentWeight && targetWeight && goalType !== 'MAINTAIN' && (
                        <div className={`text-center p-3 rounded-lg ${
                          isDark ? 'bg-white/5' : 'bg-gray-50'
                        }`}>
                          <span className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                            Rate: ~{calculateWeeklyRate()} kg/week
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div
                      key="step-2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      <div className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                        <h4 className={`font-medium mb-3 ${isDark ? 'text-white' : ''}`}>
                          Your Goal Summary
                        </h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className={isDark ? 'text-white/60' : 'text-gray-600'}>Goal</span>
                            <span className={isDark ? 'text-white' : ''}>
                              {GOAL_TYPES.find(t => t.value === goalType)?.label}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className={isDark ? 'text-white/60' : 'text-gray-600'}>Target</span>
                            <span className={isDark ? 'text-white' : ''}>{targetWeight} kg</span>
                          </div>
                          {currentWeight && (
                            <div className="flex justify-between">
                              <span className={isDark ? 'text-white/60' : 'text-gray-600'}>Change</span>
                              <span className={`${
                                parseFloat(targetWeight) < currentWeight 
                                  ? isDark ? 'text-orange-400' : 'text-orange-600'
                                  : parseFloat(targetWeight) > currentWeight
                                  ? isDark ? 'text-green-400' : 'text-green-600'
                                  : isDark ? 'text-white/60' : 'text-gray-600'
                              }`}>
                                {parseFloat(targetWeight) < currentWeight ? '' : '+'}
                                {(parseFloat(targetWeight) - currentWeight).toFixed(1)} kg
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <FormField
                        control={form.control}
                        name="checkinCadence"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={isDark ? 'text-white/80' : ''}>
                              Weigh-in Reminder
                            </FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger 
                                  className={isDark ? 'bg-white/5 border-white/20 text-white' : ''}
                                  data-testid="select-cadence"
                                >
                                  <SelectValue placeholder="How often to remind you" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {CADENCES.map((c) => (
                                  <SelectItem key={c.value} value={c.value}>
                                    {c.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <DrawerFooter className="px-0 pt-4 flex-row gap-2">
                {step > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    className={`flex-1 h-12 ${isDark ? 'border-white/20 text-white' : ''}`}
                    data-testid="button-goal-back"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={!canProceed() || goalMutation.isPending}
                  className={`flex-1 h-12 ${step === 0 ? 'w-full' : ''}`}
                  data-testid="button-goal-next"
                >
                  {goalMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : step === 2 ? (
                    'Set Goal'
                  ) : (
                    <>
                      Continue
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              </DrawerFooter>
            </form>
          </Form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
