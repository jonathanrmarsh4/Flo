import { Star, Plus } from 'lucide-react';

interface SavedMeal {
  id: string;
  name: string;
  items: Array<{
    id: string;
    name: string;
    portion: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  }>;
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  savedAt: Date;
}

interface SavedMealsCardProps {
  isDark: boolean;
  savedMeals: SavedMeal[];
  onAddMeal: (meal: SavedMeal) => void;
  onRemoveSavedMeal: (mealId: string) => void;
}

export function SavedMealsCard({ isDark, savedMeals, onAddMeal, onRemoveSavedMeal }: SavedMealsCardProps) {
  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-6 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}
      data-testid="card-saved-meals"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Saved Meals
          </h3>
        </div>
        <div className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
          {savedMeals.length} {savedMeals.length === 1 ? 'meal' : 'meals'}
        </div>
      </div>
      
      {savedMeals.length === 0 ? (
        <div className={`text-center py-8 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
          <Star className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-white/20' : 'text-gray-300'}`} />
          <p className="text-sm">No saved meals yet</p>
          <p className="text-xs mt-1">Star a meal from Today's Meals to save it</p>
        </div>
      ) : (
        <div className="space-y-3">
          {savedMeals.map((meal) => (
            <div
              key={meal.id}
              className={`p-4 rounded-xl ${
                isDark ? 'bg-white/5' : 'bg-black/5'
              }`}
              data-testid={`card-saved-meal-${meal.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className={`text-sm mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {meal.name}
                  </div>
                  <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                    {meal.items.length} {meal.items.length === 1 ? 'item' : 'items'}
                  </div>
                </div>
                <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                  {Math.round(meal.totals.calories)} cal
                </div>
              </div>
              
              <div className="space-y-1 mb-3">
                {meal.items.map((item) => (
                  <div key={item.id} className={`text-xs flex items-center justify-between ${
                    isDark ? 'text-white/60' : 'text-gray-600'
                  }`}>
                    <span>{item.name} ({item.portion})</span>
                    <span>{item.calories} cal</span>
                  </div>
                ))}
              </div>
              
              <div className={`mb-3 pb-3 border-b flex gap-4 text-xs ${
                isDark ? 'border-white/10 text-white/50' : 'border-black/10 text-gray-500'
              }`}>
                <span>P: {Math.round(meal.totals.protein)}g</span>
                <span>C: {Math.round(meal.totals.carbs)}g</span>
                <span>F: {Math.round(meal.totals.fats)}g</span>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => onAddMeal(meal)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors ${
                    isDark 
                      ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' 
                      : 'bg-purple-500/20 text-purple-700 hover:bg-purple-500/30'
                  }`}
                  data-testid={`button-add-saved-meal-${meal.id}`}
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm">Add to Today</span>
                </button>
                <button
                  onClick={() => onRemoveSavedMeal(meal.id)}
                  className={`p-2 rounded-lg transition-colors ${
                    isDark 
                      ? 'bg-white/5 hover:bg-white/10' 
                      : 'bg-black/5 hover:bg-black/10'
                  }`}
                  title="Remove from saved"
                  data-testid={`button-remove-saved-meal-${meal.id}`}
                >
                  <Star className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} fill="currentColor" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { SavedMeal };
