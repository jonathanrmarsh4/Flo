import { Flame, Snowflake, Clock, Activity } from 'lucide-react';
import { useState } from 'react';
import { SaunaLogModal, SaunaSessionData } from './SaunaLogModal';
import { IceBathLogModal, IceBathSessionData } from './IceBathLogModal';

interface RecoveryTabProps {
  isDark: boolean;
  sessions: RecoverySession[];
  stats: RecoveryStats | null;
  onSaveSauna: (data: SaunaSessionData) => Promise<void>;
  onSaveIceBath: (data: IceBathSessionData) => Promise<void>;
  isLoading?: boolean;
}

export interface RecoverySession {
  id: string;
  session_type: 'sauna' | 'icebath';
  session_date: string;
  duration_minutes: number;
  duration_seconds: number | null;
  temperature: number | null;
  temperature_unit: string | null;
  timing: string | null;
  feeling: number | null;
  calories_burned: number | null;
  recovery_score: number | null;
  benefit_tags: string[] | null;
  created_at: string;
}

export interface RecoveryStats {
  totalSaunaSessions: number;
  totalIceBathSessions: number;
  totalSaunaMinutes: number;
  totalIceBathMinutes: number;
  totalCaloriesBurned: number;
  avgRecoveryScore: number;
}

export function RecoveryTab({ isDark, sessions, stats, onSaveSauna, onSaveIceBath, isLoading }: RecoveryTabProps) {
  const [showSaunaModal, setShowSaunaModal] = useState(false);
  const [showIceBathModal, setShowIceBathModal] = useState(false);
  const [savingType, setSavingType] = useState<'sauna' | 'icebath' | null>(null);

  const handleSaveSauna = async (data: SaunaSessionData) => {
    setSavingType('sauna');
    try {
      await onSaveSauna(data);
    } finally {
      setSavingType(null);
    }
  };

  const handleSaveIceBath = async (data: IceBathSessionData) => {
    setSavingType('icebath');
    try {
      await onSaveIceBath(data);
    } finally {
      setSavingType(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const getTotalSaunaSessions = () => stats?.totalSaunaSessions ?? sessions.filter(s => s.session_type === 'sauna').length;
  const getTotalIceBathSessions = () => stats?.totalIceBathSessions ?? sessions.filter(s => s.session_type === 'icebath').length;
  const getTotalSaunaMinutes = () => {
    if (stats?.totalSaunaMinutes) return stats.totalSaunaMinutes;
    return sessions
      .filter(s => s.session_type === 'sauna')
      .reduce((total, s) => total + s.duration_minutes, 0);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Thermal Recovery
        </h2>
        <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
          Track sauna sessions and ice baths for enhanced recovery
        </p>
      </div>

      {sessions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className={`backdrop-blur-xl rounded-2xl border p-4 ${
            isDark 
              ? 'bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20' 
              : 'bg-gradient-to-br from-orange-50 to-red-50 border-orange-200'
          }`}>
            <Flame className={`w-5 h-5 mb-2 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
            <div className={`text-2xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-sauna-count">
              {getTotalSaunaSessions()}
            </div>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-600'}`}>
              Sauna
            </div>
          </div>
          <div className={`backdrop-blur-xl rounded-2xl border p-4 ${
            isDark 
              ? 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/20' 
              : 'bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-200'
          }`}>
            <Snowflake className={`w-5 h-5 mb-2 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
            <div className={`text-2xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-icebath-count">
              {getTotalIceBathSessions()}
            </div>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-600'}`}>
              Ice Bath
            </div>
          </div>
          <div className={`backdrop-blur-xl rounded-2xl border p-4 ${
            isDark 
              ? 'bg-white/5 border-white/10' 
              : 'bg-white/60 border-black/10'
          }`}>
            <Clock className={`w-5 h-5 mb-2 ${isDark ? 'text-white/70' : 'text-gray-700'}`} />
            <div className={`text-2xl mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`} data-testid="text-total-minutes">
              {getTotalSaunaMinutes()}
            </div>
            <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-600'}`}>
              Total Mins
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setShowSaunaModal(true)}
          className={`p-6 rounded-2xl border-2 border-dashed transition-all active:scale-95 ${
            isDark 
              ? 'bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/30 hover:from-orange-500/20 hover:to-red-500/20' 
              : 'bg-gradient-to-br from-orange-50 to-red-50 border-orange-300 hover:from-orange-100 hover:to-red-100'
          }`}
          data-testid="button-log-sauna"
        >
          <Flame className={`w-8 h-8 mx-auto mb-3 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
          <div className={`text-sm mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Log Sauna
          </div>
          <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-600'}`}>
            Track heat exposure
          </div>
        </button>

        <button
          onClick={() => setShowIceBathModal(true)}
          className={`p-6 rounded-2xl border-2 border-dashed transition-all active:scale-95 ${
            isDark 
              ? 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30 hover:from-cyan-500/20 hover:to-blue-500/20' 
              : 'bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-300 hover:from-cyan-100 hover:to-blue-100'
          }`}
          data-testid="button-log-icebath"
        >
          <Snowflake className={`w-8 h-8 mx-auto mb-3 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
          <div className={`text-sm mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Log Ice Bath
          </div>
          <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-600'}`}>
            Track cold exposure
          </div>
        </button>
      </div>

      {sessions.length > 0 ? (
        <div>
          <h3 className={`text-sm uppercase tracking-wider mb-3 ${
            isDark ? 'text-white/40' : 'text-gray-500'
          }`}>
            Recent Sessions
          </h3>
          <div className="space-y-3">
            {sessions.map((session) => {
              if (session.session_type === 'sauna') {
                return (
                  <div
                    key={session.id}
                    className={`backdrop-blur-xl rounded-2xl border p-4 ${
                      isDark 
                        ? 'bg-gradient-to-r from-orange-500/5 to-red-500/5 border-orange-500/20' 
                        : 'bg-gradient-to-r from-orange-50/50 to-red-50/50 border-orange-200'
                    }`}
                    data-testid={`card-session-${session.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-3 rounded-xl ${
                        isDark ? 'bg-orange-500/20' : 'bg-orange-100'
                      }`}>
                        <Flame className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Sauna Session
                          </h4>
                          <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                            {formatDate(session.created_at)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                              Duration
                            </div>
                            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {session.duration_minutes} min
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                              Temp
                            </div>
                            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {session.temperature ? `${session.temperature}°${session.temperature_unit}` : '—'}
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                              Score
                            </div>
                            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {session.recovery_score ?? '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div
                    key={session.id}
                    className={`backdrop-blur-xl rounded-2xl border p-4 ${
                      isDark 
                        ? 'bg-gradient-to-r from-cyan-500/5 to-blue-500/5 border-cyan-500/20' 
                        : 'bg-gradient-to-r from-cyan-50/50 to-blue-50/50 border-cyan-200'
                    }`}
                    data-testid={`card-session-${session.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-3 rounded-xl ${
                        isDark ? 'bg-cyan-500/20' : 'bg-cyan-100'
                      }`}>
                        <Snowflake className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Ice Bath
                          </h4>
                          <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                            {formatDate(session.created_at)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                              Duration
                            </div>
                            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {session.duration_minutes}:{(session.duration_seconds ?? 0).toString().padStart(2, '0')}
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                              Temp
                            </div>
                            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {session.temperature ? `${session.temperature}°${session.temperature_unit}` : '—'}
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                              Score
                            </div>
                            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {session.recovery_score ?? '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>
      ) : (
        <div className={`text-center py-12 ${
          isDark 
            ? 'bg-white/5 border border-white/10' 
            : 'bg-white/60 border border-black/10'
        } rounded-2xl`}>
          <Activity className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-white/30' : 'text-gray-300'}`} />
          <p className={`text-sm mb-1 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
            No recovery sessions yet
          </p>
          <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            Log your first sauna or ice bath session above
          </p>
        </div>
      )}

      {showSaunaModal && (
        <SaunaLogModal
          isDark={isDark}
          onClose={() => setShowSaunaModal(false)}
          onSave={handleSaveSauna}
          isLoading={savingType === 'sauna'}
        />
      )}

      {showIceBathModal && (
        <IceBathLogModal
          isDark={isDark}
          onClose={() => setShowIceBathModal(false)}
          onSave={handleSaveIceBath}
          isLoading={savingType === 'icebath'}
        />
      )}
    </div>
  );
}
