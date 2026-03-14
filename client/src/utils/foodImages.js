// Curated Unsplash food images — real photos, no API key needed
const FOOD_IMAGES = {
  'salad': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop',
  'soup': 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=300&fit=crop',
  'pasta': 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=300&fit=crop',
  'curry': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=300&fit=crop',
  'stir': 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop',
  'smoothie': 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400&h=300&fit=crop',
  'toast': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=300&fit=crop',
  'bowl': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
  'taco': 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=300&fit=crop',
  'rice': 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=400&h=300&fit=crop',
  'chicken': 'https://images.unsplash.com/photo-1598103442097-8b74f60b183f?w=400&h=300&fit=crop',
  'salmon': 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=300&fit=crop',
  'steak': 'https://images.unsplash.com/photo-1558030006-450675393462?w=400&h=300&fit=crop',
  'pizza': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop',
  'burger': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop',
  'pancake': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop',
  'omelette': 'https://images.unsplash.com/photo-1510693206972-df098062cb71?w=400&h=300&fit=crop',
  'quinoa': 'https://images.unsplash.com/photo-1505576399279-0d309fce0140?w=400&h=300&fit=crop',
  'tofu': 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&h=300&fit=crop',
  'hummus': 'https://images.unsplash.com/photo-1577805947697-89e18249d767?w=400&h=300&fit=crop',
  'avocado': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=300&fit=crop',
  'sushi': 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&h=300&fit=crop',
  'noodle': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=300&fit=crop',
  'wrap': 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=300&fit=crop',
  'oat': 'https://images.unsplash.com/photo-1517673400267-0251440c45dc?w=400&h=300&fit=crop',
  'yogurt': 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=300&fit=crop',
  'egg': 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&h=300&fit=crop',
  'lentil': 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=300&fit=crop',
  'bean': 'https://images.unsplash.com/photo-1515516969-d4008c6b4215?w=400&h=300&fit=crop',
  'chili': 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=400&h=300&fit=crop',
  'bibimbap': 'https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=400&h=300&fit=crop',
  'pad thai': 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400&h=300&fit=crop',
  'poke': 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
  'burrito': 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=400&h=300&fit=crop',
  'shakshuka': 'https://images.unsplash.com/photo-1590412200988-a436970781fa?w=400&h=300&fit=crop',
  'tempeh': 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=400&h=300&fit=crop',
};

const MEAL_TYPE_IMAGES = {
  'breakfast': 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&h=300&fit=crop',
  'lunch': 'https://images.unsplash.com/photo-1547592180-85f173990554?w=400&h=300&fit=crop',
  'dinner': 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400&h=300&fit=crop',
  'snack': 'https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=400&h=300&fit=crop',
};

// Curated high-quality food photo IDs from Unsplash — used as a pool for deterministic assignment
const FOOD_PHOTO_POOL = [
  'photo-1546069901-ba9599a7e63c', 'photo-1504674900247-0877df9cc836', 'photo-1498837167922-ddd27525d352',
  'photo-1490645935967-10de6ba17061', 'photo-1512621776951-a57141f2eefd', 'photo-1473093295043-cdd812d0e601',
  'photo-1555939594-58d7cb561ad1', 'photo-1540189549336-e6e99c3679fe', 'photo-1565299585323-38d6b0865b47',
  'photo-1547592180-85f173990554', 'photo-1476224203421-9ac39bcb3327', 'photo-1499028344343-cd173ffc68a9',
  'photo-1606787366850-de6330128bfc', 'photo-1467003909585-2f8a72700288', 'photo-1565557623262-b51c2513a641',
  'photo-1603133872878-684f208fb84b', 'photo-1484723091739-30a097e8f929', 'photo-1529042410759-befb1204b468',
  'photo-1574484284002-952d92456975', 'photo-1482049016688-2d3e1b311543', 'photo-1551183053-bf91a1d81141',
  'photo-1493770348161-369560ae357d', 'photo-1505253716362-afaea1d3d1af', 'photo-1505576399279-0d309fce0140',
  'photo-1551024506-0bccd828d307', 'photo-1488477181946-6428a0291777', 'photo-1515516969-d4008c6b4215',
  'photo-1590412200988-a436970781fa', 'photo-1559314809-0d155014e29e', 'photo-1569718212165-3a8278d5f624',
];

// Deterministic hash of recipe name → consistent photo assignment
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return Math.abs(hash);
}

function getDynamicFoodImage(recipeName) {
  const idx = hashString(recipeName) % FOOD_PHOTO_POOL.length;
  return `https://images.unsplash.com/${FOOD_PHOTO_POOL[idx]}?w=400&h=300&fit=crop&auto=format`;
}

export function getRecipeImage(recipeName, mealType) {
  if (!recipeName) return MEAL_TYPE_IMAGES[mealType] || MEAL_TYPE_IMAGES.dinner;
  const name = recipeName.toLowerCase();
  
  // 1. Check curated images first (instant, guaranteed quality)
  for (const [keyword, url] of Object.entries(FOOD_IMAGES)) {
    if (name.includes(keyword)) return url;
  }
  
  // 2. Dynamic Unsplash source for ANY recipe (real photo, matched to recipe name)
  return getDynamicFoodImage(recipeName);
}
