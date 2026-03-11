import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ALL_INGREDIENTS = [
  'Avocado','Garlic','Lemon','Lime','Chicken','Beef','Pork','Turkey','Lamb','Salmon','Shrimp','Tuna','Cod','Tofu','Tempeh',
  'Eggs','Milk','Cheese','Yogurt','Butter','Cream','Sour Cream','Cottage Cheese','Mozzarella','Cheddar','Parmesan','Feta','Goat Cheese',
  'Rice','Pasta','Quinoa','Oats','Bread','Tortillas','Naan','Couscous','Barley','Noodles',
  'Spinach','Kale','Lettuce','Tomato','Onion','Bell Pepper','Carrot','Broccoli','Cauliflower','Zucchini','Cucumber','Celery','Mushrooms',
  'Potato','Sweet Potato','Corn','Asparagus','Green Beans','Peas','Eggplant','Cabbage','Brussels Sprouts','Beets','Radish','Artichoke',
  'Apple','Banana','Orange','Strawberry','Blueberry','Raspberry','Mango','Pineapple','Peach','Pear','Grape','Watermelon','Coconut',
  'Cilantro','Basil','Parsley','Mint','Rosemary','Thyme','Dill','Oregano','Ginger','Scallions','Shallots','Leek',
  'Olive Oil','Coconut Oil','Sesame Oil','Soy Sauce','Vinegar','Honey','Maple Syrup','Hot Sauce','Sriracha','Mustard',
  'Almonds','Walnuts','Pecans','Cashews','Peanuts','Peanut Butter','Almond Butter','Chia Seeds','Flax Seeds','Sesame Seeds','Sunflower Seeds',
  'Black Beans','Chickpeas','Lentils','Kidney Beans','Edamame',
  'Cinnamon','Cumin','Paprika','Turmeric','Chili Powder','Curry Powder','Garam Masala','Cayenne','Nutmeg','Black Pepper','Salt',
  'Olives','Anchovies','Capers','Blue Cheese','Liver','Okra','Beets','Turnip','Fennel','Seaweed','Nori',
  'Dark Chocolate','Granola','Popcorn','Crackers',
];

export default function TagInput({ selected = [], onChange, placeholder = 'Type to search...', suggestions = ALL_INGREDIENTS, colorClass = 'tag-active' }) {
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const filtered = query.length > 0
    ? suggestions.filter(s => s.toLowerCase().includes(query.toLowerCase()) && !selected.includes(s)).slice(0, 8)
    : [];

  useEffect(() => { setHighlightIdx(0); }, [query]);

  const addTag = (tag) => {
    if (!selected.includes(tag)) {
      onChange([...selected, tag]);
    }
    setQuery('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag) => {
    onChange(selected.filter(t => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0) {
        addTag(filtered[highlightIdx]);
      } else if (query.trim()) {
        addTag(query.trim());
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Backspace' && !query && selected.length > 0) {
      removeTag(selected[selected.length - 1]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative">
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <AnimatePresence>
          {selected.map(tag => (
            <motion.span
              key={tag}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className={`tag ${colorClass} flex items-center gap-1`}
            >
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:bg-white/20 rounded-full p-0.5 transition-colors">
                <X size={12} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length > 0 ? 'Add more...' : placeholder}
          className="input-field text-sm"
        />

        {/* Dropdown */}
        <AnimatePresence>
          {showDropdown && filtered.length > 0 && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-48 overflow-y-auto"
            >
              {filtered.map((item, idx) => (
                <button
                  key={item}
                  onMouseDown={(e) => { e.preventDefault(); addTag(item); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    idx === highlightIdx ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {item}
                </button>
              ))}
              {query.trim() && !filtered.some(f => f.toLowerCase() === query.trim().toLowerCase()) && (
                <button
                  onMouseDown={(e) => { e.preventDefault(); addTag(query.trim()); }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700"
                >
                  Add "{query.trim()}" as custom
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}