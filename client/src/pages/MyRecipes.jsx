import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Mic, MicOff, Trash2, Edit3, Save, X, ChefHat,
  Clock, Users, AlertCircle, BookOpen, Square, CheckSquare,
} from 'lucide-react';
import { useUserRecipesStore } from '../store/useStore';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const DICTATION_FIELDS = [
  { key: 'name', label: 'Recipe Name', placeholder: 'Say the recipe name...' },
  { key: 'description', label: 'Description', placeholder: 'Briefly describe this dish...' },
  { key: 'ingredients', label: 'Ingredients', placeholder: 'List ingredients one by one...' },
  { key: 'instructions', label: 'Instructions', placeholder: 'Describe the cooking steps...' },
];

function RecipeForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    cuisine: '',
    mealType: 'dinner',
    ingredientsText: '',
    instructionsText: '',
    prepTimeMinutes: '',
    cookTimeMinutes: '',
    servings: 4,
    ...initial,
  });
  const [activeField, setActiveField] = useState(null);
  const speech = useSpeechRecognition();

  const handleDictate = (fieldKey) => {
    if (speech.isListening) {
      speech.stopListening();
      // Append transcript to the field
      const text = speech.fullTranscript.trim();
      if (text) {
        const key = fieldKey === 'ingredients' ? 'ingredientsText'
          : fieldKey === 'instructions' ? 'instructionsText'
          : fieldKey;
        setForm((prev) => ({
          ...prev,
          [key]: prev[key] ? prev[key] + ' ' + text : text,
        }));
      }
      speech.resetTranscript();
      setActiveField(null);
    } else {
      speech.resetTranscript();
      setActiveField(fieldKey);
      speech.startListening();
    }
  };

  // When listening stops externally, append any remaining text
  useEffect(() => {
    if (!speech.isListening && activeField && speech.fullTranscript.trim()) {
      const text = speech.fullTranscript.trim();
      const key = activeField === 'ingredients' ? 'ingredientsText'
        : activeField === 'instructions' ? 'instructionsText'
        : activeField;
      setForm((prev) => ({
        ...prev,
        [key]: prev[key] ? prev[key] + ' ' + text : text,
      }));
      speech.resetTranscript();
      setActiveField(null);
    }
  }, [speech.isListening]);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Parse ingredients and instructions from text
    const ingredients = form.ingredientsText
      .split(/\n|,|;/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ name, quantity: '', unit: '' }));
    const instructions = form.instructionsText
      .split(/\n|\.(?=\s)/)
      .map((s) => s.trim())
      .filter(Boolean);

    onSave({
      name: form.name,
      description: form.description,
      cuisine: form.cuisine,
      mealType: form.mealType,
      ingredients,
      instructions,
      prepTimeMinutes: form.prepTimeMinutes ? parseInt(form.prepTimeMinutes) : null,
      cookTimeMinutes: form.cookTimeMinutes ? parseInt(form.cookTimeMinutes) : null,
      servings: parseInt(form.servings) || 4,
      sourceText: form.ingredientsText + '\n---\n' + form.instructionsText,
    });
  };

  const getFieldKey = (f) => f === 'ingredients' ? 'ingredientsText'
    : f === 'instructions' ? 'instructionsText' : f;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!speech.isSupported && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-700 dark:text-amber-400 text-sm">
          <AlertCircle size={16} />
          <span>Voice dictation is not supported in this browser. Use Chrome, Edge, or Safari for voice input.</span>
        </div>
      )}

      {speech.error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={16} />
          <span>{speech.error}</span>
        </div>
      )}

      {DICTATION_FIELDS.map(({ key, label, placeholder }) => {
        const fieldKey = getFieldKey(key);
        const isTextArea = key === 'ingredients' || key === 'instructions';
        const isActive = activeField === key && speech.isListening;

        return (
          <div key={key}>
            <label className="block text-sm font-medium mb-1.5">{label}</label>
            <div className={`relative rounded-xl border-2 transition-all ${
              isActive
                ? 'border-red-400 bg-red-50/50 dark:bg-red-900/10'
                : 'border-transparent'
            }`}>
              {isTextArea ? (
                <textarea
                  value={
                    isActive
                      ? form[fieldKey] + (form[fieldKey] ? ' ' : '') + speech.fullTranscript
                      : form[fieldKey]
                  }
                  onChange={(e) => setForm({ ...form, [fieldKey]: e.target.value })}
                  placeholder={placeholder}
                  rows={4}
                  className="input-field pr-12 resize-none"
                  required={key === 'ingredients'}
                />
              ) : (
                <input
                  type="text"
                  value={
                    isActive
                      ? form[fieldKey] + (form[fieldKey] ? ' ' : '') + speech.fullTranscript
                      : form[fieldKey]
                  }
                  onChange={(e) => setForm({ ...form, [fieldKey]: e.target.value })}
                  placeholder={placeholder}
                  className="input-field pr-12"
                  required={key === 'name'}
                />
              )}
              {speech.isSupported && (
                <button
                  type="button"
                  onClick={() => handleDictate(key)}
                  className={`absolute right-2 top-2 p-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                  }`}
                  title={isActive ? 'Stop recording' : `Dictate ${label.toLowerCase()}`}
                >
                  {isActive ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
            </div>
            {key === 'ingredients' && (
              <p className="text-xs text-gray-400 mt-1">Separate with commas, semicolons, or new lines</p>
            )}
            {key === 'instructions' && (
              <p className="text-xs text-gray-400 mt-1">Separate steps with periods or new lines</p>
            )}
          </div>
        );
      })}

      {/* Meta fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Cuisine</label>
          <input
            type="text"
            value={form.cuisine}
            onChange={(e) => setForm({ ...form, cuisine: e.target.value })}
            placeholder="Italian, Mexican..."
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Meal Type</label>
          <select
            value={form.mealType}
            onChange={(e) => setForm({ ...form, mealType: e.target.value })}
            className="input-field"
          >
            {MEAL_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Prep (min)</label>
          <input
            type="number"
            value={form.prepTimeMinutes}
            onChange={(e) => setForm({ ...form, prepTimeMinutes: e.target.value })}
            placeholder="15"
            className="input-field"
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Cook (min)</label>
          <input
            type="number"
            value={form.cookTimeMinutes}
            onChange={(e) => setForm({ ...form, cookTimeMinutes: e.target.value })}
            placeholder="30"
            className="input-field"
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Servings</label>
          <input
            type="number"
            value={form.servings}
            onChange={(e) => setForm({ ...form, servings: e.target.value })}
            className="input-field"
            min="1"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 flex-1">
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {saving ? 'Saving...' : 'Save Recipe'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost px-6">
          Cancel
        </button>
      </div>
    </form>
  );
}

function RecipeCard({ recipe, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="glass-card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate">{recipe.name}</h3>
          {recipe.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{recipe.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
            {recipe.meal_type && (
              <span className="px-2 py-0.5 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-full font-medium">
                {recipe.meal_type}
              </span>
            )}
            {recipe.cuisine && (
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full">{recipe.cuisine}</span>
            )}
            {(recipe.prep_time_minutes || recipe.cook_time_minutes) && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {(recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0)} min
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Users size={12} />
                {recipe.servings}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)} className="btn-ghost p-2 rounded-lg" title="View details">
            <BookOpen size={16} />
          </button>
          <button onClick={() => onEdit(recipe)} className="btn-ghost p-2 rounded-lg" title="Edit">
            <Edit3 size={16} />
          </button>
          <button onClick={() => onDelete(recipe.id)} className="btn-ghost p-2 rounded-lg text-red-500 hover:text-red-600" title="Delete">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
              {recipe.ingredients?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-1.5">Ingredients</h4>
                  <ul className="space-y-1">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
                        {typeof ing === 'string' ? ing : `${ing.quantity || ''} ${ing.unit || ''} ${ing.name}`.trim()}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recipe.instructions?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-1.5">Instructions</h4>
                  <ol className="space-y-2">
                    {recipe.instructions.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{typeof step === 'string' ? step : step.text || step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function MyRecipes() {
  const { recipes, loading, error, fetchRecipes, createRecipe, updateRecipe, deleteRecipe } = useUserRecipesStore();
  const [showForm, setShowForm] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleSave = async (data) => {
    setSaving(true);
    try {
      if (editingRecipe) {
        await updateRecipe(editingRecipe.id, data);
      } else {
        await createRecipe(data);
      }
      setShowForm(false);
      setEditingRecipe(null);
    } catch {
      // error in store
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (recipe) => {
    setEditingRecipe(recipe);
    setShowForm(true);
    // Prepare form initial data
  };

  const handleDelete = async (id) => {
    if (deleteConfirm === id) {
      await deleteRecipe(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const getInitialFormData = () => {
    if (!editingRecipe) return {};
    return {
      name: editingRecipe.name || '',
      description: editingRecipe.description || '',
      cuisine: editingRecipe.cuisine || '',
      mealType: editingRecipe.meal_type || 'dinner',
      ingredientsText: (editingRecipe.ingredients || [])
        .map((i) => (typeof i === 'string' ? i : `${i.quantity || ''} ${i.unit || ''} ${i.name}`.trim()))
        .join('\n'),
      instructionsText: (editingRecipe.instructions || [])
        .map((s) => (typeof s === 'string' ? s : s.text || s))
        .join('\n'),
      prepTimeMinutes: editingRecipe.prep_time_minutes || '',
      cookTimeMinutes: editingRecipe.cook_time_minutes || '',
      servings: editingRecipe.servings || 4,
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="text-brand-500" size={28} />
            My Recipes
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Your personal recipe collection — type or speak your recipes
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingRecipe(null); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Add Recipe</span>
          </button>
        )}
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                  <Mic className="text-brand-500" size={20} />
                </div>
                <div>
                  <h3 className="font-semibold">{editingRecipe ? 'Edit Recipe' : 'New Recipe'}</h3>
                  <p className="text-xs text-gray-400">
                    Type or tap the <Mic size={10} className="inline" /> mic icon to dictate each field
                  </p>
                </div>
              </div>
              <RecipeForm
                initial={getInitialFormData()}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditingRecipe(null); }}
                saving={saving}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Recipe List */}
      {!loading && recipes.length === 0 && !showForm && (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
            <ChefHat size={40} className="text-gray-300 dark:text-gray-600" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No recipes yet</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
            Start building your personal recipe collection. You can type recipes or dictate them using your voice!
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Mic size={18} />
            Add Your First Recipe
          </button>
        </div>
      )}

      {!loading && recipes.length > 0 && (
        <div className="space-y-3">
          <AnimatePresence>
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
