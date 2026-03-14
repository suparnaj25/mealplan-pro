/**
 * Nutritionix API Integration
 * Free tier: 50 requests/day
 * Provides USDA-verified nutrition data
 */

const NUTRITIONIX_APP_ID = () => process.env.NUTRITIONIX_APP_ID;
const NUTRITIONIX_APP_KEY = () => process.env.NUTRITIONIX_APP_KEY;

function isConfigured() {
  return !!(NUTRITIONIX_APP_ID() && NUTRITIONIX_APP_KEY());
}

// Natural Language endpoint — "grilled chicken breast with rice"
async function getNutrition(query) {
  if (!isConfigured()) return null;
  
  try {
    const res = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
      method: 'POST',
      headers: {
        'x-app-id': NUTRITIONIX_APP_ID(),
        'x-app-key': NUTRITIONIX_APP_KEY(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.foods?.length) return null;

    // Sum all identified foods
    let total = { calories: 0, protein: 0, carbs: 0, fat: 0, items: [] };
    for (const food of data.foods) {
      total.calories += Math.round(food.nf_calories || 0);
      total.protein += Math.round(food.nf_protein || 0);
      total.carbs += Math.round(food.nf_total_carbohydrate || 0);
      total.fat += Math.round(food.nf_total_fat || 0);
      total.items.push({
        name: food.food_name,
        calories: Math.round(food.nf_calories || 0),
        protein: Math.round(food.nf_protein || 0),
        carbs: Math.round(food.nf_total_carbohydrate || 0),
        fat: Math.round(food.nf_total_fat || 0),
        serving: `${food.serving_qty} ${food.serving_unit}`,
        photo: food.photo?.thumb,
      });
    }

    return total;
  } catch (error) {
    console.error('Nutritionix error:', error.message);
    return null;
  }
}

// Instant search — autocomplete for food names
async function searchFoods(query) {
  if (!isConfigured()) return [];

  try {
    const res = await fetch(`https://trackapi.nutritionix.com/v2/search/instant?query=${encodeURIComponent(query)}`, {
      headers: { 'x-app-id': NUTRITIONIX_APP_ID(), 'x-app-key': NUTRITIONIX_APP_KEY() },
    });
    if (!res.ok) return [];
    const data = await res.json();

    return [...(data.common || []).slice(0, 5), ...(data.branded || []).slice(0, 3)].map(f => ({
      name: f.food_name || f.brand_name_item_name,
      brand: f.brand_name || '',
      photo: f.photo?.thumb,
      source: f.brand_name ? 'branded' : 'common',
    }));
  } catch { return []; }
}

module.exports = { isConfigured, getNutrition, searchFoods };