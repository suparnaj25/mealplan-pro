/**
 * Spoonacular Recipe API Adapter
 * Docs: https://spoonacular.com/food-api
 */

async function searchRecipes(query, options = {}) {
  const apiKey = options.apiKey || process.env.SPOONACULAR_API_KEY;
  if (!apiKey) return { recipes: [], error: 'No API key configured' };

  const { diet, cuisine, number = 10 } = options;
  const params = new URLSearchParams({
    apiKey,
    query,
    number: String(number),
    addRecipeNutrition: 'true',
    addRecipeInstructions: 'true',
  });
  if (diet) params.append('diet', diet);
  if (cuisine) params.append('cuisine', cuisine);

  try {
    const res = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params}`);
    if (!res.ok) {
      const err = await res.json();
      return { recipes: [], error: err.message || `API error ${res.status}` };
    }
    const data = await res.json();

    const recipes = (data.results || []).map(r => ({
      source: 'spoonacular',
      externalId: String(r.id),
      name: r.title,
      description: r.summary?.replace(/<[^>]*>/g, '').slice(0, 200) || '',
      cuisine: r.cuisines?.[0] || null,
      dietTags: r.diets || [],
      mealType: r.dishTypes?.includes('breakfast') ? 'breakfast' : r.dishTypes?.includes('lunch') ? 'lunch' : r.dishTypes?.includes('snack') ? 'snack' : 'dinner',
      ingredients: (r.nutrition?.ingredients || []).map(i => ({
        name: i.name, quantity: i.amount, unit: i.unit, category: 'Other',
      })),
      instructions: r.analyzedInstructions?.[0]?.steps?.map(s => s.step) || [],
      nutrition: {
        calories: Math.round(r.nutrition?.nutrients?.find(n => n.name === 'Calories')?.amount || 0),
        protein: Math.round(r.nutrition?.nutrients?.find(n => n.name === 'Protein')?.amount || 0),
        carbs: Math.round(r.nutrition?.nutrients?.find(n => n.name === 'Carbohydrates')?.amount || 0),
        fat: Math.round(r.nutrition?.nutrients?.find(n => n.name === 'Fat')?.amount || 0),
        fiber: Math.round(r.nutrition?.nutrients?.find(n => n.name === 'Fiber')?.amount || 0),
      },
      imageUrl: r.image || null,
      prepTimeMinutes: r.preparationMinutes || null,
      cookTimeMinutes: r.cookingMinutes || r.readyInMinutes || null,
      servings: r.servings || 4,
    }));

    return { recipes, total: data.totalResults || recipes.length };
  } catch (error) {
    return { recipes: [], error: error.message };
  }
}

module.exports = { searchRecipes, name: 'Spoonacular', id: 'spoonacular' };