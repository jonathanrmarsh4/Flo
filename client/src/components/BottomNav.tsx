import { Home, Droplets, Activity, Target } from 'lucide-react';
import { useLocation } from 'wouter';
import { FloIcon } from './FloLogo';

interface BottomNavProps {
  isDark: boolean;
  onAddClick?: () => void;
}

export function BottomNav({ isDark, onAddClick }: BottomNavProps) {
  const [location, setLocation] = useLocation();

  const tabs = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      path: '/dashboard',
    },
    {
      id: 'labs',
      label: 'Labs',
      icon: Droplets,
      path: '/labs',
    },
    {
      id: 'add',
      label: 'Add',
      icon: null,
      path: null,
      isCenter: true,
    },
    {
      id: 'diagnostics',
      label: 'Diagnostics',
      icon: Activity,
      path: '/diagnostics',
    },
    {
      id: 'actions',
      label: 'Actions',
      icon: Target,
      path: '/actions',
    },
  ];

  const handleTabClick = (tab: typeof tabs[0]) => {
    if (tab.id === 'add') {
      onAddClick?.();
    } else if (tab.path) {
      setLocation(tab.path);
    }
  };

  const isActive = (path: string | null) => {
    if (!path) return false;
    return location === path;
  };

  return (
    <nav 
      className={`fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t ${
        isDark 
          ? 'bg-slate-900/90 border-white/10' 
          : 'bg-white/90 border-gray-200'
      }`}
      data-testid="bottom-nav"
    >
      <div className="max-w-2xl mx-auto px-2 py-2">
        <div className="flex items-center justify-around">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.path);

            if (tab.isCenter) {
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab)}
                  className={`flex flex-col items-center justify-center min-w-[80px] relative ${
                    isDark ? 'text-white' : 'text-gray-900'
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <div className={`w-14 h-14 -mt-8 rounded-full flex items-center justify-center shadow-lg transition-all ${
                    isDark 
                      ? 'bg-gradient-to-br from-cyan-500 to-blue-600' 
                      : 'bg-gradient-to-br from-cyan-500 to-blue-600'
                  }`}>
                    <FloIcon size={36} />
                  </div>
                  <span className={`text-[10px] mt-1 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab)}
                className={`flex flex-col items-center justify-center py-2 min-w-[64px] transition-colors ${
                  active
                    ? isDark ? 'text-cyan-400' : 'text-cyan-600'
                    : isDark ? 'text-white/60' : 'text-gray-600'
                }`}
                data-testid={`tab-${tab.id}`}
              >
                {Icon && <Icon className={`w-6 h-6 mb-1 ${active ? 'stroke-[2.5]' : 'stroke-2'}`} />}
                <span className="text-[10px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
