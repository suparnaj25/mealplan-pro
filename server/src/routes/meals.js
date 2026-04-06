const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const { generateMealPlan, generateJointPlan, recipePassesRestrictions } = require('../services/mealGenerator');

const router = express.Router();
router.use(authenticateToken);

const { parseJSON } = require('../utils/parseJSON');

router.get('/plan', (req, res) => {
  try {
    const { weekStart } = req.query;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

    // Check if user is in a family — look for shared family plan first
    const user = db.prepare('SELECT family_id, name FROM users WHERE id = ?').get(req.user.id);
    let plan = null;
    let isSharedPlan = false;

    if (user?.family_id) {
      // Look for a family-tagged plan for this week (deterministic: oldest first = canonical)
      plan = db.prepare('SELECT * FROM meal_plans WHERE family_id = ? AND week_start_date = ? ORDER BY created_at ASC LIMIT 1').get(user.family_id, weekStart);
      if (plan) {
        isSharedPlan = true;
        // Clean up duplicates: if multiple family plans exist for same week, keep only the canonical one
        const dupes = db.prepare('SELECT id FROM meal_plans WHERE family_id = ? AND week_start_date = ? AND id != ?').all(user.family_id, weekStart, plan.id);
        for (const dupe of dupes) {
          db.prepare('DELETE FROM meal_plan_overrides WHERE meal_plan_id = ?').run(dupe.id);
          db.prepare('DELETE FROM meal_plan_items WHERE meal_plan_id = ?').run(dupe.id);
          db.prepare('DELETE FROM meal_plans WHERE id = ?').run(dupe.id);
        }
      }

      // If no family-tagged plan, check if any family member has an untagged plan for this week
      if (!plan) {
        const familyMembers = db.prepare('SELECT user_id FROM family_members WHERE family_id = ?').all(user.family_id);
        const memberIds = familyMembers.map(m => m.user_id);
        if (memberIds.length > 0) {
          const placeholders = memberIds.map(() => '?').join(',');
          const untagged = db.prepare(`SELECT * FROM meal_plans WHERE user_id IN (${placeholders}) AND week_start_date = ? AND family_id IS NULL ORDER BY created_at ASC LIMIT 1`).get(...memberIds, weekStart);
          if (untagged) {
            // Adopt this plan into the family so both partners see it going forward
            db.prepare('UPDATE meal_plans SET family_id = ? WHERE id = ?').run(user.family_id, untagged.id);
            plan = { ...untagged, family_id: user.family_id };
            isSharedPlan = true;
          }
        }
      }
    }

    // Fall back to personal plan (no family, or family plan not found)
    if (!plan) {
      plan = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND week_start_date = ? AND family_id IS NULL').get(req.user.id, weekStart);
    }

    if (!plan) return res.json({ plan: null, items: [], isSharedPlan: false });

    // Fetch items — LEFT JOIN so custom meals (no recipe_id) still appear
    // Filter: shared items (user_id IS NULL) + personal items for this user (beverages)
    const items = db.prepare(`SELECT mpi.*, r.name as recipe_name, r.image_url, r.cuisine, r.prep_time_minutes, r.cook_time_minutes, r.nutrition, r.ingredients, r.instructions, r.servings as recipe_servings
      FROM meal_plan_items mpi LEFT JOIN recipes r ON r.id = mpi.recipe_id 
      WHERE mpi.meal_plan_id = ? AND (mpi.user_id IS NULL OR mpi.user_id = ?)
      ORDER BY mpi.day_of_week`).all(plan.id, req.user.id);

    // Load per-user overrides for this plan
    const overrides = isSharedPlan ? db.prepare('SELECT * FROM meal_plan_overrides WHERE meal_plan_id = ? AND user_id = ?').all(plan.id, req.user.id) : [];
    const overrideMap = {};
    for (const ov of overrides) { overrideMap[ov.original_item_id] = ov; }

    // Get user's personal macros for scale factor calculation
    const userMacros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id);
    // Get plan creator's macros for comparison
    const creatorMacros = isSharedPlan && plan.user_id !== req.user.id
      ? db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(plan.user_id)
      : null;

    // Calculate personal scale factor: ratio of user's calorie target to creator's
    let personalScaleFactor = 1.0;
    if (creatorMacros && userMacros && creatorMacros.calories && userMacros.calories) {
      personalScaleFactor = userMacros.calories / creatorMacros.calories;
    }

    res.json({ plan: { ...plan, isSharedPlan }, items: items.map(i => {
      // Check if this item has a personal override
      const override = overrideMap[i.id];
      
      const isCustom = override 
        ? (!!override.custom_name && !override.recipe_id)
        : (!!i.custom_name && !i.recipe_id);
      
      let sf = i.scale_factor || 1.0;
      // Apply personal scale factor for shared plans (non-beverage meals)
      if (isSharedPlan && plan.user_id !== req.user.id && i.meal_type !== 'beverage') {
        sf = sf * personalScaleFactor;
      }
      if (override) sf = override.scale_factor || sf;

      let nutrition, recipeName;
      if (override) {
        // Use override data
        if (override.recipe_id) {
          const overrideRecipe = db.prepare('SELECT name, nutrition FROM recipes WHERE id = ?').get(override.recipe_id);
          nutrition = overrideRecipe ? parseJSON(overrideRecipe.nutrition, {}) : {};
          recipeName = overrideRecipe?.name || override.custom_name || 'Override';
        } else {
          nutrition = parseJSON(override.custom_nutrition, {});
          recipeName = override.custom_name || 'Override';
        }
      } else {
        nutrition = isCustom ? parseJSON(i.custom_nutrition, {}) : parseJSON(i.nutrition, {});
        recipeName = isCustom ? i.custom_name : (i.recipe_name || i.custom_name || 'Unknown');
      }

      const ingredients = isCustom ? [] : parseJSON(i.ingredients, []);
      return {
        ...i,
        recipe_name: recipeName,
        nutrition: { calories: Math.round((nutrition.calories || 0) * sf), protein: Math.round((nutrition.protein || 0) * sf), carbs: Math.round((nutrition.carbs || 0) * sf), fat: Math.round((nutrition.fat || 0) * sf), fiber: Math.round((nutrition.fiber || 0) * sf) },
        ingredients: ingredients.map(ing => ({ ...ing, quantity: Math.round(((ing.quantity || 1) / (i.recipe_servings || 4)) * (i.servings || 1) * sf * 10) / 10 })),
        instructions: parseJSON(i.instructions, []),
        locked: !!i.locked,
        is_user_provided: !!i.is_user_provided,
        scale_factor: Math.round(sf * 100) / 100,
        has_override: !!override,
        is_shared: isSharedPlan && !i.user_id,
      };
    }), isSharedPlan });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/generate', async (req, res) => {
  try {
    const { weekStart } = req.body;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

    const userInfo = db.prepare('SELECT family_id, name FROM users WHERE id = ?').get(req.user.id);

    // ── Family guard: if a shared family plan already exists for this week
    //    and this user did NOT create it, return it instead of overwriting ──
    if (userInfo?.family_id) {
      // Check tagged family plans
      let existingFamily = db.prepare('SELECT * FROM meal_plans WHERE family_id = ? AND week_start_date = ? ORDER BY created_at ASC LIMIT 1').get(userInfo.family_id, weekStart);
      // Also check untagged plans from family members
      if (!existingFamily) {
        const familyMembers = db.prepare('SELECT user_id FROM family_members WHERE family_id = ?').all(userInfo.family_id);
        const otherMemberIds = familyMembers.map(m => m.user_id).filter(id => id !== req.user.id);
        if (otherMemberIds.length > 0) {
          const ph = otherMemberIds.map(() => '?').join(',');
          existingFamily = db.prepare(`SELECT * FROM meal_plans WHERE user_id IN (${ph}) AND week_start_date = ? AND family_id IS NULL ORDER BY created_at ASC LIMIT 1`).get(...otherMemberIds, weekStart);
          if (existingFamily) {
            // Adopt into family
            db.prepare('UPDATE meal_plans SET family_id = ? WHERE id = ?').run(userInfo.family_id, existingFamily.id);
            existingFamily.family_id = userInfo.family_id;
          }
        }
      }
      if (existingFamily && existingFamily.user_id !== req.user.id) {
        // Partner already created a plan — return it via the GET logic
        const items = db.prepare(`SELECT mpi.*, r.name as recipe_name, r.image_url, r.cuisine, r.prep_time_minutes, r.cook_time_minutes, r.nutrition, r.ingredients, r.instructions, r.servings as recipe_servings
          FROM meal_plan_items mpi LEFT JOIN recipes r ON r.id = mpi.recipe_id 
          WHERE mpi.meal_plan_id = ? AND (mpi.user_id IS NULL OR mpi.user_id = ?)
          ORDER BY mpi.day_of_week`).all(existingFamily.id, req.user.id);

        const responseItems = items.map(i => {
          const sf = i.scale_factor || 1.0;
          const isCustom = !!i.custom_name && !i.recipe_id;
          const nutrition = isCustom ? parseJSON(i.custom_nutrition, {}) : parseJSON(i.nutrition, {});
          return {
            ...i,
            recipe_name: isCustom ? i.custom_name : (i.recipe_name || i.custom_name || 'Unknown'),
            nutrition: { calories: Math.round((nutrition.calories || 0) * sf), protein: Math.round((nutrition.protein || 0) * sf), carbs: Math.round((nutrition.carbs || 0) * sf), fat: Math.round((nutrition.fat || 0) * sf), fiber: Math.round((nutrition.fiber || 0) * sf) },
            ingredients: isCustom ? [] : parseJSON(i.ingredients, []),
            instructions: parseJSON(i.instructions, []),
            locked: !!i.locked,
            is_user_provided: !!i.is_user_provided,
            scale_factor: sf,
            is_shared: true,
          };
        });
        return res.json({ plan: { ...existingFamily, isSharedPlan: true }, items: responseItems, isSharedPlan: true, message: `${existingFamily.created_by_name || 'Your partner'} already created a plan for this week — showing their shared plan.` });
      }
    }

    const dietPrefs = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(req.user.id) || {};
    const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id) || {};
    const ingredientPrefs = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(req.user.id) || {};
    const cuisinePrefs = db.prepare('SELECT * FROM user_cuisine_preferences WHERE user_id = ?').get(req.user.id) || {};
    const mealStructure = db.prepare('SELECT * FROM user_meal_structure WHERE user_id = ?').get(req.user.id) || { breakfast: 1, lunch: 1, dinner: 1, snacks: 0 };

    const profile = db.prepare('SELECT household_size FROM users WHERE id = ?').get(req.user.id);
    const householdSize = profile?.household_size || 1;

    const preferences = { userId: req.user.id, diets: dietPrefs, macros, ingredients: ingredientPrefs, cuisines: cuisinePrefs, mealStructure, householdSize };
    const generatedItems = await generateMealPlan(preferences);

    // Delete existing personal plan for this week
    const existing = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(req.user.id, weekStart);
    if (existing) {
      db.prepare('DELETE FROM meal_plan_items WHERE meal_plan_id = ?').run(existing.id);
      db.prepare('DELETE FROM meal_plans WHERE id = ?').run(existing.id);
    }

    // If user is the creator of an existing family plan for this week, replace it
    if (userInfo?.family_id) {
      const existingFamily = db.prepare('SELECT id FROM meal_plans WHERE family_id = ? AND week_start_date = ? AND user_id = ?').get(userInfo.family_id, weekStart, req.user.id);
      if (existingFamily && (!existing || existingFamily.id !== existing?.id)) {
        db.prepare('DELETE FROM meal_plan_overrides WHERE meal_plan_id = ?').run(existingFamily.id);
        db.prepare('DELETE FROM meal_plan_items WHERE meal_plan_id = ?').run(existingFamily.id);
        db.prepare('DELETE FROM meal_plans WHERE id = ?').run(existingFamily.id);
      }
    }

    const planId = uuidv4();
    // Tag with family_id so partner sees the same plan
    db.prepare('INSERT INTO meal_plans (id, user_id, week_start_date, family_id, created_by_name) VALUES (?, ?, ?, ?, ?)').run(planId, req.user.id, weekStart, userInfo?.family_id || null, userInfo?.name || null);

    const insert = db.prepare('INSERT INTO meal_plan_items (id, meal_plan_id, day_of_week, meal_type, recipe_id, servings, scale_factor) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const item of generatedItems) {
      insert.run(uuidv4(), planId, item.dayOfWeek, item.mealType, item.recipeId, item.servings || 1, item.scaleFactor || 1.0);
    }

    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(planId);
    const items = db.prepare(`SELECT mpi.*, r.name as recipe_name, r.image_url, r.cuisine, r.prep_time_minutes, r.cook_time_minutes, r.nutrition, r.ingredients, r.instructions, r.servings as recipe_servings
      FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.meal_plan_id = ? ORDER BY mpi.day_of_week`).all(planId);

    const responseItems = items.map(i => {
      const sf = i.scale_factor || 1.0;
      const nutrition = parseJSON(i.nutrition, {});
      return {
        ...i,
        nutrition: {
          calories: Math.round((nutrition.calories || 0) * sf),
          protein: Math.round((nutrition.protein || 0) * sf),
          carbs: Math.round((nutrition.carbs || 0) * sf),
          fat: Math.round((nutrition.fat || 0) * sf),
          fiber: Math.round((nutrition.fiber || 0) * sf),
        },
        ingredients: parseJSON(i.ingredients, []),
        instructions: parseJSON(i.instructions, []),
        locked: !!i.locked,
        scale_factor: sf,
      };
    });
    res.json({ plan, items: responseItems });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/plan/:planId/items/:itemId', (req, res) => {
  try {
    const { planId, itemId } = req.params;
    const plan = userCanAccessPlan(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });

    const { recipeId, locked, servings } = req.body;
    if (recipeId !== undefined) db.prepare('UPDATE meal_plan_items SET recipe_id = ? WHERE id = ?').run(recipeId, itemId);
    if (locked !== undefined) db.prepare('UPDATE meal_plan_items SET locked = ? WHERE id = ?').run(locked ? 1 : 0, itemId);
    if (servings !== undefined) db.prepare('UPDATE meal_plan_items SET servings = ? WHERE id = ?').run(servings, itemId);
    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/meals/copy — copy a meal to other days
router.post('/copy', (req, res) => {
  try {
    const { planId, recipeId, dayOfWeek, mealType } = req.body;
    if (!planId || !recipeId) return res.status(400).json({ error: 'planId and recipeId required' });
    
    const plan = userCanAccessPlan(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    // Check if same recipe already exists for this day/meal
    const existing = db.prepare('SELECT id FROM meal_plan_items WHERE meal_plan_id = ? AND day_of_week = ? AND meal_type = ?')
      .get(planId, dayOfWeek, mealType);
    
    if (existing) {
      // Update existing slot
      db.prepare('UPDATE meal_plan_items SET recipe_id = ? WHERE id = ?').run(recipeId, existing.id);
    } else {
      // Insert new
      const { v4: uuidv4 } = require('uuid');
      db.prepare('INSERT INTO meal_plan_items (id, meal_plan_id, day_of_week, meal_type, recipe_id, servings) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), planId, dayOfWeek, mealType, recipeId, 1);
    }

    res.json({ success: true });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/regenerate-slot', (req, res) => {
  try {
    const { planId, itemId } = req.body;
    const plan = userCanAccessPlan(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });

    const item = db.prepare('SELECT * FROM meal_plan_items WHERE id = ? AND meal_plan_id = ?').get(itemId, planId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Get user dietary restrictions to enforce during regeneration
    const dietPrefs = db.prepare('SELECT restrictions FROM user_diet_preferences WHERE user_id = ?').get(req.user.id);
    const restrictions = dietPrefs?.restrictions ? (typeof dietPrefs.restrictions === 'string' ? JSON.parse(dietPrefs.restrictions) : dietPrefs.restrictions) : [];

    const usedIds = db.prepare('SELECT recipe_id FROM meal_plan_items WHERE meal_plan_id = ? AND id != ?').all(planId, itemId).map(r => r.recipe_id);
    const allRecipes = db.prepare('SELECT id, ingredients, name FROM recipes WHERE meal_type = ?').all(item.meal_type);
    
    // Load disliked ingredients
    const ingredientPrefs = db.prepare('SELECT disliked_ingredients FROM user_ingredient_preferences WHERE user_id = ?').get(req.user.id);
    const dislikedIngredients = ingredientPrefs ? parseJSON(ingredientPrefs.disliked_ingredients, []) : [];
    
    // Helper: check if recipe contains disliked ingredients
    const hasDisliked = (recipe) => {
      if (dislikedIngredients.length === 0) return false;
      const ings = parseJSON(recipe.ingredients, []);
      const name = (recipe.name || '').toLowerCase();
      return dislikedIngredients.some(d => {
        const dl = d.toLowerCase();
        return name.includes(dl) || ings.some(ing => ing.name?.toLowerCase().includes(dl));
      });
    };
    
    // Filter by restrictions, disliked ingredients, AND exclude used/current recipes
    let candidates = allRecipes
      .filter(r => !usedIds.includes(r.id) && r.id !== item.recipe_id)
      .filter(r => recipePassesRestrictions(r, restrictions))
      .filter(r => !hasDisliked(r));
    
    // If no candidates after filtering, allow reuse but still enforce restrictions + disliked
    if (candidates.length === 0) {
      candidates = allRecipes
        .filter(r => r.id !== item.recipe_id)
        .filter(r => recipePassesRestrictions(r, restrictions))
        .filter(r => !hasDisliked(r));
    }
    
    const pick = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;

    if (pick) db.prepare('UPDATE meal_plan_items SET recipe_id = ? WHERE id = ?').run(pick.id, itemId);

    const updated = db.prepare(`SELECT mpi.*, r.name as recipe_name, r.image_url, r.cuisine, r.prep_time_minutes, r.cook_time_minutes, r.nutrition, r.ingredients, r.instructions, r.servings as recipe_servings
      FROM meal_plan_items mpi JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.id = ?`).get(itemId);
    const sf = updated.scale_factor || 1.0;
    const rawNutrition = parseJSON(updated.nutrition, {});
    res.json({ item: {
      ...updated,
      nutrition: {
        calories: Math.round((rawNutrition.calories || 0) * sf),
        protein: Math.round((rawNutrition.protein || 0) * sf),
        carbs: Math.round((rawNutrition.carbs || 0) * sf),
        fat: Math.round((rawNutrition.fat || 0) * sf),
        fiber: Math.round((rawNutrition.fiber || 0) * sf),
      },
      ingredients: parseJSON(updated.ingredients, []),
      instructions: parseJSON(updated.instructions, []),
      locked: !!updated.locked,
      scale_factor: sf,
    } });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/meals/generate-joint — Joint Plan: user provides some meals, AI fills the rest
router.post('/generate-joint', async (req, res) => {
  try {
    const { weekStart, prefilled } = req.body;
    if (!weekStart) return res.status(400).json({ error: 'weekStart required' });
    if (!prefilled || !Array.isArray(prefilled) || prefilled.length === 0) {
      return res.status(400).json({ error: 'At least one prefilled meal is required for joint plan' });
    }

    // ── Family guard: don't overwrite partner's plan ──
    const userInfo = db.prepare('SELECT family_id, name FROM users WHERE id = ?').get(req.user.id);
    if (userInfo?.family_id) {
      let existingFamily = db.prepare('SELECT * FROM meal_plans WHERE family_id = ? AND week_start_date = ? ORDER BY created_at ASC LIMIT 1').get(userInfo.family_id, weekStart);
      // Also check untagged plans from other family members
      if (!existingFamily) {
        const familyMembers = db.prepare('SELECT user_id FROM family_members WHERE family_id = ?').all(userInfo.family_id);
        const otherMemberIds = familyMembers.map(m => m.user_id).filter(id => id !== req.user.id);
        if (otherMemberIds.length > 0) {
          const ph = otherMemberIds.map(() => '?').join(',');
          existingFamily = db.prepare(`SELECT * FROM meal_plans WHERE user_id IN (${ph}) AND week_start_date = ? AND family_id IS NULL ORDER BY created_at ASC LIMIT 1`).get(...otherMemberIds, weekStart);
          if (existingFamily) {
            db.prepare('UPDATE meal_plans SET family_id = ? WHERE id = ?').run(userInfo.family_id, existingFamily.id);
            existingFamily.family_id = userInfo.family_id;
          }
        }
      }
      if (existingFamily && existingFamily.user_id !== req.user.id) {
        return res.status(409).json({ error: `${existingFamily.created_by_name || 'Your partner'} already created a plan for this week. View their shared plan instead.` });
      }
    }

    const dietPrefs = db.prepare('SELECT * FROM user_diet_preferences WHERE user_id = ?').get(req.user.id) || {};
    const macros = db.prepare('SELECT * FROM user_macros WHERE user_id = ?').get(req.user.id) || {};
    const ingredientPrefs = db.prepare('SELECT * FROM user_ingredient_preferences WHERE user_id = ?').get(req.user.id) || {};
    const cuisinePrefs = db.prepare('SELECT * FROM user_cuisine_preferences WHERE user_id = ?').get(req.user.id) || {};
    const mealStructure = db.prepare('SELECT * FROM user_meal_structure WHERE user_id = ?').get(req.user.id) || { breakfast: 1, lunch: 1, dinner: 1, snacks: 0 };

    const profile = db.prepare('SELECT household_size FROM users WHERE id = ?').get(req.user.id);
    const householdSize = profile?.household_size || 1;

    const preferences = { userId: req.user.id, diets: dietPrefs, macros, ingredients: ingredientPrefs, cuisines: cuisinePrefs, mealStructure, householdSize };

    // Generate AI meals for empty slots, considering prefilled nutrition
    const generatedItems = await generateJointPlan(preferences, prefilled);

    // Delete existing plan for this week
    const existing = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(req.user.id, weekStart);
    if (existing) {
      db.prepare('DELETE FROM meal_plan_items WHERE meal_plan_id = ?').run(existing.id);
      db.prepare('DELETE FROM meal_plans WHERE id = ?').run(existing.id);
    }

    // If user is the creator of an existing family plan for this week, replace it
    if (userInfo?.family_id) {
      const existingFamily = db.prepare('SELECT id FROM meal_plans WHERE family_id = ? AND week_start_date = ? AND user_id = ?').get(userInfo.family_id, weekStart, req.user.id);
      if (existingFamily && (!existing || existingFamily.id !== existing?.id)) {
        db.prepare('DELETE FROM meal_plan_overrides WHERE meal_plan_id = ?').run(existingFamily.id);
        db.prepare('DELETE FROM meal_plan_items WHERE meal_plan_id = ?').run(existingFamily.id);
        db.prepare('DELETE FROM meal_plans WHERE id = ?').run(existingFamily.id);
      }
    }

    const planId = uuidv4();
    db.prepare("INSERT INTO meal_plans (id, user_id, week_start_date, plan_mode, family_id, created_by_name) VALUES (?, ?, ?, 'joint', ?, ?)").run(planId, req.user.id, weekStart, userInfo?.family_id || null, userInfo?.name || null);

    // Insert prefilled (user-provided) meals first
    const insertFull = db.prepare('INSERT INTO meal_plan_items (id, meal_plan_id, day_of_week, meal_type, recipe_id, servings, scale_factor, is_user_provided, locked, custom_name, custom_nutrition) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const pf of prefilled) {
      insertFull.run(
        uuidv4(), planId, pf.dayOfWeek, pf.mealType,
        pf.recipeId || null, pf.servings || 1, 1.0,
        1, 1, // is_user_provided=1, locked=1
        pf.customName || null,
        pf.customNutrition ? JSON.stringify(pf.customNutrition) : null
      );
    }

    // Insert AI-generated meals
    const insertGen = db.prepare('INSERT INTO meal_plan_items (id, meal_plan_id, day_of_week, meal_type, recipe_id, servings, scale_factor, is_user_provided) VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
    for (const item of generatedItems) {
      insertGen.run(uuidv4(), planId, item.dayOfWeek, item.mealType, item.recipeId, item.servings || 1, item.scaleFactor || 1.0);
    }

    // Fetch the complete plan
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(planId);
    const items = db.prepare(`SELECT mpi.*, r.name as recipe_name, r.image_url, r.cuisine, r.prep_time_minutes, r.cook_time_minutes, r.nutrition, r.ingredients, r.instructions, r.servings as recipe_servings
      FROM meal_plan_items mpi LEFT JOIN recipes r ON r.id = mpi.recipe_id WHERE mpi.meal_plan_id = ? ORDER BY mpi.day_of_week`).all(planId);

    const responseItems = items.map(i => {
      const isCustom = !!i.custom_name && !i.recipe_id;
      const sf = i.scale_factor || 1.0;
      const nutrition = isCustom ? parseJSON(i.custom_nutrition, {}) : parseJSON(i.nutrition, {});
      return {
        ...i,
        recipe_name: isCustom ? i.custom_name : (i.recipe_name || i.custom_name || 'Unknown'),
        nutrition: {
          calories: Math.round((nutrition.calories || 0) * sf),
          protein: Math.round((nutrition.protein || 0) * sf),
          carbs: Math.round((nutrition.carbs || 0) * sf),
          fat: Math.round((nutrition.fat || 0) * sf),
          fiber: Math.round((nutrition.fiber || 0) * sf),
        },
        ingredients: isCustom ? [] : parseJSON(i.ingredients, []),
        instructions: parseJSON(i.instructions, []),
        locked: !!i.locked,
        is_user_provided: !!i.is_user_provided,
        scale_factor: sf,
      };
    });
    res.json({ plan, items: responseItems });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// Helper: check if user owns or is in the family of a plan
function userCanAccessPlan(planId, userId) {
  const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(planId);
  if (!plan) return null;
  if (plan.user_id === userId) return plan;
  // Check if user is in the same family
  if (plan.family_id) {
    const user = db.prepare('SELECT family_id FROM users WHERE id = ?').get(userId);
    if (user?.family_id === plan.family_id) return plan;
  }
  return null;
}

// POST /api/meals/skip — skip a meal (remove from plan)
router.post('/skip', (req, res) => {
  try {
    const { planId, itemId } = req.body;
    const plan = userCanAccessPlan(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });

    db.prepare('DELETE FROM meal_plan_items WHERE id = ? AND meal_plan_id = ?').run(itemId, planId);
    res.json({ success: true, skippedItemId: itemId });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/meals/override — create a personal override for a shared meal (just for this user)
router.post('/override', (req, res) => {
  try {
    const { planId, itemId, recipeName, recipeId, nutrition } = req.body;
    if (!planId || !itemId) return res.status(400).json({ error: 'planId and itemId required' });

    const plan = userCanAccessPlan(planId, req.user.id);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    // Check item exists
    const item = db.prepare('SELECT id FROM meal_plan_items WHERE id = ? AND meal_plan_id = ?').get(itemId, planId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Upsert override
    const existing = db.prepare('SELECT id FROM meal_plan_overrides WHERE meal_plan_id = ? AND original_item_id = ? AND user_id = ?')
      .get(planId, itemId, req.user.id);

    if (existing) {
      db.prepare('UPDATE meal_plan_overrides SET recipe_id = ?, custom_name = ?, custom_nutrition = ? WHERE id = ?')
        .run(recipeId || null, recipeName || null, nutrition ? JSON.stringify(nutrition) : null, existing.id);
    } else {
      db.prepare('INSERT INTO meal_plan_overrides (id, meal_plan_id, original_item_id, user_id, recipe_id, custom_name, custom_nutrition) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), planId, itemId, req.user.id, recipeId || null, recipeName || null, nutrition ? JSON.stringify(nutrition) : null);
    }

    res.json({ success: true, message: 'Personal override saved' });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/meals/override — remove a personal override (revert to shared meal)
router.post('/remove-override', (req, res) => {
  try {
    const { planId, itemId } = req.body;
    if (!planId || !itemId) return res.status(400).json({ error: 'planId and itemId required' });

    db.prepare('DELETE FROM meal_plan_overrides WHERE meal_plan_id = ? AND original_item_id = ? AND user_id = ?')
      .run(planId, itemId, req.user.id);

    res.json({ success: true, message: 'Override removed, reverted to shared meal' });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Clone previous week's plan into a new week ──
router.post('/clone', (req, res) => {
  try {
    const userId = req.user.id;
    const { sourceWeekStart, targetWeekStart } = req.body;
    if (!sourceWeekStart || !targetWeekStart) return res.status(400).json({ error: 'sourceWeekStart and targetWeekStart required' });

    // Find the source plan (own or family)
    let sourcePlan = db.prepare('SELECT * FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(userId, sourceWeekStart);
    if (!sourcePlan) {
      const user = db.prepare('SELECT family_id FROM users WHERE id = ?').get(userId);
      if (user?.family_id) {
        sourcePlan = db.prepare('SELECT * FROM meal_plans WHERE family_id = ? AND week_start_date = ?').get(user.family_id, sourceWeekStart);
      }
    }
    if (!sourcePlan) return res.status(404).json({ error: 'Source plan not found' });

    const sourceItems = db.prepare(`
      SELECT mpi.*, r.name as recipe_name, r.nutrition, r.cuisine, r.image_url, r.ingredients as recipe_ingredients,
             r.instructions as recipe_instructions, r.meal_type as recipe_meal_type, r.servings as recipe_servings,
             r.prep_time_minutes, r.cook_time_minutes, r.diet_tags, r.description as recipe_description
      FROM meal_plan_items mpi LEFT JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = ?
    `).all(sourcePlan.id);

    if (!sourceItems.length) return res.status(404).json({ error: 'Source plan has no items' });

    // Delete existing plan for target week
    const existingTarget = db.prepare('SELECT id FROM meal_plans WHERE user_id = ? AND week_start_date = ?').get(userId, targetWeekStart);
    if (existingTarget) {
      db.prepare('DELETE FROM meal_plan_items WHERE meal_plan_id = ?').run(existingTarget.id);
      db.prepare('DELETE FROM meal_plans WHERE id = ?').run(existingTarget.id);
    }

    // Create new plan
    const planId = uuidv4();
    const userInfo = db.prepare('SELECT name, family_id FROM users WHERE id = ?').get(userId);
    db.prepare('INSERT INTO meal_plans (id, user_id, week_start_date, plan_mode, family_id, created_by_name) VALUES (?, ?, ?, ?, ?, ?)')
      .run(planId, userId, targetWeekStart, sourcePlan.plan_mode || 'full', userInfo?.family_id || null, userInfo?.name || null);

    // Clone items
    const insertItem = db.prepare('INSERT INTO meal_plan_items (id, meal_plan_id, day_of_week, meal_type, recipe_id, locked, servings, scale_factor, is_user_provided, custom_name, custom_nutrition) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const item of sourceItems) {
      insertItem.run(uuidv4(), planId, item.day_of_week, item.meal_type, item.recipe_id, 0, item.servings, item.scale_factor || 1.0, item.is_user_provided || 0, item.custom_name || null, item.custom_nutrition || null);
    }

    // Fetch the new plan with full details
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(planId);
    const items = db.prepare(`
      SELECT mpi.*, r.name as recipe_name, r.nutrition, r.cuisine, r.image_url, r.ingredients as recipe_ingredients,
             r.instructions as recipe_instructions, r.meal_type as recipe_meal_type, r.servings as recipe_servings,
             r.prep_time_minutes, r.cook_time_minutes, r.diet_tags, r.description as recipe_description
      FROM meal_plan_items mpi LEFT JOIN recipes r ON r.id = mpi.recipe_id
      WHERE mpi.meal_plan_id = ? ORDER BY mpi.day_of_week, mpi.meal_type
    `).all(planId);

    res.json({ plan, items });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
