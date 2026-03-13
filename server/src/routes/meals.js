const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { generateMealPlan, recipePassesRestrictions } = require('../services/mealGenerator');

const router = express.Router();
router.use(authenticateToken);

const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

router.get('/plan', (req, res) => {
  try {
    const { weekStart } = req.query;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

    const plan = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(req.user.id, weekStart);
    if (!plan) return res.json({ plan: null, items: [] });

    const items = db.prepare(`SELECT mpi.*, r.name as recipe_name, r.image_url, r.cuisine, r.prep_time_minutes, r.cook_time_minutes, r.nutrition, r.ingredients, r.instructions, r.servings as recipe_servings
      FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.meal_plan_id = ? ORDER BY mpi.day_of_week`).all(plan.id);

    res.json({ plan, items: items.map(i => {
      const sf = i.scale_factor || 1.0;
      const nutrition = parseJSON(i.nutrition, {});
      const ingredients = parseJSON(i.ingredients, []);
      return {
        ...i,
        nutrition: { calories: Math.round((nutrition.calories || 0) * sf), protein: Math.round((nutrition.protein || 0) * sf), carbs: Math.round((nutrition.carbs || 0) * sf), fat: Math.round((nutrition.fat || 0) * sf), fiber: Math.round((nutrition.fiber || 0) * sf) },
        ingredients: ingredients.map(ing => ({ ...ing, quantity: Math.round((ing.quantity || 1) * sf * (i.servings || 1) * 10) / 10 })),
        instructions: parseJSON(i.instructions, []),
        locked: !!i.locked,
        scale_factor: sf,
      };
    }) });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/generate', async (req, res) => {
  try {
    const { weekStart } = req.body;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

    const dietPrefs = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(req.user.id) || {};
    const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id) || {};
    const ingredientPrefs = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(req.user.id) || {};
    const cuisinePrefs = db.prepare('SELECT * FROM user_cuisine_preferences WHERE user_id = ?').get(req.user.id) || {};
    const mealStructure = db.prepare('SELECT * FROM user_meal_structure WHERE user_id = ?').get(req.user.id) || { breakfast: 1, lunch: 1, dinner: 1, snacks: 0 };

    const profile = db.prepare('SELECT household_size FROM users WHERE id = ?').get(req.user.id);
    const householdSize = profile?.household_size || 1;

    // Ensure restrictions are properly parsed before passing to generator
    console.log(`🔍 Raw diet prefs from DB:`, JSON.stringify(dietPrefs));
    const preferences = { diets: dietPrefs, macros, ingredients: ingredientPrefs, cuisines: cuisinePrefs, mealStructure, householdSize };
    const generatedItems = await generateMealPlan(preferences);

    // Delete existing
    const existing = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(req.user.id, weekStart);
    if (existing) {
      db.prepare('DELETE FROM meal_plan_items WHERE meal_plan_id = ?').run(existing.id);
      db.prepare('DELETE FROM meal_plans WHERE id = ?').run(existing.id);
    }

    const planId = uuidv4();
    db.prepare('INSERT INTO meal_plans (id, user_id, week_start_date) VALUES (?, ?, ?)').run(planId, req.user.id, weekStart);

    const insert = db.prepare('INSERT INTO meal_plan_items (id, meal_plan_id, day_of_week, meal_type, recipe_id, servings, scale_factor) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const item of generatedItems) {
      insert.run(uuidv4(), planId, item.dayOfWeek, item.mealType, item.recipeId, item.servings || 1, item.scaleFactor || 1.0);
    }

    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(planId);
    const items = db.prepare(`SELECT mpi.*, r.name as recipe_name, r.image_url, r.cuisine, r.prep_time_minutes, r.cook_time_minutes, r.nutrition, r.ingredients, r.instructions, r.servings as recipe_servings
      FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.meal_plan_id = ? ORDER BY mpi.day_of_week`).all(planId);

    res.json({ plan, items: items.map(i => ({ ...i, nutrition: parseJSON(i.nutrition, {}), ingredients: parseJSON(i.ingredients, []), instructions: parseJSON(i.instructions, []), locked: !!i.locked })) });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/plan/:planId/items/:itemId', (req, res) => {
  try {
    const { planId, itemId } = req.params;
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });

    const { recipeId, locked, servings } = req.body;
    if (recipeId !== undefined) db.prepare('UPDATE meal_plan_items SET recipe_id = ? WHERE id = ?').run(recipeId, itemId);
    if (locked !== undefined) db.prepare('UPDATE meal_plan_items SET locked = ? WHERE id = ?').run(locked ? 1 : 0, itemId);
    if (servings !== undefined) db.prepare('UPDATE meal_plan_items SET servings = ? WHERE id = ?').run(servings, itemId);
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/regenerate-slot', (req, res) => {
  try {
    const { planId, itemId } = req.body;
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });

    const item = db.prepare('SELECT * FROM meal_plan_items WHERE id = ? AND meal_plan_id = ?').get(itemId, planId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Get user dietary restrictions to enforce during regeneration
    const dietPrefs = db.prepare('SELECT restrictions FROM user_diet_preferences WHERE user_id = ?').get(req.user.id);
    const restrictions = dietPrefs?.restrictions ? (typeof dietPrefs.restrictions === 'string' ? JSON.parse(dietPrefs.restrictions) : dietPrefs.restrictions) : [];

    const usedIds = db.prepare('SELECT recipe_id FROM meal_plan_items WHERE meal_plan_id = ? AND id != ?').all(planId, itemId).map(r => r.recipe_id);
    const allRecipes = db.prepare('SELECT id, ingredients FROM recipes WHERE meal_type = ?').all(item.meal_type);
    
    // Filter by restrictions AND exclude used/current recipes
    let candidates = allRecipes
      .filter(r => !usedIds.includes(r.id) && r.id !== item.recipe_id)
      .filter(r => recipePassesRestrictions(r, restrictions));
    
    // If no candidates after filtering, allow reuse but still enforce restrictions
    if (candidates.length === 0) {
      candidates = allRecipes
        .filter(r => r.id !== item.recipe_id)
        .filter(r => recipePassesRestrictions(r, restrictions));
    }
    
    const pick = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;

    if (pick) db.prepare('UPDATE meal_plan_items SET recipe_id = ? WHERE id = ?').run(pick.id, itemId);

    const updated = db.prepare(`SELECT mpi.*, r.name as recipe_name, r.image_url, r.cuisine, r.prep_time_minutes, r.cook_time_minutes, r.nutrition, r.ingredients, r.instructions, r.servings as recipe_servings
      FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.id = ?`).get(itemId);
    res.json({ item: { ...updated, nutrition: parseJSON(updated.nutrition, {}), ingredients: parseJSON(updated.ingredients, []), instructions: parseJSON(updated.instructions, []), locked: !!updated.locked } });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/meals/skip — skip a meal (remove from plan)
router.post('/skip', (req, res) => {
  try {
    const { planId, itemId } = req.body;
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });

    db.prepare('DELETE FROM meal_plan_items WHERE id = ? AND meal_plan_id = ?').run(itemId, planId);
    res.json({ success: true, skippedItemId: itemId });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
