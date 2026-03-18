/**
 * TheMealDB Recipe API Adapter (Free, no API key required)
 * Docs: https://www.themealdb.com/api.php
 */

const { estimateNutritionFromIngredients } = require('../nutritionEstimator');

async function searchRecipes(query, options = {}) {
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`);
    if (!res.ok) return { recipes: [], error: `API error ${res.status}` };
    const data = await res.json();

    const recipes = (data.meals || []).map(m => {
      const ingredients = [];
      for (let i = 1; i <= 20; i++) {
        const name = m[`strIngredient${i}`];
        const measure = m[`strMeasure${i}`];
        if (name && name.trim()) {
          ingredients.push({ name: name.trim(), quantity: 1, unit: (measure || '').trim(), category: 'Other' });
        }
      }

      // Estimate nutrition from actual ingredients instead of returning zeros
      const nutrition = estimateNutritionFromIngredients(ingredients, 4);

      return {
        source: 'themealdb',
        externalId: m.idMeal,
        name: m.strMeal,
        description: (m.strInstructions || '').slice(0, 200),
        cuisine: m.strArea || null,
        dietTags: m.strCategory ? [m.strCategory.toLowerCase()] : [],
        mealType: 'dinner',
        ingredients,
        instructions: m.strInstructions ? m.strInstructions.split('\r\n').filter(Boolean) : [],
        nutrition,
        imageUrl: m.strMealThumb || null,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        servings: 4,
      };
    });

    return { recipes, total: recipes.length };
  } catch (error) {
    return { recipes: [], error: error.message };
  }
}

module.exports = { searchRecipes, name: 'TheMealDB', id: 'themealdb' };
