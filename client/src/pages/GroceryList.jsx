import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Check, ExternalLink, Copy, CheckCheck, Zap, X, ArrowRight, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

const STORES = [
  { id: 'amazon_wholefoods', name: 'Amazon / Whole Foods', icon: '🛒', url: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=wholefoods` },
  { id: 'kroger', name: 'Kroger', icon: '🏪', url: (q) => `https://www.kroger.com/search?query=${encodeURIComponent(q)}&searchType=default_search` },
  { id: 'walmart', name: 'Walmart', icon: '🏬', url: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
  { id: 'instacart', name: 'Instacart', icon: '🥕', url: (q) => `https://www.instacart.com/store/search/${encodeURIComponent(q)}` },
  { id: 'target', name: 'Target', icon: '🎯', url: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}&category=5xt1a` },
  { id: 'costco', name: 'Costco', icon: '📦', url: (q) => `https://www.costco.com/CatalogSearch?dept=All&keyword=${encodeURIComponent(q)}` },
  { id: 'safeway', name: 'Safeway', icon: '🛍️', url: (q) => `https://www.safeway.com/shop/search-results.html?q=${encodeURIComponent(q)}` },
  { id: 'trader_joes', name: "Trader Joe's", icon: '🌺', url: (q) => `https://www.traderjoes.com/home/search?q=${encodeURIComponent(q)}&section=products` },
];

function getStoreLink(storeId, itemName, organicPref) {
  const store = STORES.find(s => s.id === storeId) || STORES[0];
  const query = (organicPref === 'always_organic' || organicPref === 'prefer_organic') ? `organic ${itemName}` : itemName;
  return store.url(query);
}

const CATEGORY_ICONS = {
  'Produce': '🥬', 'Meat & Seafood': '🥩', 'Dairy & Eggs': '🥛', 'Bakery & Bread': '🍞',
  'Grains & Pasta': '🌾', 'Canned & Jarred': '🥫', 'Frozen': '🧊', 'Oils & Condiments': '🫒',
  'Spices & Seasonings': '🧂', 'Nuts & Seeds': '🥜', 'Snacks': '🍿', 'Beverages': '🥤', 'Other': '📦',
};

export default function GroceryList() {
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [pantryToast, setPantryToast] = useState(null);
  const [currentStore, setCurrentStore] = useState(null);
  const [organicPref, setOrganicPref] = useState('no_preference');
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [krogerStatus, setKrogerStatus] = useState(null);
  const [autoFillResults, setAutoFillResults] = useState(null);
  const [autoFilling, setAutoFilling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cartSuccess, setCartSuccess] = useState(null);
  const storeDropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(e.target)) {
        setShowStoreDropdown(false);
      }
    }
    if (showStoreDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showStoreDropdown]);

  useEffect(() => { loadList(); loadStore(); loadKrogerStatus(); }, []);

  const loadKrogerStatus = async () => {
    try { const data = await api.getKrogerStatus(); setKrogerStatus(data); }
    catch { setKrogerStatus({ connected: false, configured: false }); }
  };

  const handleAutoFill = async () => {
    if (!list) return;
    setAutoFilling(true);
    try {
      const data = await api.krogerAutoFill(list.id);
      setAutoFillResults(data.results);
    } catch (err) {
      alert(err.message);
    } finally { setAutoFilling(false); }
  };

  const handleConfirmCart = async () => {
    if (!autoFillResults) return;
    setConfirming(true);
    try {
      const selections = autoFillResults
        .filter(r => r.selectedProduct?.upc)
        .map(r => ({ upc: r.selectedProduct.upc, quantity: Math.max(1, Math.ceil(r.quantity || 1)) }));
      const data = await api.krogerConfirmCart(selections);
      setAutoFillResults(null);
      setCartSuccess({ count: data.successCount, total: data.totalCount });
    } catch (err) { alert(err.message); }
    finally { setConfirming(false); }
  };

  const handleConnectKroger = async () => {
    try {
      const data = await api.getKrogerAuthUrl();
      window.open(data.url, '_blank');
    } catch (err) { alert(err.message); }
  };

  const loadStore = async () => {
    try {
      const data = await api.getPreferences();
      setCurrentStore(data.store?.primary_store || 'amazon_wholefoods');
      setOrganicPref(data.store?.organic_preference || 'no_preference');
    } catch (err) { console.error(err); }
  };

  const handleStoreChange = async (storeId) => {
    setCurrentStore(storeId);
    setShowStoreDropdown(false);
    try {
      await api.updateStore({ primaryStore: storeId });
    } catch (err) { console.error(err); }
  };

  const loadList = async () => {
    try {
      const data = await api.getLatestGroceryList();
      setList(data.list);
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (itemId, currentChecked) => {
    if (!list) return;
    try {
      const data = await api.toggleGroceryItem(list.id, itemId, !currentChecked);
      setItems((prev) => prev.map((i) => (i.id === itemId ? data.item : i)));
      if (!currentChecked && data.addedToPantry) {
        const item = items.find(i => i.id === itemId);
        setPantryToast(`✅ ${item?.name || 'Item'} added to pantry`);
        setTimeout(() => setPantryToast(null), 2500);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyList = () => {
    const text = groupedItems.map(([cat, catItems]) =>
      `${cat}\n${catItems.map(i => `  ${i.checked ? '✓' : '○'} ${i.name}${i.quantity ? ` (${i.quantity} ${i.unit || ''})` : ''}`).join('\n')}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const categories = [...new Set(items.map((i) => i.category || 'Other'))].sort();
  const groupedItems = categories.map((cat) => [cat, items.filter((i) => (i.category || 'Other') === cat)]);
  const checkedCount = items.filter((i) => i.checked).length;
  const totalCount = items.length;
  const needToBuy = items.filter((i) => !i.in_pantry && !i.checked);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!list) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
        <div className="text-6xl mb-4">🛒</div>
        <h3 className="text-xl font-bold mb-2">No grocery list yet</h3>
        <p className="text-gray-500">Generate a meal plan first, then create your grocery list</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <ShoppingCart className="text-brand-500" size={28} />
            Grocery List
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {checkedCount}/{totalCount} items checked · {needToBuy.length} to buy
          </p>
        </div>
        <div className="flex gap-2">
          {/* Store selector */}
          <div className="relative" ref={storeDropdownRef}>
            <button onClick={() => setShowStoreDropdown(!showStoreDropdown)} className="btn-secondary flex items-center gap-2 text-sm">
              <span>{STORES.find(s => s.id === currentStore)?.icon || '🛒'}</span>
              <span className="hidden sm:inline">{STORES.find(s => s.id === currentStore)?.name || 'Store'}</span>
            </button>
            {showStoreDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 w-56 overflow-hidden">
                {STORES.map(store => (
                  <button key={store.id} onClick={() => handleStoreChange(store.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${currentStore === store.id ? 'bg-brand-500/10 text-brand-600' : ''}`}>
                    <span>{store.icon}</span> {store.name}
                    {currentStore === store.id && <Check size={14} className="ml-auto text-brand-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleCopyList} className="btn-secondary flex items-center gap-2 text-sm">
            {copied ? <CheckCheck size={16} className="text-brand-500" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy List'}
          </button>
        </div>
      </div>

      {/* Kroger Cart Success — Go to Kroger */}
      {cartSuccess && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 text-center space-y-4">
          <div className="text-4xl">🎉</div>
          <h3 className="text-lg font-bold">
            {cartSuccess.count} of {cartSuccess.total} items added to your Kroger cart!
          </h3>
          <p className="text-sm text-gray-500">Your cart is ready. Go to Kroger to review and checkout.</p>
          <div className="flex justify-center gap-3">
            <a href="https://www.kroger.com/cart" target="_blank" rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2">
              <ShoppingCart size={18} /> Go to Kroger Cart →
            </a>
            <button onClick={() => setCartSuccess(null)} className="btn-secondary text-sm">Dismiss</button>
          </div>
          <p className="text-xs text-gray-400">
            Or open the <a href="https://www.kroger.com" target="_blank" rel="noopener noreferrer" className="text-brand-500 underline">Kroger website</a> or Kroger app on your phone
          </p>
        </motion.div>
      )}

      {/* Kroger Auto-Fill Button (only when Kroger is selected) */}
      {currentStore === 'kroger' && (
        <div className="glass-card p-4">
          {krogerStatus?.connected ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">🏪 Kroger Connected</p>
                <p className="text-xs text-gray-500">Auto-select best products and add to your Kroger cart</p>
              </div>
              <button onClick={handleAutoFill} disabled={autoFilling} className="btn-primary flex items-center gap-2 text-sm">
                {autoFilling ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap size={16} />}
                {autoFilling ? 'Finding products...' : 'Auto-fill Kroger Cart'}
              </button>
            </div>
          ) : krogerStatus?.configured ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">🔗 Connect Your Kroger Account</p>
                <p className="text-xs text-gray-500">One-time login to enable auto-cart</p>
              </div>
              <button onClick={handleConnectKroger} className="btn-primary flex items-center gap-2 text-sm">
                Connect Kroger <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-gray-500">Kroger API not configured. Add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET to enable auto-cart.</p>
            </div>
          )}
        </div>
      )}

      {/* Kroger Auto-Fill Results Review */}
      <AnimatePresence>
        {autoFillResults && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-card overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm">🛒 Review Kroger Selections</h3>
                <p className="text-xs text-gray-500">{autoFillResults.filter(r => r.selectedProduct).length} of {autoFillResults.length} items matched</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAutoFillResults(null)} className="btn-ghost p-1"><X size={18} /></button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/50">
              {autoFillResults.map((result, idx) => (
                <div key={idx} className="px-4 py-3 flex items-center gap-3">
                  {result.selectedProduct?.image && (
                    <img src={result.selectedProduct.image} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">{result.groceryItemName} ({result.quantity} {result.unit})</p>
                    {result.selectedProduct ? (
                      <>
                        <p className="text-sm font-medium truncate">{result.selectedProduct.name}</p>
                        <p className="text-xs text-gray-500">{result.selectedProduct.brand} · {result.selectedProduct.size} · ${result.selectedProduct.price}</p>
                      </>
                    ) : (
                      <p className="text-sm text-red-500 italic">No match found</p>
                    )}
                  </div>
                  {result.alternatives?.length > 0 && (
                    <span className="text-xs text-gray-400">{result.alternatives.length} alt</span>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
              <button onClick={() => setAutoFillResults(null)} className="btn-secondary text-sm">Cancel</button>
              <button onClick={handleConfirmCart} disabled={confirming} className="btn-primary flex items-center gap-2 text-sm">
                {confirming ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ShoppingCart size={16} />}
                {confirming ? 'Adding...' : `Add ${autoFillResults.filter(r => r.selectedProduct).length} items to Kroger Cart`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pantry toast */}
      {pantryToast && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-brand-500 text-white px-4 py-2 rounded-xl shadow-lg text-sm font-medium">
          {pantryToast}
        </motion.div>
      )}

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-brand-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${totalCount ? (checkedCount / totalCount) * 100 : 0}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Items by category */}
      {groupedItems.map(([category, catItems]) => (
        <motion.div
          key={category}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <span>{CATEGORY_ICONS[category] || '📦'}</span>
            <h3 className="font-semibold text-sm">{category}</h3>
            <span className="text-xs text-gray-400 ml-auto">{catItems.length} items</span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {catItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-4 py-3 transition-all ${
                  item.checked || item.in_pantry ? 'opacity-50' : ''
                }`}
              >
                <button
                  onClick={() => handleToggle(item.id, item.checked)}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    item.checked
                      ? 'bg-brand-500 border-brand-500'
                      : 'border-gray-300 dark:border-gray-600 hover:border-brand-400'
                  }`}
                >
                  {item.checked && <Check size={14} className="text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${item.checked ? 'line-through text-gray-400' : ''}`}>
                    {item.name}
                  </p>
                  {item.quantity > 0 && (
                    <p className="text-xs text-gray-400">{item.quantity} {item.unit}</p>
                  )}
                  {item.in_pantry && (
                    <p className="text-xs text-brand-500 font-medium">✓ In pantry</p>
                  )}
                </div>

                {!item.checked && currentStore && (
                  <a
                    href={getStoreLink(currentStore, item.name, organicPref)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 text-xs font-medium hover:bg-brand-500/20 transition-colors"
                  >
                    Buy <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}