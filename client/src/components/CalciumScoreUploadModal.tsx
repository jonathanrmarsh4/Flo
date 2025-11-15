import { useState } from 'react';
import { X, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { getAuthHeaders, getApiBaseUrl } from '@/lib/queryClient';

interface CalciumScoreUploadModalProps {
  isDark: boolean;
  onClose: () => void;
}

export function CalciumScoreUploadModal({ isDark, onClose }: CalciumScoreUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [useExperimental, setUseExperimental] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const endpoint = useExperimental 
        ? '/api/diagnostics/calcium-score/upload-experimental'
        : '/api/diagnostics/calcium-score/upload';
      
      const baseUrl = getApiBaseUrl();
      const fullUrl = baseUrl + endpoint;
      const headers = await getAuthHeaders();
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/diagnostics/summary'] });
      setTimeout(() => {
        onClose();
      }, 2000);
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className={`w-full max-w-md rounded-3xl border p-6 ${
          isDark ? 'bg-slate-900/95 border-white/10' : 'bg-white border-black/10'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Upload Calcium Score
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
            }`}
            data-testid="button-close-upload"
          >
            <X className={`w-5 h-5 ${isDark ? 'text-white/70' : 'text-gray-700'}`} />
          </button>
        </div>

        {/* Experimental Toggle */}
        <div className={`mb-4 p-4 rounded-2xl border ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
        }`}>
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Experimental Mode
              </div>
              <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                Uses GPT-5 for text-based PDFs
              </div>
            </div>
            <Switch
              checked={useExperimental}
              onCheckedChange={setUseExperimental}
              data-testid="toggle-experimental"
            />
          </label>
        </div>

        {/* Upload Area */}
        {!file && !uploadMutation.isPending && !uploadMutation.isSuccess && (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
              dragActive 
                ? isDark ? 'border-cyan-400 bg-cyan-400/10' : 'border-cyan-600 bg-cyan-50'
                : isDark ? 'border-white/20 hover:border-white/30' : 'border-gray-300 hover:border-gray-400'
            }`}
            data-testid="dropzone-pdf"
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 ${
              isDark ? 'text-white/40' : 'text-gray-400'
            }`} />
            <p className={`text-sm mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Drop your CAC scan PDF here
            </p>
            <p className={`text-xs mb-4 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              or click to browse
            </p>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              data-testid="input-file-pdf"
            />
          </div>
        )}

        {/* Selected File */}
        {file && !uploadMutation.isPending && !uploadMutation.isSuccess && (
          <div className={`p-4 rounded-2xl border ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${
                  isDark ? 'text-white' : 'text-gray-900'
                }`}>
                  {file.name}
                </p>
                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={() => setFile(null)}
                className={`ml-2 p-2 rounded-xl ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                }`}
                data-testid="button-remove-file"
              >
                <X className={`w-4 h-4 ${isDark ? 'text-white/70' : 'text-gray-700'}`} />
              </button>
            </div>
            <button
              onClick={handleUpload}
              className={`w-full py-3 rounded-xl font-medium transition-colors ${
                isDark 
                  ? 'bg-cyan-500 hover:bg-cyan-600 text-white' 
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white'
              }`}
              data-testid="button-upload"
            >
              Upload & Analyze
            </button>
          </div>
        )}

        {/* Loading State */}
        {uploadMutation.isPending && (
          <div className="text-center py-8">
            <div className="animate-spin w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {useExperimental ? 'Analyzing with advanced AI...' : 'Analyzing PDF...'}
            </p>
            <p className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              This may take a few moments
            </p>
          </div>
        )}

        {/* Success State */}
        {uploadMutation.isSuccess && (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Upload successful!
            </p>
            <p className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              Your results are ready
            </p>
          </div>
        )}

        {/* Error State */}
        {uploadMutation.isError && (
          <div className={`p-4 rounded-2xl border ${
            isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Upload failed
                </p>
                <p className={`text-xs mt-1 ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  {uploadMutation.error?.message || 'Please try again'}
                </p>
                <button
                  onClick={() => {
                    uploadMutation.reset();
                    setFile(null);
                  }}
                  className={`mt-3 text-xs font-medium ${
                    isDark ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'
                  }`}
                  data-testid="button-retry"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
