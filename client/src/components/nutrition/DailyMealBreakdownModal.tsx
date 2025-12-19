import { X, Apple } from 'lucide-react';
import type { LoggedMeal } from './TodaysMealsCard';

interface DailyMealBreakdownModalProps {
  isDark: boolean;
  onClose: () => void;
  date: Date;
  loggedMeals: LoggedMeal[];
}

export function DailyMealBreakdownModal({
  isDark,
  onClose,
  date,
  loggedMeals
}: DailyMealBreakdownModalProps) {
  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);
  const nextDate = new Date(selectedDate);
  nextDate.setDate(nextDate.getDate() + 1);
  
  const dayMeals = loggedMeals.filter(meal => {
    const mealDate = new Date(meal.dateTime);
    return mealDate >= selectedDate && mealDate < nextDate;
  });
  
  const totals = dayMeals.reduce((acc, meal) => {
    meal.items.forEach(item => {
      acc.calories += item.calories || 0;
      acc.protein += item.protein || 0;
      acc.carbs += item.carbs || 0;
      acc.fats += item.fats || 0;
    });
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
  
  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const dateStr = isToday ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" data-testid="modal-daily-meal-breakdown">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 ${isDark ? 'bg-black/60' : 'bg-black/40'} backdrop-blur-sm`}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className={`relative w-full max-w-2xl rounded-t-3xl border-t border-x overflow-hidden ${
          isDark ? 'bg-slate-900 border-white/10' : 'bg-gray-50 border-black/10'
        }`}
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className={`sticky top-0 z-10 backdrop-blur-xl border-b px-6 py-4 ${
          isDark ? 'bg-slate-900/95 border-white/10' : 'bg-gray-50/95 border-black/10'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {dateStr}
              </h2>
              <p className={`text-sm mt-1 ${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                {dayMeals.length} {dayMeals.length === 1 ? 'meal' : 'meals'} logged
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
              data-testid="button-close-breakdown"
            >
              <X className={`w-6 h-6 ${isDark ? 'text-white' : 'text-gray-900'}`} />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          {dayMeals.length === 0 ? (
            <div className={`text-center py-12 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
              <Apple className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-white/30' : 'text-gray-400'}`} />
              <p className="text-sm">No meals logged for this day</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dayMeals.map((meal) => {
                const mealTotals = meal.items.reduce((acc, item) => ({
                  calories: acc.calories + (item.calories || 0),
                  protein: acc.protein + (item.protein || 0),
                  carbs: acc.carbs + (item.carbs || 0),
                  fats: acc.fats + (item.fats || 0)
                }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
                
                return (
                  <div
                    key={meal.id}
                    className={`backdrop-blur-xl rounded-2xl border p-5 ${
                      isDark ? 'bg-white/5 border-white/10' : 'bg-white/60 border-black/10'
                    }`}
                    data-testid={`card-meal-breakdown-${meal.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className={`text-base mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {meal.meal}
                        </h3>
                        <p className={`text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                          {new Date(meal.dateTime).toLocaleTimeString('en-US', { 
                            hour: 'numeric', 
                            minute: '2-digit' 
                          })}
                        </p>
                      </div>
                      <div className={`text-base ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {Math.round(mealTotals.calories)} cal
                      </div>
                    </div>
                    
                    {/* Food Items */}
                    <div className="space-y-2 mb-3">
                      {meal.items.map((item) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-black/5'}`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {item.name}
                              </div>
                              <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                                {item.portion}
                              </div>
                            </div>
                            <div className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                              {item.calories} cal
                            </div>
                          </div>
                          <div className={`flex gap-4 text-xs ${isDark ? 'text-white/50' : 'text-gray-500'}`}>
                            <span>Protein: {item.protein}g</span>
                            <span>Carbs: {item.carbs}g</span>
                            <span>Fat: {item.fats}g</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Meal Totals */}
                    <div className={`pt-3 border-t flex justify-between ${
                      isDark ? 'border-white/10' : 'border-black/10'
                    }`}>
                      <span className={`text-sm ${isDark ? 'text-white/70' : 'text-gray-700'}`}>
                        Meal Total
                      </span>
                      <div className="flex gap-3 text-sm">
                        <span className={isDark ? 'text-white/60' : 'text-gray-600'}>
                          P: {Math.round(mealTotals.protein)}g
                        </span>
                        <span className={isDark ? 'text-white/60' : 'text-gray-600'}>
                          C: {Math.round(mealTotals.carbs)}g
                        </span>
                        <span className={isDark ? 'text-white/60' : 'text-gray-600'}>
                          F: {Math.round(mealTotals.fats)}g
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer - Daily Summary */}
        {dayMeals.length > 0 && (
          <div className={`sticky bottom-0 backdrop-blur-xl border-t px-6 py-4 ${
            isDark ? 'bg-slate-900/95 border-white/10' : 'bg-gray-50/95 border-black/10'
          }`}>
            <div className="flex items-center justify-between">
              <div className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
                Daily Total
              </div>
              <div className="flex gap-4">
                <div className={`${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {Math.round(totals.calories)} cal
                </div>
                <div className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  P: {Math.round(totals.protein)}g
                </div>
                <div className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  C: {Math.round(totals.carbs)}g
                </div>
                <div className={`${isDark ? 'text-white/60' : 'text-gray-600'}`}>
                  F: {Math.round(totals.fats)}g
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
