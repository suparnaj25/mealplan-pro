import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, TrendingUp, Target, Trophy, Flame, AlertTriangle, Lightbulb, RefreshCw, BarChart3 } from 'lucide-react';
import { api } from '../services/api';
import AiResultSheet, { AiCard, AiSection } from '../components/AiResultSheet';

function MacroBar({ label, actual, target, color }) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  const isOver = actual > target * 1.1;
  const isClose = pct >= 90 && pct <= 110;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className={isClose ? 'text-green-500 font-semibold' : isOver ? 'text-red-500' : 'text-gray-500'}>{actual} / {target}</span>
      </div>
      <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

// Convert letter grade to encouraging progress score & label
function gradeToProgress(grade) {
  const map = {
    'A': { score: 95, label: 'Excellent', color: 'text-emerald-500', bg: 'from-emerald-500 to-green-500', ring: 'stroke-emerald-500' },
    'B': { score: 80, label: 'Great progress', color: 'text-brand-500', bg: 'from-brand-500 to-blue-500', ring: 'stroke-brand-500' },
    'C': { score: 65, label: 'Getting there', color: 'text-amber-500', bg: 'from-amber-500 to-orange-500', ring: 'stroke-amber-500' },
    'D': { score: 45, label: 'Room to grow', color: 'text-orange-500', bg: 'from-orange-500 to-red-400', ring: 'stroke-orange-500' },
  };
  return map[grade] || map['C'];
}

function ProgressRing({ score, size = 64, strokeWidth = 5, color = 'stroke-brand-500' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-gray-200 dark:text-gray-700" />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
        className={color} style={{ strokeDasharray: circumference, strokeDashoffset: offset, transition: 'stroke-dashoffset 1s ease-out' }} />
    </svg>
  );
}

export default function Insights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streaks, setStreaks] = useState(null);
  const [aiSheet, setAiSheet] = useState({ open: false, type: null, data: null, loading: false });

  useEffect(() => { loadInsights(); loadStreaks(); }, []);

  const loadStreaks = async () => {
    try { const s = await api.getStreaks(); setStreaks(s); } catch {}
  };

  const loadInsights = async () => {
    setLoading(true); setError(null);
    try {
      const result = await api.aiWeekInsights();
      setData(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="space-y-6">
      <div><h1 className="section-title flex items-center gap-2"><Sparkles className="text-brand-500" size={28} /> Insights</h1></div>
      <div className="glass-card p-12 text-center"><Loader2 size={40} className="mx-auto mb-4 animate-spin text-brand-500" /><p className="text-sm text-gray-500">Analyzing your week...</p></div>
    </div>
  );

  if (error) return (
    <div className="space-y-6">
      <div><h1 className="section-title flex items-center gap-2"><Sparkles className="text-brand-500" size={28} /> Insights</h1></div>
      <div className="glass-card p-6 text-center"><div className="mb-3 flex justify-center"><AlertTriangle size={40} className="text-red-300" /></div><p className="text-red-500 text-sm">{error}</p><button onClick={loadInsights} className="btn-primary text-sm mt-4">Retry</button></div>
    </div>
  );

  if (!data) return null;

  const { targets, actuals, forecast, ai } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2"><Sparkles className="text-brand-500" size={28} /> Insights</h1>
        <p className="text-sm text-gray-500 mt-1">Your nutrition performance this week</p>
      </div>

      {/* Section 1: Week-to-date Actuals */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target size={18} className="text-brand-500" />
          <h2 className="font-bold text-base">How am I doing?</h2>
          {ai?.actualsGrade && (() => {
            const p = gradeToProgress(ai.actualsGrade);
            return (
              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <ProgressRing score={p.score} size={48} strokeWidth={4} color={p.ring} />
                  <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${p.color}`}>{p.score}</span>
                </div>
                <span className={`text-xs font-semibold ${p.color}`}>{p.label}</span>
              </div>
            );
          })()}
        </div>
        
        {actuals.days === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No meals logged yet this week. Start tracking in the Tracker tab!</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-3">{actuals.days} day{actuals.days !== 1 ? 's' : ''} logged — daily averages vs your targets</p>
            <div className="space-y-3">
              <MacroBar label="Calories" actual={actuals.avgCalories} target={targets.calories} color="bg-orange-500" />
              <MacroBar label="Protein" actual={actuals.avgProtein} target={targets.protein} color="bg-blue-500" />
              <MacroBar label="Carbs" actual={actuals.avgCarbs} target={targets.carbs} color="bg-green-500" />
              <MacroBar label="Fat" actual={actuals.avgFat} target={targets.fat} color="bg-yellow-500" />
              {actuals.avgFiber > 0 && targets.fiber > 0 && <MacroBar label="Fiber" actual={actuals.avgFiber} target={targets.fiber} color="bg-purple-500" />}
            </div>
            {ai?.actualsSummary && <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{ai.actualsSummary}</p>}
          </>
        )}
      </motion.div>

      {/* Section 2: Forecast */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-purple-500" />
          <h2 className="font-bold text-base">Week Forecast</h2>
          {ai?.forecastGrade && (() => {
            const p = gradeToProgress(ai.forecastGrade);
            return (
              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <ProgressRing score={p.score} size={48} strokeWidth={4} color={p.ring} />
                  <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${p.color}`}>{p.score}</span>
                </div>
                <span className={`text-xs font-semibold ${p.color}`}>{p.label}</span>
              </div>
            );
          })()}
        </div>
        
        <p className="text-xs text-gray-500 mb-3">Logged meals + remaining planned meals — projected daily averages</p>
        <div className="space-y-3">
          <MacroBar label="Calories" actual={forecast.avgCalories} target={targets.calories} color="bg-orange-400" />
          <MacroBar label="Protein" actual={forecast.avgProtein} target={targets.protein} color="bg-blue-400" />
          <MacroBar label="Carbs" actual={forecast.avgCarbs} target={targets.carbs} color="bg-green-400" />
          <MacroBar label="Fat" actual={forecast.avgFat} target={targets.fat} color="bg-yellow-400" />
          {forecast.avgFiber > 0 && targets.fiber > 0 && <MacroBar label="Fiber" actual={forecast.avgFiber} target={targets.fiber} color="bg-purple-400" />}
        </div>
        {ai?.forecastSummary && <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{ai.forecastSummary}</p>}
      </motion.div>

      {/* Tips */}
      {ai?.tips?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5"><Lightbulb size={14} className="text-blue-500" /> Tips to improve</h3>
          <div className="space-y-2">
            {ai.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-sm bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl">
                <Lightbulb size={14} className="text-blue-500 mt-0.5 flex-shrink-0" /><span>{tip}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Encouragement */}
      {ai?.encouragement && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass-card p-5 bg-gradient-to-r from-brand-500/10 to-purple-500/10 border border-brand-200 dark:border-brand-800 text-center">
          <p className="text-sm font-medium">{ai.encouragement}</p>
        </motion.div>
      )}

      {/* Actionable Swaps */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
        className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><RefreshCw size={14} className="text-green-500" /> Smart Meal Swaps</h3>
          <button onClick={async () => {
            setAiSheet({ open: true, type: 'swaps', data: null, loading: true });
            try {
              const result = await api.aiActionableSwaps();
              setAiSheet({ open: true, type: 'swaps', data: result, loading: false });
            } catch (err) { setAiSheet({ open: true, type: 'swaps', data: { error: err.message }, loading: false }); }
          }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-green-500 to-teal-500 text-white hover:opacity-90 transition-opacity inline-flex items-center gap-1">
            <Sparkles size={12} /> Get Swap Ideas
          </button>
        </div>
        <p className="text-xs text-gray-500">Get specific meal swaps to hit your macro targets + week-over-week comparison</p>
      </motion.div>

      {/* Multi-Week Trend Analysis */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><BarChart3 size={14} className="text-purple-500" /> Multi-Week Trends</h3>
          <button onClick={async () => {
            setAiSheet({ open: true, type: 'trends', data: null, loading: true });
            try {
              const result = await api.aiTrends();
              setAiSheet({ open: true, type: 'trends', data: result, loading: false });
            } catch (err) { setAiSheet({ open: true, type: 'trends', data: { error: err.message }, loading: false }); }
          }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500 to-brand-500 text-white hover:opacity-90 transition-opacity inline-flex items-center gap-1">
            <Sparkles size={12} /> Analyze Trends
          </button>
        </div>
        <p className="text-xs text-gray-500">Analyzes your last 4 weeks of data to find patterns and predict your trajectory</p>
      </motion.div>

      {/* Streaks & Achievements */}
      {streaks && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-amber-500" />
            <h2 className="font-bold text-base">Streaks & Achievements</h2>
          </div>
          
          {/* Current streak */}
          <div className="flex items-center gap-4 mb-4 p-3 bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-xl">
            <Flame size={40} className="text-orange-500" />
            <div>
              <div className="text-2xl font-bold text-orange-500">{streaks.currentStreak || 0} day{(streaks.currentStreak || 0) !== 1 ? 's' : ''}</div>
              <p className="text-xs text-gray-500">Current logging streak</p>
            </div>
            {streaks.longestStreak > 0 && (
              <div className="ml-auto text-right">
                <div className="text-lg font-bold text-amber-500">{streaks.longestStreak}</div>
                <p className="text-xs text-gray-500">Best streak</p>
              </div>
            )}
          </div>

          {/* Achievements */}
          {streaks.achievements?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {streaks.achievements.map((a, i) => (
                <div key={i} className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all ${a.earned ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border border-transparent'}`}>
                  <span>{a.icon || '🏅'}</span>
                  <span>{a.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stats */}
          {(streaks.totalDaysLogged > 0 || streaks.totalMealsLogged > 0) && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="text-lg font-bold text-brand-500">{streaks.totalDaysLogged || 0}</div>
                <p className="text-xs text-gray-500">Days logged</p>
              </div>
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="text-lg font-bold text-brand-500">{streaks.totalMealsLogged || 0}</div>
                <p className="text-xs text-gray-500">Meals tracked</p>
              </div>
              <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div className="text-lg font-bold text-brand-500">{streaks.weeklyGoalMet || 0}</div>
                <p className="text-xs text-gray-500">Weeks on target</p>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* AI Result Sheet (Trends + Swaps) */}
      <AiResultSheet
        open={aiSheet.open}
        onClose={() => setAiSheet({ open: false, type: null, data: null, loading: false })}
        loading={aiSheet.loading}
        title={aiSheet.type === 'swaps' ? 'Smart Meal Swaps' : 'Trend Analysis'}
        emoji={aiSheet.type === 'swaps' ? '🔄' : '📈'}
        gradient={aiSheet.type === 'swaps' ? 'from-green-500 to-teal-500' : 'from-indigo-500 to-purple-500'}
      >
        {aiSheet.data?.error ? (
          <AiCard icon="⚠️" title="Error">{aiSheet.data.error}</AiCard>
        ) : aiSheet.type === 'swaps' && aiSheet.data ? (
          <>
            {aiSheet.data.topPriority && (
              <AiCard icon="🎯" title="Top Priority" highlight>{aiSheet.data.topPriority}</AiCard>
            )}
            {aiSheet.data.weekOverWeek && (
              <AiCard icon={aiSheet.data.weekOverWeek.trend === 'improving' ? '📈' : aiSheet.data.weekOverWeek.trend === 'declining' ? '📉' : '➡️'} title="Week-over-Week">
                {aiSheet.data.weekOverWeek.summary}
                {aiSheet.data.weekOverWeek.caloriesTrend && <div className="text-xs mt-1 text-gray-500">Calories: {aiSheet.data.weekOverWeek.caloriesTrend}</div>}
                {aiSheet.data.weekOverWeek.proteinTrend && <div className="text-xs text-gray-500">Protein: {aiSheet.data.weekOverWeek.proteinTrend}</div>}
              </AiCard>
            )}
            {aiSheet.data.swaps?.length > 0 && (
              <AiSection title="Suggested Swaps">
                {aiSheet.data.swaps.map((s, i) => (
                  <AiCard key={i} icon="🔄" title={s.day || `Swap ${i + 1}`}>
                    <div className="text-xs text-red-400 line-through mb-1">{s.currentMeal}</div>
                    <div className="text-sm font-medium text-green-600 dark:text-green-400">→ {s.suggestedSwap}</div>
                    <div className="text-xs text-gray-500 mt-1">{s.issue}</div>
                    <div className="text-xs font-semibold text-brand-500 mt-1">{s.impact}</div>
                  </AiCard>
                ))}
              </AiSection>
            )}
            {aiSheet.data.quickFixes?.length > 0 && (
              <AiSection title="Quick Fixes">
                {aiSheet.data.quickFixes.map((f, i) => (
                  <AiCard key={i} icon={f.icon || '⚡'} title={f.action}>
                    <span className="text-xs font-semibold text-green-500">{f.impact}</span>
                  </AiCard>
                ))}
              </AiSection>
            )}
          </>
        ) : aiSheet.type === 'trends' && aiSheet.data ? (
          <>
            {aiSheet.data.summary && <AiCard icon="📊" title="Summary">{aiSheet.data.summary}</AiCard>}
            {aiSheet.data.patterns?.length > 0 && (
              <AiSection title="Patterns Detected">
                {aiSheet.data.patterns.map((p, i) => <AiCard key={i} icon="🔍">{typeof p === 'string' ? p : p.pattern}</AiCard>)}
              </AiSection>
            )}
            {aiSheet.data.predictions?.length > 0 && (
              <AiSection title="Predictions">
                {aiSheet.data.predictions.map((p, i) => <AiCard key={i} icon="🔮">{typeof p === 'string' ? p : p.prediction}</AiCard>)}
              </AiSection>
            )}
            {aiSheet.data.encouragement && <AiCard icon="💪" title="Keep Going!">{aiSheet.data.encouragement}</AiCard>}
          </>
        ) : null}
      </AiResultSheet>
    </div>
  );
}
