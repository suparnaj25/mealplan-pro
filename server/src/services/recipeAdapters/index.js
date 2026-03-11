/**
 * Recipe Adapter Registry
 * Provides a unified interface to search across multiple recipe APIs
 */

const spoonacular = require('./spoonacular');
const themealdb = require('./themealdb');

const ADAPTERS = {
  spoonacular,
  themealdb,
};

/**
 * Search recipes across enabled external sources
 * @param {string} query - search term
 * @param {Array} enabledSources - [{sourceName, apiKey, enabled}]
 * @param {object} options - {diet, cuisine, number}
 */
async function searchExternalRecipes(query, enabledSources = [], options = {}) {
  const results = [];
  const errors = [];

  const promises = enabledSources
    .filter(s => s.enabled !== false && ADAPTERS[s.sourceName || s.source_name])
    .map(async (source) => {
      const adapter = ADAPTERS[source.sourceName || source.source_name];
      try {
        const result = await adapter.searchRecipes(query, {
          ...options,
          apiKey: source.apiKey || source.api_key,
        });
        if (result.error) errors.push({ source: adapter.id, error: result.error });
        return result.recipes || [];
      } catch (err) {
        errors.push({ source: adapter.id, error: err.message });
        return [];
      }
    });

  const allResults = await Promise.all(promises);
  for (const recipes of allResults) {
    results.push(...recipes);
  }

  return { recipes: results, errors };
}

function getAvailableAdapters() {
  return Object.values(ADAPTERS).map(a => ({ id: a.id, name: a.name }));
}

module.exports = { searchExternalRecipes, getAvailableAdapters, ADAPTERS };