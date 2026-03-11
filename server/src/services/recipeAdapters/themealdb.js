/**
 * TheMealDB Recipe API Adapter (Free, no API key required)
 * Docs: https://www.themealdb.com/api.php
 */

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
        nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
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