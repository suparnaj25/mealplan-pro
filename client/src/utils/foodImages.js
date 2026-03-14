// Dynamic recipe image fetcher — calls server API which uses Pexels/Unsplash
// Falls back to curated images for known keywords

const KEYWORD_IMAGES = {
  'salad': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop',
  'soup': 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=300&fit=crop',
  'pasta': 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=300&fit=crop',
  'curry': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=300&fit=crop',
  'stir fry': 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop',
  'smoothie': 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400&h=300&fit=crop',
  'toast': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=300&fit=crop',
  'bowl': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
  'taco': 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=300&fit=crop',
  'chicken': 'https://images.unsplash.com/photo-1598103442097-8b74f60b183f?w=400&h=300&fit=crop',
  'salmon': 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=300&fit=crop',
  'pizza': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop',
  'pancake': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop',
  'sushi': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&h=300&fit=crop',
  'noodle': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=300&fit=crop',
};

const MEAL_TYPE_FALLBACK = {
  'breakfast': 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&h=300&fit=crop',
  'lunch': 'https://images.unsplash.com/photo-1547592180-85f173990554?w=400&h=300&fit=crop',
  'dinner': 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400&h=300&fit=crop',
  'snack': 'https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=400&h=300&fit=crop',
};

// Cache for dynamically fetched images
const imageCache = {};

// Synchronous: returns a curated image or meal-type fallback instantly
export function getRecipeImage(recipeName, mealType) {
  // Check cache first
  if (recipeName && imageCache[recipeName]) return imageCache[recipeName];
  
  // Check keyword images
  if (recipeName) {
    const name = recipeName.toLowerCase();
    for (const [keyword, url] of Object.entries(KEYWORD_IMAGES)) {
      if (name.includes(keyword)) return url;
    }
  }
  
  return MEAL_TYPE_FALLBACK[mealType] || MEAL_TYPE_FALLBACK.dinner;
}

// Async: fetches a dynamic image from the API and caches it
export async function fetchRecipeImage(recipeName) {
  if (!recipeName) return null;
  if (imageCache[recipeName]) return imageCache[recipeName];
  
  // Check keywords first (no need to fetch)
  const name = recipeName.toLowerCase();
  for (const [keyword, url] of Object.entries(KEYWORD_IMAGES)) {
    if (name.includes(keyword)) { imageCache[recipeName] = url; return url; }
  }
  
  try {
    const res = await fetch(`/api/images/recipe?name=${encodeURIComponent(recipeName)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.url) { imageCache[recipeName] = data.url; return data.url; }
    }
  } catch {}
  return null;
}