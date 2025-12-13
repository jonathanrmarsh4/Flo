import { X, Snowflake, Clock, Thermometer, Zap, Dumbbell, Meh, Wind, Waves } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface IceBathLogModalProps {
  isDark: boolean;
  onClose: () => void;
  onSave: (data: IceBathSessionData) => void;
  isLoading?: boolean;
}

export interface IceBathSessionData {
  durationMinutes: number;
  durationSeconds: number;
  temperature: number;
  temperatureUnit: 'F' | 'C';
  feeling: number;
  timestamp: string;
}

const FEELING_LABELS = [
  { value: 1, label: 'Invigorated', icon: Zap, color: 'from-blue-500 to-cyan-500' },
  { value: 2, label: 'Energized', icon: Dumbbell, color: 'from-cyan-500 to-teal-500' },
  { value: 3, label: 'Neutral', icon: Meh, color: 'from-teal-500 to-green-500' },
  { value: 4, label: 'Cold', icon: Wind, color: 'from-blue-400 to-indigo-500' },
  { value: 5, label: 'Shivering', icon: Waves, color: 'from-indigo-500 to-purple-500' }
];

export function IceBathLogModal({ isDark, onClose, onSave, isLoading }: IceBathLogModalProps) {
  const [durationMinutes, setDurationMinutes] = useState(3);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [temperature, setTemperature] = useState(50);
  const [temperatureUnit, setTemperatureUnit] = useState<'F' | 'C'>('F');
  const [feeling, setFeeling] = useState(2);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSave = () => {
    const data: IceBathSessionData = {
      durationMinutes,
      durationSeconds,
      temperature,
      temperatureUnit,
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

  const getTotalSeconds = () => durationMinutes * 60 + durationSeconds;

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
                    isDark ? 'bg-gradient-to-br from-cyan-500 to-blue-500' : 'bg-gradient-to-br from-cyan-400 to-blue-400'
                  }`}>
                    <Snowflake className="w-12 h-12 text-white" />
                  </div>
                </motion.div>
                <div className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Ice Bath Logged!
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
                isDark ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20' : 'bg-gradient-to-br from-cyan-100 to-blue-100'
              }`}>
                <Snowflake className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
              </div>
              <div>
                <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Log Ice Bath
                </h2>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  Track your cold exposure
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all hover:scale-110 ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-close-icebath-modal"
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
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Clock className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${
                  isDark ? 'text-white/40' : 'text-gray-400'
                }`} />
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
                  className={`w-full pl-12 pr-4 py-4 rounded-xl border text-lg ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-white' 
                      : 'bg-white border-gray-200 text-gray-900'
                  }`}
                  min="0"
                  max="60"
                  data-testid="input-icebath-minutes"
                />
                <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm ${
                  isDark ? 'text-white/50' : 'text-gray-500'
                }`}>
                  min
                </span>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className={`w-full pl-4 pr-4 py-4 rounded-xl border text-lg ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-white' 
                      : 'bg-white border-gray-200 text-gray-900'
                  }`}
                  min="0"
                  max="59"
                  data-testid="input-icebath-seconds"
                />
                <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-sm ${
                  isDark ? 'text-white/50' : 'text-gray-500'
                }`}>
                  sec
                </span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-3">
              {[
                { min: 1, sec: 30, label: '1:30' },
                { min: 2, sec: 0, label: '2:00' },
                { min: 3, sec: 0, label: '3:00' },
                { min: 5, sec: 0, label: '5:00' }
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setDurationMinutes(preset.min);
                    setDurationSeconds(preset.sec);
                  }}
                  className={`py-2 rounded-lg text-sm transition-all ${
                    durationMinutes === preset.min && durationSeconds === preset.sec
                      ? isDark 
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 border-2' 
                        : 'bg-cyan-100 border-cyan-500 text-cyan-700 border-2'
                      : isDark 
                        ? 'bg-white/5 border-white/10 text-white/70 border hover:bg-white/10' 
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                  data-testid={`button-icebath-duration-${preset.label}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
              Total: {getTotalSeconds()} seconds
            </p>
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
                  data-testid="input-icebath-temperature"
                />
              </div>
              <button
                onClick={toggleTemperatureUnit}
                className={`px-6 py-4 rounded-xl border transition-all ${
                  isDark 
                    ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' 
                    : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
                }`}
                data-testid="button-icebath-temp-unit"
              >
                °{temperatureUnit}
              </button>
            </div>
            <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-gray-500'}`}>
              Default: {temperatureUnit === 'F' ? '50°F (10°C)' : '10°C (50°F)'}
            </p>
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
                  data-testid={`button-icebath-feeling-${item.value}`}
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

        <div className={`sticky bottom-0 backdrop-blur-xl px-6 py-4 border-t ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-white/70 border-black/10'
        }`}>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className={`w-full py-4 rounded-xl text-white transition-all active:scale-95 ${
              isDark 
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600' 
                : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="button-save-icebath"
          >
            <span className="flex items-center justify-center gap-2">
              <Snowflake className="w-5 h-5" />
              {isLoading ? 'Saving...' : 'Log Ice Bath'}
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
