const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

// ── Restriction rules (unchanged) ──
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

// ── Dynamic recipe fetching from TheMealDB (free, no API key) ──
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

      // Cache in DB
      try {
        db.prepare('INSERT INTO recipes (id, source, external_id, name, description, cuisine, diet_tags, meal_type, ingredients, instructions, nutrition, image_url, prep_time_minutes, cook_time_minutes, servings) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(recipe.id, recipe.source, recipe.external_id, recipe.name, recipe.description, recipe.cuisine, recipe.diet_tags, recipe.meal_type, recipe.ingredients, recipe.instructions, recipe.nutrition, recipe.image_url, recipe.prep_time_minutes, recipe.cook_time_minutes, recipe.servings);
        newRecipes.push({ id: recipe.id, ingredients: recipe.ingredients });
      } catch (e) { /* duplicate, skip */ }
    }

    // Filter by restrictions
    return newRecipes.filter(r => {
      const fullRecipe = db.prepare('SELECT id, ingredients FROM recipes WHERE id = ?').get(r.id);
      return fullRecipe && recipePassesRestrictions(fullRecipe, restrictions);
    });
  } catch (error) {
    console.error('TheMealDB fetch error:', error.message);
    return [];
  }
}

async function generateMealPlan(preferences) {
  const { diets, macros, ingredients, cuisines, mealStructure } = preferences;

  const mealTypes = [];
  if (mealStructure.breakfast) mealTypes.push('breakfast');
  if (mealStructure.lunch) mealTypes.push('lunch');
  if (mealStructure.dinner) mealTypes.push('dinner');
  if (mealStructure.snacks) mealTypes.push('snack');

  const items = [];
  const usedRecipeIds = new Set();
  const restrictions = parseJSON(diets.restrictions, []);
  const dietPrefs = parseJSON(diets.diets, []);

  // Pre-fetch some fresh recipes from the internet for variety
  for (const mt of mealTypes) {
    try { await fetchAndCacheFromInternet(mt, restrictions); } catch (e) { /* non-fatal */ }
  }

  for (let day = 0; day < 7; day++) {
    for (const mealType of mealTypes) {
      // Get ALL recipes (local + newly cached from internet)
      const allRecipes = db.prepare('SELECT id, cuisine, diet_tags, ingredients FROM recipes WHERE meal_type = ?').all(mealType);

      let candidates = allRecipes.filter(r => !usedRecipeIds.has(r.id));

      if (restrictions.length > 0) {
        candidates = candidates.filter(recipe => recipePassesRestrictions(recipe, restrictions));
      }

      if (dietPrefs.length > 0 && candidates.length > 3) {
        const preferred = candidates.filter(r => {
          const tags = parseJSON(r.diet_tags, []).map(t => t.toLowerCase());
          return dietPrefs.some(d => tags.includes(d.toLowerCase()));
        });
        if (preferred.length > 0) candidates = preferred;
      }

      if (candidates.length === 0) {
        candidates = allRecipes;
        if (restrictions.length > 0) {
          candidates = candidates.filter(recipe => recipePassesRestrictions(recipe, restrictions));
        }
      }

      if (candidates.length === 0) continue;

      const recipe = candidates[Math.floor(Math.random() * candidates.length)];
      if (recipe) {
        usedRecipeIds.add(recipe.id);
        items.push({ dayOfWeek: day, mealType, recipeId: recipe.id, servings: 1 });
      }
    }
  }

  return items;
}

module.exports = { generateMealPlan, recipePassesRestrictions };