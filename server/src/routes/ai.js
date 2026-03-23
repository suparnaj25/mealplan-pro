const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const ai = require('../services/aiService');
const db = require('../db/connection');

const router = express.Router();
router.use(authenticateToken);

// GET /api/ai/status — check if AI is configured
router.get('/status', (req, res) => {
  res.json({ configured: ai.isConfigured() });
});

// POST /api/ai/optimize — Feature 2: Smart Meal Plan Optimization
router.post('/optimize', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.optimizeMealPlan(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI optimize error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/chat — Feature 3: Natural Language Chat (with auto-execute actions)
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const result = await ai.mealPlanChat(req.user.id, message, history);
    // result = { response: string, proposedActions: [], planId: number|null }

    // AUTO-EXECUTE: If the AI proposed actions, execute them immediately server-side
    const executedActions = [];
    if (result.proposedActions && result.proposedActions.length > 0) {
      for (const action of result.proposedActions) {
        try {
          const execResult = await executeActionForUser(req.user.id, action);
          executedActions.push({ ...action, result: execResult });
        } catch (err) {
          executedActions.push({ ...action, result: { success: false, message: err.message } });
        }
      }
    }

    // Build response text: replace AI's suggested recipe names with actual swapped names
    let responseText = result.response;
    const successActions = executedActions.filter(a => a.result?.success);
    
    // For swap_meal actions, if the actual recipe differs from what AI suggested,
    // rewrite the response to show the actual recipe name
    for (const action of executedActions) {
      if (action.type === 'swap_meal' && action.result?.success && action.result?.actualRecipeName) {
        const suggested = action.data?.newRecipeName;
        if (suggested && action.result.actualRecipeName !== suggested) {
          // Replace the AI's suggested name with the actual name in the response
          responseText = responseText.replace(
            new RegExp(suggested.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
            action.result.actualRecipeName
          );
        }
      }
    }
    
    if (successActions.length > 0) {
      const summary = successActions.map(a => `✅ ${a.result.message}`).join('\n');
      responseText = responseText + '\n\n' + summary;
    }

    res.json({
      response: responseText,
      proposedActions: result.proposedActions || [],
      executedActions,
      planId: result.planId,
    });
  } catch (error) {
    console.error('AI chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Helper: Execute an action for a specific user (reusable by both chat auto-execute and manual execute-action)
async function executeActionForUser(userId, action) {
  const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

  switch (action.type) {
    case 'add_dislike': {
      const { ingredient } = action.data || {};
      if (!ingredient) return { success: false, message: 'No ingredient specified' };
      const existing = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(userId);
      let disliked = existing ? parseJSON(existing.disliked_ingredients, []) : [];
      const normalized = ingredient.toLowerCase().trim();
      if (!disliked.map(d => d.toLowerCase()).includes(normalized)) {
        disliked.push(ingredient.trim());
        if (existing) {
          db.prepare('UPDATE user_ingredient_preferences SET disliked_ingredients = ? WHERE user_id = ?').run(JSON.stringify(disliked), userId);
        } else {
          db.prepare('INSERT INTO user_ingredient_preferences (user_id, disliked_ingredients, loved_ingredients) VALUES (?, ?, ?)').run(userId, JSON.stringify(disliked), '[]');
        }
        return { success: true, message: `Added "${ingredient}" to your disliked ingredients` };
      }
      return { success: true, message: `"${ingredient}" is already in your disliked ingredients` };
    }

    case 'add_like': {
      const { ingredient } = action.data || {};
      if (!ingredient) return { success: false, message: 'No ingredient specified' };
      const existing = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(userId);
      let loved = existing ? parseJSON(existing.loved_ingredients, []) : [];
      const normalized = ingredient.toLowerCase().trim();
      if (!loved.map(l => l.toLowerCase()).includes(normalized)) {
        loved.push(ingredient.trim());
        if (existing) {
          db.prepare('UPDATE user_ingredient_preferences SET loved_ingredients = ? WHERE user_id = ?').run(JSON.stringify(loved), userId);
        } else {
          db.prepare('INSERT INTO user_ingredient_preferences (user_id, disliked_ingredients, loved_ingredients) VALUES (?, ?, ?)').run(userId, '[]', JSON.stringify(loved));
        }
        return { success: true, message: `Added "${ingredient}" to your loved ingredients` };
      }
      return { success: true, message: `"${ingredient}" is already in your loved ingredients` };
    }

    case 'update_restriction': {
      const { restriction } = action.data || {};
      if (!restriction) return { success: false, message: 'No restriction specified' };
      const existing = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(userId);
      let restrictions = existing ? parseJSON(existing.restrictions, []) : [];
      const normalized = restriction.toLowerCase().trim();
      if (!restrictions.map(r => r.toLowerCase()).includes(normalized)) {
        restrictions.push(restriction.trim());
        if (existing) {
          db.prepare('UPDATE user_diet_preferences SET restrictions = ? WHERE user_id = ?').run(JSON.stringify(restrictions), userId);
        } else {
          db.prepare('INSERT INTO user_diet_preferences (user_id, restrictions, diets) VALUES (?, ?, ?)').run(userId, JSON.stringify(restrictions), '[]');
        }
        return { success: true, message: `Added "${restriction}" to your dietary restrictions` };
      }
      return { success: true, message: `"${restriction}" is already in your dietary restrictions` };
    }

    case 'update_macros': {
      const { field, value } = action.data || {};
      if (!field || value === undefined) return { success: false, message: 'Field and value required' };
      const fieldMap = { calories: 'calories', protein: 'protein_g', carbs: 'carbs_g', fat: 'fat_g' };
      const dbField = fieldMap[field];
      if (!dbField) return { success: false, message: `Invalid macro field: ${field}` };
      const existing = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(userId);
      if (existing) {
        db.prepare(`UPDATE user_macros SET ${dbField} = ? WHERE user_id = ?`).run(value, userId);
      } else {
        const defaults = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 67 };
        defaults[dbField] = value;
        db.prepare('INSERT INTO user_macros (user_id, calories, protein_g, carbs_g, fat_g) VALUES (?, ?, ?, ?, ?)').run(userId, defaults.calories, defaults.protein_g, defaults.carbs_g, defaults.fat_g);
      }
      return { success: true, message: `Updated ${field} target to ${value}${field === 'calories' ? ' kcal' : 'g'}` };
    }

    case 'swap_meal': {
      const { itemId, newRecipeName } = action.data || {};
      if (!itemId) return { success: false, message: 'No meal item specified' };
      const item = db.prepare('SELECT mpi.*, mp.user_id FROM meal_plan_items mpi JOIN meal_plans mp ON mp.id = mpi.meal_plan_id WHERE mpi.id = ?').get(itemId);
      if (!item || item.user_id !== userId) return { success: false, message: 'Meal plan item not found' };

      const userIngPrefs = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(userId);
      const disliked = userIngPrefs ? parseJSON(userIngPrefs.disliked_ingredients, []) : [];
      
      // Helper: check if a recipe contains any disliked ingredients
      const hasDisliked = (recipe) => {
        if (disliked.length === 0) return false;
        const ings = parseJSON(recipe.ingredients, []);
        const name = (recipe.name || '').toLowerCase();
        return disliked.some(d => {
          const dl = d.toLowerCase();
          return name.includes(dl) || ings.some(ing => ing.name?.toLowerCase().includes(dl));
        });
      };

      let newRecipe = null;
      if (newRecipeName) {
        // Strategy 1: Exact name match (skip if contains disliked)
        const s1 = db.prepare("SELECT * FROM recipes WHERE LOWER(name) = ? AND id != ?").get(newRecipeName.toLowerCase(), item.recipe_id);
        if (s1 && !hasDisliked(s1)) newRecipe = s1;
        // Strategy 2: Partial match (skip if contains disliked)
        if (!newRecipe) {
          const s2 = db.prepare("SELECT * FROM recipes WHERE LOWER(name) LIKE ? AND id != ? LIMIT 5").all(`%${newRecipeName.toLowerCase()}%`, item.recipe_id);
          newRecipe = s2.find(r => !hasDisliked(r)) || null;
        }
        // Strategy 3: Word-by-word match within same meal type (skip if contains disliked)
        if (!newRecipe) {
          const words = newRecipeName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          for (const word of words) {
            const s3 = db.prepare("SELECT * FROM recipes WHERE LOWER(name) LIKE ? AND meal_type = ? AND id != ? LIMIT 5").all(`%${word}%`, item.meal_type, item.recipe_id);
            newRecipe = s3.find(r => !hasDisliked(r)) || null;
            if (newRecipe) break;
          }
        }
      }
      // Strategy 4: Random recipe of same meal type, avoiding disliked ingredients
      if (!newRecipe) {
        const candidates = db.prepare("SELECT * FROM recipes WHERE meal_type = ? AND id != ? ORDER BY RANDOM() LIMIT 20").all(item.meal_type, item.recipe_id);
        newRecipe = candidates.find(c => !hasDisliked(c));
        if (!newRecipe && candidates.length > 0) newRecipe = candidates[0];
      }
      if (newRecipe) {
        db.prepare('UPDATE meal_plan_items SET recipe_id = ? WHERE id = ?').run(newRecipe.id, itemId);
        return { success: true, message: `Swapped to "${newRecipe.name}"`, actualRecipeName: newRecipe.name };
      }
      return { success: false, message: 'No alternative recipe found' };
    }

    case 'regenerate_week': {
      const now = new Date();
      const day = now.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      const weekStart = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
      const existingPlan = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(userId, weekStart);
      if (existingPlan) {
        db.prepare('DELETE FROM meal_plan_items WHERE meal_plan_id = ?').run(existingPlan.id);
        db.prepare('DELETE FROM meal_plans WHERE id = ?').run(existingPlan.id);
      }
      // Build preferences object that generateMealPlan expects
      const { generateMealPlan } = require('../services/mealGenerator');
      const dietPrefs = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(userId) || {};
      const macrosRow = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(userId) || {};
      const ingredientPrefs = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(userId) || {};
      const cuisinePrefs = db.prepare('SELECT * FROM user_cuisine_preferences WHERE user_id = ?').get(userId) || {};
      const mealStructure = db.prepare('SELECT * FROM user_meal_structure WHERE user_id = ?').get(userId) || { breakfast: 1, lunch: 1, dinner: 1, snacks: 0 };
      const profile = db.prepare('SELECT household_size FROM users WHERE id = ?').get(userId);
      const householdSize = profile?.household_size || 1;
      const preferences = { userId, diets: dietPrefs, macros: macrosRow, ingredients: ingredientPrefs, cuisines: cuisinePrefs, mealStructure, householdSize };
      
      const generatedItems = await generateMealPlan(preferences);
      
      // Create new plan and insert items
      const { v4: uuidv4 } = require('uuid');
      const planId = uuidv4();
      db.prepare('INSERT INTO meal_plans (id, user_id, week_start_date) VALUES (?, ?, ?)').run(planId, userId, weekStart);
      const insert = db.prepare('INSERT INTO meal_plan_items (id, meal_plan_id, day_of_week, meal_type, recipe_id, servings, scale_factor) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const item of generatedItems) {
        insert.run(uuidv4(), planId, item.dayOfWeek, item.mealType, item.recipeId, item.servings || 1, item.scaleFactor || 1.0);
      }
      return { success: true, message: `Meal plan regenerated with ${generatedItems.length} meals! Refresh your Meal Plan page to see the changes.` };
    }

    default:
      return { success: false, message: `Unknown action type: ${action.type}` };
  }
}

// POST /api/ai/execute-action — Execute a confirmed action from chat
router.post('/execute-action', async (req, res) => {
  try {
    const { action } = req.body;
    if (!action || !action.type) return res.status(400).json({ error: 'action with type required' });

    const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    let result = { success: false, message: 'Unknown action type' };

    switch (action.type) {
      case 'swap_meal': {
        // Delegate to executeActionForUser which has the full disliked-ingredient-aware logic
        result = await executeActionForUser(req.user.id, action);
        break;
      }

      case 'regenerate_week': {
        // Delegate to executeActionForUser which has the full preferences-building logic
        result = await executeActionForUser(req.user.id, action);
        break;
      }

      case 'add_dislike': {
        const { ingredient } = action.data || {};
        if (!ingredient) return res.status(400).json({ error: 'ingredient required for add_dislike' });
        
        const existing = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(req.user.id);
        let disliked = existing ? parseJSON(existing.disliked_ingredients, []) : [];
        const normalized = ingredient.toLowerCase().trim();
        if (!disliked.map(d => d.toLowerCase()).includes(normalized)) {
          disliked.push(ingredient.trim());
          if (existing) {
            db.prepare('UPDATE user_ingredient_preferences SET disliked_ingredients = ? WHERE user_id = ?').run(JSON.stringify(disliked), req.user.id);
          } else {
            db.prepare('INSERT INTO user_ingredient_preferences (user_id, disliked_ingredients, loved_ingredients) VALUES (?, ?, ?)').run(req.user.id, JSON.stringify(disliked), '[]');
          }
          result = { success: true, message: `Added "${ingredient}" to your disliked ingredients` };
        } else {
          result = { success: true, message: `"${ingredient}" is already in your disliked ingredients` };
        }
        break;
      }

      case 'add_like': {
        const { ingredient } = action.data || {};
        if (!ingredient) return res.status(400).json({ error: 'ingredient required for add_like' });
        
        const existing = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(req.user.id);
        let loved = existing ? parseJSON(existing.loved_ingredients, []) : [];
        const normalized = ingredient.toLowerCase().trim();
        if (!loved.map(l => l.toLowerCase()).includes(normalized)) {
          loved.push(ingredient.trim());
          if (existing) {
            db.prepare('UPDATE user_ingredient_preferences SET loved_ingredients = ? WHERE user_id = ?').run(JSON.stringify(loved), req.user.id);
          } else {
            db.prepare('INSERT INTO user_ingredient_preferences (user_id, disliked_ingredients, loved_ingredients) VALUES (?, ?, ?)').run(req.user.id, '[]', JSON.stringify(loved));
          }
          result = { success: true, message: `Added "${ingredient}" to your loved ingredients` };
        } else {
          result = { success: true, message: `"${ingredient}" is already in your loved ingredients` };
        }
        break;
      }

      case 'update_restriction': {
        const { restriction } = action.data || {};
        if (!restriction) return res.status(400).json({ error: 'restriction required for update_restriction' });
        
        const existing = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(req.user.id);
        let restrictions = existing ? parseJSON(existing.restrictions, []) : [];
        const normalized = restriction.toLowerCase().trim();
        if (!restrictions.map(r => r.toLowerCase()).includes(normalized)) {
          restrictions.push(restriction.trim());
          if (existing) {
            db.prepare('UPDATE user_diet_preferences SET restrictions = ? WHERE user_id = ?').run(JSON.stringify(restrictions), req.user.id);
          } else {
            db.prepare('INSERT INTO user_diet_preferences (user_id, restrictions, diets) VALUES (?, ?, ?)').run(req.user.id, JSON.stringify(restrictions), '[]');
          }
          result = { success: true, message: `Added "${restriction}" to your dietary restrictions` };
        } else {
          result = { success: true, message: `"${restriction}" is already in your dietary restrictions` };
        }
        break;
      }

      case 'update_macros': {
        const { field, value } = action.data || {};
        if (!field || value === undefined) return res.status(400).json({ error: 'field and value required for update_macros' });
        
        const fieldMap = { calories: 'calories', protein: 'protein_g', carbs: 'carbs_g', fat: 'fat_g' };
        const dbField = fieldMap[field];
        if (!dbField) return res.status(400).json({ error: `Invalid macro field: ${field}` });
        
        const existing = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id);
        if (existing) {
          db.prepare(`UPDATE user_macros SET ${dbField} = ? WHERE user_id = ?`).run(value, req.user.id);
        } else {
          const defaults = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 67 };
          defaults[dbField] = value;
          db.prepare('INSERT INTO user_macros (user_id, calories, protein_g, carbs_g, fat_g) VALUES (?, ?, ?, ?, ?)').run(req.user.id, defaults.calories, defaults.protein_g, defaults.carbs_g, defaults.fat_g);
        }
        result = { success: true, message: `Updated ${field} target to ${value}${field === 'calories' ? ' kcal' : 'g'}` };
        break;
      }

      default:
        result = { success: false, message: `Unknown action type: ${action.type}` };
    }

    res.json(result);
  } catch (error) {
    console.error('AI execute-action error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/substitutions — Feature 4: Ingredient Substitution
router.post('/substitutions', async (req, res) => {
  try {
    const { recipeId } = req.body;
    if (!recipeId) return res.status(400).json({ error: 'recipeId required' });
    const result = await ai.getSubstitutions(req.user.id, recipeId);
    res.json(result);
  } catch (error) {
    console.error('AI substitutions error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai/what-can-i-make — Feature 5: Pantry-Aware Suggestions
router.get('/what-can-i-make', async (req, res) => {
  try {
    const result = await ai.whatCanIMake(req.user.id);
    res.json(result);
  } catch (error) {
    console.error('AI what-can-i-make error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/budget — Feature 6: Budget Estimator
router.post('/budget', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.estimateBudget(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI budget error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/nutrition-report — Feature 7: Nutrition Insights
router.post('/nutrition-report', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.nutritionInsights(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI nutrition error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/generate-recipe — #4: AI Recipe Generation
router.post('/generate-recipe', async (req, res) => {
  try {
    const { mealType, macroTargets } = req.body;
    if (!mealType) return res.status(400).json({ error: 'mealType required' });

    const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const diets = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(req.user.id);
    const cuisines = db.prepare('SELECT * FROM user_cuisine_preferences WHERE user_id = ?').get(req.user.id);
    const restrictions = diets ? parseJSON(diets.restrictions, []) : [];
    const cuisinePrefs = cuisines ? parseJSON(cuisines.favorite_cuisines, []) : [];

    const result = await ai.generateRecipe(mealType, restrictions, macroTargets || {}, cuisinePrefs);
    res.json(result);
  } catch (error) {
    console.error('AI generate-recipe error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/interpret-diet — #7: AI Dietary Interpretation
router.post('/interpret-diet', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    const result = await ai.interpretDietaryInput(text);
    res.json(result);
  } catch (error) {
    console.error('AI interpret-diet error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/calculate-macros — #8: AI Macro Calculator
router.post('/calculate-macros', async (req, res) => {
  try {
    const { profile } = req.body;
    if (!profile) return res.status(400).json({ error: 'profile required' });
    const result = await ai.calculatePersonalizedMacros(profile);
    res.json(result);
  } catch (error) {
    console.error('AI calculate-macros error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/search-terms — #2: AI Recipe Discovery
router.post('/search-terms', async (req, res) => {
  try {
    const { mealType } = req.body;
    const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const diets = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(req.user.id);
    const cuisines = db.prepare('SELECT * FROM user_cuisine_preferences WHERE user_id = ?').get(req.user.id);
    const restrictions = diets ? parseJSON(diets.restrictions, []) : [];
    const cuisinePrefs = cuisines ? parseJSON(cuisines.favorite_cuisines, []) : [];

    const terms = await ai.generateSearchTerms(mealType || 'dinner', restrictions, cuisinePrefs);
    res.json({ terms });
  } catch (error) {
    console.error('AI search-terms error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/week-insights — Week-to-date actuals + forecast
router.post('/week-insights', async (req, res) => {
  try {
    const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    
    // Get user macros targets
    const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id);
    const targets = {
      calories: macros?.calories || 2000,
      protein: macros?.protein_g || 150,
      carbs: macros?.carbs_g || 200,
      fat: macros?.fat_g || 67,
    };

    // Get current week dates
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    }
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const todayIdx = weekDates.indexOf(today);

    // Get logged meals (actuals)
    const logs = db.prepare('SELECT date, meal_type, calories, protein_g, carbs_g, fat_g, status FROM meal_logs WHERE user_id = ? AND date >= ? AND date <= ?')
      .all(req.user.id, weekDates[0], weekDates[6]);

    // Get meal plan (for forecast)
    const weekStart = weekDates[0];
    const plan = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(req.user.id, weekStart);
    let planItems = [];
    if (plan) {
      planItems = db.prepare(`SELECT mpi.day_of_week, mpi.scale_factor, r.nutrition FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.meal_plan_id = ?`).all(plan.id);
    }

    // Calculate actuals (logged days)
    const actuals = { days: 0, calories: 0, protein: 0, carbs: 0, fat: 0 };
    const loggedDates = new Set();
    for (const log of logs) {
      if (log.status === 'eaten' || log.status === 'logged') {
        loggedDates.add(log.date);
        actuals.calories += log.calories || 0;
        actuals.protein += log.protein_g || 0;
        actuals.carbs += log.carbs_g || 0;
        actuals.fat += log.fat_g || 0;
      }
    }
    actuals.days = loggedDates.size;

    // Calculate forecast (actuals + remaining planned)
    const forecast = { ...actuals };
    const remainingDays = todayIdx >= 0 ? 6 - todayIdx : 0;
    for (const item of planItems) {
      if (item.day_of_week > todayIdx) {
        const n = parseJSON(item.nutrition, {});
        const sf = item.scale_factor || 1.0;
        forecast.calories += Math.round((n.calories || 0) * sf);
        forecast.protein += Math.round((n.protein || 0) * sf);
        forecast.carbs += Math.round((n.carbs || 0) * sf);
        forecast.fat += Math.round((n.fat || 0) * sf);
      }
    }
    forecast.days = actuals.days + remainingDays;

    // Compute deviation percentages for deterministic grading
    const computeGrade = (avg, target) => {
      if (!target || target === 0) return 'B';
      const pct = Math.abs(avg - target) / target;
      if (pct <= 0.10) return 'A';
      if (pct <= 0.20) return 'B';
      if (pct <= 0.35) return 'C';
      return 'D';
    };

    const avgActCal = actuals.days > 0 ? Math.round(actuals.calories / actuals.days) : 0;
    const avgActProt = actuals.days > 0 ? Math.round(actuals.protein / actuals.days) : 0;
    const avgActCarbs = actuals.days > 0 ? Math.round(actuals.carbs / actuals.days) : 0;
    const avgActFat = actuals.days > 0 ? Math.round(actuals.fat / actuals.days) : 0;

    const avgFcCal = forecast.days > 0 ? Math.round(forecast.calories / forecast.days) : 0;
    const avgFcProt = forecast.days > 0 ? Math.round(forecast.protein / forecast.days) : 0;
    const avgFcCarbs = forecast.days > 0 ? Math.round(forecast.carbs / forecast.days) : 0;
    const avgFcFat = forecast.days > 0 ? Math.round(forecast.fat / forecast.days) : 0;

    // Grade each macro individually, then take the worst as overall grade
    const gradeOrder = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
    const worstGrade = (...grades) => grades.reduce((w, g) => gradeOrder[g] > gradeOrder[w] ? g : w, 'A');

    const actualsGrade = actuals.days === 0 ? 'D' : worstGrade(
      computeGrade(avgActCal, targets.calories),
      computeGrade(avgActProt, targets.protein),
      computeGrade(avgActCarbs, targets.carbs),
      computeGrade(avgActFat, targets.fat)
    );
    const forecastGrade = forecast.days === 0 ? 'D' : worstGrade(
      computeGrade(avgFcCal, targets.calories),
      computeGrade(avgFcProt, targets.protein),
      computeGrade(avgFcCarbs, targets.carbs),
      computeGrade(avgFcFat, targets.fat)
    );

    // Use AI for summaries and tips only (grading is deterministic)
    const response = await ai.chatCompletion([
      {
        role: 'system',
        content: `You are a personal nutrition coach. The user has set THEIR OWN specific daily macro targets (not general guidelines). Grade and assess ONLY against THEIR targets.

Return JSON:
{
  "actualsGrade": "${actualsGrade}",
  "actualsSummary": "Brief assessment referencing their specific targets",
  "forecastGrade": "${forecastGrade}",
  "forecastSummary": "Brief forecast assessment referencing their specific targets",
  "tips": ["actionable tip referencing their specific macro gaps", "tip2"],
  "encouragement": "Motivational message"
}

IMPORTANT: The grades are pre-computed. Use exactly actualsGrade="${actualsGrade}" and forecastGrade="${forecastGrade}".
Focus your summary on which specific macros are off-target and by how much.
Grading criteria (against USER's personal targets): A=within 10%, B=within 20%, C=within 35%, D=>35% off.`
      },
      {
        role: 'user',
        content: `THIS USER'S personal daily targets: ${targets.calories} cal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat

Week-to-date actuals (${actuals.days} days logged): avg ${avgActCal} cal (${targets.calories > 0 ? Math.round((avgActCal/targets.calories)*100) : 0}% of target), ${avgActProt}g P (${targets.protein > 0 ? Math.round((avgActProt/targets.protein)*100) : 0}%), ${avgActCarbs}g C (${targets.carbs > 0 ? Math.round((avgActCarbs/targets.carbs)*100) : 0}%), ${avgActFat}g F (${targets.fat > 0 ? Math.round((avgActFat/targets.fat)*100) : 0}%)

Forecast (${forecast.days} days): avg ${avgFcCal} cal (${targets.calories > 0 ? Math.round((avgFcCal/targets.calories)*100) : 0}%), ${avgFcProt}g P (${targets.protein > 0 ? Math.round((avgFcProt/targets.protein)*100) : 0}%), ${avgFcCarbs}g C (${targets.carbs > 0 ? Math.round((avgFcCarbs/targets.carbs)*100) : 0}%), ${avgFcFat}g F (${targets.fat > 0 ? Math.round((avgFcFat/targets.fat)*100) : 0}%)`
      }
    ], { jsonMode: true, temperature: 0.3, maxTokens: 500 });

    const aiAnalysis = JSON.parse(response);

    res.json({
      targets,
      actuals: {
        ...actuals,
        avgCalories: actuals.days > 0 ? Math.round(actuals.calories / actuals.days) : 0,
        avgProtein: actuals.days > 0 ? Math.round(actuals.protein / actuals.days) : 0,
        avgCarbs: actuals.days > 0 ? Math.round(actuals.carbs / actuals.days) : 0,
        avgFat: actuals.days > 0 ? Math.round(actuals.fat / actuals.days) : 0,
      },
      forecast: {
        ...forecast,
        avgCalories: forecast.days > 0 ? Math.round(forecast.calories / forecast.days) : 0,
        avgProtein: forecast.days > 0 ? Math.round(forecast.protein / forecast.days) : 0,
        avgCarbs: forecast.days > 0 ? Math.round(forecast.carbs / forecast.days) : 0,
        avgFat: forecast.days > 0 ? Math.round(forecast.fat / forecast.days) : 0,
      },
      ai: aiAnalysis,
      weekDates,
      today,
    });
  } catch (error) {
    console.error('Week insights error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/analyze-photo — Vision-based food photo analysis
router.post('/analyze-photo', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image (base64) required' });
    
    // Ensure proper data URL format
    let imageData = image;
    if (!imageData.startsWith('data:')) {
      imageData = `data:image/jpeg;base64,${imageData}`;
    }
    
    console.log(`📷 AI photo analysis: image size ${Math.round(imageData.length / 1024)}KB`);
    const result = await ai.analyzePhoto(imageData);
    res.json(result);
  } catch (error) {
    console.error('AI analyze-photo error:', error.message);
    res.status(500).json({ error: error.message, details: 'Photo analysis failed. The image may be too large or the AI service may be temporarily unavailable. Try a smaller image or try again.' });
  }
});

// POST /api/ai/parse-food — Natural language food → nutrition
router.post('/parse-food', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'description required' });
    const result = await ai.parseFoodDescription(description);
    res.json(result);
  } catch (error) {
    console.error('AI parse-food error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/explain-plan — Personalized meal plan summary
router.post('/explain-plan', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.explainMealPlan(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI explain-plan error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/optimize-grocery — Smart grocery list optimization
router.post('/optimize-grocery', async (req, res) => {
  try {
    const { items, store, budget, organic } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'items required' });
    const result = await ai.optimizeGroceryList(items, { store, budget, organic });
    res.json(result);
  } catch (error) {
    console.error('AI optimize-grocery error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai/pantry-alerts — Expiry alerts with AI suggestions
router.get('/pantry-alerts', async (req, res) => {
  try {
    const now = new Date();
    const items = db.prepare('SELECT * FROM pantry_items WHERE user_id = ? AND expiry_date IS NOT NULL ORDER BY expiry_date').all(req.user.id);
    const expiring = items.filter(i => {
      const exp = new Date(i.expiry_date + 'T23:59:59');
      const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 5;
    }).map(i => {
      const exp = new Date(i.expiry_date + 'T23:59:59');
      return { ...i, daysLeft: Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) };
    });

    if (expiring.length === 0) return res.json({ alerts: [], mealIdea: null, tip: 'Nothing expiring soon — nice work keeping your pantry fresh! 🌿' });

    const result = await ai.pantryExpiryAlerts(expiring, req.user.id);
    res.json(result);
  } catch (error) {
    console.error('AI pantry-alerts error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/recipe-enhance — Cooking tips, healthier version, pairings
router.post('/recipe-enhance', async (req, res) => {
  try {
    const { recipeId, type } = req.body;
    if (!recipeId || !type) return res.status(400).json({ error: 'recipeId and type required' });
    if (!['cooking-tips', 'make-healthier', 'pairings'].includes(type)) return res.status(400).json({ error: 'type must be cooking-tips, make-healthier, or pairings' });

    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    // Parse JSON fields from DB
    const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
    const parsed = {
      ...recipe,
      ingredients: parseJSON(recipe.ingredients, []),
      instructions: parseJSON(recipe.instructions, []),
      nutrition: parseJSON(recipe.nutrition, {}),
    };

    const result = await ai.getRecipeEnhancements(parsed, type);
    res.json(result);
  } catch (error) {
    console.error('AI recipe-enhance error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/meal-prep — Generate meal prep guide
router.post('/meal-prep', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId required' });
    const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ? AND user_id = ?').get(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const result = await ai.generateMealPrepGuide(req.user.id, planId);
    res.json(result);
  } catch (error) {
    console.error('AI meal-prep error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/actionable-swaps — Feature 10: Actionable meal swap suggestions
router.post('/actionable-swaps', async (req, res) => {
  try {
    const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id);
    const targets = macros ? { calories: macros.calories || 2000, protein: macros.protein_g || 150, carbs: macros.carbs_g || 200, fat: macros.fat_g || 67 } : { calories: 2000, protein: 150, carbs: 200, fat: 67 };

    // Get this week's meal logs
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    const wsStr = weekStart.toISOString().split('T')[0];

    const logs = db.prepare(`SELECT * FROM meal_logs WHERE user_id = ? AND date >= ? ORDER BY date, meal_type`).all(req.user.id, wsStr);

    // Get last week's logs for comparison
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const pwsStr = prevWeekStart.toISOString().split('T')[0];
    const prevLogs = db.prepare(`SELECT * FROM meal_logs WHERE user_id = ? AND date >= ? AND date < ? ORDER BY date`).all(req.user.id, pwsStr, wsStr);

    // Get planned meals
    const plan = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(req.user.id);
    let planItems = [];
    if (plan) {
      planItems = db.prepare(`SELECT mpi.*, r.name as recipe_name, r.nutrition FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.meal_plan_id = ?`).all(plan.id);
    }

    const weekData = {
      currentWeekLogs: logs.map(l => ({ date: l.date, meal: l.meal_type, description: l.actual_description || l.recipe_name, calories: l.calories, protein: l.protein_g, carbs: l.carbs_g, fat: l.fat_g })),
      previousWeekLogs: prevLogs.map(l => ({ date: l.date, meal: l.meal_type, calories: l.calories, protein: l.protein_g, carbs: l.carbs_g, fat: l.fat_g })),
      plannedMeals: planItems.map(i => {
        const sf = i.scale_factor || 1.0;
        const n = (() => { try { return JSON.parse(i.nutrition); } catch { return {}; } })();
        return { day: i.day_of_week, meal: i.meal_type, name: i.recipe_name, nutrition: { calories: Math.round((n.calories || 0) * sf), protein: Math.round((n.protein || 0) * sf), carbs: Math.round((n.carbs || 0) * sf), fat: Math.round((n.fat || 0) * sf) } };
      })
    };

    const result = await ai.getActionableSwaps(weekData, targets);
    res.json(result);
  } catch (error) {
    console.error('Actionable swaps error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai/trends — Multi-week trend analysis
router.post('/trends', async (req, res) => {
  try {
    const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id);
    const targets = {
      calories: macros?.calories || 2000,
      protein: macros?.protein_g || 150,
      carbs: macros?.carbs_g || 200,
      fat: macros?.fat_g || 67,
    };

    // Get last 4 weeks of data
    const weeks = [];
    for (let w = 0; w < 4; w++) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (w * 7 + startDate.getDay() - 1));
      const weekStart = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      const weekEnd = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;

      const logs = db.prepare("SELECT date, SUM(calories) as cal, SUM(protein_g) as prot, SUM(carbs_g) as carbs, SUM(fat_g) as fat FROM meal_logs WHERE user_id = ? AND date >= ? AND date <= ? AND status IN ('eaten','modified') GROUP BY date").all(req.user.id, weekStart, weekEnd);

      if (logs.length > 0) {
        const avgCal = Math.round(logs.reduce((s, l) => s + l.cal, 0) / logs.length);
        const avgProt = Math.round(logs.reduce((s, l) => s + l.prot, 0) / logs.length);
        const avgCarbs = Math.round(logs.reduce((s, l) => s + l.carbs, 0) / logs.length);
        const avgFat = Math.round(logs.reduce((s, l) => s + l.fat, 0) / logs.length);
        weeks.push({ weekStart, daysLogged: logs.length, avgCalories: avgCal, avgProtein: avgProt, avgCarbs, avgFat });
      }
    }

    if (weeks.length < 2) return res.json({ summary: 'Need at least 2 weeks of data for trend analysis. Keep logging!', patterns: [], predictions: [] });

    const result = await ai.analyzeTrends(weeks, targets);
    res.json(result);
  } catch (error) {
    console.error('AI trends error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
