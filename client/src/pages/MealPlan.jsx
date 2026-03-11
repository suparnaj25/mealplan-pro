import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, RefreshCw, Lock, Unlock, ChevronLeft, ChevronRight, Sparkles, Clock, ShoppingCart, SkipForward } from 'lucide-react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍿' };

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  // Use local date components to avoid UTC timezone shift
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayStr = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

export default function MealPlan() {
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadPlan(); }, [weekStart]);

  const loadPlan = async () => {
    setLoading(true);
    try {
      const data = await api.getMealPlan(weekStart);
      setPlan(data.plan);
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await api.generateMealPlan(weekStart);
      setPlan(data.plan);
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleSkipMeal = async (itemId) => {
    if (!plan) return;
    try {
      await api.skipMeal(plan.id, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegenSlot = async (itemId) => {
    if (!plan) return;
    try {
      const data = await api.regenerateSlot(plan.id, itemId);
      setItems((prev) => prev.map((i) => (i.id === itemId ? data.item : i)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleLock = async (itemId, currentLocked) => {
    if (!plan) return;
    try {
      await api.updateMealPlanItem(plan.id, itemId, { locked: !currentLocked });
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, locked: !currentLocked } : i)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateGroceryList = async () => {
    if (!plan) return;
    try {
      await api.generateGroceryList(plan.id);
      navigate('/groceries');
    } catch (err) {
      console.error(err);
    }
  };

  const shiftWeek = (dir) => {
    const d = new Date(weekStart + 'T12:00:00'); // noon to avoid DST edge cases
    d.setDate(d.getDate() + dir * 7);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    setWeekStart(`${year}-${month}-${dayStr}`);
  };

  const weekDates = DAYS.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const groupedByDay = DAYS.map((_, dayIdx) =>
    items.filter((item) => item.day_of_week === dayIdx)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <CalendarDays className="text-brand-500" size={28} />
            Meal Plan
          </h1>
          <p className="text-sm text-gray-500 mt-1">Your weekly meal schedule</p>
        </div>
        <div className="flex gap-2">
          {plan && (
            <button onClick={handleCreateGroceryList} className="btn-secondary flex items-center gap-2 text-sm">
              <ShoppingCart size={16} /> Grocery List
            </button>
          )}
          <button onClick={handleGenerate} disabled={generating} className="btn-primary flex items-center gap-2 text-sm">
            {generating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles size={16} />}
            {plan ? 'Regenerate' : 'Generate Plan'}
          </button>
        </div>
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => shiftWeek(-1)} className="btn-ghost p-2"><ChevronLeft size={20} /></button>
        <span className="font-semibold">
          {new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} —{' '}
          {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button onClick={() => shiftWeek(1)} className="btn-ghost p-2"><ChevronRight size={20} /></button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !plan && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <div className="text-6xl mb-4">🍽️</div>
          <h3 className="text-xl font-bold mb-2">No meal plan yet</h3>
          <p className="text-gray-500 mb-6">Generate a personalized meal plan based on your preferences</p>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary inline-flex items-center gap-2">
            <Sparkles size={18} /> Generate My Meal Plan
          </button>
        </motion.div>
      )}

      {/* Meal plan grid */}
      {!loading && plan && (
        <div className="space-y-4">
          {DAYS.map((day, dayIdx) => (
            <motion.div
              key={dayIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: dayIdx * 0.05 }}
              className="glass-card p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-bold text-brand-500 w-10">{day}</span>
                <span className="text-sm text-gray-400">
                  {weekDates[dayIdx].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>

              {groupedByDay[dayIdx].length === 0 ? (
                <p className="text-sm text-gray-400 italic">No meals planned</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groupedByDay[dayIdx].map((item) => (
                    <div
                      key={item.id}
                      className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 card-hover"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase text-gray-400 flex items-center gap-1">
                          {MEAL_ICONS[item.meal_type]} {item.meal_type}
                        </span>
                        <div className="flex gap-1">
                          <button onClick={() => handleToggleLock(item.id, item.locked)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title={item.locked ? 'Unlock' : 'Lock'}>
                            {item.locked ? <Lock size={14} className="text-brand-500" /> : <Unlock size={14} className="text-gray-400" />}
                          </button>
                          <button onClick={() => handleRegenSlot(item.id)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Swap meal">
                            <RefreshCw size={14} className="text-gray-400" />
                          </button>
                          <button onClick={() => handleSkipMeal(item.id)} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Skip this meal">
                            <SkipForward size={14} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                      <p className="font-medium text-sm leading-tight">{item.recipe_name}</p>
                      {item.nutrition && (
                        <div className="flex gap-3 mt-2 text-xs text-gray-400">
                          <span>{item.nutrition.calories} cal</span>
                          <span>{item.nutrition.protein}g P</span>
                          <span>{item.nutrition.carbs}g C</span>
                          <span>{item.nutrition.fat}g F</span>
                        </div>
                      )}
                      {item.prep_time_minutes && (
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                          <Clock size={12} /> {item.prep_time_minutes + (item.cook_time_minutes || 0)} min
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}