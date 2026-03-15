import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, Shuffle, Lock, Unlock, ChevronLeft, ChevronRight, Sparkles, Clock, ShoppingCart, X, Repeat2, ChefHat, MoreVertical, CopyPlus } from 'lucide-react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { getRecipeImage, fetchRecipeImage } from '../utils/foodImages';

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
  
  // Dynamically fetch images for all recipes
  const [recipeImages, setRecipeImages] = useState({});
  useEffect(() => {
    if (items.length > 0) {
      items.forEach(async (item) => {
        if (!recipeImages[item.recipe_name]) {
          const url = await fetchRecipeImage(item.recipe_name);
          if (url) setRecipeImages(prev => ({ ...prev, [item.recipe_name]: url }));
        }
      });
    }
  }, [items]);

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

  // Modal states
  const [copyModal, setCopyModal] = useState(null); // { item, selectedDays: [] }
  const [mealMenu, setMealMenu] = useState(null); // item id for context menu

  const handleCopyMeal = async (item, targetDays) => {
    if (!plan || targetDays.length === 0) return;
    try {
      for (const dayIdx of targetDays) {
        await api.copyMeal(plan.id, item.recipe_id, dayIdx, item.meal_type);
      }
      await loadPlan();
      setCopyModal(null);
    } catch (err) {
      console.error(err);
      await loadPlan();
      setCopyModal(null);
    }
  };

  const handleClonePreviousWeek = async () => {
    const prevWeekStart = new Date(weekStart + 'T12:00:00');
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWS = `${prevWeekStart.getFullYear()}-${String(prevWeekStart.getMonth() + 1).padStart(2, '0')}-${String(prevWeekStart.getDate()).padStart(2, '0')}`;
    
    try {
      const prevData = await api.getMealPlan(prevWS);
      if (!prevData.plan || !prevData.items?.length) {
        alert('No meal plan found for the previous week.');
        return;
      }
      // Generate current week first (to create plan), then copy items
      const data = await api.generateMealPlan(weekStart);
      setPlan(data.plan);
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
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
        {plan && (
          <div className="flex gap-2">
            <button onClick={handleCreateGroceryList} className="btn-secondary flex items-center gap-2 text-sm">
              <ShoppingCart size={16} /> Generate Grocery List
            </button>
            <button onClick={handleGenerate} disabled={generating} className="btn-primary flex items-center gap-2 text-sm">
              {generating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles size={16} />}
              Regenerate Plan
            </button>
          </div>
        )}
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
          {/* Top grocery list CTA */}
          <div className="glass-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Ready to shop?</p>
              <p className="text-xs text-gray-500">Generate a grocery list from this meal plan</p>
            </div>
            <button onClick={handleCreateGroceryList} className="btn-primary flex items-center gap-2 text-sm">
              <ShoppingCart size={16} /> Generate Grocery List
            </button>
          </div>
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
                      className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 card-hover cursor-pointer group"
                      onClick={() => navigate(`/recipe/${item.recipe_id}`, { state: { recipe: { ...item, name: item.recipe_name, id: item.recipe_id } } })}
                    >
                      {/* Food image */}
                      <div className="relative h-32 overflow-hidden">
                        <img src={recipeImages[item.recipe_name] || item.image_url || getRecipeImage(item.recipe_name, item.meal_type)} alt={item.recipe_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <span className="absolute bottom-2 left-3 text-[11px] font-semibold text-white/90 uppercase tracking-wide flex items-center gap-1">
                          {MEAL_ICONS[item.meal_type]} {item.meal_type}
                        </span>
                      </div>
                      <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div />
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleToggleLock(item.id, item.locked)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title={item.locked ? 'Unlock — allow changes when regenerating' : 'Keep — protect this meal when regenerating'}>
                            {item.locked ? <Lock size={14} className="text-brand-500" /> : <Unlock size={14} className="text-gray-400" />}
                          </button>
                          <button onClick={() => setCopyModal({ item, selectedDays: [] })} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Repeat this meal on other days">
                            <Repeat2 size={14} className="text-gray-400" />
                          </button>
                          <button onClick={() => handleRegenSlot(item.id)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Try a different recipe">
                            <Shuffle size={14} className="text-gray-400" />
                          </button>
                          <button onClick={() => handleSkipMeal(item.id)} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Remove this meal">
                            <X size={14} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                      <p className="font-medium text-sm leading-tight group-hover:text-brand-500 transition-colors">{item.recipe_name}</p>
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
                      <div className="flex items-center gap-1 mt-2 text-xs text-brand-500 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        See recipe details →
                      </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
          {/* Bottom grocery list CTA */}
          <div className="glass-card p-4 flex items-center justify-center gap-3">
            <button onClick={handleCreateGroceryList} className="btn-primary flex items-center gap-2">
              <ShoppingCart size={18} /> Generate Grocery List
            </button>
            <button onClick={handleGenerate} disabled={generating} className="btn-secondary flex items-center gap-2">
              {generating ? <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" /> : <Sparkles size={18} />}
              Regenerate Meal Plan
            </button>
          </div>
        </div>
      )}
      {/* Copy Meal Modal */}
      <AnimatePresence>
        {copyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setCopyModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">🔁 Repeat Meal</h3>
                <button onClick={() => setCopyModal(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-1">"{copyModal.item.recipe_name}"</p>
              <p className="text-xs text-gray-400 mb-4">Select which days you'd like to have this {copyModal.item.meal_type} again:</p>
              <div className="grid grid-cols-7 gap-2 mb-4">
                {DAYS.map((day, idx) => {
                  const isCurrentDay = copyModal.item.day_of_week === idx;
                  const isSelected = copyModal.selectedDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      disabled={isCurrentDay}
                      onClick={() => {
                        setCopyModal(prev => ({
                          ...prev,
                          selectedDays: isSelected
                            ? prev.selectedDays.filter(d => d !== idx)
                            : [...prev.selectedDays, idx]
                        }));
                      }}
                      className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                        isCurrentDay ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed' :
                        isSelected ? 'bg-brand-500 text-white shadow-lg' :
                        'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCopyModal(prev => ({ ...prev, selectedDays: DAYS.map((_, i) => i).filter(i => i !== copyModal.item.day_of_week) }))}
                  className="btn-secondary text-xs flex-1"
                >
                  Select All
                </button>
                <button
                  onClick={() => handleCopyMeal(copyModal.item, copyModal.selectedDays)}
                  disabled={copyModal.selectedDays.length === 0}
                  className="btn-primary text-xs flex-1 flex items-center justify-center gap-1"
                >
                  <CopyPlus size={14} /> Copy to {copyModal.selectedDays.length} day{copyModal.selectedDays.length !== 1 ? 's' : ''}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
