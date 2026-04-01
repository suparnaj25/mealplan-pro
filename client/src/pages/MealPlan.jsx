import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, Shuffle, Lock, Unlock, ChevronLeft, ChevronRight, Sparkles, Clock, ShoppingCart, X, Repeat2, ChefHat, MoreVertical, CopyPlus, Heart, ThumbsUp, ThumbsDown, Meh, Sunrise, Sun, Moon, Cookie, UtensilsCrossed, Star, SmilePlus, Frown, FileText, ClipboardList, Search, User, Users, Plus, Check, Trash2, Camera, Coffee, GlassWater, UserX, RotateCcw } from 'lucide-react';
import { api } from '../services/api';
import AiResultSheet, { AiCard, AiSection, AiTag } from '../components/AiResultSheet';
import { useNavigate, useLocation } from 'react-router-dom';
import { getRecipeImage, fetchRecipeImage } from '../utils/foodImages';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MealIcon = ({ type, size = 14, className = '' }) => {
  const icons = { breakfast: Sunrise, lunch: Sun, dinner: Moon, snack: Cookie, beverage: Coffee };
  const Icon = icons[type] || UtensilsCrossed;
  return <Icon size={size} className={className} />;
};

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
  const [showGenModal, setShowGenModal] = useState(false);
  const [genMealTypes, setGenMealTypes] = useState({ breakfast: true, lunch: true, dinner: true, snacks: false, beverages: false });
  const [aiSheet, setAiSheet] = useState({ open: false, type: null, data: null, loading: false });
  const [feedbackMap, setFeedbackMap] = useState({}); // { recipeId: 'loved'|'liked'|'ok'|'disliked' }
  const navigate = useNavigate();

  // Load existing feedback
  useEffect(() => {
    api.getFeedback().then(data => {
      const map = {};
      (data.feedback || []).forEach(f => { map[f.recipe_id] = f.reaction; });
      setFeedbackMap(map);
    }).catch(() => {});
  }, []);

  const handleFeedback = async (recipeId, recipeName, reaction) => {
    const current = feedbackMap[recipeId];
    const newReaction = current === reaction ? null : reaction; // toggle off if same
    setFeedbackMap(prev => ({ ...prev, [recipeId]: newReaction }));
    try {
      await api.submitFeedback(recipeId, recipeName, newReaction, null, newReaction !== 'disliked');
    } catch (err) { console.error(err); }
  };

  // Refetch plan when weekStart changes OR when navigating back to this page (e.g., from AI Chef)
  const location = useLocation();
  useEffect(() => { loadPlan(); }, [weekStart, location.key]);
  
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

  // Load saved meal preferences
  useEffect(() => {
    api.getPreferences().then(data => {
      const ms = data.mealStructure || {};
      setGenMealTypes({ breakfast: !!ms.breakfast, lunch: !!ms.lunch, dinner: !!ms.dinner, snacks: !!ms.snacks, beverages: !!ms.beverages });
    }).catch(() => {});
  }, []);

  const openGenerateModal = () => setShowGenModal(true);

  const [genError, setGenError] = useState(null);

  const handleGenerate = async () => {
    setShowGenModal(false);
    setGenerating(true);
    setGenError(null);
    try {
      await api.updateProfile({ mealStructure: genMealTypes });
      const data = await api.generateMealPlan(weekStart);
      setPlan(data.plan);
      setItems(data.items || []);
      if (!data.items || data.items.length === 0) {
        setGenError('Plan generated but no meals were found. Try adjusting your dietary preferences or try again.');
      }
    } catch (err) {
      console.error(err);
      setGenError(err.message || 'Failed to generate meal plan. Please try again.');
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
      // Clone the previous week's plan (preserving exact recipes) into the current week
      const data = await api.cloneMealPlan(prevWS, weekStart);
      setPlan(data.plan);
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to clone previous week.');
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
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    return d;
  });

  const groupedByDay = DAYS.map((_, dayIdx) =>
    items.filter((item) => item.day_of_week === dayIdx)
  );

  // Determine today's day-of-week index (0=Mon ... 6=Sun) relative to this week
  const today = new Date();
  const todayDayIdx = (() => {
    for (let i = 0; i < 7; i++) {
      if (weekDates[i].toDateString() === today.toDateString()) return i;
    }
    // If today is not in this week, show all days for both past and future weeks
    // -1 means no days are hidden (dayIdx < -1 is always false)
    return -1;
  })();

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
            <button onClick={openGenerateModal} disabled={generating} className="btn-primary flex items-center gap-2 text-sm">
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

      {/* Shared Plan Banner */}
      {plan?.isSharedPlan && (
        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center flex-shrink-0">
            <Users size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">Shared Family Plan</p>
            <p className="text-[11px] text-purple-500 dark:text-purple-400 truncate">
              Created by {plan.created_by_name || 'a family member'} · Portions auto-adjusted to your goals
            </p>
          </div>
          <span className="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 px-2 py-1 rounded-full font-medium whitespace-nowrap">
            {plan.user_id === (plan._currentUserId) ? 'You created this' : 'Synced'}
          </span>
        </motion.div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Generating overlay */}
      {generating && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 animate-pulse">Generating your meal plan... this may take a moment</p>
        </div>
      )}

      {/* Error message */}
      {genError && !generating && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-500 text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">{genError}</p>
            <button onClick={openGenerateModal} className="text-xs text-red-500 hover:text-red-600 mt-2 underline">
              Try again
            </button>
          </div>
          <button onClick={() => setGenError(null)} className="text-red-400 hover:text-red-500 p-1">
            <X size={16} />
          </button>
        </motion.div>
      )}

      {/* Empty state */}
      {!loading && !plan && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <div className="mb-4 flex justify-center"><UtensilsCrossed size={56} className="text-gray-300" /></div>
          <h3 className="text-xl font-bold mb-2">No meal plan yet</h3>
          <p className="text-gray-500 mb-6">Generate a personalized meal plan based on your preferences</p>
          <button onClick={openGenerateModal} disabled={generating} className="btn-primary inline-flex items-center gap-2">
            <Sparkles size={18} /> Generate My Meal Plan
          </button>
        </motion.div>
      )}

      {/* Meal plan grid */}
      {!loading && plan && (
        <div className="space-y-4">
          {DAYS.map((day, dayIdx) => {
            // Hide past days for the current week
            if (dayIdx < todayDayIdx) return null;
            return (
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
                {weekDates[dayIdx].toDateString() === new Date().toDateString() && (
                  <button onClick={() => navigate('/tracker')} className="ml-auto text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors flex items-center gap-1">
                    Track meals →
                  </button>
                )}
              </div>

              {groupedByDay[dayIdx].length === 0 ? (
                <p className="text-sm text-gray-400 italic">No meals planned</p>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {groupedByDay[dayIdx].map((item) => (
                    <div
                      key={item.id}
                      className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 card-hover cursor-pointer group min-w-0"
                      onClick={() => navigate(`/recipe/${item.recipe_id}`, { state: { recipe: { ...item, name: item.recipe_name, id: item.recipe_id } } })}
                    >
                      {/* Food image */}
                      <div className="relative h-32 overflow-hidden">
                        <img src={recipeImages[item.recipe_name] || item.image_url || getRecipeImage(item.recipe_name, item.meal_type)} alt={item.recipe_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <span className="absolute bottom-2 left-3 text-[11px] font-semibold text-white/90 uppercase tracking-wide flex items-center gap-1.5">
                          <MealIcon type={item.meal_type} size={12} className="text-white/90" /> {item.meal_type}
                        </span>
                        {/* User vs AI vs Shared badges */}
                        {item.has_override ? (
                          <span className="absolute top-2 right-2 bg-amber-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <UserX size={9} /> Your override
                          </span>
                        ) : item.is_shared ? (
                          <span className="absolute top-2 right-2 bg-purple-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Users size={9} /> Shared
                          </span>
                        ) : item.is_user_provided ? (
                          <span className="absolute top-2 right-2 bg-blue-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <User size={9} /> Your meal
                          </span>
                        ) : plan?.plan_mode === 'joint' ? (
                          <span className="absolute top-2 right-2 bg-brand-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Sparkles size={9} /> AI pick
                          </span>
                        ) : null}
                      </div>
                      <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div />
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {/* Override buttons for shared plans */}
                          {item.is_shared && !item.has_override && (
                            <button onClick={async () => {
                              const newName = prompt(`Change "${item.recipe_name}" just for you?\n\nEnter the meal name you'd like instead (or cancel to keep shared):`, '');
                              if (!newName) return;
                              try {
                                await api.overrideMeal(plan.id, item.id, newName, null, { calories: item.nutrition?.calories || 0, protein: item.nutrition?.protein || 0, carbs: item.nutrition?.carbs || 0, fat: item.nutrition?.fat || 0 });
                                await loadPlan();
                              } catch (err) { console.error(err); }
                            }} className="p-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title="Change just for me">
                              <UserX size={14} className="text-amber-500" />
                            </button>
                          )}
                          {item.has_override && (
                            <button onClick={async () => {
                              try {
                                await api.removeOverride(plan.id, item.id);
                                await loadPlan();
                              } catch (err) { console.error(err); }
                            }} className="p-1 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" title="Revert to shared meal">
                              <RotateCcw size={14} className="text-purple-500" />
                            </button>
                          )}
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
                      <div className="flex items-center gap-0.5 mt-1" onClick={(e) => e.stopPropagation()}>
                        {[{ reaction: 'loved', Icon: Heart, label: 'Loved it', activeColor: 'text-red-500' },
                          { reaction: 'liked', Icon: ThumbsUp, label: 'Liked it', activeColor: 'text-brand-500' },
                          { reaction: 'ok', Icon: Meh, label: 'It was ok', activeColor: 'text-amber-500' },
                          { reaction: 'disliked', Icon: ThumbsDown, label: 'Not for me', activeColor: 'text-gray-500' },
                        ].map(({ reaction, Icon, label, activeColor }) => (
                          <button
                            key={reaction}
                            onClick={() => handleFeedback(item.recipe_id, item.recipe_name, reaction)}
                            title={label}
                            className={`p-1 rounded-lg transition-all ${
                              feedbackMap[item.recipe_id] === reaction
                                ? `scale-110 ${activeColor} bg-brand-50 dark:bg-brand-900/30 ring-1 ring-brand-200 dark:ring-brand-800`
                                : 'text-gray-300 hover:text-gray-500 hover:scale-110'
                            }`}
                          >
                            <Icon size={14} fill={feedbackMap[item.recipe_id] === reaction ? 'currentColor' : 'none'} />
                          </button>
                        ))}
                      </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
            );
          })}
          {/* Smart Tools */}
          <div className="glass-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Smart Tools</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={async () => {
                setAiSheet({ open: true, type: 'summary', data: null, loading: true });
                try {
                  const result = await api.aiExplainPlan(plan.id);
                  setAiSheet({ open: true, type: 'summary', data: result, loading: false });
                } catch (err) { setAiSheet({ open: true, type: 'summary', data: { error: err.message }, loading: false }); }
              }} className="btn-secondary flex items-center gap-2 text-sm justify-center py-3">
                <FileText size={16} /> Plan Summary
              </button>
              <button onClick={async () => {
                setAiSheet({ open: true, type: 'prep', data: null, loading: true });
                try {
                  const result = await api.aiMealPrep(plan.id);
                  setAiSheet({ open: true, type: 'prep', data: result, loading: false });
                } catch (err) { setAiSheet({ open: true, type: 'prep', data: { error: err.message }, loading: false }); }
              }} className="btn-secondary flex items-center gap-2 text-sm justify-center py-3">
                <ChefHat size={16} /> Meal Prep Guide
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Generate Plan Modal — Multi-step: Mode → Meal Types → (Joint: Pre-fill) */}
      <AnimatePresence>
        {showGenModal && (
          <GeneratePlanModal
            genMealTypes={genMealTypes}
            setGenMealTypes={setGenMealTypes}
            onClose={() => setShowGenModal(false)}
            onGenerateFull={handleGenerate}
            onGenerateJoint={async (prefilled) => {
              setShowGenModal(false);
              setGenerating(true);
              setGenError(null);
              try {
                await api.updateProfile({ mealStructure: genMealTypes });
                const data = await api.generateJointPlan(weekStart, prefilled);
                setPlan(data.plan);
                setItems(data.items || []);
              } catch (err) {
                console.error(err);
                setGenError(err.message || 'Failed to generate joint plan.');
              } finally {
                setGenerating(false);
              }
            }}
          />
        )}
      </AnimatePresence>

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
                <h3 className="font-bold text-lg flex items-center gap-2"><Repeat2 size={20} className="text-brand-500" /> Repeat Meal</h3>
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

      {/* AI Result Sheet */}
      <AiResultSheet
        open={aiSheet.open}
        onClose={() => setAiSheet({ open: false, type: null, data: null, loading: false })}
        loading={aiSheet.loading}
        title={aiSheet.type === 'summary' ? 'Plan Summary' : 'Meal Prep Guide'}
        emoji={aiSheet.type === 'summary' ? '📋' : '🍳'}
        gradient={aiSheet.type === 'summary' ? 'from-blue-500 to-indigo-500' : 'from-orange-500 to-red-500'}
      >
        {aiSheet.data?.error ? (
          <AiCard icon="⚠️" title="Error">{aiSheet.data.error}</AiCard>
        ) : aiSheet.type === 'summary' && aiSheet.data ? (
          <>
            {aiSheet.data.summary && <AiCard icon="📝" title="Overview">{aiSheet.data.summary}</AiCard>}
            {aiSheet.data.highlights?.length > 0 && (
              <AiSection title="Highlights">
                {aiSheet.data.highlights.map((h, i) => <AiCard key={i} icon="🎯">{h}</AiCard>)}
              </AiSection>
            )}
            {aiSheet.data.tips?.length > 0 && (
              <AiSection title="Tips">
                {aiSheet.data.tips.map((t, i) => <AiCard key={i} icon="💡">{t}</AiCard>)}
              </AiSection>
            )}
          </>
        ) : aiSheet.type === 'prep' && aiSheet.data ? (
          <>
            {aiSheet.data.totalTime && (
              <AiCard icon="⏱️" title="Total Prep Time" highlight>{aiSheet.data.totalTime}</AiCard>
            )}
            {aiSheet.data.steps?.length > 0 && (
              <AiSection title="Prep Steps">
                {aiSheet.data.steps.map((s, i) => (
                  <AiCard key={i} icon={`${i + 1}️⃣`} title={typeof s === 'string' ? `Step ${i + 1}` : s.title}>
                    {typeof s === 'string' ? s : s.detail}
                  </AiCard>
                ))}
              </AiSection>
            )}
            {aiSheet.data.tips?.length > 0 && (
              <AiSection title="Pro Tips">
                {aiSheet.data.tips.map((t, i) => <AiCard key={i} icon="💡">{t}</AiCard>)}
              </AiSection>
            )}
          </>
        ) : null}
      </AiResultSheet>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   GeneratePlanModal — Multi-step: Plan Mode → Meal Types → (Joint: Pre-fill Grid)
   ───────────────────────────────────────────────────────────── */
function GeneratePlanModal({ genMealTypes, setGenMealTypes, onClose, onGenerateFull, onGenerateJoint }) {
  const [step, setStep] = useState(1); // 1=mode, 2=meal types, 3=prefill grid
  const [planMode, setPlanMode] = useState('full'); // 'full' or 'joint'
  const [prefilled, setPrefilled] = useState([]); // [{ dayOfWeek, mealType, customName, customNutrition, recipeId? }]
  const [activeSlot, setActiveSlot] = useState(null); // { dayOfWeek, mealType } — which slot is being filled
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [replicateModal, setReplicateModal] = useState(null); // { food, sourceDayOfWeek, mealType, selectedDays: [] }
  const photoInputRef = useRef(null);

  // Handle photo capture/upload → AI analyze → add as prefilled meal
  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeSlot) return;
    // Reset file input so same file can be re-selected
    if (photoInputRef.current) photoInputRef.current.value = '';

    setAnalyzingPhoto(true);
    try {
      // Convert to data URL (same format the tracker uses)
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Call the same photo analysis endpoint that works in the tracker
      const result = await api.analyzePhoto(dataUrl);
      if (result && result.food) {
        addPrefilled(activeSlot.dayOfWeek, activeSlot.mealType, {
          name: result.food.name || 'Identified meal',
          calories: result.food.calories || 0,
          protein: result.food.protein || 0,
          carbs: result.food.carbs || 0,
          fat: result.food.fat || 0,
        });
      } else {
        alert('Could not identify the food in the photo. Please try again or search manually.');
      }
    } catch (err) {
      console.error('Photo analysis failed:', err);
      alert('Failed to analyze photo. Please try searching manually.');
    } finally {
      setAnalyzingPhoto(false);
    }
  };

  const MEAL_TYPES = [
    { key: 'breakfast', label: 'Breakfast', Icon: Sunrise },
    { key: 'lunch', label: 'Lunch', Icon: Sun },
    { key: 'dinner', label: 'Dinner', Icon: Moon },
    { key: 'snacks', label: 'Snacks', Icon: Cookie },
    { key: 'beverages', label: 'Beverages', Icon: Coffee },
  ];

  const activeMealTypes = MEAL_TYPES.filter(mt => genMealTypes[mt.key]);

  // Food search with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.searchFood(searchQuery);
        setSearchResults(data.foods || []);
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addPrefilled = (dayOfWeek, mealType, food) => {
    // Remove existing entry for this slot if any
    setPrefilled(prev => [
      ...prev.filter(p => !(p.dayOfWeek === dayOfWeek && p.mealType === mealType)),
      {
        dayOfWeek,
        mealType,
        customName: food.name,
        customNutrition: { calories: food.calories || 0, protein: food.protein || 0, carbs: food.carbs || 0, fat: food.fat || 0 },
        recipeId: food.recipeId || null,
      }
    ]);
    setActiveSlot(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removePrefilled = (dayOfWeek, mealType) => {
    setPrefilled(prev => prev.filter(p => !(p.dayOfWeek === dayOfWeek && p.mealType === mealType)));
  };

  const getPrefilledForSlot = (dayOfWeek, mealType) => {
    return prefilled.find(p => p.dayOfWeek === dayOfWeek && p.mealType === mealType);
  };

  // Calculate daily totals for the prefill view
  const getDayTotals = (dayIdx) => {
    const dayMeals = prefilled.filter(p => p.dayOfWeek === dayIdx);
    return {
      calories: dayMeals.reduce((s, m) => s + (m.customNutrition?.calories || 0), 0),
      protein: dayMeals.reduce((s, m) => s + (m.customNutrition?.protein || 0), 0),
    };
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl ${step === 3 ? 'max-w-2xl w-full max-h-[85vh] overflow-y-auto' : 'max-w-sm w-full'} p-6`}
        onClick={(e) => e.stopPropagation()}>

        {/* Step 1: Choose Plan Mode */}
        {step === 1 && (
          <>
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <CalendarDays size={20} className="text-brand-500" /> How would you like to plan?
            </h3>
            <p className="text-xs text-gray-500 mb-5">Choose your planning style for this week.</p>
            <div className="space-y-3 mb-6">
              <button onClick={() => { setPlanMode('full'); setStep(2); }}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 ${planMode === 'full' ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Full Plan</p>
                    <p className="text-xs text-gray-500">AI plans all your meals for the week</p>
                  </div>
                </div>
              </button>
              <button onClick={() => { setPlanMode('joint'); setStep(2); }}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 ${planMode === 'joint' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Joint Plan</p>
                    <p className="text-xs text-gray-500">Add your own meals, AI fills the rest to hit your goals</p>
                  </div>
                </div>
              </button>
            </div>
            <button onClick={onClose} className="btn-secondary w-full text-sm">Cancel</button>
          </>
        )}

        {/* Step 2: Select Meal Types */}
        {step === 2 && (
          <>
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <UtensilsCrossed size={20} className="text-brand-500" /> What meals to include?
            </h3>
            <p className="text-xs text-gray-500 mb-4">Select which meals to plan each day.</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {MEAL_TYPES.map(({ key, label, Icon }) => (
                <button key={key} onClick={() => setGenMealTypes(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`py-4 rounded-xl text-sm font-medium transition-all flex flex-col items-center gap-2 ${
                    genMealTypes[key] ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                  }`}>
                  <Icon size={24} />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1 text-sm">Back</button>
              {planMode === 'full' ? (
                <button onClick={onGenerateFull} disabled={!Object.values(genMealTypes).some(Boolean)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
                  <Sparkles size={16} /> Generate Plan
                </button>
              ) : (
                <button onClick={() => setStep(3)} disabled={!Object.values(genMealTypes).some(Boolean)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm bg-blue-500 hover:bg-blue-600">
                  <User size={16} /> Add Your Meals →
                </button>
              )}
            </div>
          </>
        )}

        {/* Step 3: Joint Plan — Pre-fill Grid */}
        {step === 3 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <User size={20} className="text-blue-500" /> Add Your Meals
              </h3>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Tap any slot to add a meal you've already planned. Empty slots will be filled by AI to hit your daily macro targets.
            </p>

            {/* Weekly grid */}
            <div className="space-y-3 mb-4">
              {DAYS.map((day, dayIdx) => {
                const totals = getDayTotals(dayIdx);
                const hasMeals = prefilled.some(p => p.dayOfWeek === dayIdx);
                return (
                  <div key={dayIdx} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-brand-500">{day}</span>
                      {hasMeals && (
                        <span className="text-[10px] text-gray-400">
                          {totals.calories} cal · {totals.protein}g P locked
                        </span>
                      )}
                    </div>
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${activeMealTypes.length}, 1fr)` }}>
                      {activeMealTypes.map(({ key, label, Icon }) => {
                        const mealKey = key === 'snacks' ? 'snack' : key === 'beverages' ? 'beverage' : key;
                        const filled = getPrefilledForSlot(dayIdx, mealKey);
                        const isActive = activeSlot?.dayOfWeek === dayIdx && activeSlot?.mealType === mealKey;

                        if (filled) {
                          return (
                            <div key={key} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 relative group">
                              <div className="flex items-center gap-1 mb-1">
                                <Icon size={10} className="text-blue-500" />
                                <span className="text-[9px] text-blue-500 font-semibold uppercase">{label}</span>
                              </div>
                              <p className="text-[11px] font-medium leading-tight truncate" title={filled.customName}>{filled.customName}</p>
                              <p className="text-[9px] text-gray-400 mt-0.5">{filled.customNutrition?.calories} cal · {filled.customNutrition?.protein}g P</p>
                              {/* Action buttons: Repeat + Remove */}
                              <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setReplicateModal({ food: filled, sourceDayOfWeek: dayIdx, mealType: mealKey, selectedDays: [] })}
                                  className="p-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-500 hover:bg-blue-200" title="Repeat on other days">
                                  <Repeat2 size={10} />
                                </button>
                                <button onClick={() => removePrefilled(dayIdx, mealKey)}
                                  className="p-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-500 hover:bg-red-200" title="Remove">
                                  <X size={10} />
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <button key={key} onClick={() => { setActiveSlot({ dayOfWeek: dayIdx, mealType: mealKey }); setSearchQuery(''); setSearchResults([]); }}
                            className={`border-2 border-dashed rounded-lg p-2 text-center transition-all ${
                              isActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
                            }`}>
                            <Icon size={14} className="mx-auto text-gray-300 mb-1" />
                            <p className="text-[9px] text-gray-400">{label}</p>
                            <p className="text-[8px] text-gray-300 mt-0.5">AI fills</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Inline food search for active slot */}
                    {activeSlot?.dayOfWeek === dayIdx && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-2 overflow-hidden">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Search or 📷 snap a photo...`}
                            className="w-full pl-9 pr-12 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoFocus
                          />
                          {/* Camera button inside the input */}
                          <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            disabled={analyzingPhoto}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-500 transition-all"
                            title="Take or upload a photo of your meal"
                          >
                            {analyzingPhoto ? (
                              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Camera size={14} />
                            )}
                          </button>
                          {/* Hidden file input for photo capture */}
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoCapture}
                            className="hidden"
                          />
                          {searching && <div className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                        </div>
                        {/* Photo analyzing indicator */}
                        {analyzingPhoto && (
                          <div className="flex items-center gap-2 mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs text-blue-600 dark:text-blue-400">Analyzing your photo with AI...</span>
                          </div>
                        )}
                        {searchResults.length > 0 && (
                          <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                            {searchResults.map((food, i) => (
                              <button key={i} onClick={() => addPrefilled(activeSlot.dayOfWeek, activeSlot.mealType, food)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <p className="text-xs font-medium truncate">{food.name}</p>
                                <p className="text-[10px] text-gray-400">
                                  {food.calories} cal · {food.protein}g P · {food.carbs}g C · {food.fat}g F
                                  {food.source === 'ai' && ' · ✨ AI'}
                                  {food.source === 'nutritionix' && ' · ✅ Verified'}
                                  {food.brand && food.source !== 'ai' && food.source !== 'nutritionix' && ` · ${food.brand}`}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                          <p className="text-xs text-gray-400 mt-2 text-center">No results found. Try a different search.</p>
                        )}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary + Generate */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  <span className="font-semibold text-blue-500">{prefilled.length}</span> meal{prefilled.length !== 1 ? 's' : ''} you've added
                </span>
                <span className="text-gray-500">
                  <span className="font-semibold text-brand-500">{DAYS.length * activeMealTypes.length - prefilled.length}</span> slots for AI
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="btn-secondary flex-1 text-sm">Back</button>
              <button onClick={() => onGenerateJoint(prefilled)} disabled={prefilled.length === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-50">
                <Sparkles size={16} /> Generate Joint Plan
              </button>
            </div>
          </>
        )}
      {/* Replicate Meal Modal — copy a prefilled meal to other days */}
      {replicateModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setReplicateModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 max-w-xs w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm flex items-center gap-2"><Repeat2 size={16} className="text-blue-500" /> Repeat Meal</h4>
              <button onClick={() => setReplicateModal(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X size={16} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-1 truncate">"{replicateModal.food.customName}"</p>
            <p className="text-[10px] text-gray-400 mb-3">Select days to copy this {replicateModal.mealType} to:</p>
            <div className="grid grid-cols-7 gap-1.5 mb-4">
              {DAYS.map((day, idx) => {
                const isSrc = idx === replicateModal.sourceDayOfWeek;
                const isSel = replicateModal.selectedDays.includes(idx);
                return (
                  <button key={idx} disabled={isSrc}
                    onClick={() => setReplicateModal(prev => ({
                      ...prev,
                      selectedDays: isSel ? prev.selectedDays.filter(d => d !== idx) : [...prev.selectedDays, idx]
                    }))}
                    className={`py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                      isSrc ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed' :
                      isSel ? 'bg-blue-500 text-white shadow' :
                      'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200'
                    }`}>{day}</button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setReplicateModal(prev => ({ ...prev, selectedDays: DAYS.map((_, i) => i).filter(i => i !== replicateModal.sourceDayOfWeek) }))}
                className="btn-secondary text-[10px] flex-1">All Days</button>
              <button disabled={replicateModal.selectedDays.length === 0}
                onClick={() => {
                  for (const dayIdx of replicateModal.selectedDays) {
                    addPrefilled(dayIdx, replicateModal.mealType, {
                      name: replicateModal.food.customName,
                      calories: replicateModal.food.customNutrition?.calories || 0,
                      protein: replicateModal.food.customNutrition?.protein || 0,
                      carbs: replicateModal.food.customNutrition?.carbs || 0,
                      fat: replicateModal.food.customNutrition?.fat || 0,
                      recipeId: replicateModal.food.recipeId || null,
                    });
                  }
                  setReplicateModal(null);
                }}
                className="btn-primary text-[10px] flex-1 flex items-center justify-center gap-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50">
                <CopyPlus size={12} /> Copy to {replicateModal.selectedDays.length} day{replicateModal.selectedDays.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      </motion.div>
    </motion.div>
  );
}
