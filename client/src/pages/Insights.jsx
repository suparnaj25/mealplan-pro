import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Brain, DollarSign, Loader2 } from 'lucide-react';
import { api } from '../services/api';

export default function Insights() {
  const [aiConfigured, setAiConfigured] = useState(null);
  const [planId, setPlanId] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getAiStatus().then(d => setAiConfigured(d.configured)).catch(() => setAiConfigured(false));
    loadPlan();
  }, []);

  const loadPlan = async () => {
    try {
      const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff);
      const ws = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const data = await api.getMealPlan(ws);
      if (data.plan) setPlanId(data.plan.id);
    } catch {}
  };

  const runFeature = async (id) => {
    setActiveFeature(id); setResult(null); setError(null); setLoading(true);
    try {
      if (!planId) throw new Error('No meal plan found. Generate a meal plan first.');
      const data = id === 'rate' ? await api.aiOptimize(planId) : await api.aiBudget(planId);
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  if (aiConfigured === null) return <div className="flex justify-center py-24"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!aiConfigured) return <div className="text-center py-16"><div className="text-6xl mb-4">✨</div><h3 className="text-xl font-bold mb-2">Insights Not Available</h3><p className="text-gray-500">Set OPENAI_API_KEY to enable.</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title flex items-center gap-2"><Sparkles className="text-brand-500" size={28} /> Insights</h1>
        <p className="text-sm text-gray-500 mt-1">Understand and improve your meal plan</p>
      </div>

      {!activeFeature && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => runFeature('rate')} className="glass-card p-6 text-left group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
              <Brain size={26} className="text-white" />
            </div>
            <h3 className="font-bold text-base mb-1 group-hover:text-brand-500">📊 Rate my meal plan</h3>
            <p className="text-sm text-gray-500">See how well your plan matches your nutrition goals</p>
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => runFeature('budget')} className="glass-card p-6 text-left group">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center mb-4 shadow-lg">
              <DollarSign size={26} className="text-white" />
            </div>
            <h3 className="font-bold text-base mb-1 group-hover:text-brand-500">💰 How much will this cost?</h3>
            <p className="text-sm text-gray-500">Estimate your weekly grocery spend with saving tips</p>
          </motion.button>
        </div>
      )}

      {activeFeature && (
        <div>
          <button onClick={() => { setActiveFeature(null); setResult(null); setError(null); }} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4">← Back</button>

          {loading && <div className="glass-card p-12 text-center"><Loader2 size={40} className="mx-auto mb-4 animate-spin text-brand-500" /><p className="text-sm text-gray-500">Analyzing...</p></div>}
          {error && <div className="glass-card p-6 text-center"><div className="text-4xl mb-3">😕</div><p className="text-red-500 text-sm">{error}</p></div>}

          {activeFeature === 'rate' && result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="glass-card p-6 text-center">
                <div className="text-5xl font-bold text-brand-500 mb-2">{result.overallScore}/100</div>
                <p className="text-sm text-gray-500">Overall Plan Score</p>
              </div>
              {result.macroBalance && (
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Macro Fit</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {[{l:'Calories',v:result.macroBalance.caloriesFit,c:'text-orange-500'},{l:'Protein',v:result.macroBalance.proteinFit,c:'text-blue-500'},{l:'Carbs',v:result.macroBalance.carbsFit,c:'text-green-500'},{l:'Fat',v:result.macroBalance.fatFit,c:'text-yellow-500'}].map(m => (
                      <div key={m.l} className="text-center"><div className={`text-xl font-bold ${m.c}`}>{m.v}%</div><div className="text-xs text-gray-500">{m.l}</div></div>
                    ))}
                  </div>
                </div>
              )}
              {result.suggestions?.length > 0 && (
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Suggestions</h3>
                  <div className="space-y-2">
                    {result.suggestions.map((s, i) => (
                      <div key={i} className={`p-3 rounded-xl text-sm ${s.priority === 'high' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : s.priority === 'medium' ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}>
                        <p className="font-medium">{s.message}</p>
                        {s.actionable && <p className="text-xs text-gray-500 mt-1">{s.actionable}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeFeature === 'budget' && result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="glass-card p-6 text-center">
                <div className="text-4xl font-bold text-green-500 mb-1">${result.totalEstimate?.toFixed(2)}</div>
                <p className="text-sm text-gray-500">Estimated Weekly Cost</p>
                {result.perMealCost && <p className="text-xs text-gray-400 mt-1">${result.perMealCost?.toFixed(2)} per meal</p>}
              </div>
              {result.breakdown?.length > 0 && (
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Cost Breakdown</h3>
                  <div className="space-y-2">{result.breakdown.map((b, i) => (<div key={i} className="flex items-center justify-between text-sm"><span>{b.category} ({b.itemCount} items)</span><span className="font-semibold">${b.estimate?.toFixed(2)}</span></div>))}</div>
                </div>
              )}
              {result.savingTips?.length > 0 && (
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-sm mb-3">💰 Saving Tips</h3>
                  <div className="space-y-2">{result.savingTips.map((t, i) => (<div key={i} className="flex items-center justify-between text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-xl"><span>{t.tip}</span><span className="text-green-600 font-semibold">-${t.savings?.toFixed(2)}</span></div>))}</div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}