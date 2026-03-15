import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings as SettingsIcon, User, Moon, Sun, Save, ShieldAlert, Salad, Gauge, Heart, Globe, ShoppingBag, Leaf, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore, useThemeStore } from '../store/useStore';
import TagInput from '../components/TagInput';

const MACRO_PRESETS = {
  balanced: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 67 },
  high_protein: { calories: 2200, proteinG: 200, carbsG: 165, fatG: 73 },
  keto: { calories: 1800, proteinG: 113, carbsG: 23, fatG: 140 },
  low_carb: { calories: 1800, proteinG: 158, carbsG: 90, fatG: 100 },
};

const RESTRICTIONS = ['Vegan', 'Vegetarian', 'Pescatarian', 'Gluten-Free', 'Dairy-Free', 'Nut-Free', 'Halal', 'Kosher'];
const DIET_PREFS = ['Keto', 'Paleo', 'Mediterranean', 'Whole30', 'Low-Carb', 'Low-Fat', 'DASH', 'Low-Sodium'];
const ALLERGIES = ['Peanuts', 'Tree Nuts', 'Shellfish', 'Fish', 'Eggs', 'Milk', 'Wheat', 'Soy', 'Sesame'];
const CUISINES = ['Italian', 'Mexican', 'Indian', 'Chinese', 'Japanese', 'Thai', 'Korean', 'Mediterranean', 'American', 'French', 'Middle Eastern', 'Ethiopian', 'Caribbean', 'Vietnamese', 'Greek', 'Spanish'];
const STORES = [
  { id: 'amazon_wholefoods', name: 'Amazon / Whole Foods', icon: '🛒' },
  { id: 'kroger', name: 'Kroger', icon: '🏪' },
  { id: 'walmart', name: 'Walmart', icon: '🏬' },
  { id: 'instacart', name: 'Instacart', icon: '🥕' },
  { id: 'target', name: 'Target', icon: '🎯' },
  { id: 'costco', name: 'Costco', icon: '📦' },
  { id: 'safeway', name: 'Safeway', icon: '🛍️' },
  { id: 'trader_joes', name: "Trader Joe's", icon: '🌺' },
  { id: 'heb', name: 'H-E-B', icon: '🔴' },
  { id: 'fred_meyer', name: 'Fred Meyer', icon: '🟡' },
  { id: 'qfc', name: 'QFC', icon: '🟢' },
];

function Section({ icon: Icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <Icon size={18} className="text-brand-500" />
        <span className="font-semibold text-sm flex-1 text-left">{title}</span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TagToggle({ items, selected, onToggle, colorClass = 'tag-active' }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button key={item} onClick={() => onToggle(item)} className={`tag ${selected.includes(item) ? colorClass : 'tag-inactive'}`}>{item}</button>
      ))}
    </div>
  );
}

// Safely ensure a value is an array (handles JSON strings, arrays, nulls)
function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }
  return [];
}

export default function Settings() {
  const { user } = useAuthStore();
  const { dark, toggle } = useThemeStore();
  // Normalized local state (arrays are always arrays, not JSON strings)
  const [profile, setProfile] = useState({ name: '', household_size: 2, budget_preference: 'moderate' });
  const [restrictions, setRestrictions] = useState([]);
  const [diets, setDiets] = useState([]);
  const [allergies, setAllergies] = useState([]);
  const [customDiet, setCustomDiet] = useState('');
  const [disliked, setDisliked] = useState([]);
  const [loved, setLoved] = useState([]);
  const [favCuisines, setFavCuisines] = useState([]);
  const [avoidedCuisines, setAvoidedCuisines] = useState([]);
  const [varietyPref, setVarietyPref] = useState(5);
  const [macros, setMacros] = useState({ calories: 2000, proteinG: 150, carbsG: 200, fatG: 67, macroPreset: 'balanced' });
  const [organicPref, setOrganicPref] = useState('no_preference');
  const [primaryStore, setPrimaryStore] = useState('amazon_wholefoods');
  const [krogerZip, setKrogerZip] = useState('');
  const [krogerLocations, setKrogerLocations] = useState([]);
  const [krogerLocationId, setKrogerLocationId] = useState(null);
  const [searchingLocations, setSearchingLocations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const data = await api.getPreferences();
      setProfile({ name: data.profile?.name || '', household_size: data.profile?.household_size || 2, budget_preference: data.profile?.budget_preference || 'moderate' });
      setRestrictions(ensureArray(data.diets?.restrictions));
      setDiets(ensureArray(data.diets?.diets));
      setAllergies(ensureArray(data.diets?.allergies));
      setCustomDiet(data.diets?.custom_diet || '');
      setDisliked(ensureArray(data.ingredients?.disliked_ingredients));
      setLoved(ensureArray(data.ingredients?.loved_ingredients));
      setFavCuisines(ensureArray(data.cuisines?.favorite_cuisines));
      setAvoidedCuisines(ensureArray(data.cuisines?.avoided_cuisines));
      setVarietyPref(data.cuisines?.variety_preference || 5);
      setMacros({
        calories: data.macros?.calories || 2000,
        proteinG: data.macros?.protein_g || 150,
        carbsG: data.macros?.carbs_g || 200,
        fatG: data.macros?.fat_g || 67,
        macroPreset: data.macros?.macro_preset || 'balanced',
      });
      setOrganicPref(data.store?.organic_preference || 'no_preference');
      setPrimaryStore(data.store?.primary_store || 'amazon_wholefoods');
      // Load Kroger location
      try {
        const kStatus = await api.getKrogerStatus();
        setKrogerLocationId(kStatus.locationId);
      } catch {}
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const saveSection = async (section, apiCall) => {
    setSavingSection(section);
    try { await apiCall(); }
    catch (err) { console.error(err); }
    finally { setTimeout(() => setSavingSection(null), 1000); }
  };

  const toggleInArray = (arr, item) => arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="section-title flex items-center gap-2"><SettingsIcon className="text-brand-500" size={28} /> Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Edit any preference — changes save instantly</p>
      </div>

      {/* Account */}
      <Section icon={User} title="Account & Profile" defaultOpen={true}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-500">Email</label>
            <p className="text-sm">{user?.email}</p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-500">Name</label>
            <input type="text" value={profile.name} onChange={(e) => setProfile({...profile, name: e.target.value})} className="input-field text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-500">Household Size</label>
            <div className="flex gap-2">
              {[1,2,3,4,5,6].map(n => (
                <button key={n} onClick={() => setProfile({...profile, household_size: n})}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${profile.household_size === n ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}>{n}</button>
              ))}
            </div>
          </div>
          <button onClick={() => saveSection('profile', () => api.updateProfile({ name: profile.name, householdSize: profile.household_size, budgetPreference: profile.budget_preference }))} className="btn-primary text-sm flex items-center gap-2">
            {savingSection === 'profile' ? <Check size={14} /> : <Save size={14} />} {savingSection === 'profile' ? 'Saved!' : 'Save Profile'}
          </button>
        </div>
      </Section>

      {/* Dietary Restrictions */}
      <Section icon={ShieldAlert} title="Dietary Restrictions (Strict)">
        <p className="text-xs text-red-500 mb-2">These are enforced strictly — no meals will violate these</p>
        <TagToggle items={RESTRICTIONS} selected={restrictions}
          onToggle={(r) => setRestrictions(toggleInArray(restrictions, r))}
          colorClass="tag-danger" />
        <button onClick={() => saveSection('restrictions', () => api.updateDiets({ diets, allergies, restrictions, customDiet }))} className="btn-primary text-sm flex items-center gap-2 mt-2">
          {savingSection === 'restrictions' ? <Check size={14} /> : <Save size={14} />} {savingSection === 'restrictions' ? 'Saved!' : 'Save Restrictions'}
        </button>
      </Section>

      {/* Diet Preferences */}
      <Section icon={Salad} title="Diet Preferences & Allergies">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-gray-500">Diet Styles (preferred)</label>
          <TagToggle items={DIET_PREFS} selected={diets}
            onToggle={(d) => setDiets(toggleInArray(diets, d))} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 text-gray-500">Allergies</label>
          <TagToggle items={ALLERGIES} selected={allergies}
            onToggle={(a) => setAllergies(toggleInArray(allergies, a))} colorClass="tag-danger" />
        </div>
        <button onClick={() => saveSection('diets', () => api.updateDiets({ diets, allergies, restrictions, customDiet }))} className="btn-primary text-sm flex items-center gap-2">
          {savingSection === 'diets' ? <Check size={14} /> : <Save size={14} />} {savingSection === 'diets' ? 'Saved!' : 'Save Diet Prefs'}
        </button>
      </Section>

      {/* Macros */}
      <Section icon={Gauge} title="Macro Targets">
        <p className="text-xs text-gray-500 mb-3">Set your daily nutrition targets. Your meal plan will be optimized to match these goals.</p>
        <div>
          <label className="block text-xs font-medium mb-1.5 text-gray-500">Quick Presets</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(MACRO_PRESETS).map(([key, vals]) => (
              <button key={key} onClick={() => setMacros({ ...vals, macroPreset: key })}
                className={`py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${macros.macroPreset === key ? 'bg-brand-500 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                {key.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        {[
          { k: 'calories', l: 'Daily Calories', u: 'kcal', max: 4000, color: 'text-orange-500' },
          { k: 'proteinG', l: 'Protein', u: 'g', max: 300, color: 'text-blue-500' },
          { k: 'carbsG', l: 'Carbs', u: 'g', max: 400, color: 'text-green-500' },
          { k: 'fatG', l: 'Fat', u: 'g', max: 200, color: 'text-yellow-500' },
        ].map(({ k, l, u, max, color }) => (
          <div key={k}>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">{l}</span>
              <span className={`${color} font-semibold`}>{macros[k]} {u}</span>
            </div>
            <input type="range" min={0} max={max} value={macros[k]}
              onChange={(e) => setMacros({ ...macros, [k]: parseInt(e.target.value), macroPreset: 'custom' })}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-brand-500" />
          </div>
        ))}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mt-2">
          <p className="text-xs text-gray-500 mb-1">Daily Summary</p>
          <div className="flex justify-between text-sm">
            <span className="text-orange-500 font-semibold">{macros.calories} kcal</span>
            <span className="text-blue-500 font-semibold">{macros.proteinG}g P</span>
            <span className="text-green-500 font-semibold">{macros.carbsG}g C</span>
            <span className="text-yellow-500 font-semibold">{macros.fatG}g F</span>
          </div>
        </div>
        <button onClick={() => saveSection('macros', () => api.updateMacros(macros))} className="btn-primary text-sm flex items-center gap-2">
          {savingSection === 'macros' ? <Check size={14} /> : <Save size={14} />} {savingSection === 'macros' ? 'Saved! Regenerate your meal plan to apply.' : 'Save Macro Targets'}
        </button>
      </Section>

      {/* Ingredients */}
      <Section icon={Heart} title="Ingredient Likes & Dislikes">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-gray-500">❌ Disliked Ingredients</label>
          <TagInput selected={disliked} onChange={setDisliked} placeholder="Type to search..." colorClass="tag-danger" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 text-gray-500">❤️ Loved Ingredients</label>
          <TagInput selected={loved} onChange={setLoved} placeholder="Type to search..." colorClass="tag-active" />
        </div>
        <button onClick={() => saveSection('ingredients', () => api.updateIngredients({ dislikedIngredients: disliked, lovedIngredients: loved }))} className="btn-primary text-sm flex items-center gap-2">
          {savingSection === 'ingredients' ? <Check size={14} /> : <Save size={14} />} {savingSection === 'ingredients' ? 'Saved!' : 'Save Ingredients'}
        </button>
      </Section>

      {/* Cuisines */}
      <Section icon={Globe} title="Cuisine Preferences">
        <TagToggle items={CUISINES} selected={favCuisines}
          onToggle={(c) => setFavCuisines(toggleInArray(favCuisines, c))} />
        <button onClick={() => saveSection('cuisines', () => api.updateCuisines({ favoriteCuisines: favCuisines, avoidedCuisines, varietyPreference: varietyPref }))} className="btn-primary text-sm flex items-center gap-2">
          {savingSection === 'cuisines' ? <Check size={14} /> : <Save size={14} />} {savingSection === 'cuisines' ? 'Saved!' : 'Save Cuisines'}
        </button>
      </Section>

      {/* Recipe Sources */}
      <Section icon={Globe} title="Recipe Sources">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div><p className="text-sm font-medium">📚 Built-in Recipes</p><p className="text-xs text-gray-500">47 curated recipes</p></div>
            <span className="text-brand-500 text-xs font-semibold">Always On</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div><p className="text-sm font-medium">🥄 Spoonacular API</p><p className="text-xs text-gray-500">Thousands of recipes (needs API key)</p></div>
            <span className="text-xs text-gray-400">Configure in onboarding</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div><p className="text-sm font-medium">🍲 TheMealDB</p><p className="text-xs text-gray-500">Free, no API key needed</p></div>
            <span className="text-xs text-gray-400">Available</span>
          </div>
          <p className="text-xs text-gray-400">External recipe sources can be searched via the API. More adapters coming soon.</p>
        </div>
      </Section>

      {/* Organic & Quality */}
      <Section icon={Leaf} title="Organic & Quality Preference">
        <div className="space-y-2">
          {[
            { v: 'always_organic', l: '🌱 Always Organic' },
            { v: 'prefer_organic', l: '🌿 Prefer Organic' },
            { v: 'no_preference', l: '⚖️ No Preference' },
            { v: 'conventional', l: '💰 Conventional / Budget' },
          ].map(({ v, l }) => (
            <button key={v} onClick={() => setOrganicPref(v)}
              className={`w-full text-left p-3 rounded-xl text-sm font-medium transition-all flex items-center justify-between ${organicPref === v ? 'bg-brand-500/10 border border-brand-500 text-brand-600' : 'bg-gray-50 dark:bg-gray-800'}`}>
              {l} {organicPref === v && <Check size={16} className="text-brand-500" />}
            </button>
          ))}
        </div>
        <button onClick={() => saveSection('organic', () => api.updateStore({ primaryStore, organicPreference: organicPref }))} className="btn-primary text-sm flex items-center gap-2">
          {savingSection === 'organic' ? <Check size={14} /> : <Save size={14} />} {savingSection === 'organic' ? 'Saved!' : 'Save'}
        </button>
      </Section>

      {/* Store Selection */}
      <Section icon={ShoppingBag} title="Grocery Store">
        <div className="space-y-2">
          {STORES.map((store) => (
            <button key={store.id} onClick={() => setPrimaryStore(store.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm transition-all ${primaryStore === store.id ? 'bg-brand-500/10 border border-brand-500' : 'bg-gray-50 dark:bg-gray-800'}`}>
              <span className="text-lg">{store.icon}</span>
              <span className="font-medium flex-1 text-left">{store.name}</span>
              {primaryStore === store.id && <Check size={16} className="text-brand-500" />}
            </button>
          ))}
        </div>

        {/* Kroger Location Picker */}
        {primaryStore === 'kroger' && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-3">
            <p className="text-sm font-medium">📍 Your Kroger Store Location</p>
            {krogerLocationId && <p className="text-xs text-brand-500">Current: Store #{krogerLocationId}</p>}
            <div className="flex gap-2">
              <input type="text" placeholder="Enter your zip code" value={krogerZip} onChange={(e) => setKrogerZip(e.target.value)}
                className="input-field text-sm flex-1" maxLength={5} />
              <button onClick={async () => {
                if (!krogerZip || krogerZip.length < 5) return;
                setSearchingLocations(true);
                try {
                  const data = await api.krogerSearchLocations(krogerZip);
                  setKrogerLocations(data.locations || []);
                } catch (err) { alert(err.message); }
                finally { setSearchingLocations(false); }
              }} disabled={searchingLocations} className="btn-secondary text-sm whitespace-nowrap">
                {searchingLocations ? 'Searching...' : 'Find Stores'}
              </button>
            </div>
            {krogerLocations.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {krogerLocations.map((loc) => (
                  <button key={loc.locationId} onClick={async () => {
                    try {
                      await api.krogerSetLocation(loc.locationId);
                      setKrogerLocationId(loc.locationId);
                      setKrogerLocations([]);
                      setKrogerZip('');
                    } catch (err) { alert(err.message); }
                  }} className={`w-full text-left p-3 rounded-lg text-sm transition-all ${krogerLocationId === loc.locationId ? 'bg-brand-500/10 border border-brand-500' : 'bg-white dark:bg-gray-700 hover:bg-gray-100'}`}>
                    <p className="font-medium">{loc.chain || 'Kroger'} — {loc.name}</p>
                    <p className="text-xs text-gray-500">{loc.address?.line1}, {loc.address?.city}, {loc.address?.state} {loc.address?.zipCode}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={() => saveSection('store', () => api.updateStore({ primaryStore, organicPreference: organicPref }))} className="btn-primary text-sm flex items-center gap-2">
          {savingSection === 'store' ? <Check size={14} /> : <Save size={14} />} {savingSection === 'store' ? 'Saved!' : 'Save Store'}
        </button>
      </Section>

      {/* Appearance */}
      <Section icon={dark ? Moon : Sun} title="Appearance">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Dark Mode</p>
            <p className="text-xs text-gray-500">{dark ? 'Currently dark' : 'Currently light'}</p>
          </div>
          <button onClick={toggle} className={`w-12 h-6 rounded-full transition-all ${dark ? 'bg-brand-500' : 'bg-gray-300'}`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${dark ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </Section>

      <div className="text-center py-4">
        <p className="text-xs text-gray-400">MealPlan Pro v1.1.1</p>
      </div>
    </div>
  );
}