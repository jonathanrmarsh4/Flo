import { useState } from 'react';
import { ChevronRight, Check, Bell, Heart, User, Upload, Bone, CircleDot } from 'lucide-react';

interface SetupStepsProps {
  isDark: boolean;
  onComplete: () => void;
}

type SetupStep = 'notifications' | 'profile' | 'bloodwork' | 'optional' | 'complete';

export function SetupSteps({ isDark, onComplete }: SetupStepsProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>('notifications');
  const [completedSteps, setCompletedSteps] = useState<SetupStep[]>([]);
  
  // Form state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [healthKitEnabled, setHealthKitEnabled] = useState(false);
  const [profileData, setProfileData] = useState({
    name: '',
    dateOfBirth: '',
    biologicalSex: '',
    height: '',
    weight: ''
  });
  const [bloodworkUploaded, setBloodworkUploaded] = useState(false);
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

  const handleNotificationsNext = () => {
    if (notificationsEnabled || healthKitEnabled) {
      setCompletedSteps([...completedSteps, 'notifications']);
      setCurrentStep('profile');
    }
  };

  const handleProfileNext = () => {
    if (profileData.name && profileData.dateOfBirth && profileData.biologicalSex) {
      setCompletedSteps([...completedSteps, 'profile']);
      setCurrentStep('bloodwork');
    }
  };

  const handleBloodworkNext = () => {
    if (bloodworkUploaded) {
      setCompletedSteps([...completedSteps, 'bloodwork']);
      setCurrentStep('optional');
    }
  };

  const handleOptionalNext = () => {
    setCompletedSteps([...completedSteps, 'optional']);
    onComplete();
  };

  const handleSkipOptional = () => {
    onComplete();
  };

  const isStepComplete = (stepId: SetupStep) => completedSteps.includes(stepId);

  return (
    <div className="h-full flex flex-col">
      {/* Progress Header */}
      <div className={`sticky top-0 z-10 backdrop-blur-xl border-b ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-6 py-4">
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
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  notificationsEnabled
                    ? 'border-cyan-500/50 bg-gradient-to-br from-cyan-500/10 to-blue-500/10'
                    : isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white/60 border-black/10 hover:bg-white/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-xl ${
                      notificationsEnabled
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-500'
                        : isDark ? 'bg-white/10' : 'bg-gray-200'
                    }`}>
                      <Bell className={`w-5 h-5 ${notificationsEnabled ? 'text-white' : isDark ? 'text-white/60' : 'text-gray-600'}`} />
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
                onClick={() => setHealthKitEnabled(!healthKitEnabled)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  healthKitEnabled
                    ? 'border-cyan-500/50 bg-gradient-to-br from-cyan-500/10 to-blue-500/10'
                    : isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white/60 border-black/10 hover:bg-white/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-xl ${
                      healthKitEnabled
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-500'
                        : isDark ? 'bg-white/10' : 'bg-gray-200'
                    }`}>
                      <Heart className={`w-5 h-5 ${healthKitEnabled ? 'text-white' : isDark ? 'text-white/60' : 'text-gray-600'}`} />
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

              <button
                onClick={handleNotificationsNext}
                disabled={!notificationsEnabled && !healthKitEnabled}
                className={`w-full py-4 rounded-xl font-medium transition-all ${
                  notificationsEnabled || healthKitEnabled
                    ? 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 text-white shadow-lg hover:shadow-xl'
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
                    className={`w-full px-4 py-3 rounded-xl border transition-all ${
                      isDark 
                        ? 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:bg-white/10 focus:border-cyan-500/50' 
                        : 'bg-white/60 border-black/10 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-cyan-500/50'
                    } focus:outline-none`}
                  />
                </div>

                <div>
                  <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    value={profileData.dateOfBirth}
                    onChange={(e) => setProfileData({...profileData, dateOfBirth: e.target.value})}
                    className={`w-full px-4 py-3 rounded-xl border transition-all ${
                      isDark 
                        ? 'bg-white/5 border-white/10 text-white focus:bg-white/10 focus:border-cyan-500/50' 
                        : 'bg-white/60 border-black/10 text-gray-900 focus:bg-white focus:border-cyan-500/50'
                    } focus:outline-none`}
                  />
                </div>

                <div>
                  <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    Biological Sex *
                  </label>
                  <select
                    value={profileData.biologicalSex}
                    onChange={(e) => setProfileData({...profileData, biologicalSex: e.target.value})}
                    className={`w-full px-4 py-3 rounded-xl border transition-all ${
                      isDark 
                        ? 'bg-white/5 border-white/10 text-white focus:bg-white/10 focus:border-cyan-500/50' 
                        : 'bg-white/60 border-black/10 text-gray-900 focus:bg-white focus:border-cyan-500/50'
                    } focus:outline-none`}
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      value={profileData.height}
                      onChange={(e) => setProfileData({...profileData, height: e.target.value})}
                      placeholder="175"
                      className={`w-full px-4 py-3 rounded-xl border transition-all ${
                        isDark 
                          ? 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:bg-white/10 focus:border-cyan-500/50' 
                          : 'bg-white/60 border-black/10 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-cyan-500/50'
                      } focus:outline-none`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      value={profileData.weight}
                      onChange={(e) => setProfileData({...profileData, weight: e.target.value})}
                      placeholder="75"
                      className={`w-full px-4 py-3 rounded-xl border transition-all ${
                        isDark 
                          ? 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:bg-white/10 focus:border-cyan-500/50' 
                          : 'bg-white/60 border-black/10 text-gray-900 placeholder-gray-400 focus:bg-white focus:border-cyan-500/50'
                      } focus:outline-none`}
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={handleProfileNext}
                disabled={!profileData.name || !profileData.dateOfBirth || !profileData.biologicalSex}
                className={`w-full py-4 rounded-xl font-medium transition-all ${
                  profileData.name && profileData.dateOfBirth && profileData.biologicalSex
                    ? 'bg-gradient-to-r from-teal-500 via-emerald-500 to-green-500 text-white shadow-lg hover:shadow-xl'
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

              {/* Upload Area */}
              <div 
                onClick={() => setBloodworkUploaded(true)}
                className={`p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all text-center ${
                  bloodworkUploaded
                    ? 'border-purple-500/50 bg-gradient-to-br from-purple-500/10 to-pink-500/10'
                    : isDark 
                      ? 'border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10' 
                      : 'border-gray-300 hover:border-gray-400 bg-white/60 hover:bg-white/80'
                }`}
              >
                {bloodworkUploaded ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Check className="w-8 h-8 text-white" />
                    </div>
                    <div className={`font-medium ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                      Blood work uploaded!
                    </div>
                    <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                      Your results are ready to analyze
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
                      Click to upload
                    </div>
                    <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                      PDF, JPEG, or PNG • Max 10MB
                    </p>
                  </div>
                )}
              </div>

              {/* Info Box */}
              <div className={`p-4 rounded-xl border ${
                isDark ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
              }`}>
                <p className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                  💡 Tip: You can also manually enter your biomarker values after setup
                </p>
              </div>

              <button
                onClick={handleBloodworkNext}
                disabled={!bloodworkUploaded}
                className={`w-full py-4 rounded-xl font-medium transition-all ${
                  bloodworkUploaded
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
