import { Apple } from 'lucide-react';

interface LoggedMeal {
  id: string;
  meal: string;
  dateTime: Date;
  items: Array<{
    id: string;
    name: string;
    confidence: 'high' | 'medium' | 'low';
    portion: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    thumbnail?: string;
  }>;
}

interface TodaysMealsCardProps {
  isDark: boolean;
  todaysMeals: LoggedMeal[];
  todaysTotals: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  onMealClick: (date: Date) => void;
}

export function TodaysMealsCard({ isDark, todaysMeals, todaysTotals, onMealClick }: TodaysMealsCardProps) {
  return (
    <div 
      className={`backdrop-blur-xl rounded-3xl border p-6 ${
        isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
      }`}
      data-testid="card-todays-meals"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Apple className={`w-5 h-5 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
          <h3 className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
            Today's Meals
          </h3>
        </div>
        <div className={`text-sm ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
          {todaysMeals.length} {todaysMeals.length === 1 ? 'meal' : 'meals'}
        </div>
      </div>
      
      {todaysMeals.length === 0 ? (
        <div className={`text-center py-8 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
          <p className="text-sm">No meals logged today</p>
          <p className="text-xs mt-1">Tap the Flō button to log your first meal</p>
        </div>
      ) : (
        <div className="space-y-3">
          {todaysMeals.map((meal) => {
            const mealTotals = meal.items.reduce((acc, item) => ({
              calories: acc.calories + (item.calories || 0),
              protein: acc.protein + (item.protein || 0),
              carbs: acc.carbs + (item.carbs || 0),
              fats: acc.fats + (item.fats || 0)
            }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
            
            return (
              <button
                key={meal.id}
                onClick={() => onMealClick(new Date(meal.dateTime))}
                className={`w-full p-4 rounded-xl transition-all text-left ${
                  isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'
                }`}
                data-testid={`button-meal-${meal.id}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className={`text-sm mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {meal.meal}
                    </div>
                    <div className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                      {new Date(meal.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                    {Math.round(mealTotals.calories)} cal
                  </div>
                </div>
                <div className="space-y-1">
                  {meal.items.map((item) => (
                    <div key={item.id} className={`text-xs flex items-center justify-between ${
                      isDark ? 'text-white/60' : 'text-gray-600'
                    }`}>
                      <span>{item.name} ({item.portion})</span>
                      <span>{item.calories} cal</span>
                    </div>
                  ))}
                </div>
                <div className={`mt-2 pt-2 border-t flex gap-4 text-xs ${
                  isDark ? 'border-white/10 text-white/50' : 'border-black/10 text-gray-500'
                }`}>
                  <span>P: {Math.round(mealTotals.protein)}g</span>
                  <span>C: {Math.round(mealTotals.carbs)}g</span>
                  <span>F: {Math.round(mealTotals.fats)}g</span>
                </div>
              </button>
            );
          })}
          
          {/* Daily Summary */}
          <div className={`mt-4 pt-4 border-t flex items-center justify-between ${
            isDark ? 'border-white/10' : 'border-black/10'
          }`}>
            <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
              Today's Total
            </div>
            <div className="flex gap-4 text-sm">
              <div className={isDark ? 'text-white' : 'text-gray-900'}>
                {Math.round(todaysTotals.calories)} cal
              </div>
              <div className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                P: {Math.round(todaysTotals.protein)}g
              </div>
              <div className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                C: {Math.round(todaysTotals.carbs)}g
              </div>
              <div className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                F: {Math.round(todaysTotals.fats)}g
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type { LoggedMeal };
