/**
 * Store Link Generator — Context-Aware
 * Generates deep links with organic preference, quantity context
 */

const STORE_CONFIGS = {
  amazon_wholefoods: {
    name: 'Amazon Fresh / Whole Foods',
    icon: '🛒',
    searchUrl: (query) => `https://www.amazon.com/s?k=${encodeURIComponent(query)}&i=wholefoods`,
    color: '#FF9900',
    tier: 'deep_link',
  },
  kroger: {
    name: 'Kroger',
    icon: '🏪',
    searchUrl: (query) => `https://www.kroger.com/search?query=${encodeURIComponent(query)}&searchType=default_search`,
    color: '#E35205',
    tier: 'full_cart',
  },
  walmart: {
    name: 'Walmart',
    icon: '🏬',
    searchUrl: (query) => `https://www.walmart.com/search?q=${encodeURIComponent(query)}`,
    color: '#0071CE',
    tier: 'deep_link',
  },
  instacart: {
    name: 'Instacart',
    icon: '🥕',
    searchUrl: (query) => `https://www.instacart.com/store/search/${encodeURIComponent(query)}`,
    color: '#43B02A',
    tier: 'deep_link',
  },
  target: {
    name: 'Target',
    icon: '🎯',
    searchUrl: (query) => `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}&category=5xt1a`,
    color: '#CC0000',
    tier: 'deep_link',
  },
  costco: {
    name: 'Costco',
    icon: '📦',
    searchUrl: (query) => `https://www.costco.com/CatalogSearch?dept=All&keyword=${encodeURIComponent(query)}`,
    color: '#E31837',
    tier: 'deep_link',
  },
  safeway: {
    name: 'Safeway',
    icon: '🛍️',
    searchUrl: (query) => `https://www.safeway.com/shop/search-results.html?q=${encodeURIComponent(query)}`,
    color: '#E8282B',
    tier: 'deep_link',
  },
  trader_joes: {
    name: "Trader Joe's",
    icon: '🌺',
    searchUrl: (query) => `https://www.traderjoes.com/home/search?q=${encodeURIComponent(query)}&section=products`,
    color: '#DA291C',
    tier: 'list_export',
  },
};

/**
 * Generate a context-aware store link
 * @param {string} store - store ID
 * @param {string} itemName - ingredient name
 * @param {object} options - { organicPreference, quantity, unit, budgetPreference }
 */
function generateStoreLink(store, itemName, options = {}) {
  const config = STORE_CONFIGS[store] || STORE_CONFIGS.amazon_wholefoods;
  const { organicPreference, quantity, unit } = options;

  // Build a context-aware search query
  let searchQuery = itemName;

  // Prepend "organic" if user prefers it
  if (organicPreference === 'always_organic' || organicPreference === 'prefer_organic') {
    searchQuery = `organic ${searchQuery}`;
  }

  return config.searchUrl(searchQuery);
}

function getStoreConfig(store) {
  return STORE_CONFIGS[store] || STORE_CONFIGS.amazon_wholefoods;
}

function getAllStores() {
  return Object.entries(STORE_CONFIGS).map(([key, config]) => ({
    id: key,
    name: config.name,
    icon: config.icon,
    color: config.color,
    tier: config.tier,
  }));
}

module.exports = { generateStoreLink, getStoreConfig, getAllStores };