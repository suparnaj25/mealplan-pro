import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  Users,
  Flame,
  ChevronRight,
  ChevronLeft,
  Check,
  UtensilsCrossed,
  ShoppingBasket,
  Sparkles,
  Globe,
  Leaf,
} from 'lucide-react';
import { api } from '../services/api';

// Feature 9: Voice synthesis for cooking mode
function useSpeech() {
  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  };
  const stop = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return { speak, stop, supported };
}

const MEAL_EMOJI = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍿',
};

const CUISINE_EMOJI = {
  American: '🇺🇸',
  Mexican: '🇲🇽',
  Italian: '🇮🇹',
  Japanese: '🇯🇵',
  Chinese: '🇨🇳',
  Indian: '🇮🇳',
  Thai: '🇹🇭',
  Korean: '🇰🇷',
  Mediterranean: '🫒',
  'Middle Eastern': '🧆',
};

const STEP_IMAGES = {
  // Keywords mapped to decorative emojis for visual appeal
  chop: '🔪',
  dice: '🔪',
  slice: '🔪',
  cut: '🔪',
  mince: '🔪',
  julienne: '🔪',
  cook: '🍳',
  saute: '🍳',
  sear: '🍳',
  fry: '🍳',
  'stir-fry': '🍳',
  brown: '🍳',
  scramble: '🍳',
  boil: '♨️',
  simmer: '♨️',
  steam: '♨️',
  blanch: '♨️',
  bake: '🔥',
  roast: '🔥',
  grill: '🔥',
  broil: '🔥',
  mix: '🥣',
  whisk: '🥣',
  blend: '🥣',
  stir: '🥣',
  combine: '🥣',
  toss: '🥣',
  fold: '🥣',
  pour: '🫗',
  drizzle: '🫗',
  add: '➕',
  top: '✨',
  garnish: '✨',
  sprinkle: '✨',
  serve: '🍽️',
  assemble: '🍽️',
  plate: '🍽️',
  layer: '📚',
  marinate: '⏳',
  refrigerate: '❄️',
  rest: '⏳',
  warm: '🌡️',
  preheat: '🌡️',
  season: '🧂',
  crack: '🥚',
  poach: '🥚',
  roll: '🌀',
  wrap: '🌯',
  toast: '🍞',
};

function getStepEmoji(instruction) {
  const lower = instruction.toLowerCase();
  for (const [keyword, emoji] of Object.entries(STEP_IMAGES)) {
    if (lower.includes(keyword)) return emoji;
  }
  return '👨‍🍳';
}

function getRecipeHeroGradient(name) {
  const gradients = [
    'from-orange-400 via-red-400 to-pink-500',
    'from-emerald-400 via-teal-400 to-cyan-500',
    'from-violet-400 via-purple-400 to-fuchsia-500',
    'from-amber-400 via-orange-400 to-red-500',
    'from-blue-400 via-indigo-400 to-purple-500',
    'from-lime-400 via-green-400 to-emerald-500',
    'from-rose-400 via-pink-400 to-fuchsia-500',
    'from-sky-400 via-blue-400 to-indigo-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [recipe, setRecipe] = useState(location.state?.recipe || null);
  const [loading, setLoading] = useState(!recipe);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('ingredients');
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [checkedIngredients, setCheckedIngredients] = useState(new Set());
  const [cookingMode, setCookingMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [substitutions, setSubstitutions] = useState(null);
  const [subsLoading, setSubsLoading] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState(null);
  const { speak, stop, supported: voiceSupported } = useSpeech();

  useEffect(() => {
    if (!recipe && id) {
      loadRecipe();
    }
  }, [id]);

  const loadRecipe = async () => {
    setLoading(true);
    try {
      const data = await api.getRecipe(id);
      setRecipe(data.recipe);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleIngredient = (idx) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleStepComplete = (idx) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const nextStep = () => {
    if (recipe && currentStep < recipe.instructions.length - 1) {
      toggleStepComplete(currentStep);
      const next = currentStep + 1;
      setCurrentStep(next);
      if (voiceEnabled && recipe.instructions[next]) speak(recipe.instructions[next]);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      if (voiceEnabled && recipe.instructions[prev]) speak(recipe.instructions[prev]);
    }
  };

  const loadSubstitutions = async () => {
    if (!recipe?.id && !id) return;
    setSubsLoading(true);
    try {
      const data = await api.aiSubstitutions(recipe?.id || id);
      setSubstitutions(data);
    } catch (err) {
      console.error('Substitutions error:', err);
    } finally {
      setSubsLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!recipe) return;
    setImageGenerating(true);
    try {
      const data = await api.aiGenerateImage(recipe.name, recipe.description, recipe.cuisine, recipe.id || id);
      setGeneratedImage(data.imageUrl);
    } catch (err) {
      console.error('Image gen error:', err);
    } finally {
      setImageGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="text-center py-24">
        <div className="text-5xl mb-4">😕</div>
        <h3 className="text-xl font-bold mb-2">Recipe not found</h3>
        <p className="text-gray-500 mb-6">{error || "We couldn't load this recipe."}</p>
        <button onClick={() => navigate(-1)} className="btn-primary">
          Go Back
        </button>
      </div>
    );
  }

  const instructions = recipe.instructions || [];
  const ingredients = recipe.ingredients || [];
  const nutrition = recipe.nutrition || {};
  const totalTime = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);
  const gradient = getRecipeHeroGradient(recipe.name);
  const progressPct = instructions.length > 0 ? (completedSteps.size / instructions.length) * 100 : 0;

  // Cooking mode — full-screen step-by-step
  if (cookingMode) {
    const step = instructions[currentStep];
    const emoji = getStepEmoji(step);
    const isLast = currentStep === instructions.length - 1;
    const isFirst = currentStep === 0;

    return (
      <div className="fixed inset-0 z-50 bg-gray-900 text-white flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <button onClick={() => { setCookingMode(false); stop(); }} className="text-gray-400 hover:text-white transition-colors flex items-center gap-2">
            <ArrowLeft size={20} /> Exit Cooking Mode
          </button>
          <div className="flex items-center gap-3">
            {voiceSupported && (
              <button onClick={() => { setVoiceEnabled(!voiceEnabled); if (voiceEnabled) stop(); else speak(instructions[currentStep]); }}
                className={`p-2 rounded-lg transition-colors ${voiceEnabled ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white'}`}
                title={voiceEnabled ? 'Disable voice' : 'Enable voice'}>
                🔊
              </button>
            )}
            <span className="text-sm text-gray-400">
              Step {currentStep + 1} of {instructions.length}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-800">
          <motion.div
            className="h-full bg-gradient-to-r from-brand-400 to-brand-600"
            initial={false}
            animate={{ width: `${((currentStep + 1) / instructions.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Step content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="text-center max-w-2xl"
            >
              <div className="text-8xl mb-8">{emoji}</div>
              <div className="text-sm font-semibold text-brand-400 uppercase tracking-wider mb-4">
                Step {currentStep + 1}
              </div>
              <p className="text-3xl font-light leading-relaxed">{step}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-8 py-6 border-t border-gray-700">
          <button
            onClick={prevStep}
            disabled={isFirst}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              isFirst ? 'text-gray-600 cursor-not-allowed' : 'text-white bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <ChevronLeft size={20} /> Previous
          </button>

          <div className="flex gap-2">
            {instructions.map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i === currentStep
                    ? 'bg-brand-500 scale-125'
                    : completedSteps.has(i)
                    ? 'bg-brand-700'
                    : 'bg-gray-700'
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={() => {
                toggleStepComplete(currentStep);
                setCookingMode(false);
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-green-600 hover:bg-green-500 text-white transition-all"
            >
              <Check size={20} /> Done!
            </button>
          ) : (
            <button
              onClick={nextStep}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-brand-600 hover:bg-brand-500 text-white transition-all"
            >
              Next <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <ArrowLeft size={18} /> Back to Meal Plan
      </button>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${gradient} p-8 md:p-12`}
      >
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {recipe.meal_type && (
              <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1 rounded-full">
                {MEAL_EMOJI[recipe.meal_type]} {recipe.meal_type}
              </span>
            )}
            {recipe.cuisine && (
              <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1 rounded-full">
                {CUISINE_EMOJI[recipe.cuisine] || '🌍'} {recipe.cuisine}
              </span>
            )}
            {recipe.diet_tags?.map((tag) => (
              <span key={tag} className="bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1 rounded-full">
                <Leaf size={10} className="inline mr-1" />
                {tag}
              </span>
            ))}
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">{recipe.name}</h1>
          {recipe.description && (
            <p className="text-white/80 text-lg max-w-2xl">{recipe.description}</p>
          )}

          <div className="flex flex-wrap gap-6 mt-6">
            {totalTime > 0 && (
              <div className="flex items-center gap-2 text-white/90">
                <Clock size={18} />
                <div>
                  <div className="text-sm font-semibold">{totalTime} min</div>
                  <div className="text-xs text-white/60">Total Time</div>
                </div>
              </div>
            )}
            {recipe.prep_time_minutes > 0 && (
              <div className="flex items-center gap-2 text-white/90">
                <UtensilsCrossed size={18} />
                <div>
                  <div className="text-sm font-semibold">{recipe.prep_time_minutes} min</div>
                  <div className="text-xs text-white/60">Prep</div>
                </div>
              </div>
            )}
            {recipe.cook_time_minutes > 0 && (
              <div className="flex items-center gap-2 text-white/90">
                <Flame size={18} />
                <div>
                  <div className="text-sm font-semibold">{recipe.cook_time_minutes} min</div>
                  <div className="text-xs text-white/60">Cook</div>
                </div>
              </div>
            )}
            {(recipe.servings || recipe.recipe_servings) && (
              <div className="flex items-center gap-2 text-white/90">
                <Users size={18} />
                <div>
                  <div className="text-sm font-semibold">{recipe.servings || recipe.recipe_servings}</div>
                  <div className="text-xs text-white/60">Servings</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-4 right-4 text-8xl opacity-20 select-none">
          {MEAL_EMOJI[recipe.meal_type] || '🍽️'}
        </div>
      </motion.div>

      {/* Nutrition Bar */}
      {(nutrition.calories || nutrition.protein) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4"
        >
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Nutrition per Serving
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {nutrition.calories && (
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-500">{nutrition.calories}</div>
                <div className="text-xs text-gray-500">Calories</div>
              </div>
            )}
            {nutrition.protein && (
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-500">{nutrition.protein}g</div>
                <div className="text-xs text-gray-500">Protein</div>
              </div>
            )}
            {nutrition.carbs && (
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">{nutrition.carbs}g</div>
                <div className="text-xs text-gray-500">Carbs</div>
              </div>
            )}
            {nutrition.fat && (
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-500">{nutrition.fat}g</div>
                <div className="text-xs text-gray-500">Fat</div>
              </div>
            )}
            {nutrition.fiber && (
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-500">{nutrition.fiber}g</div>
                <div className="text-xs text-gray-500">Fiber</div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* AI-generated image */}
      {(generatedImage || recipe.image_url) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl overflow-hidden">
          <img src={generatedImage || recipe.image_url} alt={recipe.name} className="w-full h-64 object-cover rounded-2xl" />
        </motion.div>
      )}

      {/* AI Action buttons */}
      <div className="flex flex-wrap gap-2">
        {!generatedImage && !recipe.image_url && (
          <button onClick={handleGenerateImage} disabled={imageGenerating}
            className="btn-secondary text-xs flex items-center gap-1.5">
            {imageGenerating ? <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" /> : '🎨'}
            {imageGenerating ? 'Generating...' : 'Generate AI Image'}
          </button>
        )}
        <button onClick={loadSubstitutions} disabled={subsLoading}
          className="btn-secondary text-xs flex items-center gap-1.5">
          {subsLoading ? <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" /> : '🔄'}
          {subsLoading ? 'Finding...' : 'AI Substitutions'}
        </button>
      </div>

      {/* Substitution Results */}
      {substitutions?.substitutions?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">🔄 Smart Substitutions</h3>
          <div className="space-y-2">
            {substitutions.substitutions.map((sub, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="line-through text-gray-400">{sub.original}</span>
                    <span>→</span>
                    <span className="font-medium text-brand-500">{sub.substitute}</span>
                    {sub.inPantry && <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">In pantry</span>}
                  </div>
                  <p className="text-xs text-gray-500">{sub.reason}</p>
                  {sub.dietaryBenefit && <p className="text-xs text-brand-400 mt-0.5">{sub.dietaryBenefit}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  sub.impactOnTaste === 'minimal' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' :
                  sub.impactOnTaste === 'moderate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                }`}>
                  {sub.impactOnTaste} impact
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('ingredients')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'ingredients'
              ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <ShoppingBasket size={14} className="inline mr-1.5" />
          Ingredients ({ingredients.length})
        </button>
        <button
          onClick={() => setActiveTab('steps')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'steps'
              ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <UtensilsCrossed size={14} className="inline mr-1.5" />
          Steps ({instructions.length})
        </button>
      </div>

      {/* Ingredients Tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'ingredients' && (
          <motion.div
            key="ingredients"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">What You'll Need</h3>
              <span className="text-sm text-gray-400">
                {checkedIngredients.size}/{ingredients.length} checked
              </span>
            </div>
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => toggleIngredient(idx)}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                    checkedIngredients.has(idx)
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      : 'bg-gray-50 dark:bg-gray-800/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-700'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      checkedIngredients.has(idx)
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {checkedIngredients.has(idx) && <Check size={14} />}
                  </div>
                  <div className={`flex-1 ${checkedIngredients.has(idx) ? 'line-through text-gray-400' : ''}`}>
                    <span className="font-medium">{ing.name}</span>
                    {ing.quantity && (
                      <span className="text-gray-500 ml-2 text-sm">
                        {ing.quantity} {ing.unit}
                      </span>
                    )}
                  </div>
                  {ing.category && (
                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full hidden sm:inline">
                      {ing.category}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Steps Tab */}
        {activeTab === 'steps' && (
          <motion.div
            key="steps"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Progress overview */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Cooking Progress</span>
                <span className="text-sm font-bold text-brand-500">{Math.round(progressPct)}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full"
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            {/* Start cooking mode button */}
            <button
              onClick={() => {
                setCookingMode(true);
                setCurrentStep(0);
              }}
              className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-3"
            >
              <Sparkles size={22} /> Start Cooking Mode
            </button>

            {/* Step cards */}
            {instructions.map((step, idx) => {
              const emoji = getStepEmoji(step);
              const isComplete = completedSteps.has(idx);

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`glass-card p-5 cursor-pointer transition-all border-2 ${
                    isComplete
                      ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10'
                      : 'border-transparent hover:border-brand-200 dark:hover:border-brand-800'
                  }`}
                  onClick={() => toggleStepComplete(idx)}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 transition-all ${
                        isComplete
                          ? 'bg-green-100 dark:bg-green-800/50'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}
                    >
                      {isComplete ? <Check size={24} className="text-green-600 dark:text-green-400" /> : emoji}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-brand-500 uppercase tracking-wider">
                          Step {idx + 1}
                        </span>
                        {isComplete && (
                          <span className="text-xs text-green-600 bg-green-100 dark:bg-green-800/50 dark:text-green-400 px-2 py-0.5 rounded-full">
                            Done
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-sm md:text-base leading-relaxed ${
                          isComplete ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {step}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Completion celebration */}
            {completedSteps.size === instructions.length && instructions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card p-8 text-center"
              >
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold mb-2">Bon Appétit!</h3>
                <p className="text-gray-500">
                  You've completed all the steps. Enjoy your {recipe.name}!
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}