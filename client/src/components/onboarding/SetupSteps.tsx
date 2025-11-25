import { useState, useRef } from 'react';
import { ChevronRight, Check, Bell, Heart, User, Upload, Bone, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { HealthKitService } from '@/services/healthkit';
import type { HealthDataType } from '@/types/healthkit';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useUpdateDemographics } from '@/hooks/useProfile';

interface SetupStepsProps {
  isDark: boolean;
  onComplete: () => void;
}

type SetupStep = 'notifications' | 'profile' | 'bloodwork' | 'optional' | 'complete';

// Generate year options (100 years back from current year)
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 100 }, (_, i) => currentYear - i);
const months = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

// Get days in month
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Countries that use imperial system (US, Liberia, Myanmar)
const imperialCountries = ['US', 'LR', 'MM'];

// Detect if user's locale uses metric system
function useMetricSystem(): boolean {
  try {
    // Guard against SSR/environments where navigator is undefined
    if (typeof navigator === 'undefined') {
      return false; // Default to imperial
    }
    const locale = navigator.language || 'en-US';
    // Extract country code from locale (e.g., "en-AU" -> "AU", "en-US" -> "US")
    const parts = locale.split('-');
    const countryCode = parts.length > 1 ? parts[1].toUpperCase() : 'US';
    return !imperialCountries.includes(countryCode);
  } catch {
    return false; // Default to imperial if detection fails
  }
}

export function SetupSteps({ isDark, onComplete }: SetupStepsProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState<SetupStep>('notifications');
  const [completedSteps, setCompletedSteps] = useState<SetupStep[]>([]);
  
  // Detect unit system based on device locale
  const isMetric = useMetricSystem();
  
  // Profile mutation hook
  const updateDemographics = useUpdateDemographics();
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  
  // Permission states
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [healthKitEnabled, setHealthKitEnabled] = useState(false);
  const [isRequestingNotifications, setIsRequestingNotifications] = useState(false);
  const [isRequestingHealthKit, setIsRequestingHealthKit] = useState(false);
  
  // Profile form state with separate date fields
  const [profileData, setProfileData] = useState({
    name: '',
    birthYear: '',
    birthMonth: '',
    birthDay: '',
    biologicalSex: '',
    height: '',
    weight: ''
  });
  
  // Blood work upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  
  // Optional scans state
  const [optionalScansUploaded, setOptionalScansUploaded] = useState({
    cac: false,
    dexa: false
  });

  const steps = [
    { id: 'notifications' as const, title: 'Enable Notifications', icon: Bell, required: true },
    { id: 'profile' as const, title: 'Configure Profile', icon: User, required: true },
    { id: 'bloodwork' as const, title: 'Upload Blood Work', icon: Upload, required: true },
    { id: 'optional' as const, title: 'Optional Scans', icon: Bone, required: false },
  ];

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);

  // Get available days based on selected year and month
  const availableDays = profileData.birthYear && profileData.birthMonth
    ? Array.from(
        { length: getDaysInMonth(parseInt(profileData.birthYear), parseInt(profileData.birthMonth)) },
        (_, i) => String(i + 1).padStart(2, '0')
      )
    : Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

  // Compute ISO date string from separate fields
  const dateOfBirth = profileData.birthYear && profileData.birthMonth && profileData.birthDay
    ? `${profileData.birthYear}-${profileData.birthMonth}-${profileData.birthDay}`
    : '';

  // Request notification permission
  const handleNotificationToggle = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }

    const isNative = Capacitor.isNativePlatform();
    
    if (isNative) {
      setIsRequestingNotifications(true);
      try {
        const permStatus = await LocalNotifications.checkPermissions();
        
        if (permStatus.display === 'granted') {
          setNotificationsEnabled(true);
          toast({ title: 'Notifications enabled', description: 'You will receive health reminders' });
        } else {
          const result = await LocalNotifications.requestPermissions();
          if (result.display === 'granted') {
            setNotificationsEnabled(true);
            toast({ title: 'Notifications enabled', description: 'You will receive health reminders' });
          } else {
            toast({ 
              title: 'Permission denied', 
              description: 'You can enable notifications later in Settings',
              variant: 'destructive'
            });
          }
        }
      } catch (error) {
        console.error('[Onboarding] Notification permission error:', error);
        toast({ title: 'Error', description: 'Could not request notification permission', variant: 'destructive' });
      } finally {
        setIsRequestingNotifications(false);
      }
    } else {
      // Web platform - show info but keep toggle disabled (no real permissions on web)
      toast({ 
        title: 'iOS Required', 
        description: 'Open Flō on your iPhone to enable notifications',
      });
      // Don't enable - native permissions only work on device
    }
  };

  // Request HealthKit permission
  const handleHealthKitToggle = async () => {
    if (healthKitEnabled) {
      setHealthKitEnabled(false);
      return;
    }

    const isNative = Capacitor.isNativePlatform();
    
    if (isNative) {
      setIsRequestingHealthKit(true);
      try {
        const available = await HealthKitService.isAvailable();
        
        if (!available) {
          toast({ 
            title: 'HealthKit not available', 
            description: 'HealthKit is not available on this device',
            variant: 'destructive'
          });
          setIsRequestingHealthKit(false);
          return;
        }

        // Request comprehensive HealthKit permissions
        const allDataTypes: HealthDataType[] = [
          'heartRateVariability', 'restingHeartRate', 'respiratoryRate',
          'oxygenSaturation', 'sleepAnalysis', 'bodyTemperature',
          'weight', 'height', 'bmi', 'bodyFatPercentage', 'leanBodyMass',
          'heartRate', 'bloodPressureSystolic', 'bloodPressureDiastolic',
          'bloodGlucose', 'vo2Max', 'walkingHeartRateAverage',
          'steps', 'distance', 'calories', 'basalEnergyBurned',
          'flightsClimbed', 'appleExerciseTime', 'appleStandTime',
        ];

        const result = await HealthKitService.requestAuthorization({
          read: allDataTypes,
          write: [],
        });

        if (result && (result.readAuthorized?.length || 0) > 0) {
          setHealthKitEnabled(true);
          toast({ title: 'HealthKit connected', description: 'Your health data will sync automatically' });
        } else {
          toast({ 
            title: 'Limited access', 
            description: 'Some HealthKit permissions were denied. You can update this in Settings.',
          });
          setHealthKitEnabled(true); // Still mark as enabled if any permissions granted
        }
      } catch (error) {
        console.error('[Onboarding] HealthKit permission error:', error);
        toast({ title: 'Error', description: 'Could not request HealthKit permission', variant: 'destructive' });
      } finally {
        setIsRequestingHealthKit(false);
      }
    } else {
      // Web platform - show info but keep toggle disabled (no real permissions on web)
      toast({ 
        title: 'iOS Required', 
        description: 'Open Flō on your iPhone to connect HealthKit',
      });
      // Don't enable - native permissions only work on device
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10485760) { // 10MB limit
        toast({
          title: 'File too large',
          description: 'Please select a file smaller than 10MB',
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // Get signed upload URL
      const uploadRes = await apiRequest('POST', '/api/objects/upload', {});
      const { uploadURL, objectPath } = await uploadRes.json();

      // Upload file directly to signed URL
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: selectedFile,
        headers: { 'Content-Type': selectedFile.type },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      // Trigger analysis
      const analyzeRes = await apiRequest('POST', '/api/blood-work/analyze', {
        fileUrl: objectPath,
        fileName: selectedFile.name,
      });

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json();
        throw new Error(errorData.details || errorData.error || 'Analysis failed');
      }

      // Invalidate blood work cache so dashboard refreshes
      queryClient.invalidateQueries({ queryKey: ['/api/blood-work'] });
      
      // Reset file selection
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      setUploadComplete(true);
      toast({
        title: 'Upload successful',
        description: 'Your blood work is being analyzed',
      });
    } catch (error: any) {
      console.error('[Onboarding] Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload blood work',
        variant: 'destructive',
      });
      // Reset file on error so user can try again
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleNotificationsNext = () => {
    // On native, require at least one permission enabled
    // On web, allow progression since permissions can't be granted
    const isNative = Capacitor.isNativePlatform();
    
    if (notificationsEnabled || healthKitEnabled || !isNative) {
      setCompletedSteps([...completedSteps, 'notifications']);
      setCurrentStep('profile');
    }
  };

  const handleProfileNext = async () => {
    if (!profileData.name || !profileData.birthYear || !profileData.birthMonth || !profileData.birthDay || !profileData.biologicalSex) {
      return;
    }
    
    setIsSavingProfile(true);
    try {
      // Construct date from separate fields
      const dob = new Date(`${profileData.birthYear}-${profileData.birthMonth}-${profileData.birthDay}`);
      
      // Map biologicalSex to expected format
      const sexMap: Record<string, 'Male' | 'Female' | 'Other'> = {
        'male': 'Male',
        'female': 'Female',
        'other': 'Other',
      };
      
      // Convert metric to imperial if needed (API expects inches/lbs)
      let heightInches: number | undefined;
      let weightLbs: number | undefined;
      
      if (profileData.height) {
        const heightValue = parseFloat(profileData.height);
        // Convert cm to inches and round to 1 decimal place
        heightInches = isMetric 
          ? Math.round((heightValue / 2.54) * 10) / 10 
          : heightValue;
      }
      
      if (profileData.weight) {
        const weightValue = parseFloat(profileData.weight);
        // Convert kg to lbs and round to 1 decimal place
        weightLbs = isMetric 
          ? Math.round((weightValue * 2.205) * 10) / 10 
          : weightValue;
      }
      
      // Save demographics to backend
      await updateDemographics.mutateAsync({
        dateOfBirth: dob,
        sex: sexMap[profileData.biologicalSex] || 'Other',
        height: heightInches,
        heightUnit: 'inches' as const,
        weight: weightLbs,
        weightUnit: 'lbs' as const,
      });
      
      toast({
        title: 'Profile saved',
        description: 'Your information has been saved',
      });
      
      setCompletedSteps([...completedSteps, 'profile']);
      setCurrentStep('bloodwork');
    } catch (error: any) {
      console.error('[Onboarding] Profile save error:', error);
      toast({
        title: 'Error saving profile',
        description: error.message || 'Failed to save your profile',
        variant: 'destructive',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleBloodworkNext = () => {
    if (uploadComplete) {
      setCompletedSteps([...completedSteps, 'bloodwork']);
      setCurrentStep('optional');
    }
  };

  const handleBloodworkSkip = () => {
    setCompletedSteps([...completedSteps, 'bloodwork']);
    setCurrentStep('optional');
  };

  const handleOptionalNext = () => {
    setCompletedSteps([...completedSteps, 'optional']);
    onComplete();
  };

  const handleSkipOptional = () => {
    onComplete();
  };

  const isStepComplete = (stepId: SetupStep) => completedSteps.includes(stepId);

  const inputClassName = `w-full px-4 py-3 rounded-xl border transition-all ${
    isDark 
      ? 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:bg-white/10 focus:border-cyan-500/50' 
      : 'bg-white/60 border-black/10 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-cyan-500/50'
  } focus:outline-none`;

  return (
    <div className="h-full flex flex-col">
      {/* Progress Header */}
      <div className={`sticky top-0 z-10 backdrop-blur-xl border-b ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-6 py-4 pt-[calc(env(safe-area-inset-top)+16px)]">
          <h2 className={`text-xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Setup Your Account
          </h2>
          <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
            Step {currentStepIndex + 1} of {steps.length}
          </p>
          
          {/* Progress Bar */}
          <div className="mt-4 flex gap-2">
            {steps.map((step, index) => (
              <div 
                key={step.id}
                className={`h-1 flex-1 rounded-full transition-all ${
                  isStepComplete(step.id) || index <= currentStepIndex
                    ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500'
                    : isDark 
                      ? 'bg-white/10' 
                      : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-md mx-auto">
          {/* Notifications Step */}
          {currentStep === 'notifications' && (
            <div 
              className="space-y-6"
              style={{ animation: 'fadeSlideIn 0.4s ease-out' }}
            >
              <div className="text-center mb-8">
                <div className="inline-flex p-4 rounded-3xl bg-gradient-to-br from-blue-500 to-cyan-500 mb-4 shadow-2xl">
                  <Bell className="w-10 h-10 text-white" />
                </div>
                <h3 className={`text-xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Stay on Track
                </h3>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Enable notifications and HealthKit to get the most from Flō
                </p>
              </div>

              {/* Notifications Toggle */}
              <div 
                onClick={!isRequestingNotifications ? handleNotificationToggle : undefined}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  notificationsEnabled
                    ? 'border-cyan-500/50 bg-gradient-to-br from-cyan-500/10 to-blue-500/10'
                    : isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white/60 border-black/10 hover:bg-white/80'
                } ${isRequestingNotifications ? 'opacity-70 cursor-wait' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-xl ${
                      notificationsEnabled
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-500'
                        : isDark ? 'bg-white/10' : 'bg-gray-200'
                    }`}>
                      {isRequestingNotifications ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Bell className={`w-5 h-5 ${notificationsEnabled ? 'text-white' : isDark ? 'text-white/60' : 'text-gray-600'}`} />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Enable Notifications
                      </h4>
                      <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                        Get reminders for blood work, retests, and personalized health tips
                      </p>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                    notificationsEnabled
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-500 border-cyan-500'
                      : isDark ? 'border-white/30' : 'border-gray-300'
                  }`}>
                    {notificationsEnabled && <Check className="w-4 h-4 text-white" />}
                  </div>
                </div>
              </div>

              {/* HealthKit Toggle */}
              <div 
                onClick={!isRequestingHealthKit ? handleHealthKitToggle : undefined}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  healthKitEnabled
                    ? 'border-cyan-500/50 bg-gradient-to-br from-cyan-500/10 to-blue-500/10'
                    : isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white/60 border-black/10 hover:bg-white/80'
                } ${isRequestingHealthKit ? 'opacity-70 cursor-wait' : ''}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-xl ${
                      healthKitEnabled
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-500'
                        : isDark ? 'bg-white/10' : 'bg-gray-200'
                    }`}>
                      {isRequestingHealthKit ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Heart className={`w-5 h-5 ${healthKitEnabled ? 'text-white' : isDark ? 'text-white/60' : 'text-gray-600'}`} />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Connect Apple HealthKit
                      </h4>
                      <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                        Sync activity, sleep, and vitals for better AI insights
                      </p>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                    healthKitEnabled
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-500 border-cyan-500'
                      : isDark ? 'border-white/30' : 'border-gray-300'
                  }`}>
                    {healthKitEnabled && <Check className="w-4 h-4 text-white" />}
                  </div>
                </div>
              </div>

              {(() => {
                const isNative = Capacitor.isNativePlatform();
                const canProceed = notificationsEnabled || healthKitEnabled || !isNative;
                const hasPermission = notificationsEnabled || healthKitEnabled;
                
                return (
                  <button
                    onClick={handleNotificationsNext}
                    disabled={!canProceed}
                    className={`w-full py-4 rounded-xl font-medium transition-all ${
                      canProceed
                        ? 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 text-white shadow-lg hover:shadow-xl'
                        : isDark 
                          ? 'bg-white/10 text-white/40 cursor-not-allowed'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span>{!isNative && !hasPermission ? 'Skip for Now' : 'Continue'}</span>
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </button>
                );
              })()}
            </div>
          )}

          {/* Profile Step */}
          {currentStep === 'profile' && (
            <div 
              className="space-y-6"
              style={{ animation: 'fadeSlideIn 0.4s ease-out' }}
            >
              <div className="text-center mb-8">
                <div className="inline-flex p-4 rounded-3xl bg-gradient-to-br from-teal-500 to-emerald-500 mb-4 shadow-2xl">
                  <User className="w-10 h-10 text-white" />
                </div>
                <h3 className={`text-xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Your Profile
                </h3>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Help us personalize your experience
                </p>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                    placeholder="Your name"
                    className={inputClassName}
                  />
                </div>

                {/* Date of Birth - Three Dropdowns */}
                <div>
                  <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    Date of Birth *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {/* Year */}
                    <select
                      value={profileData.birthYear}
                      onChange={(e) => setProfileData({...profileData, birthYear: e.target.value, birthDay: ''})}
                      className={inputClassName}
                    >
                      <option value="">Year</option>
                      {years.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    
                    {/* Month */}
                    <select
                      value={profileData.birthMonth}
                      onChange={(e) => setProfileData({...profileData, birthMonth: e.target.value, birthDay: ''})}
                      className={inputClassName}
                    >
                      <option value="">Month</option>
                      {months.map(month => (
                        <option key={month.value} value={month.value}>{month.label}</option>
                      ))}
                    </select>
                    
                    {/* Day */}
                    <select
                      value={profileData.birthDay}
                      onChange={(e) => setProfileData({...profileData, birthDay: e.target.value})}
                      className={inputClassName}
                    >
                      <option value="">Day</option>
                      {availableDays.map(day => (
                        <option key={day} value={day}>{parseInt(day)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    Biological Sex *
                  </label>
                  <select
                    value={profileData.biologicalSex}
                    onChange={(e) => setProfileData({...profileData, biologicalSex: e.target.value})}
                    className={inputClassName}
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      Height ({isMetric ? 'cm' : 'inches'})
                    </label>
                    <input
                      type="number"
                      value={profileData.height}
                      onChange={(e) => setProfileData({...profileData, height: e.target.value})}
                      placeholder={isMetric ? '175' : '68'}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      Weight ({isMetric ? 'kg' : 'lbs'})
                    </label>
                    <input
                      type="number"
                      value={profileData.weight}
                      onChange={(e) => setProfileData({...profileData, weight: e.target.value})}
                      placeholder={isMetric ? '75' : '165'}
                      className={inputClassName}
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleProfileNext}
                disabled={isSavingProfile || !profileData.name || !profileData.birthYear || !profileData.birthMonth || !profileData.birthDay || !profileData.biologicalSex}
                className={`w-full py-4 rounded-xl font-medium transition-all ${
                  profileData.name && profileData.birthYear && profileData.birthMonth && profileData.birthDay && profileData.biologicalSex && !isSavingProfile
                    ? 'bg-gradient-to-r from-teal-500 via-emerald-500 to-green-500 text-white shadow-lg hover:shadow-xl'
                    : isDark 
                      ? 'bg-white/10 text-white/40 cursor-not-allowed'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </div>
              </button>
            </div>
          )}

          {/* Blood Work Step */}
          {currentStep === 'bloodwork' && (
            <div 
              className="space-y-6"
              style={{ animation: 'fadeSlideIn 0.4s ease-out' }}
            >
              <div className="text-center mb-8">
                <div className="inline-flex p-4 rounded-3xl bg-gradient-to-br from-purple-500 to-pink-500 mb-4 shadow-2xl">
                  <Upload className="w-10 h-10 text-white" />
                </div>
                <h3 className={`text-xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Upload Blood Work
                </h3>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Add your most recent blood test results
                </p>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Upload Area */}
              <div 
                onClick={() => !isUploading && !uploadComplete && fileInputRef.current?.click()}
                className={`p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all text-center ${
                  uploadComplete
                    ? 'border-purple-500/50 bg-gradient-to-br from-purple-500/10 to-pink-500/10'
                    : selectedFile
                      ? 'border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-pink-500/5'
                      : isDark 
                        ? 'border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10' 
                        : 'border-gray-300 hover:border-gray-400 bg-white/60 hover:bg-white/80'
                } ${isUploading ? 'opacity-70 cursor-wait' : ''}`}
              >
                {uploadComplete ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Check className="w-8 h-8 text-white" />
                    </div>
                    <div className={`font-medium ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                      Blood work uploaded!
                    </div>
                    <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                      Your results are being analyzed
                    </p>
                  </div>
                ) : isUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                    <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Uploading...
                    </div>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-pink-500/20`}>
                      <Upload className={`w-8 h-8 ${isDark ? 'text-purple-300' : 'text-purple-600'}`} />
                    </div>
                    <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {selectedFile.name}
                    </div>
                    <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                      Click "Upload" to analyze
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                      isDark ? 'bg-white/10' : 'bg-gray-200'
                    }`}>
                      <Upload className={`w-8 h-8 ${isDark ? 'text-white/60' : 'text-gray-600'}`} />
                    </div>
                    <div className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Tap to select file
                    </div>
                    <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                      PDF, JPEG, or PNG • Max 10MB
                    </p>
                  </div>
                )}
              </div>

              {/* Upload button when file is selected */}
              {selectedFile && !uploadComplete && !isUploading && (
                <button
                  onClick={handleUpload}
                  className="w-full py-3 rounded-xl font-medium transition-all bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white shadow-lg hover:shadow-xl"
                >
                  Upload & Analyze
                </button>
              )}

              {/* Info Box */}
              <div className={`p-4 rounded-xl border ${
                isDark ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
              }`}>
                <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                  You can also upload blood work later from the Labs screen
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleBloodworkSkip}
                  className={`flex-1 py-4 rounded-xl font-medium transition-all ${
                    isDark 
                      ? 'bg-white/10 text-white hover:bg-white/20' 
                      : 'bg-black/5 text-gray-900 hover:bg-black/10'
                  }`}
                >
                  Skip for now
                </button>
                <button
                  onClick={handleBloodworkNext}
                  disabled={!uploadComplete}
                  className={`flex-1 py-4 rounded-xl font-medium transition-all ${
                    uploadComplete
                      ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white shadow-lg hover:shadow-xl'
                      : isDark 
                        ? 'bg-white/10 text-white/40 cursor-not-allowed'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Continue</span>
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Optional Scans Step */}
          {currentStep === 'optional' && (
            <div 
              className="space-y-6"
              style={{ animation: 'fadeSlideIn 0.4s ease-out' }}
            >
              <div className="text-center mb-8">
                <div className="inline-flex p-4 rounded-3xl bg-gradient-to-br from-orange-500 to-amber-500 mb-4 shadow-2xl">
                  <Bone className="w-10 h-10 text-white" />
                </div>
                <h3 className={`text-xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Optional Scans
                </h3>
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Add advanced health assessments (you can skip this)
                </p>
              </div>

              {/* CAC Score */}
              <div 
                onClick={() => setOptionalScansUploaded({...optionalScansUploaded, cac: !optionalScansUploaded.cac})}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  optionalScansUploaded.cac
                    ? 'border-orange-500/50 bg-gradient-to-br from-orange-500/10 to-amber-500/10'
                    : isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white/60 border-black/10 hover:bg-white/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-xl ${
                      optionalScansUploaded.cac
                        ? 'bg-gradient-to-br from-orange-500 to-amber-500'
                        : isDark ? 'bg-white/10' : 'bg-gray-200'
                    }`}>
                      <Heart className={`w-5 h-5 ${optionalScansUploaded.cac ? 'text-white' : isDark ? 'text-white/60' : 'text-gray-600'}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        CAC Score (Coronary Calcium)
                      </h4>
                      <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                        Heart health assessment from CT scan
                      </p>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                    optionalScansUploaded.cac
                      ? 'bg-gradient-to-br from-orange-500 to-amber-500 border-orange-500'
                      : isDark ? 'border-white/30' : 'border-gray-300'
                  }`}>
                    {optionalScansUploaded.cac && <Check className="w-4 h-4 text-white" />}
                  </div>
                </div>
              </div>

              {/* DEXA Scan */}
              <div 
                onClick={() => setOptionalScansUploaded({...optionalScansUploaded, dexa: !optionalScansUploaded.dexa})}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  optionalScansUploaded.dexa
                    ? 'border-orange-500/50 bg-gradient-to-br from-orange-500/10 to-amber-500/10'
                    : isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white/60 border-black/10 hover:bg-white/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-xl ${
                      optionalScansUploaded.dexa
                        ? 'bg-gradient-to-br from-orange-500 to-amber-500'
                        : isDark ? 'bg-white/10' : 'bg-gray-200'
                    }`}>
                      <Bone className={`w-5 h-5 ${optionalScansUploaded.dexa ? 'text-white' : isDark ? 'text-white/60' : 'text-gray-600'}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        DEXA Scan
                      </h4>
                      <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                        Body composition and bone density analysis
                      </p>
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${
                    optionalScansUploaded.dexa
                      ? 'bg-gradient-to-br from-orange-500 to-amber-500 border-orange-500'
                      : isDark ? 'border-white/30' : 'border-gray-300'
                  }`}>
                    {optionalScansUploaded.dexa && <Check className="w-4 h-4 text-white" />}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSkipOptional}
                  className={`flex-1 py-4 rounded-xl font-medium transition-all ${
                    isDark 
                      ? 'bg-white/10 text-white hover:bg-white/20' 
                      : 'bg-black/5 text-gray-900 hover:bg-black/10'
                  }`}
                >
                  Skip
                </button>
                <button
                  onClick={handleOptionalNext}
                  className="flex-1 py-4 rounded-xl font-medium transition-all bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-lg hover:shadow-xl"
                >
                  <div className="flex items-center justify-center gap-2">
                    <span>Finish Setup</span>
                    <Check className="w-5 h-5" />
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
