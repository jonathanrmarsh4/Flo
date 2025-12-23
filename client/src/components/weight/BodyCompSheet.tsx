import { useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
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
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';

const bodyCompFormSchema = z.object({
  bodyFatPct: z.string().optional().refine(
    (val) => {
      if (!val || val === '') return true;
      const num = parseFloat(val);
      return !isNaN(num) && num >= 1 && num <= 80;
    },
    { message: 'Body fat must be between 1% and 80%' }
  ),
  leanMassKg: z.string().optional().refine(
    (val) => {
      if (!val || val === '') return true;
      const num = parseFloat(val);
      return !isNaN(num) && num > 0 && num < 200;
    },
    { message: 'Enter a valid lean mass' }
  ),
  estimated: z.boolean().default(false),
  writeToAppleHealth: z.boolean().default(false),
}).refine(
  (data) => data.bodyFatPct || data.leanMassKg,
  { message: 'Enter at least one measurement', path: ['bodyFatPct'] }
);

type BodyCompFormValues = z.infer<typeof bodyCompFormSchema>;

interface BodyCompSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  currentBodyFat?: number | null;
  currentLeanMass?: number | null;
}

export function BodyCompSheet({
  open,
  onOpenChange,
  isDark,
  currentBodyFat,
  currentLeanMass,
}: BodyCompSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSuccess, setShowSuccess] = useState(false);

  const form = useForm<BodyCompFormValues>({
    resolver: zodResolver(bodyCompFormSchema),
    defaultValues: {
      bodyFatPct: currentBodyFat ? currentBodyFat.toString() : '',
      leanMassKg: currentLeanMass ? currentLeanMass.toString() : '',
      estimated: false,
      writeToAppleHealth: false,
    },
  });

  const bodyCompMutation = useMutation({
    mutationFn: async (values: BodyCompFormValues) => {
      const now = new Date();
      const timestampLocal = now.toISOString();
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      return apiRequest('POST', '/v1/weight/body-comp', {
        timestamp_local: timestampLocal,
        user_timezone: userTimezone,
        body_fat_pct: values.bodyFatPct ? parseFloat(values.bodyFatPct) : null,
        lean_mass_kg: values.leanMassKg ? parseFloat(values.leanMassKg) : null,
        estimated: values.estimated,
        write_to_apple_health: values.writeToAppleHealth,
      });
    },
    onSuccess: () => {
      setShowSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['/v1/weight/tile'] });
      queryClient.invalidateQueries({ queryKey: ['/v1/weight/overview'] });
      queryClient.invalidateQueries({ queryKey: ['/api/body-composition'] });
      
      setTimeout(() => {
        setShowSuccess(false);
        onOpenChange(false);
        form.reset();
      }, 1500);

      toast({
        title: 'Body composition logged',
        description: 'Your measurements have been recorded.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (values: BodyCompFormValues) => {
    bodyCompMutation.mutate(values);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={isDark ? 'bg-gray-900 border-white/10' : ''}>
        <DrawerHeader className="text-center">
          <div className="mx-auto mb-2">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isDark ? 'bg-cyan-500/20' : 'bg-cyan-100'
            }`}>
              <Activity className={`w-6 h-6 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            </div>
          </div>
          <DrawerTitle className={isDark ? 'text-white' : ''}>
            Log Body Composition
          </DrawerTitle>
          <DrawerDescription>
            Enter your body fat percentage or lean mass
          </DrawerDescription>
        </DrawerHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 pb-4 space-y-4">
            <FormField
              control={form.control}
              name="bodyFatPct"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={isDark ? 'text-white/80' : ''}>
                    Body Fat Percentage
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="18.5"
                        className={`text-xl text-center h-12 ${
                          isDark 
                            ? 'bg-white/5 border-white/20 text-white placeholder:text-white/30' 
                            : ''
                        }`}
                        data-testid="input-body-fat"
                        {...field}
                      />
                      <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm ${
                        isDark ? 'text-white/40' : 'text-gray-400'
                      }`}>
                        %
                      </span>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="leanMassKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={isDark ? 'text-white/80' : ''}>
                    Lean Mass (kg)
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="62.0"
                        className={`text-xl text-center h-12 ${
                          isDark 
                            ? 'bg-white/5 border-white/20 text-white placeholder:text-white/30' 
                            : ''
                        }`}
                        data-testid="input-lean-mass"
                        {...field}
                      />
                      <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm ${
                        isDark ? 'text-white/40' : 'text-gray-400'
                      }`}>
                        kg
                      </span>
                    </div>
                  </FormControl>
                  <FormDescription className={isDark ? 'text-white/50' : ''}>
                    Optional - from DEXA or smart scale
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimated"
              render={({ field }) => (
                <FormItem className={`flex items-center justify-between rounded-lg p-3 ${
                  isDark ? 'bg-white/5' : 'bg-gray-50'
                }`}>
                  <div className="space-y-0.5">
                    <FormLabel className={`text-sm ${isDark ? 'text-white/80' : ''}`}>
                      Estimated value
                    </FormLabel>
                    <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Mark if not from accurate measurement
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-estimated"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="writeToAppleHealth"
              render={({ field }) => (
                <FormItem className={`flex items-center justify-between rounded-lg p-3 ${
                  isDark ? 'bg-white/5' : 'bg-gray-50'
                }`}>
                  <div className="space-y-0.5">
                    <FormLabel className={`text-sm ${isDark ? 'text-white/80' : ''}`}>
                      Sync to Apple Health
                    </FormLabel>
                    <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Also save to HealthKit
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-body-comp-apple-health"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DrawerFooter className="px-0 pt-2">
              <Button
                type="submit"
                disabled={bodyCompMutation.isPending}
                className="w-full h-12"
                data-testid="button-save-body-comp"
              >
                {bodyCompMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : showSuccess ? (
                  'Saved!'
                ) : (
                  'Save Measurements'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className={isDark ? 'text-white/60 hover:text-white' : ''}
                data-testid="button-cancel-body-comp"
              >
                Cancel
              </Button>
            </DrawerFooter>
          </form>
        </Form>
      </DrawerContent>
    </Drawer>
  );
}
