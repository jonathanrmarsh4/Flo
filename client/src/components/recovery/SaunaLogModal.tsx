import { X, Flame, Clock, Thermometer, Activity, Sparkles, Smile, Meh, Droplets, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SaunaLogModalProps {
  isDark: boolean;
  onClose: () => void;
  onSave: (data: SaunaSessionData) => void;
  isLoading?: boolean;
}

export interface SaunaSessionData {
  duration: number;
  temperature: number;
  temperatureUnit: 'F' | 'C';
  timing: 'post-workout' | 'separate';
  feeling: number;
  timestamp: string;
}

const FEELING_LABELS = [
  { value: 1, label: 'Relaxed', icon: Smile, color: 'from-green-500 to-teal-500' },
  { value: 2, label: 'Calm', icon: Smile, color: 'from-teal-500 to-blue-500' },
  { value: 3, label: 'Neutral', icon: Meh, color: 'from-blue-500 to-indigo-500' },
  { value: 4, label: 'Fatigued', icon: Droplets, color: 'from-amber-500 to-orange-500' },
  { value: 5, label: 'Drained', icon: AlertCircle, color: 'from-orange-500 to-red-500' }
];

export function SaunaLogModal({ isDark, onClose, onSave, isLoading }: SaunaLogModalProps) {
  const [duration, setDuration] = useState(15);
  const [temperature, setTemperature] = useState(175);
  const [temperatureUnit, setTemperatureUnit] = useState<'F' | 'C'>('F');
  const [timing, setTiming] = useState<'post-workout' | 'separate'>('separate');
  const [feeling, setFeeling] = useState(2);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSave = () => {
    const data: SaunaSessionData = {
      duration,
      temperature,
      temperatureUnit,
      timing,
      feeling,
      timestamp: new Date().toISOString()
    };
    
    setShowSuccess(true);
    setTimeout(() => {
      onSave(data);
      onClose();
    }, 1500);
  };

  const convertTemp = (temp: number, fromUnit: 'F' | 'C', toUnit: 'F' | 'C') => {
    if (fromUnit === toUnit) return temp;
    if (fromUnit === 'F' && toUnit === 'C') {
      return Math.round((temp - 32) * 5 / 9);
    }
    return Math.round(temp * 9 / 5 + 32);
  };

  const toggleTemperatureUnit = () => {
    const newUnit = temperatureUnit === 'F' ? 'C' : 'F';
    setTemperature(convertTemp(temperature, temperatureUnit, newUnit));
    setTemperatureUnit(newUnit);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={`relative w-full max-w-lg rounded-t-3xl overflow-hidden ${
          isDark 
            ? 'bg-gradient-to-b from-slate-900 to-slate-950 border-t border-white/10' 
            : 'bg-gradient-to-b from-white to-gray-50 border-t border-black/10'
        }`}
        style={{ maxHeight: '90vh' }}
      >
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10"
            >
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 10, stiffness: 200 }}
                  className="flex items-center justify-center mb-4"
                >
                  <div className={`p-6 rounded-full ${
                    isDark ? 'bg-gradient-to-br from-orange-500 to-red-500' : 'bg-gradient-to-br from-orange-400 to-red-400'
                  }`}>
                    <Flame className="w-12 h-12 text-white" />
                  </div>
                </motion.div>
                <div className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Sauna Session Logged!
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`sticky top-0 z-10 backdrop-blur-xl px-6 py-4 border-b ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${
                isDark ? 'bg-gradient-to-br from-orange-500/20 to-red-500/20' : 'bg-gradient-to-br from-orange-100 to-red-100'
              }`}>
                <Flame className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
              </div>
              <div>
                <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Log Sauna Session
                </h2>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Track your thermal recovery
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all hover:scale-110 ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-close-sauna-modal"
            >
              <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-600'}`} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-6 space-y-6" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          <div>
            <label className={`block text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Duration <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Clock className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${
                isDark ? 'text-white/40' : 'text-gray-400'
              }`} />
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
                className={`w-full pl-12 pr-20 py-4 rounded-xl border text-lg ${
                  isDark 
                    ? 'bg-white/5 border-white/10 text-white' 
                    : 'bg-white border-gray-200 text-gray-900'
                }`}
                min="1"
                max="120"
                data-testid="input-sauna-duration"
              />
              <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm ${
                isDark ? 'text-white/50' : 'text-gray-500'
              }`}>
                minutes
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[10, 15, 20, 30].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setDuration(preset)}
                  className={`py-2 rounded-lg text-sm transition-all ${
                    duration === preset
                      ? isDark 
                        ? 'bg-orange-500/20 border-orange-500/50 text-orange-400 border-2' 
                        : 'bg-orange-100 border-orange-500 text-orange-700 border-2'
                      : isDark 
                        ? 'bg-white/5 border-white/10 text-white/70 border hover:bg-white/10' 
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                  data-testid={`button-sauna-duration-${preset}`}
                >
                  {preset}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={`block text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Temperature (Optional)
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Thermometer className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${
                  isDark ? 'text-white/40' : 'text-gray-400'
                }`} />
                <input
                  type="number"
                  value={temperature}
                  onChange={(e) => setTemperature(parseInt(e.target.value) || 0)}
                  className={`w-full pl-12 pr-4 py-4 rounded-xl border text-lg ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-white' 
                      : 'bg-white border-gray-200 text-gray-900'
                  }`}
                  data-testid="input-sauna-temperature"
                />
              </div>
              <button
                onClick={toggleTemperatureUnit}
                className={`px-6 py-4 rounded-xl border transition-all ${
                  isDark 
                    ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' 
                    : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
                }`}
                data-testid="button-sauna-temp-unit"
              >
                °{temperatureUnit}
              </button>
            </div>
            <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
              Default: {temperatureUnit === 'F' ? '175°F (80°C)' : '80°C (175°F)'}
            </p>
          </div>

          <div>
            <label className={`block text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Session Timing <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTiming('post-workout')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  timing === 'post-workout'
                    ? isDark 
                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' 
                      : 'bg-orange-100 border-orange-500 text-orange-700'
                    : isDark 
                      ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10' 
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                data-testid="button-sauna-timing-post-workout"
              >
                <Activity className="w-5 h-5 mx-auto mb-2" />
                <div className="text-sm">Post-Workout</div>
                <div className={`text-xs mt-1 ${
                  timing === 'post-workout' 
                    ? isDark ? 'text-orange-400/70' : 'text-orange-600' 
                    : isDark ? 'text-white/40' : 'text-gray-500'
                }`}>
                  Extends recovery
                </div>
              </button>
              <button
                onClick={() => setTiming('separate')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  timing === 'separate'
                    ? isDark 
                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' 
                      : 'bg-orange-100 border-orange-500 text-orange-700'
                    : isDark 
                      ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10' 
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
                data-testid="button-sauna-timing-separate"
              >
                <Sparkles className="w-5 h-5 mx-auto mb-2" />
                <div className="text-sm">Separate Session</div>
                <div className={`text-xs mt-1 ${
                  timing === 'separate' 
                    ? isDark ? 'text-orange-400/70' : 'text-orange-600' 
                    : isDark ? 'text-white/40' : 'text-gray-500'
                }`}>
                  Standalone
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-sm mb-3 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              How do you feel? (Optional)
            </label>
            <div className="space-y-2">
              {FEELING_LABELS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setFeeling(item.value)}
                  className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                    feeling === item.value
                      ? isDark 
                        ? `bg-gradient-to-r ${item.color} bg-opacity-20 border-white/30 text-white` 
                        : `bg-gradient-to-r ${item.color} bg-opacity-10 border-current text-gray-900`
                      : isDark 
                        ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10' 
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                  data-testid={`button-sauna-feeling-${item.value}`}
                >
                  <item.icon className="w-6 h-6" />
                  <div className="flex-1 text-left">
                    <div className="text-sm">{item.label}</div>
                    <div className={`text-xs ${
                      feeling === item.value 
                        ? isDark ? 'text-white/60' : 'text-gray-600' 
                        : isDark ? 'text-white/40' : 'text-gray-500'
                    }`}>
                      Level {item.value}
                    </div>
                  </div>
                  {feeling === item.value && (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isDark ? 'bg-white/20' : 'bg-black/10'
                    }`}>
                      <div className="w-3 h-3 rounded-full bg-current" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div 
          className={`sticky bottom-0 backdrop-blur-xl px-6 py-4 border-t ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
          }`}
          style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={handleSave}
            disabled={isLoading}
            className={`w-full py-4 rounded-xl text-white transition-all active:scale-95 ${
              isDark 
                ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600' 
                : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="button-save-sauna"
          >
            <span className="flex items-center justify-center gap-2">
              <Flame className="w-5 h-5" />
              {isLoading ? 'Saving...' : 'Log Sauna Session'}
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
