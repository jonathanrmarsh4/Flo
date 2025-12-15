import { User, Calendar, Weight, Ruler, Activity, Moon, Target, Brain, Bell, Shield, FileText, Info, Download, Trash2, ChevronRight, Edit2, Heart, Mail, Loader2, Plus, X, ChevronLeft, ChevronRight as ChevronRightIcon, Sparkles, Smartphone, Wallet, CreditCard, Mic, Play, Check, Crown, Zap, LineChart, ArrowRight, Database, Scale } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { User as UserType } from '@shared/schema';
import { useProfile, useUpdateDemographics, useUpdateHealthBaseline, useUpdateGoals, useUpdateAIPersonalization, useBodyFatCalibration, useUpdateBodyFatCalibration, useUpdateName } from '@/hooks/useProfile';
import { ReminderSettings } from '@/components/ReminderSettings';
import { usePlan } from '@/hooks/usePlan';
import { PrivacyPolicyScreen } from '@/components/PrivacyPolicyScreen';
import { TermsOfServiceScreen } from '@/components/TermsOfServiceScreen';
import { MedicalDisclaimerScreen } from '@/components/MedicalDisclaimerScreen';
import { ExportDataScreen } from '@/components/ExportDataScreen';
import { DeleteDataConfirmation } from '@/components/DeleteDataConfirmation';
import { HelpSupportScreen } from '@/components/HelpSupportScreen';
import { NotificationsScreen } from '@/components/NotificationsScreen';
import { PasskeyManagement } from '@/components/PasskeyManagement';
import { IntegrationsSettings } from '@/components/IntegrationsSettings';
import { UserDataScreen } from '@/components/UserDataScreen';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, getAuthHeaders, getApiBaseUrl } from '@/lib/queryClient';
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
  const [showUserData, setShowUserData] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showHelpSupport, setShowHelpSupport] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('Amanda');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [isLoadingVoicePreference, setIsLoadingVoicePreference] = useState(true);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Voice options for AI Voice Settings
  const voiceOptions = [
    { name: 'Amanda', description: 'Warm & Professional', gender: 'Female' },
    { name: 'Morgan', description: 'Calm & Reassuring', gender: 'Female' },
    { name: 'Izzy', description: 'Energetic & Friendly', gender: 'Female' },
    { name: 'Ethan', description: 'Clear & Confident', gender: 'Male' },
    { name: 'Jon', description: 'Thoughtful & Steady', gender: 'Male' }
  ];
  
  // Fetch profile data from backend
  const { data: profile, isLoading, error } = useProfile();
  
  // Get user plan to determine if premium
  const { data: planData } = usePlan();
  const isPremium = planData?.plan?.id === 'premium';
  
  // Mutation hooks
  const updateDemographics = useUpdateDemographics();
  const updateHealthBaseline = useUpdateHealthBaseline();
  const updateGoals = useUpdateGoals();
  const updateAIPersonalization = useUpdateAIPersonalization();
  
  // Body fat calibration hooks
  const { data: bodyFatCalibration } = useBodyFatCalibration();
  const updateBodyFatCalibration = useUpdateBodyFatCalibration();
  
  // Name update hook
  const updateName = useUpdateName();
  
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
  const [localBodyFatCorrection, setLocalBodyFatCorrection] = useState<string>('0');
  
  // Local state for medical context (only saves when clicking Done)
  const [localMedicalContext, setLocalMedicalContext] = useState<string>('');
  
  // Local state for name editing
  const [localFirstName, setLocalFirstName] = useState<string>('');
  const [localLastName, setLocalLastName] = useState<string>('');
  
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
  
  // Sync body fat calibration from API
  useEffect(() => {
    if (bodyFatCalibration) {
      setLocalBodyFatCorrection(bodyFatCalibration.bodyFatCorrectionPct?.toString() ?? '0');
    }
  }, [bodyFatCalibration]);
  
  // Sync name from user data (but not while editing to prevent cursor jumping)
  useEffect(() => {
    if (!isEditing) {
      setLocalFirstName(user.firstName ?? '');
      setLocalLastName(user.lastName ?? '');
    }
  }, [user.firstName, user.lastName, isEditing]);

  // Fetch voice preference on mount
  useEffect(() => {
    const fetchVoicePreference = async () => {
      try {
        const response = await apiRequest('GET', '/api/profile/voice-preference');
        const data = await response.json();
        if (data.current) {
          setSelectedVoice(data.current);
        }
      } catch (error) {
        console.error('[VoicePreference] Failed to fetch:', error);
      } finally {
        setIsLoadingVoicePreference(false);
      }
    };
    fetchVoicePreference();
  }, []);

  // Audio reference for voice playback
  const audioRef = { current: null as HTMLAudioElement | null };

  // Handle voice selection
  const handleSelectVoice = async (voiceName: string) => {
    const previousVoice = selectedVoice;
    setSelectedVoice(voiceName);
    
    try {
      await apiRequest('PATCH', '/api/profile/voice-preference', { voicePreference: voiceName });
      toast({
        title: "Voice Updated",
        description: `${voiceName} is now your AI voice.`,
      });
    } catch (error) {
      console.error('[VoicePreference] Failed to save:', error);
      setSelectedVoice(previousVoice);
      toast({
        title: "Update Failed",
        description: "Could not save voice preference. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle voice sample playback
  const handlePlayVoice = async (voiceName: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    if (playingVoice === voiceName) {
      setPlayingVoice(null);
      return;
    }
    
    setPlayingVoice(voiceName);
    
    try {
      // Get auth headers for JWT token (required for iOS app)
      const headers = await getAuthHeaders();
      const baseUrl = getApiBaseUrl();
      
      console.log('[VoiceSample] Fetching sample for:', voiceName);
      
      const response = await fetch(`${baseUrl}/api/voice/sample/${voiceName}`, {
        headers,
        credentials: 'include'
      });
      
      if (!response.ok) {
        console.error('[VoiceSample] Response not ok:', response.status, response.statusText);
        throw new Error(`Failed to fetch voice sample: ${response.status}`);
      }
      
      const audioBlob = await response.blob();
      console.log('[VoiceSample] Audio blob received:', audioBlob.size, 'bytes');
      
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = (e) => {
        console.error('[VoiceSample] Audio playback error:', e);
        setPlayingVoice(null);
        URL.revokeObjectURL(audioUrl);
        toast({
          title: "Playback Error",
          description: "Could not play voice sample.",
          variant: "destructive",
        });
      };
      
      await audio.play();
    } catch (error) {
      console.error('[VoiceSample] Playback failed:', error);
      setPlayingVoice(null);
      toast({
        title: "Sample Unavailable",
        description: "Voice sample could not be loaded.",
        variant: "destructive",
      });
    }
  };

  // Calculate age from birth year using mid-year (July 1st) assumption for ±6 month accuracy
  const calculateAge = (birthYear: number | null | undefined): number | null => {
    if (!birthYear) return null;
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11
    // Assume birth on July 1st (month 6) for mid-year approximation
    const age = currentYear - birthYear - (currentMonth < 6 ? 1 : 0);
    return age;
  };

  const age = calculateAge(profile?.birthYear);
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
          {isEditing ? (
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="First Name"
                  value={localFirstName}
                  onChange={(e) => setLocalFirstName(e.target.value)}
                  onBlur={() => {
                    if (localFirstName !== (user.firstName ?? '') && localFirstName.trim()) {
                      updateName.mutate({ firstName: localFirstName.trim() });
                    }
                  }}
                  disabled={updateName.isPending}
                  className="flex-1 text-center"
                  autoComplete="off"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  data-testid="input-first-name"
                />
                <Input
                  type="text"
                  placeholder="Last Name"
                  value={localLastName}
                  onChange={(e) => setLocalLastName(e.target.value)}
                  onBlur={() => {
                    if (localLastName !== (user.lastName ?? '') && localLastName.trim()) {
                      updateName.mutate({ lastName: localLastName.trim() });
                    }
                  }}
                  disabled={updateName.isPending}
                  className="flex-1 text-center"
                  autoComplete="off"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  data-testid="input-last-name"
                />
              </div>
              {updateName.isPending && (
                <div className="flex items-center justify-center">
                  <Loader2 className={`w-4 h-4 animate-spin ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                </div>
              )}
            </div>
          ) : (
            <div className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-user-name">
              {userName}
            </div>
          )}
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
            {/* Birth Year (Privacy: Only collect year for age calculation) */}
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Calendar className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <div>
                  <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Birth Year</span>
                  <p className={`text-xs ${isDark ? 'text-white/40' : 'text-gray-400'}`}>For your privacy, we only collect year</p>
                </div>
              </div>
              {isEditing ? (
                <Select
                  value={profile?.birthYear?.toString() ?? ''}
                  onValueChange={(value) => updateDemographics.mutate({ birthYear: parseInt(value) })}
                >
                  <SelectTrigger className="w-24" data-testid="select-birth-year">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: new Date().getFullYear() - 1900 + 1 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-birth-year">
                  {profile?.birthYear ?? 'Not set'}
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
                    type="text"
                    inputMode="decimal"
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
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
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
                    type="text"
                    inputMode="decimal"
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
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
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
                    type="text"
                    inputMode="decimal"
                    placeholder="7"
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
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
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

        {/* Body Composition Calibration */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-body-fat-calibration">
          <div className="flex items-center gap-2 mb-4">
            <Scale className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
            <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Body Fat Calibration
            </h2>
          </div>
          
          <p className={`text-xs mb-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Calibrate your scale's body fat reading against a more accurate measurement like DEXA. 
            If your scale shows 7% but DEXA shows 12%, set a +5% correction.
          </p>
          
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Correction</span>
            </div>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={localBodyFatCorrection}
                  onChange={(e) => setLocalBodyFatCorrection(e.target.value)}
                  onBlur={() => {
                    const value = parseFloat(localBodyFatCorrection);
                    if (isNaN(value)) {
                      toast({
                        title: "Invalid Value",
                        description: "Please enter a valid number.",
                        variant: "destructive",
                      });
                      setLocalBodyFatCorrection(bodyFatCalibration?.bodyFatCorrectionPct?.toString() ?? '0');
                      return;
                    }
                    if (value < -15 || value > 15) {
                      toast({
                        title: "Out of Range",
                        description: "Correction must be between -15% and +15%.",
                        variant: "destructive",
                      });
                      setLocalBodyFatCorrection(bodyFatCalibration?.bodyFatCorrectionPct?.toString() ?? '0');
                      return;
                    }
                    updateBodyFatCalibration.mutate({ bodyFatCorrectionPct: value });
                  }}
                  disabled={updateBodyFatCalibration.isPending}
                  className="w-20 text-center"
                  autoComplete="off"
                  data-testid="input-body-fat-correction"
                />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>%</span>
              </div>
            ) : (
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-body-fat-correction">
                {bodyFatCalibration?.bodyFatCorrectionPct ?? 0}%
              </span>
            )}
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
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
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
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="done"
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
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
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

        {/* AI Voice Settings */}
        <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
        }`} data-testid="card-ai-voice-settings">
          <div className="flex items-center gap-2 mb-4">
            <Mic className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
              AI Voice Settings
            </h2>
          </div>

          <p className={`text-xs mb-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Choose your preferred voice for AI interactions
          </p>

          <div className="space-y-3">
            {voiceOptions.map((voice) => (
              <div
                key={voice.name}
                className={`relative p-4 rounded-2xl border transition-all cursor-pointer ${
                  selectedVoice === voice.name
                    ? isDark
                      ? 'bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-purple-500/50'
                      : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-300'
                    : isDark
                      ? 'bg-white/5 border-white/10 hover:bg-white/10'
                      : 'bg-white/60 border-gray-200 hover:bg-white'
                }`}
                onClick={() => handleSelectVoice(voice.name)}
                data-testid={`voice-option-${voice.name.toLowerCase()}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {/* Selection Indicator */}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      selectedVoice === voice.name
                        ? isDark
                          ? 'border-purple-400 bg-purple-500'
                          : 'border-purple-500 bg-purple-500'
                        : isDark
                          ? 'border-white/30'
                          : 'border-gray-300'
                    }`}>
                      {selectedVoice === voice.name && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>

                    {/* Voice Info */}
                    <div className="flex-1">
                      <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {voice.name}
                      </div>
                      <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        {voice.description} • {voice.gender}
                      </div>
                    </div>
                  </div>

                  {/* Play Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayVoice(voice.name);
                    }}
                    className={`p-2.5 rounded-full transition-all ${
                      playingVoice === voice.name
                        ? isDark
                          ? 'bg-purple-500 text-white'
                          : 'bg-purple-500 text-white'
                        : isDark
                          ? 'bg-white/10 text-purple-400 hover:bg-white/20'
                          : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                    }`}
                    data-testid={`button-play-voice-${voice.name.toLowerCase()}`}
                  >
                    {playingVoice === voice.name ? (
                      <div className="flex gap-0.5 items-center justify-center w-4 h-4">
                        <div className="w-0.5 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                        <div className="w-0.5 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <div className="w-0.5 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <Play className="w-4 h-4" fill="currentColor" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription / Upgrade Section - Conditional based on plan */}
        {isPremium ? (
          /* Premium users see subscription management */
          <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`} data-testid="card-subscription">
            <div className="flex items-center gap-2 mb-4">
              <Crown className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
              <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Premium Subscription
              </h2>
            </div>

            <div className="space-y-3">
              {/* Premium Status */}
              <div 
                className={`p-4 rounded-2xl border ${
                  isDark 
                    ? 'bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20' 
                    : 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      isDark 
                        ? 'bg-gradient-to-br from-amber-500/30 to-orange-500/30' 
                        : 'bg-gradient-to-br from-amber-100 to-orange-100'
                    }`}>
                      <Sparkles className={`w-6 h-6 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                    </div>
                    
                    <div>
                      <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Premium Active
                      </div>
                      <div className={`text-sm ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                        Full access to all features
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Manage Subscription Button */}
              <Button
                onClick={() => setLocation('/billing')}
                variant="outline"
                className={`w-full ${
                  isDark 
                    ? 'border-white/20 text-white/80 hover:bg-white/10' 
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                data-testid="button-manage-subscription"
              >
                <Wallet className="w-4 h-4 mr-2" />
                <span>Manage Subscription</span>
              </Button>
            </div>
          </div>
        ) : (
          /* Free users see upgrade tile */
          <div className={`backdrop-blur-xl rounded-3xl border p-6 ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
          }`} data-testid="card-upgrade-premium">
            <div className="flex items-center gap-2 mb-4">
              <Crown className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
              <h2 className={`text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Upgrade to Premium
              </h2>
            </div>

            {/* Main Content */}
            <div className="text-center mb-4">
              <div className="flex justify-center mb-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  isDark 
                    ? 'bg-gradient-to-br from-amber-500/30 to-orange-500/30' 
                    : 'bg-gradient-to-br from-amber-100 to-orange-100'
                }`}>
                  <Sparkles className={`w-7 h-7 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                </div>
              </div>
              
              <h4 className={`text-lg font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Unlock Full Potential
              </h4>
              <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-500'}`}>
                Get personalized AI insights and advanced health tracking
              </p>
            </div>

            {/* Feature Pills */}
            <div className="flex flex-wrap justify-center gap-2 mb-5">
              {[
                { icon: Brain, label: 'AI Insights' },
                { icon: LineChart, label: 'Flōmentum' },
                { icon: Zap, label: 'Voice Chat' },
                { icon: Shield, label: 'Full Access' },
              ].map(({ icon: Icon, label }) => (
                <div 
                  key={label}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${
                    isDark 
                      ? 'bg-white/10 text-white/80' 
                      : 'bg-black/5 text-gray-700'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <Button
              onClick={() => setLocation('/billing')}
              className={`w-full group ${
                isDark
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white border-0'
                  : 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white border-0'
              }`}
              data-testid="button-upgrade-premium"
            >
              <span>Upgrade Now</span>
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        )}

        {/* Integrations */}
        <IntegrationsSettings isDark={isDark} />

        {/* Passkeys & Security */}
        <PasskeyManagement isDark={isDark} />

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
              onClick={() => setShowUserData(true)}
              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-user-data">
              <div className="flex items-center gap-3">
                <Database className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                  User Data
                </span>
              </div>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

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

      {showUserData && (
        <UserDataScreen 
          isDark={isDark} 
          onClose={() => setShowUserData(false)} 
        />
      )}

      <DeleteDataConfirmation
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            // Use apiRequest which handles base URL for iOS and auth headers
            await apiRequest('DELETE', '/api/user/data');
            
            toast({
              title: "Data Deleted",
              description: "All your health data has been permanently deleted.",
            });
            
            setShowDeleteConfirmation(false);
            window.location.reload();
          } catch (error: any) {
            console.error('Delete data error:', {
              message: error?.message,
              stack: error?.stack,
            });
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
        <NotificationsScreen 
          isDark={isDark} 
          onClose={() => setShowHelpSupport(false)} 
        />
      )}
    </div>
  );
}
