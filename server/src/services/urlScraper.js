const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Scrape a URL and extract recipe-relevant content.
 * Works with Instagram, TikTok, YouTube, food blogs, and any web page.
 * Returns structured scraped data for AI parsing.
 */
async function scrapeUrl(url) {
  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  // Fetch the page
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let html;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: HTTP ${response.status}`);
    }

    html = await response.text();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out (15s). The URL may be unreachable.');
    throw new Error(`Failed to fetch URL: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);

  // --- Extract structured recipe data (JSON-LD) ---
  // Many food blogs embed Schema.org Recipe markup
  let jsonLdRecipe = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const recipes = findRecipeInJsonLd(data);
      if (recipes) jsonLdRecipe = recipes;
    } catch { /* ignore malformed JSON-LD */ }
  });

  // --- Extract Open Graph / meta tags ---
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDescription = $('meta[property="og:description"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const ogSiteName = $('meta[property="og:site_name"]').attr('content') || '';
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const pageTitle = $('title').text().trim() || '';

  // --- Extract main body text (cleaned) ---
  // Remove scripts, styles, nav, footer, ads
  $('script, style, nav, footer, header, aside, .ad, .ads, .sidebar, .comments, .related').remove();
  
  // Try to find the main content area
  let bodyText = '';
  const mainContent = $('article, [role="main"], main, .recipe, .post-content, .entry-content, .content').first();
  if (mainContent.length) {
    bodyText = mainContent.text().replace(/\s+/g, ' ').trim();
  } else {
    bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  }
  // Limit body text to avoid token overflow
  bodyText = bodyText.slice(0, 4000);

  // --- Detect platform ---
  const hostname = parsedUrl.hostname.toLowerCase();
  let platform = 'web';
  if (hostname.includes('instagram.com')) platform = 'instagram';
  else if (hostname.includes('tiktok.com')) platform = 'tiktok';
  else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) platform = 'youtube';
  else if (hostname.includes('pinterest.com')) platform = 'pinterest';

  return {
    url,
    platform,
    pageTitle,
    ogTitle,
    ogDescription,
    ogImage,
    ogSiteName,
    metaDescription,
    bodyText,
    jsonLdRecipe,
    hasStructuredData: !!jsonLdRecipe,
  };
}

/**
 * Recursively search JSON-LD data for a Recipe object
 */
function findRecipeInJsonLd(data) {
  if (!data) return null;
  
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeInJsonLd(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof data === 'object') {
    // Direct Recipe type
    if (data['@type'] === 'Recipe' || (Array.isArray(data['@type']) && data['@type'].includes('Recipe'))) {
      return {
        name: data.name || '',
        description: data.description || '',
        image: Array.isArray(data.image) ? data.image[0] : (data.image?.url || data.image || ''),
        prepTime: data.prepTime || '',
        cookTime: data.cookTime || '',
        totalTime: data.totalTime || '',
        servings: data.recipeYield ? String(data.recipeYield) : '',
        cuisine: Array.isArray(data.recipeCuisine) ? data.recipeCuisine.join(', ') : (data.recipeCuisine || ''),
        category: Array.isArray(data.recipeCategory) ? data.recipeCategory[0] : (data.recipeCategory || ''),
        ingredients: Array.isArray(data.recipeIngredient) ? data.recipeIngredient : [],
        instructions: extractInstructions(data.recipeInstructions),
        keywords: data.keywords || '',
        nutrition: data.nutrition || null,
      };
    }

    // Check @graph array
    if (data['@graph']) {
      return findRecipeInJsonLd(data['@graph']);
    }
  }

  return null;
}

/**
 * Extract instructions from various JSON-LD formats
 */
function extractInstructions(instructions) {
  if (!instructions) return [];
  if (typeof instructions === 'string') return [instructions];
  if (Array.isArray(instructions)) {
    return instructions.map(step => {
      if (typeof step === 'string') return step;
      if (step.text) return step.text;
      if (step.name) return step.name;
      if (step.itemListElement) {
        return step.itemListElement.map(s => s.text || s.name || String(s)).join('. ');
      }
      return String(step);
    }).filter(Boolean);
  }
  return [];
}

/**
 * Parse ISO 8601 duration (PT30M, PT1H30M) to minutes
 */
function parseDuration(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  return (parseInt(match[1] || 0) * 60) + parseInt(match[2] || 0);
}

module.exports = { scrapeUrl, parseDuration };
