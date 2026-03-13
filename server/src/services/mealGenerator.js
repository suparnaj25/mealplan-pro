const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

// ── Restriction rules ──
const RESTRICTION_EXCLUDE_RULES = {
  'Vegan': {
    exactExcludes: ['chicken','beef','pork','turkey','lamb','salmon','shrimp','tuna','fish','steak','ribeye','bacon','ham','sausage','cod','tilapia','anchovy','crab','lobster','ground beef','ground chicken','ground turkey','ground meat','chicken breast','chicken thigh'],
    standaloneExcludes: ['egg','eggs','egg whites','milk','butter','cream','heavy cream','sour cream','cheese','parmesan','parmesan cheese','mozzarella','cheddar','cheddar cheese','feta','feta cheese','goat cheese','cream cheese','cottage cheese','yogurt','greek yogurt','honey'],
    safeCompounds: ['almond milk','coconut milk','oat milk','soy milk','rice milk','cashew milk','peanut butter','almond butter','cashew butter','sunflower butter','coconut butter','coconut cream','cream of tartar','nutritional yeast'],
  },
  'Vegetarian': {
    exactExcludes: ['chicken','beef','pork','turkey','lamb','salmon','shrimp','tuna','fish','steak','ribeye','bacon','ham','sausage','cod','tilapia','anchovy','crab','lobster','ground beef','ground chicken','ground turkey','ground meat','chicken breast','chicken thigh'],
    standaloneExcludes: [], safeCompounds: [],
  },
  'Pescatarian': {
    exactExcludes: ['chicken','beef','pork','turkey','lamb','steak','ribeye','bacon','ham','sausage','ground beef','ground chicken','ground turkey','ground meat','chicken breast','chicken thigh'],
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
  if (!targetMacros || !targetMacros.calories) return 0; // No targets = all equal

  const n = recipeNutrition || {};
  let totalDeviation = 0;
  let factors = 0;

  // Calorie fit (most important — weight 2x)
  if (targetMacros.calories > 0 && n.calories) {
    const calDev = Math.abs(n.calories - targetMacros.calories) / targetMacros.calories;
    totalDeviation += calDev * 2;
    factors += 2;
  }

  // Protein fit (critical for fitness goals — weight 3x)
  if (targetMacros.protein > 0 && n.protein) {
    const protDev = Math.abs(n.protein - targetMacros.protein) / targetMacros.protein;
    totalDeviation += protDev * 3;
    factors += 3;
  }

  // Carbs fit
  if (targetMacros.carbs > 0 && n.carbs) {
    const carbDev = Math.abs(n.carbs - targetMacros.carbs) / targetMacros.carbs;
    totalDeviation += carbDev;
    factors += 1;
  }

  // Fat fit
  if (targetMacros.fat > 0 && n.fat) {
    const fatDev = Math.abs(n.fat - targetMacros.fat) / targetMacros.fat;
    totalDeviation += fatDev;
    factors += 1;
  }

  return factors > 0 ? totalDeviation / factors : 0;
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
const MEALDB_SEARCH_TERMS = {
  breakfast: ['omelette', 'pancake', 'porridge', 'smoothie', 'toast', 'muffin', 'fruit'],
  lunch: ['salad', 'soup', 'sandwich', 'wrap', 'bowl', 'rice', 'pasta'],
  dinner: ['curry', 'stir fry', 'roasted', 'grilled', 'stew', 'baked', 'noodle', 'risotto', 'tacos'],
  snack: ['hummus', 'fruit', 'nuts', 'energy', 'dip'],
};

async function fetchAndCacheFromInternet(mealType, restrictions) {
  const searchTerms = MEALDB_SEARCH_TERMS[mealType] || MEALDB_SEARCH_TERMS.dinner;
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
  const restrictions = parseJSON(diets.restrictions, []);
  const dietPrefs = parseJSON(diets.diets, []);

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

      // Apply dietary restrictions
      if (restrictions.length > 0) {
        candidates = candidates.filter(recipe => recipePassesRestrictions(recipe, restrictions));
      }

      // Fallback: allow reuse if no unused candidates
      if (candidates.length === 0) {
        candidates = allRecipes.filter(recipe => recipePassesRestrictions(recipe, restrictions));
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

        // Calculate scale factor using a weighted blend of calorie and protein targets
        // Protein is weighted higher because it's harder to hit without explicit scaling
        const n = pick.nutrition;
        const servings = householdSize;
        let scaleFactor = 1.0;
        if (n.calories && n.calories > 0) {
          const calScale = mealTarget.calories ? mealTarget.calories / n.calories : 1.0;
          const protScale = (mealTarget.protein && n.protein && n.protein > 0) ? mealTarget.protein / n.protein : calScale;
          // Blend: 40% calorie-based, 60% protein-based (prioritize protein fit)
          scaleFactor = calScale * 0.4 + protScale * 0.6;
          // Clamp between 0.5x and 2.5x to keep recipes reasonable
          scaleFactor = Math.max(0.5, Math.min(2.5, scaleFactor));
          // Round to 1 decimal place
          scaleFactor = Math.round(scaleFactor * 10) / 10;
        }

        // Update daily running totals (per-person, scaled)
        dayTotals.calories += (n.calories || 0) * scaleFactor;
        dayTotals.protein += (n.protein || 0) * scaleFactor;
        dayTotals.carbs += (n.carbs || 0) * scaleFactor;
        dayTotals.fat += (n.fat || 0) * scaleFactor;

        items.push({ dayOfWeek: day, mealType, recipeId: pick.recipe.id, servings, scaleFactor });
      }
    }

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    console.log(`  ${days[day]}: ${dayTotals.calories} cal/person, ${dayTotals.protein}g P, ${dayTotals.carbs}g C, ${dayTotals.fat}g F (${householdSize} servings each meal)`);
  }

  console.log(`✅ Generated ${items.length} optimized meals`);
  return items;
}

module.exports = { generateMealPlan, recipePassesRestrictions };