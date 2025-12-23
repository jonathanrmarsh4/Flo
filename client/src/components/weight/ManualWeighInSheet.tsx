import { useState } from 'react';
import { Scale, Loader2 } from 'lucide-react';
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
} from '@/components/ui/form';

const weighInFormSchema = z.object({
  weight: z.string().min(1, 'Weight is required').refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0 && num < 500;
    },
    { message: 'Enter a valid weight between 0 and 500' }
  ),
  writeToAppleHealth: z.boolean().default(false),
});

type WeighInFormValues = z.infer<typeof weighInFormSchema>;

interface ManualWeighInSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  unit?: 'kg' | 'lbs';
  currentWeight?: number | null;
}

export function ManualWeighInSheet({
  open,
  onOpenChange,
  isDark,
  unit = 'kg',
  currentWeight,
}: ManualWeighInSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSuccess, setShowSuccess] = useState(false);

  const form = useForm<WeighInFormValues>({
    resolver: zodResolver(weighInFormSchema),
    defaultValues: {
      weight: currentWeight ? currentWeight.toString() : '',
      writeToAppleHealth: false,
    },
  });

  const weighInMutation = useMutation({
    mutationFn: async (values: WeighInFormValues) => {
      const weightKg = unit === 'lbs' 
        ? parseFloat(values.weight) * 0.453592 
        : parseFloat(values.weight);
      
      const now = new Date();
      const timestampLocal = now.toISOString();
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      return apiRequest('POST', '/v1/weight/weigh-in', {
        timestamp_local: timestampLocal,
        user_timezone: userTimezone,
        weight_kg: weightKg,
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
        title: 'Weight logged',
        description: 'Your weight has been recorded successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save weight',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (values: WeighInFormValues) => {
    weighInMutation.mutate(values);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={isDark ? 'bg-gray-900 border-white/10' : ''}>
        <DrawerHeader className="text-center">
          <div className="mx-auto mb-2">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isDark ? 'bg-blue-500/20' : 'bg-blue-100'
            }`}>
              <Scale className={`w-6 h-6 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
            </div>
          </div>
          <DrawerTitle className={isDark ? 'text-white' : ''}>
            Log Weight
          </DrawerTitle>
          <DrawerDescription>
            Enter your current weight to track your progress
          </DrawerDescription>
        </DrawerHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-4 pb-4">
            <FormField
              control={form.control}
              name="weight"
              render={({ field }) => (
                <FormItem className="mb-4">
                  <FormLabel className={isDark ? 'text-white/80' : ''}>
                    Weight ({unit})
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder={unit === 'kg' ? '75.5' : '166.4'}
                        className={`text-2xl text-center h-14 ${
                          isDark 
                            ? 'bg-white/5 border-white/20 text-white placeholder:text-white/30' 
                            : ''
                        }`}
                        data-testid="input-weight"
                        {...field}
                      />
                      <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm ${
                        isDark ? 'text-white/40' : 'text-gray-400'
                      }`}>
                        {unit}
                      </span>
                    </div>
                  </FormControl>
                  <FormMessage />
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
                      Also save this entry to HealthKit
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-apple-health"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DrawerFooter className="px-0 pt-4">
              <Button
                type="submit"
                disabled={weighInMutation.isPending}
                className="w-full h-12"
                data-testid="button-save-weight"
              >
                {weighInMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : showSuccess ? (
                  'Saved!'
                ) : (
                  'Save Weight'
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className={isDark ? 'text-white/60 hover:text-white' : ''}
                data-testid="button-cancel-weight"
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
