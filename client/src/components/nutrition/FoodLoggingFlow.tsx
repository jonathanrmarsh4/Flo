import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Mic, Camera, Barcode, Search, Loader2, Check, ChevronLeft, Plus, Minus, AlertCircle } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { FloIcon } from '../FloLogo';

type InputMode = 'select' | 'voice' | 'photo' | 'barcode' | 'search';
type FlowStep = 'input' | 'results' | 'confirm';

interface FoodSearchResult {
  id: string;
  name: string;
  brand?: string;
  type: string;
  description: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  servingDescription?: string;
}

interface SelectedFood {
  id: string;
  name: string;
  brand?: string;
  portion: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface FoodLoggingFlowProps {
  isDark: boolean;
  onClose: () => void;
  onMealLogged: () => void;
}

export function FoodLoggingFlow({ isDark, onClose, onMealLogged }: FoodLoggingFlowProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<InputMode>('select');
  const [step, setStep] = useState<FlowStep>('input');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<SelectedFood[]>([]);
  const [mealType, setMealType] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const determineMealType = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'Breakfast';
    if (hour >= 11 && hour < 15) return 'Lunch';
    if (hour >= 15 && hour < 18) return 'Snack';
    return 'Dinner';
  };

  useEffect(() => {
    if (!mealType) {
      setMealType(determineMealType());
    }
  }, [mealType]);

  const searchFoodsMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiRequest('POST', '/api/food/search', { query });
      return response.json();
    },
    onSuccess: (data) => {
      setSearchResults(data.results || []);
      if (data.results?.length > 0) {
        setStep('results');
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Search failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const barcodeLookupMutation = useMutation({
    mutationFn: async (barcode: string) => {
      const response = await apiRequest('POST', '/api/food/barcode', { barcode });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.food) {
        setSearchResults([data.food]);
        setStep('results');
      } else {
        toast({
          title: 'Product not found',
          description: 'Try searching by name instead',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Barcode lookup failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const photoRecognizeMutation = useMutation({
    mutationFn: async (imageBase64: string) => {
      const response = await apiRequest('POST', '/api/food/recognize', { image: imageBase64 });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.results?.length > 0) {
        setSearchResults(data.results);
        setStep('results');
      } else {
        toast({
          title: 'Could not identify food',
          description: 'Try searching by name instead',
        });
        setMode('search');
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Photo recognition failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const logMealMutation = useMutation({
    mutationFn: async (data: { mealType: string; foods: SelectedFood[] }) => {
      const response = await apiRequest('POST', '/api/food/log', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Meal logged',
        description: `${mealType} has been saved`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/nutrition'] });
      onMealLogged();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to log meal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      setIsSearching(true);
      searchFoodsMutation.mutate(searchQuery.trim());
      setIsSearching(false);
    }
  }, [searchQuery, searchFoodsMutation]);

  const handleVoiceInput = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Voice not supported',
        description: 'Your browser does not support voice input',
        variant: 'destructive',
      });
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setVoiceTranscript(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (voiceTranscript) {
        setSearchQuery(voiceTranscript);
        searchFoodsMutation.mutate(voiceTranscript);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast({
        title: 'Voice input failed',
        description: 'Please try again or type your search',
        variant: 'destructive',
      });
    };

    recognition.start();
  }, [voiceTranscript, searchFoodsMutation, toast]);

  const handlePhotoCapture = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      photoRecognizeMutation.mutate(base64);
    };
    reader.readAsDataURL(file);
  }, [photoRecognizeMutation]);

  const handleBarcodeInput = useCallback((barcode: string) => {
    if (barcode.trim()) {
      barcodeLookupMutation.mutate(barcode.trim());
    }
  }, [barcodeLookupMutation]);

  const addFood = useCallback((food: FoodSearchResult) => {
    const selected: SelectedFood = {
      id: food.id,
      name: food.name,
      brand: food.brand,
      portion: food.servingDescription || '1 serving',
      quantity: 1,
      calories: food.calories || 0,
      protein: food.protein || 0,
      carbs: food.carbs || 0,
      fat: food.fat || 0,
    };
    setSelectedFoods(prev => [...prev, selected]);
  }, []);

  const removeFood = useCallback((foodId: string) => {
    setSelectedFoods(prev => prev.filter(f => f.id !== foodId));
  }, []);

  const updateQuantity = useCallback((foodId: string, delta: number) => {
    setSelectedFoods(prev => prev.map(f => {
      if (f.id === foodId) {
        const newQty = Math.max(0.5, f.quantity + delta);
        return { ...f, quantity: newQty };
      }
      return f;
    }));
  }, []);

  const handleConfirmMeal = useCallback(() => {
    if (selectedFoods.length === 0) {
      toast({
        title: 'No foods selected',
        description: 'Add at least one food item',
        variant: 'destructive',
      });
      return;
    }
    logMealMutation.mutate({ mealType, foods: selectedFoods });
  }, [selectedFoods, mealType, logMealMutation, toast]);

  const totals = selectedFoods.reduce((acc, food) => ({
    calories: acc.calories + (food.calories * food.quantity),
    protein: acc.protein + (food.protein * food.quantity),
    carbs: acc.carbs + (food.carbs * food.quantity),
    fat: acc.fat + (food.fat * food.quantity),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const isLoading = searchFoodsMutation.isPending || barcodeLookupMutation.isPending || photoRecognizeMutation.isPending;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" data-testid="modal-food-logging">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 ${isDark ? 'bg-black/60' : 'bg-black/40'} backdrop-blur-sm`}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className={`relative w-full max-w-lg rounded-t-3xl border-t border-x overflow-hidden ${
          isDark ? 'bg-slate-900 border-white/10' : 'bg-gray-50 border-black/10'
        }`}
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className={`sticky top-0 z-10 backdrop-blur-xl border-b px-6 py-4 ${
          isDark ? 'bg-slate-900/95 border-white/10' : 'bg-gray-50/95 border-black/10'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step !== 'input' && mode !== 'select' && (
                <button
                  onClick={() => {
                    if (step === 'confirm') {
                      setStep('results');
                    } else {
                      setStep('input');
                      setMode('select');
                    }
                  }}
                  className={`p-2 -ml-2 rounded-xl transition-colors ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
                  }`}
                  data-testid="button-back"
                >
                  <ChevronLeft className={`w-5 h-5 ${isDark ? 'text-white' : 'text-gray-900'}`} />
                </button>
              )}
              <div className="flex items-center gap-2">
                <FloIcon size={24} className={isDark ? 'text-cyan-400' : 'text-cyan-600'} />
                <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {step === 'input' ? 'Log Food' : step === 'results' ? 'Select Foods' : 'Confirm Meal'}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-close-food-logging"
            >
              <X className={`w-6 h-6 ${isDark ? 'text-white' : 'text-gray-900'}`} />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          {/* Input Mode Selection */}
          {step === 'input' && mode === 'select' && (
            <div className="space-y-4">
              <p className={`text-sm text-center mb-6 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                How would you like to log your food?
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setMode('voice');
                    handleVoiceInput();
                  }}
                  className={`p-6 rounded-2xl border flex flex-col items-center gap-3 transition-all ${
                    isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white border-black/10 hover:bg-gray-50'
                  }`}
                  data-testid="button-voice-input"
                >
                  <Mic className={`w-8 h-8 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                  <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Voice</span>
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Describe your meal</span>
                </button>
                
                <button
                  onClick={() => {
                    setMode('photo');
                    fileInputRef.current?.click();
                  }}
                  className={`p-6 rounded-2xl border flex flex-col items-center gap-3 transition-all ${
                    isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white border-black/10 hover:bg-gray-50'
                  }`}
                  data-testid="button-photo-input"
                >
                  <Camera className={`w-8 h-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                  <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Photo</span>
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Take a picture</span>
                </button>
                
                <button
                  onClick={() => setMode('barcode')}
                  className={`p-6 rounded-2xl border flex flex-col items-center gap-3 transition-all ${
                    isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white border-black/10 hover:bg-gray-50'
                  }`}
                  data-testid="button-barcode-input"
                >
                  <Barcode className={`w-8 h-8 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                  <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Barcode</span>
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Scan product</span>
                </button>
                
                <button
                  onClick={() => {
                    setMode('search');
                    setTimeout(() => searchInputRef.current?.focus(), 100);
                  }}
                  className={`p-6 rounded-2xl border flex flex-col items-center gap-3 transition-all ${
                    isDark 
                      ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                      : 'bg-white border-black/10 hover:bg-gray-50'
                  }`}
                  data-testid="button-search-input"
                >
                  <Search className={`w-8 h-8 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`} />
                  <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>Search</span>
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>Type food name</span>
                </button>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
            </div>
          )}

          {/* Voice Listening */}
          {step === 'input' && mode === 'voice' && (
            <div className="text-center py-12">
              {isListening ? (
                <>
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center animate-pulse">
                    <Mic className="w-10 h-10 text-white" />
                  </div>
                  <p className={`mt-4 text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Listening...
                  </p>
                  <p className={`mt-2 text-lg ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    {voiceTranscript || 'Say what you ate...'}
                  </p>
                </>
              ) : (
                <>
                  <Loader2 className={`w-12 h-12 mx-auto animate-spin ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
                  <p className={`mt-4 text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Processing...
                  </p>
                </>
              )}
            </div>
          )}

          {/* Search Input */}
          {step === 'input' && mode === 'search' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${isDark ? 'text-white/40' : 'text-gray-400'}`} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search for food..."
                  className={`w-full pl-12 pr-4 py-4 rounded-2xl border text-base ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-white placeholder:text-white/40' 
                      : 'bg-white border-black/10 text-gray-900 placeholder:text-gray-400'
                  }`}
                  data-testid="input-food-search"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={!searchQuery.trim() || isLoading}
                className={`w-full py-4 rounded-2xl font-medium transition-all ${
                  searchQuery.trim() && !isLoading
                    ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white'
                    : isDark 
                      ? 'bg-white/10 text-white/40' 
                      : 'bg-gray-200 text-gray-400'
                }`}
                data-testid="button-search-submit"
              >
                {isLoading ? <Loader2 className="w-5 h-5 mx-auto animate-spin" /> : 'Search'}
              </button>
            </div>
          )}

          {/* Barcode Input */}
          {step === 'input' && mode === 'barcode' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <Barcode className={`w-16 h-16 mx-auto mb-3 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                <p className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Enter the barcode number
                </p>
              </div>
              <input
                type="text"
                placeholder="Enter barcode..."
                className={`w-full px-4 py-4 rounded-2xl border text-base text-center tracking-widest ${
                  isDark 
                    ? 'bg-white/5 border-white/10 text-white placeholder:text-white/40' 
                    : 'bg-white border-black/10 text-gray-900 placeholder:text-gray-400'
                }`}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  e.target.value = value;
                  if (value.length >= 8) {
                    handleBarcodeInput(value);
                  }
                }}
                data-testid="input-barcode"
              />
            </div>
          )}

          {/* Search Results */}
          {step === 'results' && (
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center py-12">
                  <Loader2 className={`w-12 h-12 mx-auto animate-spin ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
                </div>
              ) : searchResults.length === 0 ? (
                <div className={`text-center py-12 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                  <AlertCircle className="w-12 h-12 mx-auto mb-3" />
                  <p>No foods found</p>
                </div>
              ) : (
                <>
                  <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                    Tap to add foods to your meal
                  </p>
                  {searchResults.map((food) => {
                    const isSelected = selectedFoods.some(f => f.id === food.id);
                    return (
                      <button
                        key={food.id}
                        onClick={() => isSelected ? removeFood(food.id) : addFood(food)}
                        className={`w-full p-4 rounded-xl border text-left transition-all ${
                          isSelected
                            ? isDark
                              ? 'bg-cyan-500/20 border-cyan-500/50'
                              : 'bg-cyan-100 border-cyan-300'
                            : isDark 
                              ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                              : 'bg-white border-black/10 hover:bg-gray-50'
                        }`}
                        data-testid={`button-food-result-${food.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {food.name}
                            </div>
                            {food.brand && (
                              <div className={`text-xs mt-0.5 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                                {food.brand}
                              </div>
                            )}
                            <div className={`text-xs mt-1 ${isDark ? 'text-white/40' : 'text-gray-400'}`}>
                              {food.servingDescription || '1 serving'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                              {food.calories || 0} cal
                            </div>
                            {isSelected && (
                              <Check className="w-5 h-5 text-cyan-500" />
                            )}
                          </div>
                        </div>
                        <div className={`flex gap-4 mt-2 text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          <span>P: {food.protein || 0}g</span>
                          <span>C: {food.carbs || 0}g</span>
                          <span>F: {food.fat || 0}g</span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Confirm Meal */}
          {step === 'confirm' && (
            <div className="space-y-4">
              {/* Meal Type Selector */}
              <div>
                <label className={`text-sm mb-2 block ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  Meal Type
                </label>
                <div className="flex gap-2 flex-wrap">
                  {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setMealType(type)}
                      className={`px-4 py-2 rounded-full text-sm transition-all ${
                        mealType === type
                          ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white'
                          : isDark 
                            ? 'bg-white/10 text-white/70' 
                            : 'bg-gray-200 text-gray-700'
                      }`}
                      data-testid={`button-meal-type-${type.toLowerCase()}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Foods */}
              <div className="space-y-3 mt-6">
                {selectedFoods.map((food) => (
                  <div
                    key={food.id}
                    className={`p-4 rounded-xl border ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-white border-black/10'
                    }`}
                    data-testid={`card-selected-food-${food.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {food.name}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          {food.portion}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFood(food.id)}
                        className={`p-1 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
                        data-testid={`button-remove-food-${food.id}`}
                      >
                        <X className={`w-4 h-4 ${isDark ? 'text-white/50' : 'text-gray-400'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateQuantity(food.id, -0.5)}
                          className={`p-2 rounded-lg ${isDark ? 'bg-white/10' : 'bg-gray-100'}`}
                          data-testid={`button-decrease-${food.id}`}
                        >
                          <Minus className={`w-4 h-4 ${isDark ? 'text-white' : 'text-gray-700'}`} />
                        </button>
                        <span className={`text-sm w-12 text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {food.quantity}x
                        </span>
                        <button
                          onClick={() => updateQuantity(food.id, 0.5)}
                          className={`p-2 rounded-lg ${isDark ? 'bg-white/10' : 'bg-gray-100'}`}
                          data-testid={`button-increase-${food.id}`}
                        >
                          <Plus className={`w-4 h-4 ${isDark ? 'text-white' : 'text-gray-700'}`} />
                        </button>
                      </div>
                      <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        {Math.round(food.calories * food.quantity)} cal
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add More Button */}
              <button
                onClick={() => {
                  setStep('input');
                  setMode('select');
                }}
                className={`w-full py-3 rounded-xl border border-dashed flex items-center justify-center gap-2 ${
                  isDark ? 'border-white/20 text-white/60 hover:bg-white/5' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
                data-testid="button-add-more-food"
              >
                <Plus className="w-4 h-4" />
                Add more food
              </button>
            </div>
          )}
        </div>
        
        {/* Footer */}
        {(step === 'results' && selectedFoods.length > 0) && (
          <div className={`sticky bottom-0 backdrop-blur-xl border-t px-6 py-4 ${
            isDark ? 'bg-slate-900/95 border-white/10' : 'bg-gray-50/95 border-black/10'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                {selectedFoods.length} item{selectedFoods.length !== 1 ? 's' : ''} selected
              </span>
              <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {Math.round(totals.calories)} cal
              </span>
            </div>
            <button
              onClick={() => setStep('confirm')}
              className="w-full py-4 rounded-2xl font-medium bg-gradient-to-r from-teal-500 to-cyan-500 text-white"
              data-testid="button-continue-to-confirm"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className={`sticky bottom-0 backdrop-blur-xl border-t px-6 py-4 ${
            isDark ? 'bg-slate-900/95 border-white/10' : 'bg-gray-50/95 border-black/10'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                Total
              </span>
              <div className="flex gap-4 text-sm">
                <span className={isDark ? 'text-white' : 'text-gray-900'}>
                  {Math.round(totals.calories)} cal
                </span>
                <span className={isDark ? 'text-white/60' : 'text-gray-600'}>
                  P: {Math.round(totals.protein)}g
                </span>
                <span className={isDark ? 'text-white/60' : 'text-gray-600'}>
                  C: {Math.round(totals.carbs)}g
                </span>
                <span className={isDark ? 'text-white/60' : 'text-gray-600'}>
                  F: {Math.round(totals.fat)}g
                </span>
              </div>
            </div>
            <button
              onClick={handleConfirmMeal}
              disabled={logMealMutation.isPending || selectedFoods.length === 0}
              className="w-full py-4 rounded-2xl font-medium bg-gradient-to-r from-teal-500 to-cyan-500 text-white disabled:opacity-50"
              data-testid="button-confirm-meal"
            >
              {logMealMutation.isPending ? (
                <Loader2 className="w-5 h-5 mx-auto animate-spin" />
              ) : (
                `Log ${mealType}`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
