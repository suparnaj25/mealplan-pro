/**
 * Shared nutrition estimation from ingredient lists.
 * Used by: mealGenerator.js, TheMealDB adapter, user recipe sync.
 * 
 * Values are approximate per typical recipe quantity for one ingredient entry,
 * divided by 4 servings (since most recipes serve 4).
 */

const INGREDIENT_MACROS = {
  // Proteins
  'chicken breast': { cal: 80, p: 16, c: 0, f: 2 },
  'chicken thigh': { cal: 65, p: 10, c: 0, f: 3 },
  'chicken': { cal: 55, p: 10, c: 0, f: 1.5 },
  'ground beef': { cal: 70, p: 8, c: 0, f: 4 },
  'beef': { cal: 70, p: 8, c: 0, f: 4 },
  'steak': { cal: 80, p: 10, c: 0, f: 4 },
  'pork': { cal: 65, p: 8, c: 0, f: 3.5 },
  'lamb': { cal: 70, p: 8, c: 0, f: 4 },
  'turkey': { cal: 45, p: 9, c: 0, f: 1 },
  'ground turkey': { cal: 50, p: 9, c: 0, f: 2 },
  'salmon': { cal: 55, p: 8, c: 0, f: 3 },
  'shrimp': { cal: 30, p: 7, c: 0, f: 0.5 },
  'tuna': { cal: 40, p: 9, c: 0, f: 0.5 },
  'cod': { cal: 30, p: 7, c: 0, f: 0.5 },
  'fish': { cal: 40, p: 8, c: 0, f: 1 },
  'tilapia': { cal: 35, p: 7, c: 0, f: 0.5 },
  'bacon': { cal: 45, p: 3, c: 0, f: 3.5 },
  'sausage': { cal: 75, p: 4, c: 0.5, f: 6.5 },
  'egg': { cal: 35, p: 3, c: 0.5, f: 2.5 },
  'eggs': { cal: 70, p: 6, c: 1, f: 5 },
  'tofu': { cal: 25, p: 3, c: 1, f: 1.5 },
  'tempeh': { cal: 80, p: 10, c: 4, f: 4.5 },
  'lentils': { cal: 30, p: 2.5, c: 5, f: 0 },
  'chickpeas': { cal: 35, p: 2, c: 6, f: 0.5 },
  'black beans': { cal: 30, p: 2, c: 5, f: 0 },
  'kidney beans': { cal: 30, p: 2, c: 5, f: 0 },
  'edamame': { cal: 30, p: 3, c: 2.5, f: 1.5 },
  // Grains & Starches
  'rice': { cal: 55, p: 1, c: 12, f: 0 },
  'jasmine rice': { cal: 55, p: 1, c: 12, f: 0 },
  'brown rice': { cal: 55, p: 1.5, c: 11, f: 0.5 },
  'quinoa': { cal: 40, p: 2, c: 7, f: 1 },
  'pasta': { cal: 55, p: 2, c: 11, f: 0.5 },
  'spaghetti': { cal: 55, p: 2, c: 11, f: 0.5 },
  'noodles': { cal: 50, p: 2, c: 10, f: 0.5 },
  'rice noodles': { cal: 50, p: 0.5, c: 12, f: 0 },
  'bread': { cal: 35, p: 1.5, c: 7, f: 0.5 },
  'sourdough bread': { cal: 35, p: 1.5, c: 7, f: 0.5 },
  'flour': { cal: 25, p: 1, c: 5, f: 0 },
  'potato': { cal: 40, p: 1, c: 9, f: 0 },
  'sweet potato': { cal: 35, p: 0.5, c: 8, f: 0 },
  'oats': { cal: 40, p: 2, c: 7, f: 1.5 },
  'rolled oats': { cal: 40, p: 2, c: 7, f: 1.5 },
  'tortilla': { cal: 30, p: 1, c: 5, f: 1 },
  'tortillas': { cal: 60, p: 2, c: 10, f: 2 },
  'couscous': { cal: 45, p: 1.5, c: 9, f: 0 },
  // Dairy
  'greek yogurt': { cal: 30, p: 5, c: 2, f: 1 },
  'yogurt': { cal: 20, p: 1.5, c: 2.5, f: 0.5 },
  'cheese': { cal: 30, p: 2, c: 0.5, f: 2.5 },
  'feta': { cal: 25, p: 1.5, c: 0.5, f: 2 },
  'mozzarella': { cal: 30, p: 2, c: 0.5, f: 2.5 },
  'parmesan': { cal: 20, p: 2, c: 0, f: 1.5 },
  'cheddar': { cal: 30, p: 2, c: 0.5, f: 2.5 },
  'cream cheese': { cal: 25, p: 0.5, c: 0.5, f: 2.5 },
  'cottage cheese': { cal: 25, p: 3.5, c: 1, f: 1 },
  'milk': { cal: 15, p: 1, c: 1.5, f: 0.5 },
  'butter': { cal: 25, p: 0, c: 0, f: 3 },
  'cream': { cal: 25, p: 0.5, c: 0.5, f: 2.5 },
  'heavy cream': { cal: 40, p: 0.5, c: 0.5, f: 4 },
  'sour cream': { cal: 15, p: 0.5, c: 0.5, f: 1.5 },
  // Vegetables
  'onion': { cal: 8, p: 0.2, c: 2, f: 0 },
  'garlic': { cal: 3, p: 0, c: 0.5, f: 0 },
  'tomato': { cal: 8, p: 0.3, c: 1.5, f: 0 },
  'tomatoes': { cal: 12, p: 0.5, c: 2.5, f: 0 },
  'bell pepper': { cal: 8, p: 0.3, c: 1.5, f: 0 },
  'carrot': { cal: 8, p: 0.2, c: 2, f: 0 },
  'carrots': { cal: 12, p: 0.3, c: 3, f: 0 },
  'spinach': { cal: 5, p: 0.5, c: 0.5, f: 0 },
  'broccoli': { cal: 8, p: 0.5, c: 1.5, f: 0 },
  'mushroom': { cal: 5, p: 0.5, c: 0.5, f: 0 },
  'mushrooms': { cal: 8, p: 0.8, c: 1, f: 0 },
  'celery': { cal: 3, p: 0, c: 0.5, f: 0 },
  'cucumber': { cal: 4, p: 0.2, c: 1, f: 0 },
  'lettuce': { cal: 3, p: 0.2, c: 0.5, f: 0 },
  'zucchini': { cal: 5, p: 0.3, c: 1, f: 0 },
  'cabbage': { cal: 5, p: 0.3, c: 1, f: 0 },
  'corn': { cal: 20, p: 0.5, c: 4, f: 0.5 },
  'peas': { cal: 15, p: 1, c: 2.5, f: 0 },
  'avocado': { cal: 40, p: 0.5, c: 2, f: 4 },
  'kale': { cal: 8, p: 0.5, c: 1.5, f: 0 },
  'asparagus': { cal: 8, p: 0.5, c: 1.5, f: 0 },
  // Oils & Fats
  'olive oil': { cal: 30, p: 0, c: 0, f: 3.5 },
  'oil': { cal: 30, p: 0, c: 0, f: 3.5 },
  'sesame oil': { cal: 30, p: 0, c: 0, f: 3.5 },
  'coconut oil': { cal: 30, p: 0, c: 0, f: 3.5 },
  'coconut milk': { cal: 30, p: 0.5, c: 1, f: 3 },
  'coconut cream': { cal: 35, p: 0.5, c: 1, f: 3.5 },
  'peanut butter': { cal: 25, p: 1, c: 1, f: 2 },
  'almond butter': { cal: 25, p: 1, c: 1, f: 2 },
  // Sauces & Condiments
  'soy sauce': { cal: 3, p: 0.5, c: 0.5, f: 0 },
  'honey': { cal: 15, p: 0, c: 4, f: 0 },
  'maple syrup': { cal: 13, p: 0, c: 3.5, f: 0 },
  'sugar': { cal: 15, p: 0, c: 4, f: 0 },
  'vinegar': { cal: 2, p: 0, c: 0, f: 0 },
  'tomato sauce': { cal: 10, p: 0.5, c: 2, f: 0 },
  'tomato paste': { cal: 5, p: 0.3, c: 1, f: 0 },
  'salsa': { cal: 5, p: 0.2, c: 1, f: 0 },
  'pesto': { cal: 30, p: 1, c: 0.5, f: 3 },
  'tahini': { cal: 22, p: 1, c: 1, f: 2 },
  'hummus': { cal: 25, p: 1, c: 2.5, f: 1.5 },
  'teriyaki sauce': { cal: 8, p: 0.3, c: 1.5, f: 0 },
  'curry paste': { cal: 5, p: 0.2, c: 1, f: 0.2 },
  // Nuts & Seeds
  'almonds': { cal: 20, p: 1, c: 0.5, f: 1.5 },
  'walnuts': { cal: 20, p: 0.5, c: 0.5, f: 2 },
  'cashews': { cal: 20, p: 0.5, c: 1, f: 1.5 },
  'sesame seeds': { cal: 15, p: 0.5, c: 0.5, f: 1.5 },
  'chia seeds': { cal: 15, p: 0.5, c: 1.5, f: 1 },
  // Fruits
  'banana': { cal: 25, p: 0.3, c: 6, f: 0 },
  'apple': { cal: 15, p: 0, c: 4, f: 0 },
  'lemon': { cal: 3, p: 0, c: 1, f: 0 },
  'lime': { cal: 3, p: 0, c: 1, f: 0 },
  'berries': { cal: 10, p: 0.2, c: 2.5, f: 0 },
  'blueberries': { cal: 10, p: 0.2, c: 2.5, f: 0 },
  'mango': { cal: 25, p: 0.3, c: 6, f: 0 },
  'coconut': { cal: 20, p: 0.5, c: 1, f: 2 },
  // Spices (negligible)
  'salt': { cal: 0, p: 0, c: 0, f: 0 },
  'pepper': { cal: 0, p: 0, c: 0, f: 0 },
  'black pepper': { cal: 0, p: 0, c: 0, f: 0 },
  'cumin': { cal: 1, p: 0, c: 0, f: 0 },
  'paprika': { cal: 1, p: 0, c: 0, f: 0 },
  'cinnamon': { cal: 1, p: 0, c: 0, f: 0 },
  'turmeric': { cal: 1, p: 0, c: 0, f: 0 },
  'parsley': { cal: 1, p: 0, c: 0, f: 0 },
  'cilantro': { cal: 1, p: 0, c: 0, f: 0 },
  'basil': { cal: 1, p: 0, c: 0, f: 0 },
  'oregano': { cal: 1, p: 0, c: 0, f: 0 },
  'thyme': { cal: 1, p: 0, c: 0, f: 0 },
  'rosemary': { cal: 1, p: 0, c: 0, f: 0 },
  'ginger': { cal: 2, p: 0, c: 0.5, f: 0 },
  'chili': { cal: 2, p: 0, c: 0.5, f: 0 },
  'chili powder': { cal: 1, p: 0, c: 0, f: 0 },
  'curry powder': { cal: 1, p: 0, c: 0, f: 0 },
  'garam masala': { cal: 1, p: 0, c: 0, f: 0 },
  // Other
  'vegetable broth': { cal: 4, p: 0.2, c: 0.5, f: 0 },
  'chicken broth': { cal: 4, p: 0.3, c: 0.3, f: 0 },
  'protein powder': { cal: 30, p: 6, c: 1, f: 0.3 },
  'nutritional yeast': { cal: 10, p: 1.5, c: 1, f: 0.2 },
};

/**
 * Estimate per-serving nutrition from an ingredient list.
 * @param {Array} ingredients - Array of {name, quantity, unit} objects
 * @param {number} servings - Number of servings the recipe makes (default 4)
 * @returns {Object} {calories, protein, carbs, fat, fiber}
 */
function estimateNutritionFromIngredients(ingredients, servings = 4) {
  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0;

  for (const ing of ingredients) {
    const name = (ing.name || '').toLowerCase().trim();
    let matched = false;

    // Try longest key match first (e.g., "chicken breast" before "chicken")
    const sortedKeys = Object.keys(INGREDIENT_MACROS).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      if (name.includes(key) || key.includes(name)) {
        const macros = INGREDIENT_MACROS[key];
        totalCal += macros.cal;
        totalP += macros.p;
        totalC += macros.c;
        totalF += macros.f;
        matched = true;
        break;
      }
    }

    // Default for unmatched ingredients
    if (!matched) {
      totalCal += 15;
      totalP += 0.5;
      totalC += 2;
      totalF += 0.5;
    }
  }

  const result = {
    calories: Math.max(150, Math.round(totalCal)),
    protein: Math.max(5, Math.round(totalP)),
    carbs: Math.max(5, Math.round(totalC)),
    fat: Math.max(3, Math.round(totalF)),
    fiber: Math.round(ingredients.length * 0.5),
  };

  // Cross-validate: 4P + 4C + 9F should roughly equal calories
  const computedCal = result.protein * 4 + result.carbs * 4 + result.fat * 9;
  if (Math.abs(computedCal - result.calories) > result.calories * 0.3) {
    result.calories = computedCal;
  }

  return result;
}

module.exports = { estimateNutritionFromIngredients, INGREDIENT_MACROS };
