const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
let aiService;
try { aiService = require('./aiService'); } catch(e) { aiService = null; }

// ── Restriction rules ──
const RESTRICTION_EXCLUDE_RULES = {
  'Vegan': {
    exactExcludes: ['chicken','beef','pork','turkey','lamb','salmon','shrimp','tuna','fish','steak','ribeye','bacon','ham','sausage','cod','tilapia','anchovy','crab','lobster','ground beef','ground chicken','ground turkey','ground meat','chicken breast','chicken thigh','prawn','prawns','goat','duck','venison','bison','rabbit','veal','scallop','scallops','squid','octopus','clam','clams','mussel','mussels','oyster','oysters','meat','liver','bone','broth','lard','gelatin','suet','dripping','worcestershire'],
    standaloneExcludes: ['egg','eggs','egg whites','milk','butter','cream','heavy cream','sour cream','cheese','parmesan','parmesan cheese','mozzarella','cheddar','cheddar cheese','feta','feta cheese','goat cheese','cream cheese','cottage cheese','yogurt','greek yogurt','honey'],
    safeCompounds: ['almond milk','coconut milk','oat milk','soy milk','rice milk','cashew milk','peanut butter','almond butter','cashew butter','sunflower butter','coconut butter','coconut cream','cream of tartar','nutritional yeast'],
  },
  'Vegetarian': {
    exactExcludes: ['chicken','beef','pork','turkey','lamb','salmon','shrimp','tuna','fish','steak','ribeye','bacon','ham','sausage','cod','tilapia','anchovy','crab','lobster','ground beef','ground chicken','ground turkey','ground meat','chicken breast','chicken thigh','prawn','prawns','goat','duck','venison','bison','rabbit','veal','scallop','scallops','squid','octopus','clam','clams','mussel','mussels','oyster','oysters','meat','liver','bone broth','lard','suet'],
    standaloneExcludes: [], safeCompounds: [],
  },
  'Pescatarian': {
    exactExcludes: ['chicken','beef','pork','turkey','lamb','steak','ribeye','bacon','ham','sausage','ground beef','ground chicken','ground turkey','ground meat','chicken breast','chicken thigh','goat','duck','venison','bison','rabbit','veal','liver','lard','suet'],
    standaloneExcludes: [], safeCompounds: [],
  },
  'Gluten-Free': {
    exactExcludes: ['couscous','barley','crouton','ciabatta','naan'],
    standaloneExcludes: ['pasta','penne pasta','bread','sourdough bread','flour','soy sauce','noodles'],
    safeCompounds: ['rice noodles','gluten-free pasta','corn tortillas','gluten-free bread'],
  },
  'Dairy-Free': {
    exactExcludes: [],
    standaloneExcludes: ['milk','butter','cream','heavy cream','sour cream','cheese','parmesan','parmesan cheese','mozzarella','cheddar','cheddar cheese','feta','feta cheese','goat cheese','cream cheese','cottage cheese','yogurt','greek yogurt'],
    safeCompounds: ['almond milk','coconut milk','oat milk','soy milk','rice milk','cashew milk','peanut butter','almond butter','cashew butter','coconut butter','coconut cream'],
  },
};

function parseJSON(v, d) { try { return v ? JSON.parse(v) : d; } catch { return d; } }

function ingredientViolatesRestriction(ingredientName, restriction) {
  const rules = RESTRICTION_EXCLUDE_RULES[restriction];
  if (!rules) return false;
  const name = ingredientName.toLowerCase().trim();
  if (rules.safeCompounds && rules.safeCompounds.some(safe => name.includes(safe))) return false;
  if (rules.exactExcludes.some(exc => name.includes(exc))) return true;
  if (rules.standaloneExcludes.some(exc => name === exc || name === `${exc}s` || name.startsWith(`${exc} `) || name.endsWith(` ${exc}`) || name.startsWith(`${exc}s `) || name.endsWith(` ${exc}s`))) return true;
  return false;
}

function recipePassesRestrictions(recipe, restrictions) {
  if (!restrictions || restrictions.length === 0) return true;
  const recipeIngredients = parseJSON(recipe.ingredients, []);
  for (const restriction of restrictions) {
    for (const ing of recipeIngredients) {
      if (ingredientViolatesRestriction(ing.name, restriction)) return false;
    }
  }
  return true;
}

// ── Macro-proportional targets per meal type ──
// These represent what fraction of daily macros each meal should aim for
const MEAL_MACRO_PROPORTIONS = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.05,
};

/**
 * Score a recipe based on how well its nutrition fits the target macros for this meal slot.
 * Lower score = better fit. Score of 0 = perfect match.
 * Uses normalized percentage deviation across all macros.
 */
function scoreRecipeNutrition(recipeNutrition, targetMacros) {
  if (!targetMacros || !targetMacros.calories) return 0;

  const n = recipeNutrition || {};
  if (!n.calories || n.calories === 0) return 10; // Penalize recipes with no nutrition data

  // Score based on MACRO RATIOS, not absolute values
  // This way, when we scale by calories, all macros scale proportionally
  // Calculate protein/carb/fat as percentage of calories
  const targetProtPct = targetMacros.protein ? (targetMacros.protein * 4) / targetMacros.calories : 0;
  const targetCarbPct = targetMacros.carbs ? (targetMacros.carbs * 4) / targetMacros.calories : 0;
  const targetFatPct = targetMacros.fat ? (targetMacros.fat * 9) / targetMacros.calories : 0;

  const recipeProtPct = n.protein ? (n.protein * 4) / n.calories : 0;
  const recipeCarbPct = n.carbs ? (n.carbs * 4) / n.calories : 0;
  const recipeFatPct = n.fat ? (n.fat * 9) / n.calories : 0;

  let totalDeviation = 0;

  // Protein ratio deviation (weighted 3x — most important)
  if (targetProtPct > 0) totalDeviation += Math.abs(recipeProtPct - targetProtPct) / targetProtPct * 3;
  // Carb ratio deviation
  if (targetCarbPct > 0) totalDeviation += Math.abs(recipeCarbPct - targetCarbPct) / targetCarbPct;
  // Fat ratio deviation
  if (targetFatPct > 0) totalDeviation += Math.abs(recipeFatPct - targetFatPct) / targetFatPct;

  return totalDeviation / 5; // Normalize
}

/**
 * Score recipe for variety — penalize if cuisine or key ingredients repeat too much
 */
function scoreVariety(recipe, usedCuisines, usedRecipeIds) {
  let penalty = 0;
  const cuisine = recipe.cuisine || 'Unknown';
  const cuisineCount = usedCuisines[cuisine] || 0;
  if (cuisineCount >= 2) penalty += 0.3; // Penalize 3rd+ use of same cuisine
  if (cuisineCount >= 3) penalty += 0.5;
  return penalty;
}

// ── Dynamic recipe fetching from TheMealDB ──
const MEALDB_SEARCH_TERMS_VEGAN = {
  breakfast: ['porridge', 'fruit', 'smoothie', 'toast', 'pancake'],
  lunch: ['salad', 'soup', 'rice', 'pasta', 'lentil'],
  dinner: ['curry', 'stew', 'rice', 'pasta', 'soup', 'noodle'],
  snack: ['fruit', 'nuts', 'hummus'],
};

const MEALDB_SEARCH_TERMS = {
  breakfast: ['omelette', 'pancake', 'porridge', 'smoothie', 'toast', 'muffin', 'fruit'],
  lunch: ['salad', 'soup', 'sandwich', 'wrap', 'bowl', 'rice', 'pasta'],
  dinner: ['curry', 'stir fry', 'roasted', 'grilled', 'stew', 'baked', 'noodle', 'risotto', 'tacos'],
  snack: ['hummus', 'fruit', 'nuts', 'energy', 'dip'],
};

async function fetchAndCacheFromInternet(mealType, restrictions) {
  // Use vegan-friendly search terms if restrictions include Vegan or Vegetarian
  const isVeganOrVeg = restrictions.some(r => ['Vegan', 'Vegetarian'].includes(r));
  const termSet = isVeganOrVeg ? MEALDB_SEARCH_TERMS_VEGAN : MEALDB_SEARCH_TERMS;
  const searchTerms = termSet[mealType] || termSet.dinner;
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.meals) return [];

    const newRecipes = [];
    for (const m of data.meals) {
      const extId = `mealdb-${m.idMeal}`;
      const existing = db.prepare('SELECT id FROM recipes WHERE source = ? AND external_id = ?').get('themealdb', extId);
      if (existing) {
        newRecipes.push(existing);
        continue;
      }

      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
        const name = m[`strIngredient${i}`];
        const measure = m[`strMeasure${i}`];
        if (name && name.trim()) {
          ingredients.push({ name: name.trim(), quantity: 1, unit: (measure || '').trim(), category: 'Other' });
        }
      }

      const recipe = {
        id: uuidv4(),
        source: 'themealdb',
        external_id: extId,
        name: m.strMeal,
        description: (m.strInstructions || '').slice(0, 200),
        cuisine: m.strArea || null,
        diet_tags: JSON.stringify(m.strTags ? m.strTags.split(',').map(t => t.trim().toLowerCase()) : []),
        meal_type: mealType,
        ingredients: JSON.stringify(ingredients),
        instructions: JSON.stringify(m.strInstructions ? m.strInstructions.split('\r\n').filter(Boolean).slice(0, 10) : []),
        nutrition: JSON.stringify({ calories: 400, protein: 20, carbs: 40, fat: 15 }),
        image_url: m.strMealThumb || null,
        prep_time_minutes: 15,
        cook_time_minutes: 30,
        servings: 4,
      };

      try {
        db.prepare('INSERT INTO recipes (id, source, external_id, name, description, cuisine, diet_tags, meal_type, ingredients, instructions, nutrition, image_url, prep_time_minutes, cook_time_minutes, servings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(recipe.id, recipe.source, recipe.external_id, recipe.name, recipe.description, recipe.cuisine, recipe.diet_tags, recipe.meal_type, recipe.ingredients, recipe.instructions, recipe.nutrition, recipe.image_url, recipe.prep_time_minutes, recipe.cook_time_minutes, recipe.servings);
        newRecipes.push({ id: recipe.id, ingredients: recipe.ingredients });
      } catch (e) { /* duplicate, skip */ }
    }

    return newRecipes.filter(r => {
      const fullRecipe = db.prepare('SELECT id, ingredients FROM recipes WHERE id = ?').get(r.id);
      return fullRecipe && recipePassesRestrictions(fullRecipe, restrictions);
    });
  } catch (error) {
    console.error('TheMealDB fetch error:', error.message);
    return [];
  }
}

/**
 * Generate a nutrition-optimized weekly meal plan.
 * 
 * Algorithm:
 * 1. Calculate per-meal macro targets based on daily targets and meal proportions
 * 2. For each day, track running macro totals
 * 3. For the last meal of each day, adjust target to fill the gap (ensures daily totals are close)
 * 4. Score all candidate recipes by nutrition fit + variety + diet preference
 * 5. Pick the best-scoring recipe (with some randomness to avoid monotony)
 */
async function generateMealPlan(preferences) {
  const { diets, macros, ingredients, cuisines, mealStructure, householdSize = 1 } = preferences;

  const mealTypes = [];
  if (mealStructure.breakfast) mealTypes.push('breakfast');
  if (mealStructure.lunch) mealTypes.push('lunch');
  if (mealStructure.dinner) mealTypes.push('dinner');
  if (mealStructure.snacks) mealTypes.push('snack');

  // Daily macro targets from user preferences
  const dailyTargets = {
    calories: macros?.calories || 2000,
    protein: macros?.protein_g || 150,
    carbs: macros?.carbs_g || 200,
    fat: macros?.fat_g || 67,
  };

  // Recalculate proportions based on active meal types
  const activePropTotal = mealTypes.reduce((sum, mt) => sum + (MEAL_MACRO_PROPORTIONS[mt] || 0.25), 0);
  const normalizedProportions = {};
  for (const mt of mealTypes) {
    normalizedProportions[mt] = (MEAL_MACRO_PROPORTIONS[mt] || 0.25) / activePropTotal;
  }

  console.log(`🍽️  Generating optimized meal plan: ${mealTypes.join(', ')} for ${householdSize} people`);
  console.log(`📊 Daily targets (per person): ${dailyTargets.calories} cal, ${dailyTargets.protein}g P, ${dailyTargets.carbs}g C, ${dailyTargets.fat}g F`);

  const items = [];
  const usedRecipeIds = new Set();
  const usedCuisines = {};
  let restrictions = parseJSON(diets.restrictions, []);
  const dietPrefs = parseJSON(diets.diets, []);
  
  // Safety: if restrictions came through empty but diets obj has them as a raw string, re-parse
  if (restrictions.length === 0 && typeof diets.restrictions === 'string' && diets.restrictions !== '[]') {
    try { restrictions = JSON.parse(diets.restrictions); } catch {}
  }
  
  console.log(`🔒 Dietary restrictions: ${restrictions.length > 0 ? restrictions.join(', ') : 'NONE'}`);
  console.log(`🥗 Diet preferences: ${dietPrefs.length > 0 ? dietPrefs.join(', ') : 'NONE'}`);
  console.log(`📋 Raw diets object: ${JSON.stringify(diets).slice(0, 200)}`);
  
  // NUCLEAR SAFETY: If restrictions say Vegan/Vegetarian, verify by checking some known meat recipes
  if (restrictions.includes('Vegan') || restrictions.includes('Vegetarian')) {
    console.log(`⚠️ VEGAN/VEGETARIAN mode active — all meat recipes will be excluded`);
  }

  // Pre-fetch some fresh recipes from the internet for variety
  for (const mt of mealTypes) {
    try { await fetchAndCacheFromInternet(mt, restrictions); } catch (e) { /* non-fatal */ }
  }

  // Pre-load all recipes with nutrition data
  const recipeCache = {};
  for (const mt of mealTypes) {
    recipeCache[mt] = db.prepare('SELECT id, cuisine, diet_tags, ingredients, nutrition FROM recipes WHERE meal_type = ?').all(mt);
  }

  for (let day = 0; day < 7; day++) {
    // Track running daily nutrition totals
    const dayTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

    for (let mealIdx = 0; mealIdx < mealTypes.length; mealIdx++) {
      const mealType = mealTypes[mealIdx];
      const isLastMeal = mealIdx === mealTypes.length - 1;

      // Calculate target for this meal slot
      let mealTarget;
      if (isLastMeal) {
        // Last meal of the day: fill the gap to reach daily targets
        mealTarget = {
          calories: Math.max(100, dailyTargets.calories - dayTotals.calories),
          protein: Math.max(5, dailyTargets.protein - dayTotals.protein),
          carbs: Math.max(5, dailyTargets.carbs - dayTotals.carbs),
          fat: Math.max(2, dailyTargets.fat - dayTotals.fat),
        };
      } else {
        // Proportional target for this meal type
        mealTarget = {
          calories: dailyTargets.calories * normalizedProportions[mealType],
          protein: dailyTargets.protein * normalizedProportions[mealType],
          carbs: dailyTargets.carbs * normalizedProportions[mealType],
          fat: dailyTargets.fat * normalizedProportions[mealType],
        };
      }

      const allRecipes = recipeCache[mealType] || [];
      let candidates = allRecipes.filter(r => !usedRecipeIds.has(r.id));

      // Apply dietary restrictions — STRICT enforcement
      if (restrictions.length > 0) {
        const beforeCount = candidates.length;
        candidates = candidates.filter(recipe => recipePassesRestrictions(recipe, restrictions));
        console.log(`    ${mealType}: ${beforeCount} candidates → ${candidates.length} after restriction filter (${restrictions.join(', ')})`);
      }

      // Fallback: allow reuse if no unused candidates, but STILL enforce restrictions
      if (candidates.length === 0) {
        candidates = allRecipes.filter(recipe => recipePassesRestrictions(recipe, restrictions));
        console.log(`    ${mealType}: Fallback to all recipes → ${candidates.length} after restrictions`);
      }

      if (candidates.length === 0) continue;

      // Score each candidate
      const scored = candidates.map(recipe => {
        const nutrition = parseJSON(recipe.nutrition, {});
        const tags = parseJSON(recipe.diet_tags, []).map(t => t.toLowerCase());

        // Nutrition fit score (lower = better, 0 = perfect)
        const nutritionScore = scoreRecipeNutrition(nutrition, mealTarget);

        // Variety penalty
        const varietyPenalty = scoreVariety(recipe, usedCuisines, usedRecipeIds);

        // Diet preference bonus (negative = bonus)
        let dietBonus = 0;
        if (dietPrefs.length > 0) {
          const matches = dietPrefs.some(d => tags.includes(d.toLowerCase()));
          if (matches) dietBonus = -0.15; // Bonus for matching preferred diet
        }

        // Total score (lower = better)
        const totalScore = nutritionScore + varietyPenalty + dietBonus;

        return { recipe, totalScore, nutrition };
      }).sort((a, b) => a.totalScore - b.totalScore);

      // Pick from top 3 to maintain some variety (weighted toward #1)
      const topN = Math.min(3, scored.length);
      const weights = [0.6, 0.25, 0.15]; // Probability weights for top 3
      let roll = Math.random();
      let pickIdx = 0;
      for (let i = 0; i < topN; i++) {
        roll -= weights[i];
        if (roll <= 0) { pickIdx = i; break; }
      }

      const pick = scored[pickIdx];
      if (pick) {
        usedRecipeIds.add(pick.recipe.id);
        const cuisine = pick.recipe.cuisine || 'Unknown';
        usedCuisines[cuisine] = (usedCuisines[cuisine] || 0) + 1;

        const n = pick.nutrition;
        const servings = householdSize;
        const scaleFactor = 1.0;

        // Update daily running totals
        dayTotals.calories += n.calories || 0;
        dayTotals.protein += n.protein || 0;
        dayTotals.carbs += n.carbs || 0;
        dayTotals.fat += n.fat || 0;

        items.push({ dayOfWeek: day, mealType, recipeId: pick.recipe.id, servings, scaleFactor });
      }
    }

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    console.log(`  ${days[day]}: ${dayTotals.calories} cal/person, ${dayTotals.protein}g P, ${dayTotals.carbs}g C, ${dayTotals.fat}g F (${householdSize} servings each meal)`);
  }

  console.log(`✅ Generated ${items.length} meals, now AI-optimizing...`);

  // AI Post-Optimization: Ask AI to adjust ingredient quantities per day to hit exact targets
  if (aiService && aiService.isConfigured()) {
    try {
      const optimizedItems = await aiOptimizeDailyPlan(items, dailyTargets, recipeCache, mealTypes);
      console.log(`🤖 AI optimization complete`);
      return optimizedItems;
    } catch (err) {
      console.error('AI optimization failed, using base plan:', err.message);
    }
  }

  return items;
}

/**
 * Use AI to adjust ingredient quantities and nutrition for each day
 * to precisely hit the user's macro targets
 */
async function aiOptimizeDailyPlan(items, dailyTargets, recipeCache, mealTypes) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Group items by day
  const dayGroups = {};
  for (const item of items) {
    if (!dayGroups[item.dayOfWeek]) dayGroups[item.dayOfWeek] = [];
    dayGroups[item.dayOfWeek].push(item);
  }

  const optimizedItems = [];

  for (const [dayIdx, dayItems] of Object.entries(dayGroups)) {
    // Get full recipe details for this day
    const dayRecipes = dayItems.map(item => {
      const allMealRecipes = recipeCache[item.mealType] || [];
      const recipe = allMealRecipes.find(r => r.id === item.recipeId);
      const nutrition = recipe ? parseJSON(recipe.nutrition, {}) : {};
      return {
        ...item,
        recipeName: recipe ? (db.prepare('SELECT name FROM recipes WHERE id = ?').get(item.recipeId)?.name || 'Unknown') : 'Unknown',
        nutrition,
      };
    });

    const currentTotal = {
      calories: dayRecipes.reduce((s, r) => s + (r.nutrition.calories || 0), 0),
      protein: dayRecipes.reduce((s, r) => s + (r.nutrition.protein || 0), 0),
      carbs: dayRecipes.reduce((s, r) => s + (r.nutrition.carbs || 0), 0),
      fat: dayRecipes.reduce((s, r) => s + (r.nutrition.fat || 0), 0),
    };

    try {
      const response = await aiService.chatCompletion([
        {
          role: 'system',
          content: `You are a precision meal plan optimizer. Your ONLY job is to compute scale factors that make the daily totals EXACTLY match the targets.

CRITICAL RULES:
- Return ONLY a JSON array of numbers, e.g.: [1.1, 0.9, 1.2]
- One scale factor per meal, in order
- Scale factors between 0.5 and 2.0
- After scaling: sum(meal_cal × factor) MUST be within 3% of calorie target
- After scaling: sum(meal_protein × factor) MUST be within 10% of protein target
- After scaling: sum(meal_carbs × factor) MUST be within 10% of carb target
- After scaling: sum(meal_fat × factor) MUST be within 15% of fat target
- Protein accuracy is MOST important — get it as close as possible
- This plan needs to achieve Grade A when evaluated against these specific targets`
        },
        {
          role: 'user',
          content: `EXACT daily targets to hit:
- Calories: ${dailyTargets.calories}
- Protein: ${dailyTargets.protein}g
- Carbs: ${dailyTargets.carbs}g
- Fat: ${dailyTargets.fat}g

${days[dayIdx]} meals (per serving, unscaled):
${dayRecipes.map((r, i) => `${i + 1}. ${r.recipeName} (${r.mealType}): ${r.nutrition.calories} cal, ${r.nutrition.protein}g P, ${r.nutrition.carbs}g C, ${r.nutrition.fat}g F`).join('\n')}

Unscaled total: ${currentTotal.calories} cal, ${currentTotal.protein}g P, ${currentTotal.carbs}g C, ${currentTotal.fat}g F

Compute scale factors so the scaled totals match the targets as closely as possible. Return JSON array only.`
        }
      ], { temperature: 0.1, maxTokens: 100 });

      // Parse AI response
      const scaleFactors = JSON.parse(response.trim());

      if (Array.isArray(scaleFactors) && scaleFactors.length === dayItems.length) {
        for (let i = 0; i < dayItems.length; i++) {
          const sf = Math.max(0.5, Math.min(2.0, scaleFactors[i] || 1.0));
          optimizedItems.push({
            ...dayItems[i],
            scaleFactor: Math.round(sf * 10) / 10,
          });
        }
        const scaledCal = dayRecipes.reduce((s, r, i) => s + (r.nutrition.calories || 0) * scaleFactors[i], 0);
        const scaledProt = dayRecipes.reduce((s, r, i) => s + (r.nutrition.protein || 0) * scaleFactors[i], 0);
        console.log(`  ${days[dayIdx]}: AI optimized → ${Math.round(scaledCal)} cal, ${Math.round(scaledProt)}g P`);
        continue;
      }
    } catch (err) {
      console.error(`  ${days[dayIdx]}: AI failed (${err.message}), using defaults`);
    }

    // Fallback: use items as-is
    optimizedItems.push(...dayItems);
  }

  return optimizedItems;
}

module.exports = { generateMealPlan, recipePassesRestrictions };