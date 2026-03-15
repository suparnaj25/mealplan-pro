import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Plus, Trash2, Edit3, X, AlertTriangle, ChefHat, Loader2 } from 'lucide-react';
import { api } from '../services/api';

const CATEGORIES = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery & Bread', 'Grains & Pasta', 'Canned & Jarred', 'Frozen', 'Oils & Condiments', 'Spices & Seasonings', 'Nuts & Seeds', 'Snacks', 'Beverages', 'Other'];
const UNITS = ['whole', 'lb', 'oz', 'cup', 'tbsp', 'tsp', 'can', 'bag', 'bottle', 'bunch', 'cloves', 'slices'];

export default function Pantry() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', quantity: '', unit: 'whole', category: 'Other', expiryDate: '', notes: '' });

  useEffect(() => { loadPantry(); }, []);

  const loadPantry = async () => {
    try {
      const data = await api.getPantry();
      setItems(data.items || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editItem) {
        const data = await api.updatePantryItem(editItem.id, form);
        setItems((prev) => prev.map((i) => (i.id === editItem.id ? data.item : i)));
      } else {
        const data = await api.addPantryItem(form);
        setItems((prev) => [...prev, data.item]);
      }
      resetForm();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deletePantryItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) { console.error(err); }
  };

  const startEdit = (item) => {
    setEditItem(item);
    setForm({
      name: item.name, quantity: item.quantity || '', unit: item.unit || 'whole',
      category: item.category || 'Other', expiryDate: item.expiry_date ? item.expiry_date.split('T')[0] : '', notes: item.notes || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ name: '', quantity: '', unit: 'whole', category: 'Other', expiryDate: '', notes: '' });
    setEditItem(null);
    setShowForm(false);
  };

  const isExpiringSoon = (date) => {
    if (!date) return false;
    // Parse at noon to avoid timezone off-by-one issues
    const d = new Date(date + 'T23:59:59');
    const now = new Date();
    const diff = (d - now) / (1000 * 60 * 60 * 24);
    return diff <= 3 && diff >= 0;
  };

  const isExpired = (date) => {
    if (!date) return false;
    // Compare end of expiry day (23:59:59 local) with now
    const d = new Date(date + 'T23:59:59');
    return d < new Date();
  };

  const [whatCanIMake, setWhatCanIMake] = useState(null);
  const [whatCanIMakeLoading, setWhatCanIMakeLoading] = useState(false);

  const handleWhatCanIMake = async () => {
    setWhatCanIMakeLoading(true);
    try {
      const data = await api.aiWhatCanIMake();
      setWhatCanIMake(data);
    } catch (err) { console.error(err); }
    finally { setWhatCanIMakeLoading(false); }
  };

  const categories = [...new Set(items.map((i) => i.category || 'Other'))].sort();

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Package className="text-brand-500" size={28} />
            Pantry
          </h1>
          <p className="text-sm text-gray-500 mt-1">{items.length} items in your pantry</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleWhatCanIMake} disabled={whatCanIMakeLoading || items.length === 0} className="btn-secondary flex items-center gap-2 text-sm">
            {whatCanIMakeLoading ? <Loader2 size={16} className="animate-spin" /> : <ChefHat size={16} />}
            What can I make?
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* What Can I Make Results */}
      {whatCanIMake && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">🍳 Recipes you can make now</h3>
            <button onClick={() => setWhatCanIMake(null)} className="btn-ghost p-1 text-gray-400"><X size={16} /></button>
          </div>
          {whatCanIMake.quickMealIdea && (
            <div className="glass-card p-4 bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs font-semibold text-emerald-600 mb-1">💡 Quick idea</p>
              <p className="text-sm">{whatCanIMake.quickMealIdea}</p>
            </div>
          )}
          {whatCanIMake.suggestions?.map((s, i) => (
            <div key={i} className="glass-card p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{s.recipeName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.canMakeNow ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' : 'bg-amber-100 text-amber-700'}`}>
                  {s.canMakeNow ? '✅ Ready' : `Missing ${s.missingItems?.length}`}
                </span>
              </div>
              <p className="text-xs text-gray-500">{s.matchPercentage}% match · {s.difficulty}</p>
              {s.tip && <p className="text-xs text-gray-400 mt-1 italic">💡 {s.tip}</p>}
            </div>
          ))}
        </motion.div>
      )}

      {/* Add/Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <form onSubmit={handleSubmit} className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{editItem ? 'Edit Item' : 'Add to Pantry'}</h3>
                <button type="button" onClick={resetForm} className="btn-ghost p-1"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
                <div className="flex gap-2">
                  <input type="number" placeholder="Qty" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="input-field w-24" step="0.01" />
                  <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="input-field flex-1">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="input-field" />
              </div>
              <button type="submit" className="btn-primary w-full text-sm">
                {editItem ? 'Update Item' : 'Add Item'}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {items.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <div className="text-6xl mb-4">🏪</div>
          <h3 className="text-xl font-bold mb-2">Pantry is empty</h3>
          <p className="text-gray-500">Add items to track what you have on hand</p>
        </motion.div>
      )}

      {/* Items by category */}
      {categories.map((category) => {
        const catItems = items.filter((i) => (i.category || 'Other') === category);
        return (
          <motion.div key={category} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-sm">{category}</h3>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {catItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{item.name}</p>
                      {isExpired(item.expiry_date) && (
                        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <AlertTriangle size={10} /> Expired
                        </span>
                      )}
                      {isExpiringSoon(item.expiry_date) && !isExpired(item.expiry_date) && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                          Expiring soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {item.quantity && `${item.quantity} ${item.unit || ''}`}
                      {item.expiry_date && ` · Exp: ${new Date(item.expiry_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button onClick={() => startEdit(item)} className="btn-ghost p-1.5"><Edit3 size={14} /></button>
                  <button onClick={() => handleDelete(item.id)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}