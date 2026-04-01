import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Check, X, Plus, ChevronLeft, ChevronRight, SkipForward, Edit3, Trash2, Scale, Trophy, Flame, Sparkles, Camera, Sunrise, Sun, Moon, Cookie, UtensilsCrossed, Coffee } from 'lucide-react';
import { api } from '../services/api';

const MealIcon = ({ type, size = 18, className = '' }) => {
  const icons = { breakfast: Sunrise, lunch: Sun, dinner: Moon, snack: Cookie, beverage: Coffee };
  const Icon = icons[type] || UtensilsCrossed;
  return <Icon size={size} className={className} />;
};
const STATUS_COLORS = {
  planned: 'bg-gray-100 dark:bg-gray-800 text-gray-500',
  eaten: 'bg-brand-500/10 text-brand-600 border-brand-500',
  modified: 'bg-amber-500/10 text-amber-600 border-amber-500',
  skipped: 'bg-red-500/10 text-red-400 line-through',
};

function CalorieRing({ consumed, target, size = 160 }) {
  const pct = Math.min((consumed / target) * 100, 100);
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const over = consumed > target;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth={10} className="text-gray-200 dark:text-gray-800" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth={10} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className={`transition-all duration-1000 ease-out ${over ? 'text-red-500' : 'text-brand-500'}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${over ? 'text-red-500' : ''}`}>{consumed}</span>
        <span className="text-xs text-gray-400">of {target} kcal</span>
      </div>
    </div>
  );
}

function MacroBar({ label, value, target, color }) {
  const pct = Math.min((value / target) * 100, 100);
  return (
    <div className="flex-1">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium">{value}/{target}g</span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${color}`} />
      </div>
    </div>
  );
}

function getLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function DailyTracker() {
  const [date, setDate] = useState(getLocalDateStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ mealType: 'snack', description: '', calories: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' });
  const [editingLog, setEditingLog] = useState(null);
  const [foodSearchQuery, setFoodSearchQuery] = useState('');
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [searchingFood, setSearchingFood] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [aiParseItems, setAiParseItems] = useState(null);
  const [weightInput, setWeightInput] = useState('');
  const [weightHistory, setWeightHistory] = useState([]);
  const [streaks, setStreaks] = useState(null);
  const [showWeightForm, setShowWeightForm] = useState(false);

  useEffect(() => { loadDay(); }, [date]);
  useEffect(() => { loadExtras(); }, []);

  const loadExtras = async () => {
    try {
      const [w, s] = await Promise.all([api.getWeightHistory(), api.getStreaks()]);
      setWeightHistory(w.weights || []);
      setStreaks(s);
    } catch {}
  };

  const handleLogWeight = async () => {
    if (!weightInput) return;
    try {
      await api.logWeight(date, parseFloat(weightInput), 'lb');
      setWeightInput('');
      setShowWeightForm(false);
      loadExtras();
    } catch (err) { console.error(err); }
  };

  const EMPTY_DATA = { logs: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }, targets: { calories: 2000, protein: 150, carbs: 200, fat: 67, fiber: 25 } };

  const loadDay = async () => {
    setLoading(true);
    // Sync planned meals first (non-blocking — don't let sync failure prevent loading)
    try { await api.syncPlan(date); } catch (err) { console.error('sync-plan failed:', err); }
    // Always load daily data, fallback to empty if it fails
    try {
      const result = await api.getDaily(date);
      setData(result || EMPTY_DATA);
    } catch (err) {
      console.error('getDaily error:', err);
      setData(EMPTY_DATA);
    }
    setLoading(false);
  };

  const handleStatusChange = async (logId, status) => {
    try {
      await api.updateLog(logId, { status });
      loadDay();
    } catch (err) { console.error(err); }
  };

  const handleFoodSearch = (query) => {
    setFoodSearchQuery(query);
    if (searchTimeout) clearTimeout(searchTimeout);
    if (query.length < 2) { setFoodSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setSearchingFood(true);
      try {
        const data = await api.searchFood(query);
        setFoodSearchResults(data.foods || []);
      } catch { setFoodSearchResults([]); }
      finally { setSearchingFood(false); }
    }, 400);
    setSearchTimeout(timeout);
  };

  const selectFood = (food, target = 'quickAdd') => {
    const update = { description: `${food.name}${food.brand ? ` (${food.brand})` : ''}`, calories: String(food.calories), proteinG: String(food.protein), carbsG: String(food.carbs), fatG: String(food.fat), fiberG: String(food.fiber || '') };
    if (target === 'quickAdd') setQuickAddForm({ ...quickAddForm, ...update });
    else if (target === 'edit') setEditingLog({ ...editingLog, ...update });
    setFoodSearchResults([]);
    setFoodSearchQuery('');
  };

  const handlePhotoCapture = async (e, target = 'quickAdd') => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = await api.analyzePhoto(reader.result);
          if (data.food) {
            const update = { description: data.food.name, calories: String(data.food.calories), proteinG: String(data.food.protein), carbsG: String(data.food.carbs), fatG: String(data.food.fat), fiberG: String(data.food.fiber || '') };
            if (target === 'quickAdd') setQuickAddForm(prev => ({ ...prev, ...update }));
            else if (target === 'edit') setEditingLog(prev => ({ ...prev, ...update }));
          } else { alert('Could not identify food in photo. Try again or enter manually.'); }
        } catch (err) { alert(err.message); }
        finally { setAnalyzingPhoto(false); }
      };
      reader.readAsDataURL(file);
    } catch { setAnalyzingPhoto(false); }
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    try {
      await api.quickAddFood({ date, mealType: quickAddForm.mealType, description: quickAddForm.description, calories: parseInt(quickAddForm.calories) || 0, proteinG: parseInt(quickAddForm.proteinG) || 0, carbsG: parseInt(quickAddForm.carbsG) || 0, fatG: parseInt(quickAddForm.fatG) || 0, fiberG: parseInt(quickAddForm.fiberG) || 0 });
      setShowQuickAdd(false);
      setQuickAddForm({ mealType: 'snack', description: '', calories: '', proteinG: '', carbsG: '', fatG: '', fiberG: '' });
      setFoodSearchResults([]);
      loadDay();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (logId) => {
    try { await api.deleteLog(logId); loadDay(); }
    catch (err) { console.error(err); }
  };

  const handleEditSave = async (logId) => {
    if (!editingLog) return;
    try {
      await api.updateLog(logId, { status: 'modified', actualDescription: editingLog.description, calories: parseInt(editingLog.calories) || 0, proteinG: parseInt(editingLog.proteinG) || 0, carbsG: parseInt(editingLog.carbsG) || 0, fatG: parseInt(editingLog.fatG) || 0, fiberG: parseInt(editingLog.fiberG) || 0 });
      setEditingLog(null);
      loadDay();
    } catch (err) { console.error(err); }
  };

  const shiftDay = (dir) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + dir);
    setDate(getLocalDateStr(d));
  };

  const isToday = date === getLocalDateStr();
  const dayName = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Group logs by meal type
  const grouped = {};
  for (const mt of ['breakfast', 'lunch', 'dinner', 'snack', 'beverage']) {
    grouped[mt] = (data?.logs || []).filter(l => l.meal_type === mt);
  }

  const remaining = data ? {
    calories: Math.max(0, data.targets.calories - data.totals.calories),
    protein: Math.max(0, data.targets.protein - data.totals.protein),
  } : { calories: 0, protein: 0 };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Activity className="text-brand-500" size={28} />
            Daily Tracker
          </h1>
          <p className="text-sm text-gray-500 mt-1">{isToday ? 'Today' : dayName}</p>
        </div>
        <button onClick={() => { setShowQuickAdd(true); }} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Log Food
        </button>
      </div>

      {/* Date navigator */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => shiftDay(-1)} className="btn-ghost p-2"><ChevronLeft size={20} /></button>
        <button onClick={() => setDate(getLocalDateStr())} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${isToday ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
          Today
        </button>
        <span className="font-semibold text-sm min-w-[140px] text-center">{dayName}</span>
        <button onClick={() => shiftDay(1)} className="btn-ghost p-2"><ChevronRight size={20} /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : data && (
        <>
          {/* Calorie ring + macro bars */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <CalorieRing consumed={data.totals.calories} target={data.targets.calories} />
              <div className="flex-1 space-y-3 w-full">
                <MacroBar label="Protein" value={data.totals.protein} target={data.targets.protein} color="bg-blue-500" />
                <MacroBar label="Carbs" value={data.totals.carbs} target={data.targets.carbs} color="bg-amber-500" />
                <MacroBar label="Fat" value={data.totals.fat} target={data.targets.fat} color="bg-pink-500" />
                <MacroBar label="Fiber" value={data.totals.fiber} target={data.targets.fiber} color="bg-purple-500" />
                {remaining.calories > 0 && (
                  <p className="text-xs text-gray-400 text-center sm:text-left">
                    {remaining.calories} kcal · {remaining.protein}g protein remaining
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Meal sections */}
          {['breakfast', 'lunch', 'dinner', 'snack', 'beverage'].map(mealType => (
            <motion.div key={mealType} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <MealIcon type={mealType} size={18} className="text-brand-500" />
                <h3 className="font-semibold text-sm capitalize">{mealType}</h3>
                <span className="text-xs text-gray-400 ml-auto">{grouped[mealType].reduce((s, l) => s + (l.status !== 'skipped' ? (l.calories || 0) : 0), 0)} kcal</span>
              </div>

              {grouped[mealType].length === 0 && (
                <div className="px-4 py-3 text-center">
                  <p className="text-sm text-gray-400 italic">No {mealType} logged</p>
                </div>
              )}
              {grouped[mealType].length > 0 && (
                <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                  {grouped[mealType].map(log => (
                    <div key={log.id} className={`px-4 py-3 ${log.status === 'skipped' ? 'opacity-40' : ''}`}>
                      {editingLog?.id === log.id ? (
                        /* Edit mode */
                        <div className="space-y-2">
                          <div className="relative">
                            <input type="text" value={editingLog.description}
                              onChange={(e) => { setEditingLog({...editingLog, description: e.target.value}); handleFoodSearch(e.target.value); }}
                              className="input-field text-sm" placeholder="Search food or type what you ate..." />
                            {foodSearchResults.length > 0 && (
                              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-36 overflow-y-auto">
                                {foodSearchResults.map((food, idx) => (
                                  <button key={idx} type="button" onClick={() => selectFood(food, 'edit')}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-xs">
                                    <div className="flex-1 truncate">{food.name} {food.brand && `(${food.brand})`}</div>
                                    <span className="text-gray-400 whitespace-nowrap">{food.calories} cal</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <label className="btn-secondary text-xs flex items-center gap-1 cursor-pointer justify-center py-1.5">
                            <Camera size={12} /> {analyzingPhoto ? 'Analyzing...' : 'Photo'}
                            <input type="file" accept="image/*" onChange={(e) => handlePhotoCapture(e, 'edit')} className="hidden" disabled={analyzingPhoto} />
                          </label>
                          {/* Portion picker for edit mode */}
                          <div>
                            <p className="text-[10px] text-gray-500 mb-1">🍽️ Portion size</p>
                            <div className="grid grid-cols-4 gap-1">
                              {[{l:'½', m:0.5}, {l:'Regular', m:1}, {l:'Large', m:1.4}, {l:'XL', m:1.8}].map(({l,m}) => (
                                <button key={l} type="button" onClick={() => {
                                  setEditingLog(prev => {
                                    const base = parseFloat(prev._baseCal || prev.calories || 0);
                                    const baseP = parseFloat(prev._baseProt || prev.proteinG || 0);
                                    const baseC = parseFloat(prev._baseCarb || prev.carbsG || 0);
                                    const baseF = parseFloat(prev._baseFat || prev.fatG || 0);
                                    const baseFib = parseFloat(prev._baseFiber || prev.fiberG || 0);
                                    return {...prev,
                                      calories: String(Math.round(base * m)), proteinG: String(Math.round(baseP * m)),
                                      carbsG: String(Math.round(baseC * m)), fatG: String(Math.round(baseF * m)),
                                      fiberG: String(Math.round(baseFib * m)),
                                      _baseCal: base, _baseProt: baseP, _baseCarb: baseC, _baseFat: baseF, _baseFiber: baseFib, _portion: l,
                                    };
                                  });
                                }} className={`py-1.5 rounded-lg text-[10px] font-medium transition-all ${editingLog._portion === l ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                  {l}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-2">
                            <input type="number" value={editingLog.calories} onChange={(e) => setEditingLog({...editingLog, calories: e.target.value})} className="input-field text-xs" placeholder="Cal" />
                            <input type="number" value={editingLog.proteinG} onChange={(e) => setEditingLog({...editingLog, proteinG: e.target.value})} className="input-field text-xs" placeholder="Prot" />
                            <input type="number" value={editingLog.carbsG} onChange={(e) => setEditingLog({...editingLog, carbsG: e.target.value})} className="input-field text-xs" placeholder="Carb" />
                            <input type="number" value={editingLog.fatG} onChange={(e) => setEditingLog({...editingLog, fatG: e.target.value})} className="input-field text-xs" placeholder="Fat" />
                            <input type="number" value={editingLog.fiberG} onChange={(e) => setEditingLog({...editingLog, fiberG: e.target.value})} className="input-field text-xs" placeholder="Fiber" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditSave(log.id)} className="btn-primary text-xs flex-1">Save</button>
                            <button onClick={() => setEditingLog(null)} className="btn-secondary text-xs">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        /* Display mode */
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${log.status === 'skipped' ? 'line-through' : ''}`}>
                              {log.actual_description || log.recipe_name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {log.calories} kcal · {log.protein_g}g P · {log.carbs_g}g C · {log.fat_g}g F{log.fiber_g > 0 ? ` · ${log.fiber_g}g Fib` : ''}
                            </p>
                          </div>
                          {/* Status badge */}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[log.status]}`}>
                            {log.status}
                          </span>
                          {/* Action buttons */}
                          {log.status === 'planned' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleStatusChange(log.id, 'eaten')} className="p-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 transition-colors" title="I ate this">
                                <Check size={14} className="text-brand-500" />
                              </button>
                              <button onClick={() => setEditingLog({ id: log.id, description: log.recipe_name, calories: String(log.calories || ''), proteinG: String(log.protein_g || ''), carbsG: String(log.carbs_g || ''), fatG: String(log.fat_g || ''), fiberG: String(log.fiber_g || '') })} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="I ate something different">
                                <Edit3 size={14} className="text-gray-400" />
                              </button>
                              <button onClick={() => handleStatusChange(log.id, 'skipped')} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Skip">
                                <SkipForward size={14} className="text-red-400" />
                              </button>
                            </div>
                          )}
                          {(log.status === 'eaten' || log.status === 'modified') && (
                            <div className="flex gap-1">
                              <button onClick={() => setEditingLog({ id: log.id, description: log.actual_description || log.recipe_name, calories: String(log.calories || ''), proteinG: String(log.protein_g || ''), carbsG: String(log.carbs_g || ''), fatG: String(log.fat_g || ''), fiberG: String(log.fiber_g || '') })} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Edit this meal">
                                <Edit3 size={14} className="text-gray-400" />
                              </button>
                              <button onClick={() => handleDelete(log.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Delete this meal">
                                <Trash2 size={14} className="text-red-400" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Always show Add button for every meal type */}
              <div className="px-4 py-2 border-t border-gray-50 dark:border-gray-800/50">
                <button onClick={() => { setQuickAddForm({ ...quickAddForm, mealType }); setShowQuickAdd(true); }} className="text-xs text-brand-500 font-medium hover:text-brand-600 transition-colors">+ Add {mealType}</button>
              </div>
            </motion.div>
          ))}
        </>
      )}

      {/* Weight Tracking */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Scale size={16} className="text-brand-500" /> Weight</h3>
          <button onClick={() => setShowWeightForm(!showWeightForm)} className="text-xs text-brand-500 font-medium">{showWeightForm ? 'Cancel' : '+ Log Weight'}</button>
        </div>
        {showWeightForm && (
          <div className="flex gap-2 mb-3">
            <input type="number" placeholder="Weight (lb)" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} className="input-field text-sm flex-1" step="0.1" />
            <button onClick={handleLogWeight} className="btn-primary text-sm">Save</button>
          </div>
        )}
        {weightHistory.length > 0 ? (
          <div>
            <div className="flex items-end gap-1 h-20">
              {weightHistory.slice(-14).map((w, i) => {
                const min = Math.min(...weightHistory.map(x => x.weight));
                const max = Math.max(...weightHistory.map(x => x.weight));
                const range = max - min || 1;
                const h = ((w.weight - min) / range) * 60 + 10;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full bg-brand-500/20 rounded-t" style={{ height: `${h}px` }}>
                      <div className="w-full h-full bg-brand-500 rounded-t opacity-60 hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-400">{weightHistory[0]?.date?.slice(5)}</span>
              <span className="text-xs font-semibold">{weightHistory[weightHistory.length-1]?.weight} lb</span>
              <span className="text-[10px] text-gray-400">{weightHistory[weightHistory.length-1]?.date?.slice(5)}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center">No weight data yet. Log your first weigh-in!</p>
        )}
      </motion.div>

      {/* Streaks & Achievements */}
      {streaks && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3"><Trophy size={16} className="text-brand-500" /> Streaks & Achievements</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
              <Flame size={20} className="mx-auto text-orange-500 mb-1" />
              <p className="text-lg font-bold">{streaks.currentStreak}</p>
              <p className="text-[10px] text-gray-500">Day Streak</p>
            </div>
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Activity size={20} className="mx-auto text-blue-500 mb-1" />
              <p className="text-lg font-bold">{streaks.totalDays}</p>
              <p className="text-[10px] text-gray-500">Total Days</p>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <Trophy size={20} className="mx-auto text-green-500 mb-1" />
              <p className="text-lg font-bold">{streaks.proteinHitDays}/7</p>
              <p className="text-[10px] text-gray-500">Protein Target</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {streaks.achievements.map(a => (
              <div key={a.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${a.earned ? 'bg-brand-500/10 text-brand-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`} title={a.desc}>
                <span>{a.icon}</span> {a.name}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Quick Add Modal */}
      <AnimatePresence>
        {showQuickAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Log Food</h3>
                <button onClick={() => setShowQuickAdd(false)} className="btn-ghost p-1"><X size={20} /></button>
              </div>
              <form onSubmit={handleQuickAdd} className="space-y-3">
                <select value={quickAddForm.mealType} onChange={(e) => setQuickAddForm({...quickAddForm, mealType: e.target.value})} className="input-field text-sm">
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="snack">Snack</option>
                  <option value="beverage">Beverage</option>
                </select>

                {/* Food search with autocomplete */}
                <div className="relative">
                  <input type="text" placeholder="Search food or type what you ate..." value={quickAddForm.description}
                    onChange={(e) => { setQuickAddForm({...quickAddForm, description: e.target.value}); handleFoodSearch(e.target.value); }}
                    className="input-field" required />
                  {searchingFood && <span className="absolute right-3 top-3 text-xs text-gray-400">Searching...</span>}
                  {foodSearchResults.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
                      {foodSearchResults.map((food, idx) => (
                        <button key={idx} type="button" onClick={() => selectFood(food, 'quickAdd')}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm border-b border-gray-50 dark:border-gray-700 last:border-0">
                          {food.image && <img src={food.image} alt="" className="w-8 h-8 rounded object-cover" />}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{food.name}</p>
                            <p className="text-xs text-gray-400">{food.calories} cal · {food.protein}g P · {food.carbs}g C · {food.fat}g F</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI Estimate + Photo capture */}
                <div className="flex gap-2">
                  <button type="button" disabled={!quickAddForm.description.trim() || aiParsing || !!quickAddForm.calories}
                    onClick={async () => {
                      if (!quickAddForm.description.trim()) return;
                      setAiParsing(true); setAiParseItems(null);
                      try {
                        const result = await api.aiParseFood(quickAddForm.description);
                        setQuickAddForm({ ...quickAddForm, description: result.description || quickAddForm.description, calories: String(result.calories || ''), proteinG: String(result.protein || ''), carbsG: String(result.carbs || ''), fatG: String(result.fat || ''), fiberG: String(result.fiber || '') });
                        if (result.items?.length > 1) setAiParseItems(result.items);
                      } catch (err) { console.error(err); }
                      finally { setAiParsing(false); }
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-purple-500 to-brand-500 text-white hover:opacity-90 transition-opacity disabled:opacity-40 flex-1 justify-center">
                    <Sparkles size={15} /> {aiParsing ? 'Estimating...' : 'Estimate Nutrition'}
                  </button>
                  <label className="btn-secondary text-sm flex items-center gap-2 cursor-pointer flex-1 justify-center">
                    <Camera size={15} /> {analyzingPhoto ? 'Analyzing...' : 'Add Photo'}
                    <input type="file" accept="image/*" onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setAnalyzingPhoto(true);
                      try {
                        const reader = new FileReader();
                        reader.onload = async () => {
                          try {
                            const data = await api.aiAnalyzePhoto(reader.result);
                            if (data.food) {
                              setQuickAddForm(prev => ({ ...prev, description: data.food.name, calories: String(data.food.calories), proteinG: String(data.food.protein), carbsG: String(data.food.carbs), fatG: String(data.food.fat), fiberG: String(data.food.fiber || '') }));
                            } else { alert(data.details || 'Could not identify food. Try describing it instead.'); }
                          } catch (err) { alert(err.message); }
                          finally { setAnalyzingPhoto(false); }
                        };
                        reader.readAsDataURL(file);
                      } catch { setAnalyzingPhoto(false); }
                    }} className="hidden" disabled={analyzingPhoto} />
                  </label>
                </div>

                {/* AI breakdown of parsed items */}
                {aiParseItems && aiParseItems.length > 1 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1"><Sparkles size={12} /> Found {aiParseItems.length} items:</p>
                    {aiParseItems.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                        <span>{item.name}</span>
                        <span className="text-gray-400">{item.calories} cal · {item.protein}g P</span>
                      </div>
                    ))}
                  </motion.div>
                )}

                {/* Portion size picker — always visible */}
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">🍽️ How much did you eat?</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[{l:'½', m:0.5}, {l:'Regular', m:1}, {l:'Large', m:1.4}, {l:'XL', m:1.8}].map(({l,m}) => (
                      <button key={l} type="button" onClick={() => {
                        setQuickAddForm(prev => {
                          const base = parseFloat(prev._baseCal || prev.calories || 0);
                          const baseP = parseFloat(prev._baseProt || prev.proteinG || 0);
                          const baseC = parseFloat(prev._baseCarb || prev.carbsG || 0);
                          const baseF = parseFloat(prev._baseFat || prev.fatG || 0);
                          const baseFib = parseFloat(prev._baseFiber || prev.fiberG || 0);
                          return {...prev,
                            calories: String(Math.round(base * m)), proteinG: String(Math.round(baseP * m)),
                            carbsG: String(Math.round(baseC * m)), fatG: String(Math.round(baseF * m)),
                            fiberG: String(Math.round(baseFib * m)),
                            _baseCal: base, _baseProt: baseP, _baseCarb: baseC, _baseFat: baseF, _baseFiber: baseFib, _portion: l,
                          };
                        });
                      }} className={`py-2 rounded-lg text-xs font-medium transition-all ${quickAddForm._portion === l ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input type="number" placeholder="Calories" value={quickAddForm.calories} onChange={(e) => setQuickAddForm({...quickAddForm, calories: e.target.value})} className="input-field text-sm" />
                  <input type="number" placeholder="Protein (g)" value={quickAddForm.proteinG} onChange={(e) => setQuickAddForm({...quickAddForm, proteinG: e.target.value})} className="input-field text-sm" />
                  <input type="number" placeholder="Carbs (g)" value={quickAddForm.carbsG} onChange={(e) => setQuickAddForm({...quickAddForm, carbsG: e.target.value})} className="input-field text-sm" />
                  <input type="number" placeholder="Fat (g)" value={quickAddForm.fatG} onChange={(e) => setQuickAddForm({...quickAddForm, fatG: e.target.value})} className="input-field text-sm" />
                  <input type="number" placeholder="Fiber (g)" value={quickAddForm.fiberG} onChange={(e) => setQuickAddForm({...quickAddForm, fiberG: e.target.value})} className="input-field text-sm" />
                </div>
                <button type="submit" className="btn-primary w-full">Log This Food</button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}