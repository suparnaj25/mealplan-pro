import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, User, ShieldAlert, Salad, Gauge, Heart, Globe, Database, ShoppingBag, Leaf } from 'lucide-react';
import { useOnboardingStore, useAuthStore } from '../store/useStore';
import { api } from '../services/api';
import TagInput from '../components/TagInput';

const STEPS = [
  { icon: User, title: 'About You', subtitle: 'Basic profile & meal preferences' },
  { icon: ShieldAlert, title: 'Dietary Restrictions', subtitle: 'Must-have rules (strictly enforced)' },
  { icon: Salad, title: 'Diet Preferences', subtitle: 'Optional diet styles & allergies' },
  { icon: Leaf, title: 'Organic & Quality', subtitle: 'Food quality preferences' },
  { icon: Gauge, title: 'Macros', subtitle: 'Nutrition targets' },
  { icon: Heart, title: 'Ingredients', subtitle: 'Likes & dislikes' },
  { icon: Globe, title: 'Cuisines', subtitle: 'Favorite food cultures' },
  { icon: Database, title: 'Recipes', subtitle: 'Recipe sources' },
  { icon: ShoppingBag, title: 'Store', subtitle: 'Where you shop' },
];

const RESTRICTIONS = ['Vegan', 'Vegetarian', 'Pescatarian', 'Gluten-Free', 'Dairy-Free', 'Nut-Free', 'Halal', 'Kosher'];
const DIET_PREFS = ['Keto', 'Paleo', 'Mediterranean', 'Whole30', 'Low-Carb', 'Low-Fat', 'DASH', 'Low-Sodium'];
const ALLERGIES = ['Peanuts', 'Tree Nuts', 'Shellfish', 'Fish', 'Eggs', 'Milk', 'Wheat', 'Soy', 'Sesame'];
const CUISINES = ['Italian', 'Mexican', 'Indian', 'Chinese', 'Japanese', 'Thai', 'Korean', 'Mediterranean', 'American', 'French', 'Middle Eastern', 'Ethiopian', 'Caribbean', 'Vietnamese', 'Greek', 'Spanish'];
const STORES = [
  { id: 'amazon_wholefoods', name: 'Amazon / Whole Foods', icon: '🛒', tier: 'deep_link' },
  { id: 'kroger', name: 'Kroger', icon: '🏪', tier: 'full_cart' },
  { id: 'walmart', name: 'Walmart', icon: '🏬', tier: 'deep_link' },
  { id: 'instacart', name: 'Instacart', icon: '🥕', tier: 'deep_link' },
  { id: 'target', name: 'Target', icon: '🎯', tier: 'deep_link' },
  { id: 'costco', name: 'Costco', icon: '📦', tier: 'deep_link' },
  { id: 'safeway', name: 'Safeway', icon: '🛍️', tier: 'deep_link' },
  { id: 'trader_joes', name: "Trader Joe's", icon: '🌺', tier: 'list_export' },
];
const MACRO_PRESETS = {
  balanced: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 67 },
  high_protein: { calories: 2200, proteinG: 200, carbsG: 165, fatG: 73 },
  keto: { calories: 1800, proteinG: 113, carbsG: 23, fatG: 140 },
  low_carb: { calories: 1800, proteinG: 158, carbsG: 90, fatG: 100 },
};

function TagToggle({ items, selected, onToggle, colorClass = 'tag-active' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <motion.button key={item} whileTap={{ scale: 0.95 }} onClick={() => onToggle(item)}
          className={`tag ${selected.includes(item) ? colorClass : 'tag-inactive'}`}>{item}</motion.button>
      ))}
    </div>
  );
}

export default function Onboarding() {
  const { step, data, setStep, nextStep, prevStep, updateData } = useOnboardingStore();
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [krogerZip, setKrogerZip] = useState('');
  const [krogerLocations, setKrogerLocations] = useState([]);
  const [krogerLocationId, setKrogerLocationId] = useState(null);
  const [searchingLocations, setSearchingLocations] = useState(false);

  const toggleArray = (section, field, item) => {
    const current = data[section][field] || [];
    const next = current.includes(item) ? current.filter((i) => i !== item) : [...current, item];
    updateData(section, { [field]: next });
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await api.updateProfile(data.profile);
      await api.updateDiets(data.diets);
      await api.updateMacros(data.macros);
      await api.updateIngredients(data.ingredients);
      await api.updateCuisines(data.cuisines);
      await api.updateSources(data.sources);
      await api.updateStore(data.store);
      // Save Kroger location if selected
      if (krogerLocationId && data.store.primaryStore === 'kroger') {
        try { await api.krogerSetLocation(krogerLocationId); } catch {}
      }
      await api.completeOnboarding();
      const user = await api.getMe();
      setUser(user);
      navigate('/');
    } catch (err) { console.error('Onboarding error:', err); }
    finally { setSaving(false); }
  };

  const totalSteps = STEPS.length;

  const renderStep = () => {
    switch (step) {
      case 0: // Profile
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5">Your Name</label>
              <input type="text" value={data.profile.name} onChange={(e) => updateData('profile', { name: e.target.value })} className="input-field" placeholder="What should we call you?" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Household Size</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button key={n} onClick={() => updateData('profile', { householdSize: n })} className={`w-12 h-12 rounded-xl font-semibold transition-all ${data.profile.householdSize === n ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200'}`}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Budget</label>
              <div className="grid grid-cols-3 gap-2">
                {[{v:'economy',l:'💰 Economy'},{v:'moderate',l:'⚖️ Moderate'},{v:'premium',l:'✨ Premium'}].map(({v,l}) => (
                  <button key={v} onClick={() => updateData('profile', { budgetPreference: v })} className={`py-3 rounded-xl text-sm font-medium transition-all ${data.profile.budgetPreference === v ? 'bg-brand-500 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-800'}`}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Meals to Plan</label>
              <div className="grid grid-cols-2 gap-2">
                {['breakfast','lunch','dinner','snacks'].map((m) => (
                  <button key={m} onClick={() => updateData('profile', { mealStructure: { ...data.profile.mealStructure, [m]: !data.profile.mealStructure[m] } })} className={`py-3 rounded-xl text-sm font-medium capitalize transition-all ${data.profile.mealStructure[m] ? 'bg-brand-500 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    {m === 'breakfast' ? '🌅' : m === 'lunch' ? '☀️' : m === 'dinner' ? '🌙' : '🍿'} {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 1: // Dietary Restrictions (HARD FILTERS)
        return (
          <div className="space-y-5">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                <ShieldAlert size={16} /> These are strict — we will NEVER suggest meals that violate these
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">Select all that apply to you</p>
            </div>
            <TagToggle items={RESTRICTIONS} selected={data.diets.restrictions} onToggle={(d) => toggleArray('diets', 'restrictions', d)} colorClass="tag-danger" />
          </div>
        );

      case 2: // Diet Preferences (soft) + Allergies
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Diet Styles <span className="text-gray-400 font-normal">(preferred, not required)</span></label>
              <TagToggle items={DIET_PREFS} selected={data.diets.diets} onToggle={(d) => toggleArray('diets', 'diets', d)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Allergies & Intolerances</label>
              <TagToggle items={ALLERGIES} selected={data.diets.allergies} onToggle={(a) => toggleArray('diets', 'allergies', a)} colorClass="tag-danger" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Custom Diet Notes</label>
              <input type="text" value={data.diets.customDiet} onChange={(e) => updateData('diets', { customDiet: e.target.value })} className="input-field" placeholder="Any other dietary needs..." />
            </div>
          </div>
        );

      case 3: // Organic & Quality (NEW)
        return (
          <div className="space-y-5">
            <div className="text-center mb-2">
              <span className="text-4xl">🌿</span>
              <p className="text-sm text-gray-500 mt-2">How important is organic food to you?</p>
            </div>
            {[
              { v: 'always_organic', l: '🌱 Always Organic', desc: 'Only show organic options when shopping' },
              { v: 'prefer_organic', l: '🌿 Prefer Organic', desc: 'Prioritize organic but show conventional too' },
              { v: 'no_preference', l: '⚖️ No Preference', desc: 'Show all options, I\'ll decide' },
              { v: 'conventional', l: '💰 Conventional / Budget', desc: 'Prioritize lowest cost options' },
            ].map(({ v, l, desc }) => (
              <motion.button key={v} whileTap={{ scale: 0.98 }} onClick={() => updateData('store', { organicPreference: v })}
                className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left ${data.store.organicPreference === v ? 'bg-brand-500/10 border-2 border-brand-500 shadow-md' : 'glass-card hover:shadow-md'}`}>
                <div className="flex-1">
                  <p className="font-medium">{l}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
                {data.store.organicPreference === v && <Check size={20} className="text-brand-500" />}
              </motion.button>
            ))}
          </div>
        );

      case 4: // Macros
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2">Quick Presets</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(MACRO_PRESETS).map(([key, vals]) => (
                  <button key={key} onClick={() => updateData('macros', { ...vals, macroPreset: key })} className={`py-3 rounded-xl text-sm font-medium capitalize transition-all ${data.macros.macroPreset === key ? 'bg-brand-500 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    {key.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            {[{k:'calories',l:'Daily Calories',u:'kcal',max:4000},{k:'proteinG',l:'Protein',u:'g',max:300},{k:'carbsG',l:'Carbs',u:'g',max:400},{k:'fatG',l:'Fat',u:'g',max:200}].map(({k,l,u,max}) => (
              <div key={k}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{l}</span>
                  <span className="text-brand-500 font-semibold">{data.macros[k]} {u}</span>
                </div>
                <input type="range" min={0} max={max} value={data.macros[k]} onChange={(e) => updateData('macros', { [k]: parseInt(e.target.value), macroPreset: 'custom' })} className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-brand-500" />
              </div>
            ))}
          </div>
        );

      case 5: // Ingredients with TagInput
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">❌ Ingredients You Dislike</label>
              <TagInput
                selected={data.ingredients.dislikedIngredients}
                onChange={(items) => updateData('ingredients', { dislikedIngredients: items })}
                placeholder="Type an ingredient to add..."
                colorClass="tag-danger"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">❤️ Ingredients You Love</label>
              <TagInput
                selected={data.ingredients.lovedIngredients}
                onChange={(items) => updateData('ingredients', { lovedIngredients: items })}
                placeholder="Type an ingredient to add..."
                colorClass="tag-active"
              />
            </div>
          </div>
        );

      case 6: // Cuisines
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">🌍 Favorite Cuisines</label>
              <TagToggle items={CUISINES} selected={data.cuisines.favoriteCuisines} onToggle={(c) => toggleArray('cuisines', 'favoriteCuisines', c)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Variety Preference</label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Comfort</span>
                <input type="range" min={1} max={10} value={data.cuisines.varietyPreference} onChange={(e) => updateData('cuisines', { varietyPreference: parseInt(e.target.value) })} className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-brand-500" />
                <span className="text-xs text-gray-500">Adventurous</span>
              </div>
            </div>
          </div>
        );

      case 7: // Sources
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Choose where we find recipes for your meal plans.</p>
            <div className="glass-card p-4 flex items-center justify-between">
              <div><p className="font-medium">📚 Built-in Recipes</p><p className="text-xs text-gray-500">29 curated recipes included</p></div>
              <span className="text-brand-500 text-sm font-semibold">Always On</span>
            </div>
            <div className="glass-card p-4 flex items-center justify-between">
              <div><p className="font-medium">🥄 Spoonacular API</p><p className="text-xs text-gray-500">Thousands of recipes</p></div>
              <button onClick={() => { const s = data.sources.sources.map(s => s.sourceName === 'spoonacular' ? {...s, enabled: !s.enabled} : s); updateData('sources', { sources: s }); }} className={`w-12 h-6 rounded-full transition-all ${data.sources.sources[0]?.enabled ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${data.sources.sources[0]?.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        );

      case 8: // Store
        return (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 mb-2">Select your primary grocery store.</p>
            {STORES.map((store) => (
              <motion.button key={store.id} whileTap={{ scale: 0.98 }} onClick={() => updateData('store', { primaryStore: store.id })}
                className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${data.store.primaryStore === store.id ? 'bg-brand-500/10 border-2 border-brand-500 shadow-md' : 'glass-card hover:shadow-md'}`}>
                <span className="text-2xl">{store.icon}</span>
                <div className="flex-1 text-left">
                  <p className="font-medium">{store.name}</p>
                  <p className="text-xs text-gray-500">{store.tier === 'full_cart' ? '🥇 Direct cart integration' : store.tier === 'deep_link' ? '🔗 Smart product links' : '📋 List export'}</p>
                </div>
                {data.store.primaryStore === store.id && <Check size={20} className="text-brand-500" />}
              </motion.button>
            ))}

            {/* Kroger Location Picker — appears when Kroger is selected */}
            {data.store.primaryStore === 'kroger' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-3">
                <p className="text-sm font-medium">📍 Select Your Nearest Kroger Store</p>
                <p className="text-xs text-gray-500">Enter your zip code to find nearby stores</p>
                {krogerLocationId && <p className="text-xs text-brand-500 font-medium">✓ Store selected</p>}
                <div className="flex gap-2">
                  <input type="text" placeholder="Zip code (e.g., 98101)" value={krogerZip} onChange={(e) => setKrogerZip(e.target.value)}
                    className="input-field text-sm flex-1" maxLength={5} />
                  <button onClick={async () => {
                    if (!krogerZip || krogerZip.length < 5) return;
                    setSearchingLocations(true);
                    try {
                      const data = await api.krogerSearchLocations(krogerZip);
                      setKrogerLocations(data.locations || []);
                    } catch (err) { console.error(err); }
                    finally { setSearchingLocations(false); }
                  }} disabled={searchingLocations} className="btn-secondary text-sm whitespace-nowrap">
                    {searchingLocations ? '...' : 'Find'}
                  </button>
                </div>
                {krogerLocations.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {krogerLocations.map((loc) => (
                      <button key={loc.locationId} onClick={() => { setKrogerLocationId(loc.locationId); setKrogerLocations([]); }}
                        className={`w-full text-left p-3 rounded-lg text-sm transition-all ${krogerLocationId === loc.locationId ? 'bg-brand-500/10 border border-brand-500' : 'bg-white dark:bg-gray-700 hover:bg-gray-100'}`}>
                        <p className="font-medium">{loc.chain || 'Kroger'} — {loc.name}</p>
                        <p className="text-xs text-gray-500">{loc.address?.line1}, {loc.address?.city}, {loc.address?.state}</p>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 via-white to-emerald-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-1 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-800'}`} />
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            {(() => { const Icon = STEPS[step].icon; return <Icon size={20} className="text-brand-500" />; })()}
          </div>
          <div>
            <h2 className="text-xl font-bold">{STEPS[step].title}</h2>
            <p className="text-sm text-gray-500">{STEPS[step].subtitle}</p>
          </div>
          <span className="ml-auto text-sm text-gray-400 font-medium">{step + 1}/{totalSteps}</span>
        </div>

        {/* Content */}
        <div className="glass-card p-6 mb-6 min-h-[320px]">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={prevStep} className="btn-secondary flex items-center gap-2">
              <ArrowLeft size={18} /> Back
            </button>
          )}
          <div className="flex-1" />
          {step < totalSteps - 1 ? (
            <button onClick={nextStep} className="btn-primary flex items-center gap-2">
              Continue <ArrowRight size={18} />
            </button>
          ) : (
            <button onClick={handleFinish} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Check size={18} /> Finish Setup</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}