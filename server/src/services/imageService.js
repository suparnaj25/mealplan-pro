/**
 * Image Service — Fetches real food photos from Unsplash
 * Free: 50 req/hour without API key using source.unsplash.com
 */

// Generate a deterministic Unsplash image URL for a recipe name
function getRecipeImageUrl(recipeName, width = 600, height = 400) {
  // Use Unsplash source (no API key needed, redirect-based)
  const query = encodeURIComponent(recipeName.replace(/[^a-zA-Z\s]/g, '').trim());
  return `https://source.unsplash.com/${width}x${height}/?food,${query}`;
}

// Curated food image collection with specific Unsplash photo IDs for common foods
const CURATED_IMAGES = {
  'breakfast': 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=600&h=400&fit=crop',
  'lunch': 'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&h=400&fit=crop',
  'dinner': 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=600&h=400&fit=crop',
  'snack': 'https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=600&h=400&fit=crop',
  'salad': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop',
  'soup': 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&h=400&fit=crop',
  'pasta': 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&h=400&fit=crop',
  'curry': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&h=400&fit=crop',
  'stir fry': 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&h=400&fit=crop',
  'smoothie': 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&h=400&fit=crop',
  'toast': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&h=400&fit=crop',
  'bowl': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=400&fit=crop',
  'tacos': 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=400&fit=crop',
  'rice': 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=600&h=400&fit=crop',
  'chicken': 'https://images.unsplash.com/photo-1598103442097-8b74f60b183f?w=600&h=400&fit=crop',
  'salmon': 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&h=400&fit=crop',
  'steak': 'https://images.unsplash.com/photo-1558030006-450675393462?w=600&h=400&fit=crop',
  'pizza': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=400&fit=crop',
  'burger': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=400&fit=crop',
  'pancake': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&h=400&fit=crop',
  'omelette': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&h=400&fit=crop',
  'quinoa': 'https://images.unsplash.com/photo-1505576399279-0d309fce0140?w=600&h=400&fit=crop',
  'tofu': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=400&fit=crop',
  'hummus': 'https://images.unsplash.com/photo-1577805947697-89e18249d767?w=600&h=400&fit=crop',
  'avocado': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&h=400&fit=crop',
  'sushi': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&h=400&fit=crop',
  'noodle': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&h=400&fit=crop',
  'wrap': 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=600&h=400&fit=crop',
};

function getBestImageForRecipe(recipeName, mealType) {
  const name = (recipeName || '').toLowerCase();
  
  // Check curated images first
  for (const [keyword, url] of Object.entries(CURATED_IMAGES)) {
    if (name.includes(keyword)) return url;
  }
  
  // Fall back to meal type
  if (CURATED_IMAGES[mealType]) return CURATED_IMAGES[mealType];
  
  // Dynamic Unsplash
  return getRecipeImageUrl(recipeName);
}

module.exports = { getRecipeImageUrl, getBestImageForRecipe, CURATED_IMAGES };