import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, TrendingUp, Target } from 'lucide-react';
import { api } from '../services/api';

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

function GradeEmoji(grade) {
  return grade === 'A' ? '🏆' : grade === 'B' ? '⭐' : grade === 'C' ? '👍' : '⚠️';
}

export default function Insights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadInsights(); }, []);

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
      <div className="glass-card p-6 text-center"><div className="text-4xl mb-3">😕</div><p className="text-red-500 text-sm">{error}</p><button onClick={loadInsights} className="btn-primary text-sm mt-4">Retry</button></div>
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
          <span className="ml-auto text-3xl">{GradeEmoji(ai?.actualsGrade)}</span>
          <span className="text-xl font-bold text-brand-500">{ai?.actualsGrade || '—'}</span>
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
          <span className="ml-auto text-3xl">{GradeEmoji(ai?.forecastGrade)}</span>
          <span className="text-xl font-bold text-purple-500">{ai?.forecastGrade || '—'}</span>
        </div>
        
        <p className="text-xs text-gray-500 mb-3">Logged meals + remaining planned meals — projected daily averages</p>
        <div className="space-y-3">
          <MacroBar label="Calories" actual={forecast.avgCalories} target={targets.calories} color="bg-orange-400" />
          <MacroBar label="Protein" actual={forecast.avgProtein} target={targets.protein} color="bg-blue-400" />
          <MacroBar label="Carbs" actual={forecast.avgCarbs} target={targets.carbs} color="bg-green-400" />
          <MacroBar label="Fat" actual={forecast.avgFat} target={targets.fat} color="bg-yellow-400" />
        </div>
        {ai?.forecastSummary && <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{ai.forecastSummary}</p>}
      </motion.div>

      {/* Tips */}
      {ai?.tips?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <h3 className="font-semibold text-sm mb-3">💡 Tips to improve</h3>
          <div className="space-y-2">
            {ai.tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2 text-sm bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl">
                <span>💡</span><span>{tip}</span>
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
    </div>
  );
}