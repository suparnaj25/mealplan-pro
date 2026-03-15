import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Send, Sparkles, Brain, ShoppingBasket, DollarSign, BarChart3,
  ChefHat, Lightbulb, ArrowRight, Loader2, MessageCircle, X, Mic, MicOff
} from 'lucide-react';
import { api } from '../services/api';

const FEATURES = [
  { id: 'chat', icon: MessageCircle, title: '💬 Ask me anything', desc: 'Get meal ideas, nutrition advice, or cooking tips', color: 'from-brand-400 to-brand-600' },
  { id: 'optimize', icon: Brain, title: '📊 Rate my meal plan', desc: 'See how well your plan matches your goals', color: 'from-violet-400 to-purple-600' },
  { id: 'pantry', icon: ChefHat, title: '🍳 What can I make?', desc: 'Find recipes using what you already have', color: 'from-emerald-400 to-green-600' },
  { id: 'budget', icon: DollarSign, title: '💰 How much will this cost?', desc: 'Estimate your weekly grocery spend', color: 'from-amber-400 to-orange-600' },
  { id: 'nutrition', icon: BarChart3, title: '📋 Weekly health check', desc: 'Grade your nutrition against your targets', color: 'from-blue-400 to-indigo-600' },
];

export default function AiAssistant() {
  const [aiConfigured, setAiConfigured] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Plan ID
  const [planId, setPlanId] = useState(null);

  useEffect(() => {
    checkAiStatus();
    loadCurrentPlan();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const checkAiStatus = async () => {
    try {
      const data = await api.getAiStatus();
      setAiConfigured(data.configured);
    } catch { setAiConfigured(false); }
  };

  const loadCurrentPlan = async () => {
    try {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      const weekStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const data = await api.getMealPlan(weekStart);
      if (data.plan) setPlanId(data.plan.id);
    } catch {}
  };

  const runFeature = async (featureId) => {
    setActiveFeature(featureId);
    setResult(null);
    setError(null);

    if (featureId === 'chat') return;

    setLoading(true);
    try {
      let data;
      switch (featureId) {
        case 'optimize':
          if (!planId) throw new Error('No meal plan found. Generate a meal plan first.');
          data = await api.aiOptimize(planId);
          break;
        case 'pantry':
          data = await api.aiWhatCanIMake();
          break;
        case 'budget':
          if (!planId) throw new Error('No meal plan found. Generate a meal plan first.');
          data = await api.aiBudget(planId);
          break;
        case 'nutrition':
          if (!planId) throw new Error('No meal plan found. Generate a meal plan first.');
          data = await api.aiNutritionReport(planId);
          break;
      }
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);

    try {
      const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
      const data = await api.aiChat(msg, history);
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I encountered an error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  if (aiConfigured === null) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!aiConfigured) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">🤖</div>
        <h3 className="text-xl font-bold mb-2">AI Features Not Configured</h3>
        <p className="text-gray-500 mb-4 max-w-md mx-auto">
          Set <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">OPENAI_API_KEY</code> in your environment variables to enable AI-powered features.
        </p>
        <p className="text-sm text-gray-400">Supports OpenAI, Azure OpenAI, or any compatible API.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="section-title flex items-center gap-2">
          <Bot className="text-brand-500" size={28} />
          AI Assistant
        </h1>
        <p className="text-sm text-gray-500 mt-1">Your intelligent meal planning companion</p>
      </div>

      {/* Feature cards */}
      {!activeFeature && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <motion.button
              key={f.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => runFeature(f.id)}
              className="glass-card p-5 text-left group"
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-3 shadow-lg`}>
                <f.icon size={22} className="text-white" />
              </div>
              <h3 className="font-bold text-sm mb-1 group-hover:text-brand-500 transition-colors">{f.title}</h3>
              <p className="text-xs text-gray-500">{f.desc}</p>
            </motion.button>
          ))}
        </div>
      )}

      {/* Active Feature */}
      {activeFeature && (
        <div>
          <button onClick={() => { setActiveFeature(null); setResult(null); setError(null); }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4">
            ← Back to features
          </button>

          {/* Chat UI */}
          {activeFeature === 'chat' && (
            <div className="glass-card overflow-hidden flex flex-col" style={{ height: '70vh' }}>
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <MessageCircle size={18} className="text-brand-500" />
                <span className="font-semibold text-sm">Meal Planning Chat</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <Bot size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-sm">Ask me anything about meal planning, nutrition, or recipes!</p>
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      {['Make this week lighter', 'High protein dinner ideas', 'What snacks fit my macros?', 'I\'m craving Thai food'].map(q => (
                        <button key={q} onClick={() => { setChatInput(q); }}
                          className="text-xs bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full hover:bg-brand-500/10 hover:text-brand-500 transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chatMessages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-brand-500 text-white rounded-br-md'
                        : 'bg-gray-100 dark:bg-gray-800 rounded-bl-md'
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </motion.div>
                ))}

                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-3 rounded-bl-md">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                <form onSubmit={(e) => { e.preventDefault(); sendChat(); }} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about meals, nutrition, or recipes..."
                    className="input-field flex-1 text-sm"
                    disabled={chatLoading}
                  />
                  <button type="submit" disabled={chatLoading || !chatInput.trim()}
                    className="btn-primary p-3 rounded-xl">
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="glass-card p-12 text-center">
              <Loader2 size={40} className="mx-auto mb-4 animate-spin text-brand-500" />
              <p className="text-sm text-gray-500">AI is analyzing your data...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="glass-card p-6 text-center">
              <div className="text-4xl mb-3">😕</div>
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          {/* Optimization Results */}
          {activeFeature === 'optimize' && result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="glass-card p-6 text-center">
                <div className="text-5xl font-bold text-brand-500 mb-2">{result.overallScore}/100</div>
                <p className="text-sm text-gray-500">Overall Plan Score</p>
              </div>

              {result.macroBalance && (
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Macro Fit</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Calories', value: result.macroBalance.caloriesFit, color: 'text-orange-500' },
                      { label: 'Protein', value: result.macroBalance.proteinFit, color: 'text-blue-500' },
                      { label: 'Carbs', value: result.macroBalance.carbsFit, color: 'text-green-500' },
                      { label: 'Fat', value: result.macroBalance.fatFit, color: 'text-yellow-500' },
                    ].map(m => (
                      <div key={m.label} className="text-center">
                        <div className={`text-xl font-bold ${m.color}`}>{m.value}%</div>
                        <div className="text-xs text-gray-500">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.suggestions?.length > 0 && (
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Suggestions</h3>
                  <div className="space-y-2">
                    {result.suggestions.map((s, i) => (
                      <div key={i} className={`p-3 rounded-xl text-sm ${
                        s.priority === 'high' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
                        s.priority === 'medium' ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' :
                        'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                      }`}>
                        <p className="font-medium">{s.message}</p>
                        {s.actionable && <p className="text-xs text-gray-500 mt-1">{s.actionable}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* What Can I Make Results */}
          {activeFeature === 'pantry' && result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {result.quickMealIdea && (
                <div className="glass-card p-5 bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb size={18} className="text-emerald-500" />
                    <span className="font-semibold text-sm">Quick Meal Idea</span>
                  </div>
                  <p className="text-sm">{result.quickMealIdea}</p>
                </div>
              )}

              {result.suggestions?.map((s, i) => (
                <div key={i} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">{s.recipeName}</h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      s.canMakeNow ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
                    }`}>
                      {s.canMakeNow ? '✅ Ready to cook' : `Missing ${s.missingItems?.length || 0} items`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{s.matchPercentage}% match</span>
                    <span>Difficulty: {s.difficulty}</span>
                  </div>
                  {s.tip && <p className="text-xs text-gray-500 mt-2 italic">💡 {s.tip}</p>}
                  {s.missingItems?.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">Missing: {s.missingItems.join(', ')}</p>
                  )}
                </div>
              ))}
            </motion.div>
          )}

          {/* Budget Results */}
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
                  <div className="space-y-2">
                    {result.breakdown.map((b, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{b.category} ({b.itemCount} items)</span>
                        <span className="font-semibold">${b.estimate?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.savingTips?.length > 0 && (
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-sm mb-3">💰 Saving Tips</h3>
                  <div className="space-y-2">
                    {result.savingTips.map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-green-50 dark:bg-green-900/20 p-3 rounded-xl">
                        <span>{t.tip}</span>
                        <span className="text-green-600 font-semibold">-${t.savings?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Nutrition Report Results */}
          {activeFeature === 'nutrition' && result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="glass-card p-6 text-center">
                <div className="text-6xl mb-2">{result.grade === 'A' ? '🏆' : result.grade === 'B' ? '⭐' : result.grade === 'C' ? '👍' : '⚠️'}</div>
                <div className="text-4xl font-bold text-brand-500 mb-2">Grade: {result.grade}</div>
                <p className="text-sm text-gray-500 max-w-md mx-auto">{result.summary}</p>
              </div>

              {result.weeklyAverages && (
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Weekly Averages (Daily)</h3>
                  <div className="grid grid-cols-5 gap-3 text-center">
                    <div><div className="text-xl font-bold text-orange-500">{result.weeklyAverages.calories}</div><div className="text-xs text-gray-500">Cal</div></div>
                    <div><div className="text-xl font-bold text-blue-500">{result.weeklyAverages.protein}g</div><div className="text-xs text-gray-500">Protein</div></div>
                    <div><div className="text-xl font-bold text-green-500">{result.weeklyAverages.carbs}g</div><div className="text-xs text-gray-500">Carbs</div></div>
                    <div><div className="text-xl font-bold text-yellow-500">{result.weeklyAverages.fat}g</div><div className="text-xs text-gray-500">Fat</div></div>
                    <div><div className="text-xl font-bold text-purple-500">{result.weeklyAverages.fiber}g</div><div className="text-xs text-gray-500">Fiber</div></div>
                  </div>
                </div>
              )}

              {result.insights?.length > 0 && (
                <div className="glass-card p-4">
                  <h3 className="font-semibold text-sm mb-3">Insights</h3>
                  <div className="space-y-2">
                    {result.insights.map((ins, i) => (
                      <div key={i} className={`p-3 rounded-xl text-sm flex items-start gap-2 ${
                        ins.type === 'positive' ? 'bg-green-50 dark:bg-green-900/20' :
                        ins.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20' :
                        'bg-blue-50 dark:bg-blue-900/20'
                      }`}>
                        <span>{ins.icon}</span>
                        <span>{ins.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.topRecommendation && (
                <div className="glass-card p-4 bg-gradient-to-r from-brand-500/10 to-purple-500/10 border border-brand-200 dark:border-brand-800">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={16} className="text-brand-500" />
                    <span className="font-semibold text-sm">Top Recommendation</span>
                  </div>
                  <p className="text-sm">{result.topRecommendation}</p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}