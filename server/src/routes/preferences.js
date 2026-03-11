const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const profile = db.prepare('SELECT name, household_size, budget_preference, onboarding_completed FROM users WHERE id = ?').get(userId) || {};
    const mealStructure = db.prepare('SELECT breakfast, lunch, dinner, snacks FROM user_meal_structure WHERE user_id = ?').get(userId) || { breakfast: 1, lunch: 1, dinner: 1, snacks: 0 };
    const diets = db.prepare('SELECT diets, custom_diet, allergies, restrictions FROM user_diet_preferences WHERE user_id = ?').get(userId);
    const macros = db.prepare('SELECT calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, sugar_g, macro_preset FROM user_macros WHERE user_id = ?').get(userId);
    const ingredients = db.prepare('SELECT disliked_ingredients, loved_ingredients FROM user_ingredient_preferences WHERE user_id = ?').get(userId);
    const cuisines = db.prepare('SELECT favorite_cuisines, avoided_cuisines, variety_preference FROM user_cuisine_preferences WHERE user_id = ?').get(userId);
    const sources = db.prepare('SELECT source_name, api_key, base_url, enabled FROM user_recipe_sources WHERE user_id = ?').all(userId);
    const store = db.prepare('SELECT primary_store, kroger_location_id, organic_preference FROM user_store_preferences WHERE user_id = ?').get(userId);

    const parseJSON = (val, def) => { try { return val ? JSON.parse(val) : def; } catch { return def; } };

    res.json({
      profile,
      mealStructure,
      diets: diets ? { diets: parseJSON(diets.diets, []), custom_diet: diets.custom_diet, allergies: parseJSON(diets.allergies, []), restrictions: parseJSON(diets.restrictions, []) } : { diets: [], custom_diet: null, allergies: [], restrictions: [] },
      macros: macros || { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 67, macro_preset: 'balanced' },
      ingredients: ingredients ? { disliked_ingredients: parseJSON(ingredients.disliked_ingredients, []), loved_ingredients: parseJSON(ingredients.loved_ingredients, []) } : { disliked_ingredients: [], loved_ingredients: [] },
      cuisines: cuisines ? { favorite_cuisines: parseJSON(cuisines.favorite_cuisines, []), avoided_cuisines: parseJSON(cuisines.avoided_cuisines, []), variety_preference: cuisines.variety_preference } : { favorite_cuisines: [], avoided_cuisines: [], variety_preference: 5 },
      recipeSources: sources.map(s => ({ ...s, enabled: !!s.enabled })),
      store: store || { primary_store: 'amazon_wholefoods', kroger_location_id: null, organic_preference: 'no_preference' },
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/profile', (req, res) => {
  try {
    const userId = req.user.id;
    const { name, householdSize, budgetPreference } = req.body;
    db.prepare('UPDATE users SET name = ?, household_size = ?, budget_preference = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, householdSize || 1, budgetPreference || 'moderate', userId);

    const { breakfast = true, lunch = true, dinner = true, snacks = false } = req.body.mealStructure || {};
    db.prepare('INSERT INTO user_meal_structure (id, user_id, breakfast, lunch, dinner, snacks) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET breakfast=?, lunch=?, dinner=?, snacks=?')
      .run(uuidv4(), userId, breakfast?1:0, lunch?1:0, dinner?1:0, snacks?1:0, breakfast?1:0, lunch?1:0, dinner?1:0, snacks?1:0);
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/diets', (req, res) => {
  try {
    const { diets = [], customDiet = null, allergies = [], restrictions = [] } = req.body;
    db.prepare('INSERT INTO user_diet_preferences (id, user_id, diets, custom_diet, allergies, restrictions) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET diets=?, custom_diet=?, allergies=?, restrictions=?')
      .run(uuidv4(), req.user.id, JSON.stringify(diets), customDiet, JSON.stringify(allergies), JSON.stringify(restrictions), JSON.stringify(diets), customDiet, JSON.stringify(allergies), JSON.stringify(restrictions));
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/macros', (req, res) => {
  try {
    const { calories, proteinG, carbsG, fatG, fiberG, sodiumMg, sugarG, macroPreset } = req.body;
    db.prepare('INSERT INTO user_macros (id, user_id, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, sugar_g, macro_preset) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET calories=?, protein_g=?, carbs_g=?, fat_g=?, fiber_g=?, sodium_mg=?, sugar_g=?, macro_preset=?')
      .run(uuidv4(), req.user.id, calories, proteinG, carbsG, fatG, fiberG||null, sodiumMg||null, sugarG||null, macroPreset||'custom', calories, proteinG, carbsG, fatG, fiberG||null, sodiumMg||null, sugarG||null, macroPreset||'custom');
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/ingredients', (req, res) => {
  try {
    const { dislikedIngredients = [], lovedIngredients = [] } = req.body;
    db.prepare('INSERT INTO user_ingredient_preferences (id, user_id, disliked_ingredients, loved_ingredients) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET disliked_ingredients=?, loved_ingredients=?')
      .run(uuidv4(), req.user.id, JSON.stringify(dislikedIngredients), JSON.stringify(lovedIngredients), JSON.stringify(dislikedIngredients), JSON.stringify(lovedIngredients));
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/cuisines', (req, res) => {
  try {
    const { favoriteCuisines = [], avoidedCuisines = [], varietyPreference = 5 } = req.body;
    db.prepare('INSERT INTO user_cuisine_preferences (id, user_id, favorite_cuisines, avoided_cuisines, variety_preference) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET favorite_cuisines=?, avoided_cuisines=?, variety_preference=?')
      .run(uuidv4(), req.user.id, JSON.stringify(favoriteCuisines), JSON.stringify(avoidedCuisines), varietyPreference, JSON.stringify(favoriteCuisines), JSON.stringify(avoidedCuisines), varietyPreference);
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/sources', (req, res) => {
  try {
    const { sources = [] } = req.body;
    db.prepare('DELETE FROM user_recipe_sources WHERE user_id = ?').run(req.user.id);
    const insert = db.prepare('INSERT INTO user_recipe_sources (id, user_id, source_name, api_key, base_url, enabled) VALUES (?, ?, ?, ?, ?, ?)');
    for (const s of sources) {
      insert.run(uuidv4(), req.user.id, s.sourceName, s.apiKey || null, s.baseUrl || null, s.enabled !== false ? 1 : 0);
    }
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/store', (req, res) => {
  try {
    const { primaryStore = 'amazon_wholefoods', krogerLocationId, organicPreference = 'no_preference' } = req.body;
    db.prepare('INSERT INTO user_store_preferences (id, user_id, primary_store, kroger_location_id, organic_preference) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET primary_store=?, kroger_location_id=?, organic_preference=?')
      .run(uuidv4(), req.user.id, primaryStore, krogerLocationId || null, organicPreference, primaryStore, krogerLocationId || null, organicPreference);
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/complete-onboarding', (req, res) => {
  try {
    db.prepare('UPDATE users SET onboarding_completed = 1, updated_at = datetime(\'now\') WHERE id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;