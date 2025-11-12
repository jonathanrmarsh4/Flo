import { User, Calendar, Weight, Ruler, Activity, Moon, Target, Brain, Bell, Shield, FileText, Info, Download, Trash2, ChevronRight, Edit2, Heart } from 'lucide-react';
import { useState } from 'react';

interface ProfileScreenProps {
  isDark: boolean;
  onClose: () => void;
}

export function ProfileScreen({ isDark, onClose }: ProfileScreenProps) {
  const [isEditing, setIsEditing] = useState(false);
  
  // Mock user data
  const [profile, setProfile] = useState({
    demographics: {
      age: 49,
      sex: 'Male',
      weight: 82,
      weightUnit: 'kg',
      height: 178,
      heightUnit: 'cm'
    },
    healthBaseline: {
      activityLevel: 'Moderate',
      sleepHours: 7.5,
      dietType: 'Balanced',
      smokingStatus: 'Never',
      alcoholIntake: 'Occasional'
    },
    goals: ['Longevity', 'Cardiovascular Health', 'Metabolic Optimization'],
    aiPersonalization: {
      tone: 'Professional',
      insightsFrequency: 'Weekly',
      focusAreas: ['Heart Health', 'Inflammation', 'Metabolic Health']
    }
  });

  const activityLevels = ['Sedentary', 'Light', 'Moderate', 'Active', 'Very Active'];
  const dietTypes = ['Balanced', 'Low Carb', 'Mediterranean', 'Vegetarian', 'Vegan', 'Keto', 'Paleo'];
  const toneOptions = ['Casual', 'Professional', 'Scientific'];
  const frequencyOptions = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly'];
  const goalOptions = ['Longevity', 'Performance', 'Prevention', 'Weight Management', 'Cardiovascular Health', 'Metabolic Optimization', 'Cognitive Health'];
  const focusAreaOptions = ['Heart Health', 'Inflammation', 'Metabolic Health', 'Liver Function', 'Kidney Function', 'Hormones', 'Nutrition', 'Immunity'];

  return (
    <div className={`h-full overflow-y-auto pb-20 transition-colors ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900' 
        : 'bg-gradient-to-br from-blue-50 via-teal-50 to-cyan-50'
    }`}>
      {/* Header */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
      }`}>
        <div className="px-4 py-4">
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
              onClick={() => setIsEditing(!isEditing)}
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
        {/* Profile Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-3 border-4 ${
            isDark 
              ? 'bg-gradient-to-br from-teal-500/20 to-blue-500/20 border-white/10' 
              : 'bg-gradient-to-br from-teal-100 to-blue-100 border-white'
          }`}>
            <User className={`w-12 h-12 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          </div>
          <div className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-profile-title">
            Your Health Profile
          </div>
          <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`} data-testid="text-age-summary">
            Bio Age: 46 • Chronological: 49
          </div>
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
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Calendar className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Age</span>
              </div>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-age">
                {profile.demographics.age} years
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <User className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Sex</span>
              </div>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sex">
                {profile.demographics.sex}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Weight className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Weight</span>
              </div>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-weight">
                {profile.demographics.weight} {profile.demographics.weightUnit}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Ruler className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Height</span>
              </div>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-height">
                {profile.demographics.height} {profile.demographics.heightUnit}
              </span>
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
            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Activity Level</span>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-activity">
                {profile.healthBaseline.activityLevel}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Moon className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Sleep</span>
              </div>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sleep">
                {profile.healthBaseline.sleepHours} hours/night
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Diet Type</span>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-diet">
                {profile.healthBaseline.dietType}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-white/10">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Smoking</span>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-smoking">
                {profile.healthBaseline.smokingStatus}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>Alcohol</span>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-alcohol">
                {profile.healthBaseline.alcoholIntake}
              </span>
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

          <div className="flex flex-wrap gap-2">
            {profile.goals.map((goal, idx) => (
              <div 
                key={idx}
                className={`px-3 py-2 rounded-full text-xs ${
                  isDark 
                    ? 'bg-gradient-to-r from-teal-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30' 
                    : 'bg-gradient-to-r from-teal-100 to-blue-100 text-cyan-700 border border-cyan-200'
                }`}
                data-testid={`badge-goal-${idx}`}
              >
                {goal}
              </div>
            ))}
          </div>
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
                    className={`flex-1 py-2 px-3 rounded-xl text-xs transition-all ${
                      profile.aiPersonalization.tone === tone
                        ? isDark 
                          ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                          : 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                        : isDark
                          ? 'bg-white/10 text-white/70 hover:bg-white/20'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
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
                    className={`py-2 px-3 rounded-xl text-xs transition-all ${
                      profile.aiPersonalization.insightsFrequency === freq
                        ? isDark 
                          ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                          : 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                        : isDark
                          ? 'bg-white/10 text-white/70 hover:bg-white/20'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
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
              <div className="flex flex-wrap gap-2">
                {profile.aiPersonalization.focusAreas.map((area, idx) => (
                  <div 
                    key={idx}
                    className={`px-3 py-1.5 rounded-full text-xs ${
                      isDark 
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                        : 'bg-purple-100 text-purple-700 border border-purple-200'
                    }`}
                    data-testid={`badge-focus-${idx}`}
                  >
                    {area}
                  </div>
                ))}
              </div>
              <button className={`mt-2 text-xs ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} data-testid="button-customize-focus">
                + Customize focus areas
              </button>
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
            <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
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

            <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-privacy-settings">
              <div className="flex items-center gap-3">
                <Shield className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                  Privacy Settings
                </span>
              </div>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
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
            <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-privacy-policy">
              <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                Privacy Policy
              </span>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-terms">
              <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                Terms of Service
              </span>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-disclaimer">
              <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                Medical Disclaimer
              </span>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-about">
              <div className="flex items-center gap-3">
                <Info className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`} />
                <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                  About Flō
                </span>
              </div>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-help">
              <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                Help & Support
              </span>
              <ChevronRight className={`w-4 h-4 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
            </button>

            <button className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`} data-testid="button-contact">
              <span className={`text-sm ${isDark ? 'text-white/80' : 'text-gray-800'}`}>
                Contact Us
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
    </div>
  );
}
