import { User, Calendar, Weight, Ruler, Activity, Moon, Target, Brain, Bell, Shield, FileText, Info, Download, Trash2, ChevronRight, Edit2, Heart, Mail, Loader2, Plus, X, ChevronLeft, ChevronRight as ChevronRightIcon, Sparkles, Smartphone, Wallet, CreditCard } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { User as UserType } from '@shared/schema';
import { useProfile, useUpdateDemographics, useUpdateHealthBaseline, useUpdateGoals, useUpdateAIPersonalization } from '@/hooks/useProfile';
import { ReminderSettings } from '@/components/ReminderSettings';
import { PrivacyPolicyScreen } from '@/components/PrivacyPolicyScreen';
import { TermsOfServiceScreen } from '@/components/TermsOfServiceScreen';
import { MedicalDisclaimerScreen } from '@/components/MedicalDisclaimerScreen';
import { ExportDataScreen } from '@/components/ExportDataScreen';
import { DeleteDataConfirmation } from '@/components/DeleteDataConfirmation';
import { HelpSupportScreen } from '@/components/HelpSupportScreen';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { format, setMonth, setYear, getMonth, getYear } from 'date-fns';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation, Link } from 'wouter';

interface ProfileScreenProps {
  isDark: boolean;
  onClose: () => void;
  user: UserType;
}

export function ProfileScreen({ isDark, onClose, user }: ProfileScreenProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showMedicalDisclaimer, setShowMedicalDisclaimer] = useState(false);
  const [showExportData, setShowExportData] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showHelpSupport, setShowHelpSupport] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Fetch profile data from backend
  const { data: profile, isLoading, error } = useProfile();
  
  // Mutation hooks
  const updateDemographics = useUpdateDemographics();
  const updateHealthBaseline = useUpdateHealthBaseline();
  const updateGoals = useUpdateGoals();
  const updateAIPersonalization = useUpdateAIPersonalization();
  
  // Comprehensive insights generation mutation
  const generateInsights = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/health-insights', { forceRefresh: true });
    },
    onSuccess: () => {
      toast({
        title: "Insights Generated",
        description: "Your comprehensive health insights have been generated successfully.",
      });
      setLocation('/insights');
    },
    onError: (error: any) => {
      // Extract specific error message from server response
      const errorMessage = error.message || error.error || "Failed to generate insights";
      const errorCode = error.code;
      
      let description = errorMessage;
      if (errorCode === "AI_NOT_CONFIGURED") {
        description = "AI integration is not configured. Please contact support.";
      } else if (errorCode === "AI_GENERATION_FAILED") {
        description = "AI service is temporarily unavailable. Please try again later.";
      } else if (errorMessage.includes("profile data")) {
        description = "Please complete your age and sex in your profile before generating insights.";
      } else if (errorMessage.includes("blood work")) {
        description = "Please add at least one blood work session before generating insights.";
      }
      
      toast({
        title: "Generation Failed",
        description,
        variant: "destructive",
      });
    },
  });
  
  // Local state for custom focus area input and health goal input
  const [newFocusArea, setNewFocusArea] = useState('');
  const [newGoal, setNewGoal] = useState('');
  
  // Local state for number inputs to prevent buggy behavior
  const [localWeight, setLocalWeight] = useState<string>('');
  const [localHeight, setLocalHeight] = useState<string>('');
  const [localSleep, setLocalSleep] = useState<string>('');
  
  // Local state for medical context (only saves when clicking Done)
  const [localMedicalContext, setLocalMedicalContext] = useState<string>('');
  
  // Calendar navigation state
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    profile?.dateOfBirth ? new Date(profile.dateOfBirth) : new Date()
  );
  
  // Safe defaults to prevent spreading undefined
  const currentHealthBaseline = profile?.healthBaseline ?? {};
  const currentAIPersonalization = profile?.aiPersonalization ?? {};
  
  // Handle save when clicking Done
  const handleToggleEdit = () => {
    // If exiting edit mode, save the medical context if it changed
    if (isEditing) {
      const serverValue = profile?.aiPersonalization?.medicalContext ?? '';
      if (localMedicalContext !== serverValue) {
        updateAIPersonalization.mutate({
          aiPersonalization: {
            ...currentAIPersonalization,
            medicalContext: localMedicalContext
          }
        });
      }
    }
    setIsEditing(!isEditing);
  };

  // Sync calendar month with profile date of birth
  useEffect(() => {
    if (profile?.dateOfBirth) {
      setCalendarMonth(new Date(profile.dateOfBirth));
    }
  }, [profile?.dateOfBirth]);

  // Sync local inputs with profile data (but not while editing medical context)
  useEffect(() => {
    if (profile) {
      setLocalWeight(profile.weight?.toString() ?? '');
      setLocalHeight(profile.height?.toString() ?? '');
      setLocalSleep(profile.healthBaseline?.sleepHours?.toString() ?? '');
      // Only sync medical context when not editing to prevent cursor jumping
      if (!isEditing) {
        setLocalMedicalContext(profile.aiPersonalization?.medicalContext ?? '');
      }
    }
  }, [profile, isEditing]);

  // Calculate age from date of birth
  const calculateAge = (dateOfBirth: Date | string | null | undefined): number | null => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const age = calculateAge(profile?.dateOfBirth);
  const userName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}` 
    : user.firstName || user.lastName || 'User';

  // Show loading state
  if (isLoading) {
    return (
      <div className={`h-full flex items-center justify-center transition-colors ${
        isDark 
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`}>
        <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-4 transition-colors ${
        isDark 
          ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
          : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
      }`}>
        <p className={`text-sm ${isDark ? 'text-red-400' : 'text-red-600'} mb-4`}>
          Failed to load profile
        </p>
        <button 
          onClick={onClose}
          className={`text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
          data-testid="button-back-error"
        >
          ← Back
        </button>
      </div>
    );
  }

  const activityLevels = ['Sedentary', 'Light', 'Moderate', 'Active', 'Very Active'];
  const dietTypes = ['Balanced', 'Low Carb', 'Mediterranean', 'Vegetarian', 'Vegan', 'Keto', 'Paleo'];
  const toneOptions = ['Casual', 'Professional', 'Scientific'];
  const frequencyOptions = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly'];
  const goalOptions = ['Longevity', 'Performance', 'Prevention', 'Weight Management', 'Cardiovascular Health', 'Metabolic Optimization', 'Cognitive Health'];
  const focusAreaOptions = ['Heart Health', 'Inflammation', 'Metabolic Health', 'Liver Function', 'Kidney Function', 'Hormones', 'Nutrition', 'Immunity'];

  return (
    <div className={`h-full overflow-y-auto overscroll-none pb-20 transition-colors ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors pt-[env(safe-area-inset-top)] ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 pt-4 pb-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={onClose}
              className={`text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
              data-testid="button-back"
            >
              ← Back
            </button>
            <h1 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Profile</h1>
            <button 
              onClick={handleToggleEdit}
              className={`text-sm ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}
              data-testid="button-edit"
            >
              {isEditing ? 'Done' : 'Edit'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-4">
        {/* Profile Avatar & User Info */}
        <div className="flex flex-col items-center mb-6">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-3 border-4 ${
            isDark 
              ? 'bg-gradient-to-br from-teal-500/20 to-blue-500/20 border-white/10' 
              : 'bg-gradient-to-br from-teal-100 to-blue-100 border-white'
          }`}>
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt={userName} className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className={`w-12 h-12 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            )}
          </div>
          <div className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-user-name">
            {userName}
          </div>
          <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-600'} flex items-center gap-2 mt-1`} data-testid="text-user-email">
            <Mail className="w-4 h-4" />
            {user.email || 'No email'}
          </div>
          {age && (
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'} mt-2`} data-testid="text-age-summary">
              Age: {age} years
            </div>
          )}
        </div>

        {/* Core Demographics */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-demographics">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <User className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Demographics
              </h2>
            </div>
          </div>

          <div className="space-y-3">
            {/* Date of Birth */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Calendar className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Date of Birth</span>
              </div>
              {isEditing ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`text-sm ${!profile?.dateOfBirth && 'text-muted-foreground'}`}
                      data-testid="button-dob-picker"
                    >
                      {profile?.dateOfBirth ? format(new Date(profile.dateOfBirth), 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <div className="p-3 space-y-3">
                      {/* Year and Month Selectors */}
                      <div className="flex gap-2">
                        <Select
                          value={getYear(calendarMonth).toString()}
                          onValueChange={(value) => {
                            setCalendarMonth(setYear(calendarMonth, parseInt(value)));
                          }}
                        >
                          <SelectTrigger className="flex-1" data-testid="select-year">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: new Date().getFullYear() - 1900 + 1 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                              <SelectItem key={year} value={year.toString()}>
                                {year}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={getMonth(calendarMonth).toString()}
                          onValueChange={(value) => {
                            setCalendarMonth(setMonth(calendarMonth, parseInt(value)));
                          }}
                        >
                          <SelectTrigger className="flex-1" data-testid="select-month">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, idx) => (
                              <SelectItem key={idx} value={idx.toString()}>
                                {month}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <CalendarComponent
                        mode="single"
                        selected={profile?.dateOfBirth ? new Date(profile.dateOfBirth) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            updateDemographics.mutate({ dateOfBirth: date });
                          }
                        }}
                        month={calendarMonth}
                        onMonthChange={setCalendarMonth}
                        initialFocus
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-dob">
                  {profile?.dateOfBirth 
                    ? new Date(profile.dateOfBirth!).toLocaleDateString()
                    : 'Not set'}
                </span>
              )}
            </div>

            {/* Sex */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <User className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Sex</span>
              </div>
              {isEditing ? (
                <Select
                  value={profile?.sex ?? ''}
                  onValueChange={(value) => updateDemographics.mutate({ sex: value as 'Male' | 'Female' | 'Other' })}
                >
                  <SelectTrigger className="w-32" data-testid="select-sex">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sex">
                  {profile?.sex || 'Not set'}
                </span>
              )}
            </div>

            {/* Weight */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Weight className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Weight</span>
              </div>
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="70"
                    value={localWeight}
                    onChange={(e) => setLocalWeight(e.target.value)}
                    onBlur={() => {
                      const value = parseFloat(localWeight);
                      if (!isNaN(value) && value !== profile?.weight) {
                        updateDemographics.mutate({ weight: value, weightUnit: profile?.weightUnit ?? 'kg' });
                      }
                    }}
                    disabled={updateDemographics.isPending}
                    className="w-20"
                    data-testid="input-weight"
                  />
                  <Select
                    value={profile?.weightUnit ?? 'kg'}
                    onValueChange={(value) => updateDemographics.mutate({ weightUnit: value as 'kg' | 'lbs' })}
                  >
                    <SelectTrigger className="w-20" data-testid="select-weight-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="lbs">lbs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-weight">
                  {profile?.weight != null ? `${profile.weight} ${profile.weightUnit ?? 'kg'}` : 'Not set'}
                </span>
              )}
            </div>

            {/* Height */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Ruler className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Height</span>
              </div>
              {isEditing ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="170"
                    value={localHeight}
                    onChange={(e) => setLocalHeight(e.target.value)}
                    onBlur={() => {
                      const value = parseFloat(localHeight);
                      if (!isNaN(value) && value !== profile?.height) {
                        updateDemographics.mutate({ height: value, heightUnit: profile?.heightUnit ?? 'cm' });
                      }
                    }}
                    disabled={updateDemographics.isPending}
                    className="w-20"
                    data-testid="input-height"
                  />
                  <Select
                    value={profile?.heightUnit ?? 'cm'}
                    onValueChange={(value) => updateDemographics.mutate({ heightUnit: value as 'cm' | 'in' })}
                  >
                    <SelectTrigger className="w-20" data-testid="select-height-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cm">cm</SelectItem>
                      <SelectItem value="in">in</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-height">
                  {profile?.height != null ? `${profile.height} ${profile.heightUnit ?? 'cm'}` : 'Not set'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Health & Lifestyle Baseline */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-health-lifestyle">
          <div className="flex items-center gap-2 mb-4">
            <Activity className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Health & Lifestyle
            </h2>
          </div>

          <div className="space-y-3">
            {/* Activity Level */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Activity Level</span>
              {isEditing ? (
                <Select
                  value={profile?.healthBaseline?.activityLevel ?? ''}
                  onValueChange={(value) => updateHealthBaseline.mutate({ 
                    healthBaseline: {
                      ...currentHealthBaseline,
                      activityLevel: value as 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active'
                    }
                  })}
                >
                  <SelectTrigger className="w-40" data-testid="select-activity">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sedentary">Sedentary</SelectItem>
                    <SelectItem value="Light">Light</SelectItem>
                    <SelectItem value="Moderate">Moderate</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Very Active">Very Active</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-activity">
                  {profile?.healthBaseline?.activityLevel ?? 'Not set'}
                </span>
              )}
            </div>

            {/* Sleep */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Moon className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Sleep</span>
              </div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="7"
                    min="0"
                    max="24"
                    step="0.5"
                    value={localSleep}
                    onChange={(e) => setLocalSleep(e.target.value)}
                    onBlur={() => {
                      const value = parseFloat(localSleep);
                      if (!isNaN(value) && value !== profile?.healthBaseline?.sleepHours) {
                        updateHealthBaseline.mutate({ 
                          healthBaseline: {
                            ...currentHealthBaseline,
                            sleepHours: value
                          }
                        });
                      }
                    }}
                    disabled={updateHealthBaseline.isPending}
                    className="w-20"
                    data-testid="input-sleep"
                  />
                  <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>hrs/night</span>
                </div>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sleep">
                  {profile?.healthBaseline?.sleepHours ? `${profile.healthBaseline.sleepHours!} hours/night` : 'Not set'}
                </span>
              )}
            </div>

            {/* Diet Type */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Diet Type</span>
              {isEditing ? (
                <Select
                  value={profile?.healthBaseline?.dietType ?? ''}
                  onValueChange={(value) => updateHealthBaseline.mutate({ 
                    healthBaseline: {
                      ...currentHealthBaseline,
                      dietType: value as 'Balanced' | 'Low Carb' | 'Mediterranean' | 'Vegetarian' | 'Vegan' | 'Keto' | 'Paleo'
                    }
                  })}
                >
                  <SelectTrigger className="w-40" data-testid="select-diet">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Balanced">Balanced</SelectItem>
                    <SelectItem value="Low Carb">Low Carb</SelectItem>
                    <SelectItem value="Mediterranean">Mediterranean</SelectItem>
                    <SelectItem value="Vegetarian">Vegetarian</SelectItem>
                    <SelectItem value="Vegan">Vegan</SelectItem>
                    <SelectItem value="Keto">Keto</SelectItem>
                    <SelectItem value="Paleo">Paleo</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-diet">
                  {profile?.healthBaseline?.dietType ?? 'Not set'}
                </span>
              )}
            </div>

            {/* Smoking */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Smoking</span>
              {isEditing ? (
                <Select
                  value={profile?.healthBaseline?.smokingStatus ?? ''}
                  onValueChange={(value) => updateHealthBaseline.mutate({ 
                    healthBaseline: {
                      ...currentHealthBaseline,
                      smokingStatus: value as 'Never' | 'Former' | 'Current'
                    }
                  })}
                >
                  <SelectTrigger className="w-32" data-testid="select-smoking">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Never">Never</SelectItem>
                    <SelectItem value="Former">Former</SelectItem>
                    <SelectItem value="Current">Current</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-smoking">
                  {profile?.healthBaseline?.smokingStatus ?? 'Not set'}
                </span>
              )}
            </div>

            {/* Alcohol */}
            <div className="flex items-center justify-between py-3">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Alcohol</span>
              {isEditing ? (
                <Select
                  value={profile?.healthBaseline?.alcoholIntake ?? ''}
                  onValueChange={(value) => updateHealthBaseline.mutate({ 
                    healthBaseline: {
                      ...currentHealthBaseline,
                      alcoholIntake: value as 'None' | 'Occasional' | 'Moderate' | 'Heavy'
                    }
                  })}
                >
                  <SelectTrigger className="w-32" data-testid="select-alcohol">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">None</SelectItem>
                    <SelectItem value="Occasional">Occasional</SelectItem>
                    <SelectItem value="Moderate">Moderate</SelectItem>
                    <SelectItem value="Heavy">Heavy</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-alcohol">
                  {profile?.healthBaseline?.alcoholIntake ?? 'Not set'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Health Goals */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-health-goals">
          <div className="flex items-center gap-2 mb-4">
            <Target className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Health Goals
            </h2>
          </div>

          <div className="flex flex-wrap gap-2 mb-2">
            {(profile?.goals ?? []).length > 0 ? (
              (profile?.goals ?? []).map((goal, idx) => (
                <div 
                  key={idx}
                  className={`px-3 py-2 rounded-full text-xs flex items-center gap-2 ${
                    isDark 
                      ? 'bg-gradient-to-r from-teal-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30' 
                      : 'bg-gradient-to-r from-teal-100 to-blue-100 text-cyan-700 border border-cyan-200'
                  }`}
                  data-testid={`badge-goal-${idx}`}
                >
                  <span>{goal}</span>
                  {isEditing && (
                    <button
                      onClick={() => {
                        const currentGoals = profile?.goals ?? [];
                        const newGoals = currentGoals.filter((_, i) => i !== idx);
                        updateGoals.mutate({ goals: newGoals });
                      }}
                      className="hover:opacity-70"
                      data-testid={`button-remove-goal-${idx}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                No goals set
              </span>
            )}
          </div>
          {isEditing && (
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="e.g., Improve Sleep Quality, Lower Cholesterol"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newGoal.trim()) {
                    const currentGoals = profile?.goals ?? [];
                    updateGoals.mutate({ goals: [...currentGoals, newGoal.trim()] });
                    setNewGoal('');
                  }
                }}
                className="flex-1"
                data-testid="input-new-goal"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (newGoal.trim()) {
                    const currentGoals = profile?.goals ?? [];
                    updateGoals.mutate({ goals: [...currentGoals, newGoal.trim()] });
                    setNewGoal('');
                  }
                }}
                data-testid="button-add-goal"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Daily Reminders */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-daily-reminders">
          <ReminderSettings user={user} isEditing={isEditing} isDark={isDark} />
        </div>

        {/* AI Personalization */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-ai-personalization">
          <div className="flex items-center gap-2 mb-4">
            <Brain className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
              AI Personalization
            </h2>
          </div>

          <div className="space-y-4">
            {/* Tone */}
            <div>
              <label className={`text-sm mb-2 block ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                Communication Tone
              </label>
              <div className="flex gap-2">
                {toneOptions.map(tone => (
                  <button
                    key={tone}
                    onClick={() => {
                      if (isEditing) {
                        updateAIPersonalization.mutate({
                          aiPersonalization: {
                            ...currentAIPersonalization,
                            tone: tone as 'Casual' | 'Professional' | 'Scientific'
                          }
                        });
                      }
                    }}
                    disabled={!isEditing}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs transition-all ${
                      profile?.aiPersonalization?.tone === tone
                        ? isDark 
                          ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                          : 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                        : isDark
                          ? 'bg-white/10 text-white/70 hover:bg-white/20'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    } ${!isEditing && 'cursor-default'}`}
                    data-testid={`button-tone-${tone.toLowerCase()}`}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>

            {/* Insights Frequency */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Bell className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  Insights Frequency
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {frequencyOptions.map(freq => (
                  <button
                    key={freq}
                    onClick={() => {
                      if (isEditing) {
                        updateAIPersonalization.mutate({
                          aiPersonalization: {
                            ...currentAIPersonalization,
                            insightsFrequency: freq as 'Daily' | 'Weekly' | 'Bi-weekly' | 'Monthly'
                          }
                        });
                      }
                    }}
                    disabled={!isEditing}
                    className={`py-2 px-3 rounded-xl text-xs transition-all ${
                      profile?.aiPersonalization?.insightsFrequency === freq
                        ? isDark 
                          ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                          : 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                        : isDark
                          ? 'bg-white/10 text-white/70 hover:bg-white/20'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    } ${!isEditing && 'cursor-default'}`}
                    data-testid={`button-frequency-${freq.toLowerCase()}`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            {/* Focus Areas */}
            <div>
              <label className={`text-sm mb-2 block ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                Focus Areas
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(profile?.aiPersonalization?.focusAreas ?? []).length > 0 ? (
                  (profile?.aiPersonalization?.focusAreas ?? []).map((area, idx) => (
                    <div 
                      key={idx}
                      className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-2 ${
                        isDark 
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                          : 'bg-purple-100 text-purple-700 border border-purple-200'
                      }`}
                      data-testid={`badge-focus-${idx}`}
                    >
                      <span>{area}</span>
                      {isEditing && (
                        <button
                          onClick={() => {
                            const currentAreas = profile?.aiPersonalization?.focusAreas ?? [];
                            const newAreas = currentAreas.filter((_, i) => i !== idx);
                            updateAIPersonalization.mutate({
                              aiPersonalization: {
                                ...currentAIPersonalization,
                                focusAreas: newAreas
                              }
                            });
                          }}
                          className="hover:opacity-70"
                          data-testid={`button-remove-focus-${idx}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <span className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    No focus areas set
                  </span>
                )}
              </div>
              {isEditing && (
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="e.g., Heart Health, Inflammation"
                    value={newFocusArea}
                    onChange={(e) => setNewFocusArea(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFocusArea.trim()) {
                        const currentAreas = profile?.aiPersonalization?.focusAreas ?? [];
                        updateAIPersonalization.mutate({
                          aiPersonalization: {
                            ...currentAIPersonalization,
                            focusAreas: [...currentAreas, newFocusArea.trim()]
                          }
                        });
                        setNewFocusArea('');
                      }
                    }}
                    className="flex-1"
                    data-testid="input-new-focus-area"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (newFocusArea.trim()) {
                        const currentAreas = profile?.aiPersonalization?.focusAreas ?? [];
                        updateAIPersonalization.mutate({
                          aiPersonalization: {
                            ...currentAIPersonalization,
                            focusAreas: [...currentAreas, newFocusArea.trim()]
                          }
                        });
                        setNewFocusArea('');
                      }
                    }}
                    data-testid="button-add-focus-area"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Medical Context */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Heart className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <label className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  Medical Context
                </label>
              </div>
              <p className={`text-xs mb-2 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Help the AI provide more accurate insights by sharing relevant medical information (e.g., "I'm on Testosterone Replacement Therapy", medications, conditions)
              </p>
              {isEditing ? (
                <Textarea
                  value={localMedicalContext}
                  onChange={(e) => {
                    setLocalMedicalContext(e.target.value);
                  }}
                  placeholder="e.g., I'm on TRT, taking metformin for prediabetes, history of hypothyroidism..."
                  className={`min-h-[100px] resize-none ${
                    isDark 
                      ? 'bg-white/10 border-white/20 text-white placeholder:text-white/40' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'
                  }`}
                  data-testid="textarea-medical-context"
                />
              ) : (
                <div 
                  className={`min-h-[100px] p-3 rounded-xl border ${
                    isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
                  }`}
                  data-testid="text-medical-context-display"
                >
                  <p className={`text-sm whitespace-pre-wrap ${
                    isDark ? 'text-white/80' : 'text-gray-800'
                  }`}>
                    {profile?.aiPersonalization?.medicalContext || (
                      <span className={`${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        No medical context provided
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-payment-method">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Payment Method
            </h2>
          </div>

          <div className="space-y-3">
            {/* Apple Pay Card */}
            <div 
              className={`p-4 rounded-2xl border ${
                isDark 
                  ? 'bg-gradient-to-br from-white/5 to-white/[0.02] border-white/10' 
                  : 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
              }`}
              style={{
                boxShadow: isDark 
                  ? '0 10px 30px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                  : '0 10px 30px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
              }}
              data-testid="payment-apple-pay"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Apple Pay Logo */}
                  <div 
                    className="w-12 h-12 rounded-xl bg-black flex items-center justify-center"
                    style={{
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                    }}
                  >
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <path d="M20.5 8.5c-.8 0-1.5-.3-2.1-.8-.5-.5-.9-1.3-.9-2.2 0-.1 0-.2.1-.2.1 0 .2 0 .2.1 1.1.4 2 1.5 2 2.8 0 .1 0 .2-.1.2-.1.1-.1.1-.2.1zm3.9 1.8c-1.2 0-2.1.6-2.8.6-.7 0-1.8-.6-3-.6-1.5 0-2.9.9-3.7 2.3-1.5 2.7-.4 6.6 1.1 8.8.7 1.1 1.6 2.3 2.7 2.3 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.9.7 1.2 0 1.9-1.1 2.6-2.2.8-1.3 1.1-2.5 1.1-2.6 0 0-2.2-.8-2.2-3.2 0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3.1-1.6l-.2-.6z" fill="white"/>
                      <text x="16" y="27" fill="white" fontSize="8" fontWeight="600" textAnchor="middle" fontFamily="system-ui, -apple-system">Pay</text>
                    </svg>
                  </div>
                  
                  <div>
                    <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Apple Pay
                    </div>
                    <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      Visa •••• 4242
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => setLocation('/billing')}
                  className={`px-4 py-2 rounded-lg text-sm transition-all ${
                    isDark 
                      ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30' 
                      : 'bg-cyan-50 text-cyan-600 hover:bg-cyan-100 border border-cyan-200'
                  }`}
                  data-testid="button-manage-payment"
                >
                  Manage
                </button>
              </div>
            </div>

            {/* Add Payment Method Button */}
            <button 
              onClick={() => setLocation('/billing')}
              className={`w-full p-4 rounded-2xl border-2 border-dashed transition-all ${
                isDark 
                  ? 'border-white/20 hover:border-cyan-500/50 hover:bg-cyan-500/5' 
                  : 'border-gray-300 hover:border-cyan-400 hover:bg-cyan-50/50'
              }`}
              data-testid="button-add-payment"
            >
              <div className="flex items-center justify-center gap-2">
                <CreditCard className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  Add Payment Method
                </span>
              </div>
            </button>

            {/* Payment Info */}
            <div className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-500'} px-2`}>
              <p>Payments are processed securely through Apple Pay. Your card information is never stored on our servers.</p>
            </div>
          </div>
        </div>

        {/* Data & Privacy */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-data-privacy">
          <div className="flex items-center gap-2 mb-4">
            <Shield className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Data & Privacy
            </h2>
          </div>

          <div className="space-y-2">
            <button 
              onClick={() => setShowExportData(true)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-export-data">
              <div className="flex items-center gap-3">
                <Download className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                  Export My Data
                </span>
              </div>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button 
              onClick={() => setShowDeleteConfirmation(true)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'
            }`} data-testid="button-delete-data">
              <div className="flex items-center gap-3">
                <Trash2 className={`w-4 h-4 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                <span className={`text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                  Delete All Data
                </span>
              </div>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>
          </div>
        </div>

        {/* Legal & Support */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-legal-support">
          <div className="flex items-center gap-2 mb-4">
            <FileText className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Legal & Support
            </h2>
          </div>

          <div className="space-y-2">
            <button 
              onClick={() => setShowPrivacyPolicy(true)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-privacy-policy">
              <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                Privacy Policy
              </span>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button 
              onClick={() => setShowTermsOfService(true)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-terms">
              <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                Terms of Service
              </span>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button 
              onClick={() => setShowMedicalDisclaimer(true)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-disclaimer">
              <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                Medical Disclaimer
              </span>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button 
              onClick={() => setShowHelpSupport(true)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-help">
              <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                Help & Support
              </span>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

          </div>
        </div>

        {/* App Version */}
        <div className={`text-center text-xs ${isDark ? 'text-white/30' : 'text-gray-400'}`}>
          <div data-testid="text-app-name">Flō Health Tracker</div>
          <div data-testid="text-app-version">Version 1.0.0 (Build 2025.11)</div>
          <div className="mt-2 flex items-center justify-center gap-1" data-testid="text-made-with">
            Made with <Heart className="w-3 h-3 inline-block text-red-500" fill="currentColor" /> for longevity
          </div>
        </div>
      </div>

      {/* Privacy Policy Screen */}
      {showPrivacyPolicy && (
        <PrivacyPolicyScreen 
          isDark={isDark} 
          onClose={() => setShowPrivacyPolicy(false)} 
        />
      )}

      {/* Terms of Service Screen */}
      {showTermsOfService && (
        <TermsOfServiceScreen 
          isDark={isDark} 
          onClose={() => setShowTermsOfService(false)} 
        />
      )}

      {/* Medical Disclaimer Screen */}
      {showMedicalDisclaimer && (
        <MedicalDisclaimerScreen 
          isDark={isDark} 
          onClose={() => setShowMedicalDisclaimer(false)} 
        />
      )}

      {showExportData && (
        <ExportDataScreen 
          isDark={isDark} 
          onClose={() => setShowExportData(false)} 
        />
      )}

      <DeleteDataConfirmation
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            const response = await fetch('/api/user/data', {
              method: 'DELETE',
              credentials: 'include',
            });
            
            if (!response.ok) {
              throw new Error('Failed to delete data');
            }
            
            toast({
              title: "Data Deleted",
              description: "All your health data has been permanently deleted.",
            });
            
            setShowDeleteConfirmation(false);
            window.location.reload();
          } catch (error) {
            toast({
              title: "Delete Failed",
              description: "Failed to delete your data. Please try again.",
              variant: "destructive",
            });
          } finally {
            setIsDeleting(false);
          }
        }}
        isDeleting={isDeleting}
      />

      {showHelpSupport && (
        <HelpSupportScreen 
          isDark={isDark} 
          onClose={() => setShowHelpSupport(false)} 
        />
      )}
    </div>
  );
}
