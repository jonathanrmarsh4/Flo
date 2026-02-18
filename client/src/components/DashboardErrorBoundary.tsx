import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  isDark?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Dashboard] Caught render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isDark = this.props.isDark ?? true;
      return (
        <div className={`flex flex-col items-center justify-center min-h-[60vh] px-6 text-center ${
          isDark ? 'text-white' : 'text-gray-900'
        }`}>
          <div className={`p-4 rounded-full mb-4 ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
            <AlertCircle className={`w-8 h-8 ${isDark ? 'text-red-400' : 'text-red-500'}`} />
          </div>
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className={`text-sm mb-6 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
            The dashboard ran into an error. Try refreshing.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${
              isDark
                ? 'bg-white/10 text-white hover:bg-white/20'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            Reload dashboard
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
