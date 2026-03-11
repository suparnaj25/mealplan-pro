const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { generateStoreLink } = require('../services/storeLinkGenerator');

const router = express.Router();
router.use(authenticateToken);

const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

function categorizeIngredient(name) {
  const n = name.toLowerCase();
  const cats = { 'Produce': ['lettuce','tomato','onion','garlic','pepper','carrot','broccoli','spinach','avocado','cucumber','mushroom','potato','sweet potato','zucchini','lemon','lime','banana','berry','ginger','cilantro','basil','scallion','asparagus','kale'], 'Meat & Seafood': ['chicken','beef','pork','turkey','salmon','shrimp','tuna','steak','fish','lamb'], 'Dairy & Eggs': ['milk','cheese','yogurt','butter','cream','egg','feta','mozzarella','parmesan','cheddar'], 'Bakery & Bread': ['bread','tortilla','pita','naan','ciabatta','crouton'], 'Grains & Pasta': ['rice','pasta','noodle','quinoa','oat','flour','granola'], 'Canned & Jarred': ['canned','tomato sauce','broth','stock','salsa','bean','chickpea','lentil','olive','coconut milk'], 'Frozen': ['frozen','edamame'], 'Oils & Condiments': ['oil','vinegar','soy sauce','honey','maple syrup','mustard','sriracha','gochujang','sesame oil'], 'Spices & Seasonings': ['salt','pepper','cumin','paprika','cinnamon','turmeric','oregano','chili powder','curry','garam masala','rosemary','thyme','dill'], 'Nuts & Seeds': ['almond','peanut','sesame','chia','walnut','cashew','peanut butter','coconut'] };
  for (const [cat, kws] of Object.entries(cats)) if (kws.some(k => n.includes(k))) return cat;
  return 'Other';
}

router.post('/generate', (req, res) => {
  try {
    const userId = req.user.id;
    const { mealPlanId } = req.body;
    if (!mealPlanId) return res.status(400).json({ error: 'mealPlanId required' });

    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ? AND user_id = ?').get(mealPlanId, userId);
    if (!plan) return res.status(404).json({ error: 'Not found' });

    const planItems = db.prepare('SELECT mpi.servings, r.ingredients, r.servings as recipe_servings FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.meal_plan_id = ?').all(mealPlanId);

    const ingredientMap = new Map();
    for (const item of planItems) {
      const mult = (item.servings || 1) / (item.recipe_servings || 4);
      const ings = parseJSON(item.ingredients, []);
      for (const ing of ings) {
        const key = `${ing.name.toLowerCase().trim()}|${(ing.unit || '').toLowerCase().trim()}`;
        if (ingredientMap.has(key)) { ingredientMap.get(key).quantity += (ing.quantity || 0) * mult; }
        else { ingredientMap.set(key, { name: ing.name.trim(), quantity: Math.round(((ing.quantity || 0) * mult) * 100) / 100, unit: ing.unit || '', category: ing.category || categorizeIngredient(ing.name) }); }
      }
    }

    const pantryItems = db.prepare('SELECT name, quantity, unit FROM pantry_items WHERE user_id = ?').all(userId);
    const pantryMap = new Map();
    for (const p of pantryItems) pantryMap.set(`${p.name.toLowerCase().trim()}|${(p.unit || '').toLowerCase().trim()}`, p);

    const storeRow = db.prepare('SELECT primary_store, organic_preference FROM user_store_preferences WHERE user_id = ?').get(userId);
    const store = storeRow?.primary_store || 'amazon_wholefoods';
    const organicPreference = storeRow?.organic_preference || 'no_preference';

    // Delete existing
    const existing = db.prepare('SELECT id FROM grocery_lists WHERE user_id = ? AND meal_plan_id = ?').get(userId, mealPlanId);
    if (existing) { db.prepare('DELETE FROM grocery_list_items WHERE grocery_list_id = ?').run(existing.id); db.prepare('DELETE FROM grocery_lists WHERE id = ?').run(existing.id); }

    const listId = uuidv4();
    db.prepare('INSERT INTO grocery_lists (id, user_id, meal_plan_id, store) VALUES (?, ?, ?, ?)').run(listId, userId, mealPlanId, store);

    const insert = db.prepare('INSERT INTO grocery_list_items (id, grocery_list_id, name, quantity, unit, category, in_pantry, amazon_search_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const groceryItems = [];
    for (const [key, ing] of ingredientMap) {
      const inPantry = pantryMap.has(key);
      let needed = ing.quantity;
      if (inPantry && pantryMap.get(key).quantity) needed = Math.max(0, ing.quantity - parseFloat(pantryMap.get(key).quantity));
      const link = generateStoreLink(store, ing.name, { organicPreference, quantity: needed, unit: ing.unit });
      const id = uuidv4();
      insert.run(id, listId, ing.name, needed, ing.unit, ing.category, (inPantry && needed === 0) ? 1 : 0, link);
      groceryItems.push({ id, grocery_list_id: listId, name: ing.name, quantity: needed, unit: ing.unit, category: ing.category, checked: 0, in_pantry: (inPantry && needed === 0) ? 1 : 0, amazon_search_url: link });
    }

    groceryItems.sort((a, b) => a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category));
    res.json({ list: { id: listId, user_id: userId, meal_plan_id: mealPlanId, store }, items: groceryItems, store });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:listId', (req, res) => {
  try {
    if (req.params.listId === 'undefined') return res.json({ list: null, items: [] });
    const list = db.prepare('SELECT * FROM grocery_lists WHERE id = ? AND user_id = ?').get(req.params.listId, req.user.id);
    if (!list) return res.status(404).json({ error: 'Not found' });
    const items = db.prepare('SELECT * FROM grocery_list_items WHERE grocery_list_id = ? ORDER BY category, name').all(req.params.listId);
    res.json({ list, items });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/', (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM grocery_lists WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.user.id);
    if (!list) return res.json({ list: null, items: [] });
    const items = db.prepare('SELECT * FROM grocery_list_items WHERE grocery_list_id = ? ORDER BY category, name').all(list.id);
    res.json({ list, items });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/:listId/items/:itemId', (req, res) => {
  try {
    const { checked } = req.body;
    const list = db.prepare('SELECT id FROM grocery_lists WHERE id = ? AND user_id = ?').get(req.params.listId, req.user.id);
    if (!list) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE grocery_list_items SET checked = ? WHERE id = ? AND grocery_list_id = ?').run(checked ? 1 : 0, req.params.itemId, req.params.listId);
    const item = db.prepare('SELECT * FROM grocery_list_items WHERE id = ?').get(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Auto-add to pantry when item is checked (bought)
    if (checked && item.quantity > 0) {
      const existingPantry = db.prepare('SELECT id, quantity FROM pantry_items WHERE user_id = ? AND LOWER(name) = LOWER(?)').get(req.user.id, item.name);
      if (existingPantry) {
        // Update existing pantry item quantity
        const newQty = (parseFloat(existingPantry.quantity) || 0) + (parseFloat(item.quantity) || 0);
        db.prepare('UPDATE pantry_items SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newQty, existingPantry.id);
      } else {
        // Add new pantry item
        const { v4: uuidv4 } = require('uuid');
        db.prepare('INSERT INTO pantry_items (id, user_id, name, quantity, unit, category) VALUES (?, ?, ?, ?, ?, ?)')
          .run(uuidv4(), req.user.id, item.name, item.quantity, item.unit, item.category || 'Other');
      }
    }

    res.json({ item, addedToPantry: !!checked });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;