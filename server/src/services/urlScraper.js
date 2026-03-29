const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Reusable browser instance (lazy-initialized)
let _browser = null;
async function getBrowser() {
  if (!_browser || !_browser.isConnected()) {
    // @sparticuz/chromium provides a bundled Chromium that works on cloud platforms (Render, AWS Lambda, etc.)
    const executablePath = await chromium.executablePath();
    _browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });
  }
  return _browser;
}

/**
 * Scrape a URL and extract recipe-relevant content.
 * Works with Instagram, TikTok, YouTube, food blogs, and any web page.
 * For video platforms, uses oEmbed APIs + thumbnail vision analysis.
 */
async function scrapeUrl(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  let platform = 'web';
  if (hostname.includes('instagram.com')) platform = 'instagram';
  else if (hostname.includes('tiktok.com')) platform = 'tiktok';
  else if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) platform = 'youtube';
  else if (hostname.includes('pinterest.com')) platform = 'pinterest';

  // For video platforms, try oEmbed first for richer data
  let oEmbedData = null;
  if (['tiktok', 'youtube'].includes(platform)) {
    oEmbedData = await fetchOEmbed(url, platform);
  }

  // For Instagram, use the embed endpoint which actually returns content
  let html = '';
  if (platform === 'instagram') {
    html = await fetchInstagramEmbed(url);
  } else {
    // Fetch the page HTML normally
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
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
      if (response.ok) {
        html = await response.text();
      }
    } catch (err) {
      if (!oEmbedData) {
        if (err.name === 'AbortError') throw new Error('Request timed out (15s). The URL may be unreachable.');
        throw new Error(`Failed to fetch URL: ${err.message}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const $ = html ? cheerio.load(html) : null;

  // --- Extract structured recipe data (JSON-LD) ---
  let jsonLdRecipe = null;
  if ($) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const recipes = findRecipeInJsonLd(data);
        if (recipes) jsonLdRecipe = recipes;
      } catch { /* ignore */ }
    });
  }

  // --- Extract Open Graph / meta tags ---
  const ogTitle = $?.('meta[property="og:title"]').attr('content') || '';
  const ogDescription = $?.('meta[property="og:description"]').attr('content') || '';
  const ogImage = $?.('meta[property="og:image"]').attr('content') || '';
  const ogSiteName = $?.('meta[property="og:site_name"]').attr('content') || '';
  const ogVideo = $?.('meta[property="og:video"]').attr('content') || $?.('meta[property="og:video:url"]').attr('content') || '';
  const metaDescription = $?.('meta[name="description"]').attr('content') || '';
  const pageTitle = $?.('title').text().trim() || '';

  // --- Extract body text ---
  let bodyText = '';
  if ($) {
    $('script, style, nav, footer, header, aside, .ad, .ads, .sidebar, .comments, .related').remove();
    const mainContent = $('article, [role="main"], main, .recipe, .post-content, .entry-content, .content').first();
    bodyText = (mainContent.length ? mainContent.text() : $('body').text()).replace(/\s+/g, ' ').trim().slice(0, 4000);
  }

  // --- Determine if this is a video page ---
  const isVideo = !!ogVideo || ['instagram', 'tiktok', 'youtube'].includes(platform);

  // --- Build the best available caption/description ---
  // For video platforms, oEmbed often has the full caption that HTML scraping misses
  let caption = '';
  if (oEmbedData) {
    caption = oEmbedData.title || '';
    // Instagram oEmbed returns the caption in the HTML field or title
    if (oEmbedData.html) {
      // Extract text from oEmbed HTML snippet
      const oEmbedHtml = cheerio.load(oEmbedData.html);
      const oEmbedText = oEmbedHtml('body').text().replace(/\s+/g, ' ').trim();
      if (oEmbedText.length > caption.length) caption = oEmbedText;
    }
  }

  // Combine all text sources for the best possible content
  const allText = [
    caption,
    ogTitle,
    ogDescription,
    metaDescription,
    bodyText,
  ].filter(Boolean).join('\n\n');

  // Get the best thumbnail URL for vision analysis
  const thumbnailUrl = oEmbedData?.thumbnail_url || ogImage || '';

  return {
    url,
    platform,
    isVideo,
    pageTitle: pageTitle || oEmbedData?.title || ogTitle,
    ogTitle,
    ogDescription,
    ogImage,
    ogSiteName: ogSiteName || oEmbedData?.provider_name || '',
    metaDescription,
    bodyText: allText.slice(0, 5000),
    jsonLdRecipe,
    hasStructuredData: !!jsonLdRecipe,
    // Video-specific fields
    caption,
    thumbnailUrl,
    oEmbed: oEmbedData,
    authorName: oEmbedData?.author_name || '',
  };
}

/**
 * Fetch Instagram content using Puppeteer (headless Chrome).
 * Instagram requires JavaScript rendering — no server-side scraping works without a real browser.
 * Uses the /embed/ endpoint which is lighter than the full page.
 */
async function fetchInstagramEmbed(url) {
  let page = null;
  try {
    const shortcodeMatch = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!shortcodeMatch) {
      console.log('⚠️ Could not extract Instagram shortcode from URL');
      return '';
    }
    const shortcode = shortcodeMatch[2];
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;

    console.log(`📸 Launching Puppeteer for Instagram embed: ${embedUrl}`);
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['video', 'media', 'font'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(embedUrl, { waitUntil: 'networkidle2', timeout: 20000 });

    // Wait for content to render
    await page.waitForSelector('img', { timeout: 8000 }).catch(() => {});

    // Extract data from the rendered page
    const data = await page.evaluate(() => {
      // Get all content images (not profile pics, not static)
      const images = [];
      document.querySelectorAll('img').forEach(img => {
        const src = img.src || '';
        if (src.includes('cdninstagram.com') && !src.includes('/s150x150/') && img.width > 100) {
          images.push(src);
        }
      });

      // Get caption text
      const captionEl = document.querySelector('.Caption, .CaptionContent, [class*="Caption"]');
      const caption = captionEl ? captionEl.innerText.trim() : '';

      // Get username
      const usernameEl = document.querySelector('.UsernameText, [class*="Username"]');
      const username = usernameEl ? usernameEl.innerText.trim() : '';

      // Get all visible text
      const bodyText = document.body.innerText.replace(/\s+/g, ' ').trim();

      // Get video poster if available
      const video = document.querySelector('video');
      const videoPoster = video ? video.poster : '';

      return { images, caption, username, bodyText, videoPoster };
    });

    console.log(`📸 Puppeteer extracted: username="${data.username}", images=${data.images.length}, caption="${(data.caption || '').slice(0, 80)}..."`);

    // Build synthetic HTML with OG tags for the main parser
    const bestImage = data.videoPoster || (data.images.length > 0 ? data.images[data.images.length - 1] : '');
    const captionText = data.caption || data.bodyText.slice(0, 1000);

    const syntheticHtml = `<!DOCTYPE html><html><head>
      <meta property="og:image" content="${bestImage}" />
      <meta property="og:title" content="${data.username ? data.username + ' on Instagram' : 'Instagram Post'}" />
      <meta property="og:description" content="${captionText.replace(/"/g, '&quot;').slice(0, 1000)}" />
      <meta property="og:site_name" content="Instagram" />
      <meta property="og:video" content="true" />
      <title>${data.username || 'Instagram'} - Recipe Video</title>
    </head><body>${captionText}</body></html>`;

    return syntheticHtml;
  } catch (err) {
    console.error(`⚠️ Puppeteer Instagram fetch failed: ${err.message}`);
    console.error(err.stack);
    // Graceful fallback: return minimal synthetic HTML so AI can still try with just the URL context
    const shortcodeMatch2 = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    const fallbackHtml = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Instagram Reel" />
      <meta property="og:description" content="Instagram video post${shortcodeMatch2 ? ' (shortcode: ' + shortcodeMatch2[2] + ')' : ''}" />
      <meta property="og:site_name" content="Instagram" />
      <meta property="og:video" content="true" />
      <title>Instagram Recipe Video</title>
    </head><body>Instagram recipe video from ${url}</body></html>`;
    return fallbackHtml;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

/**
 * Fetch oEmbed data from platform APIs.
 * These are public APIs that return post metadata including captions.
 */
async function fetchOEmbed(url, platform) {
  const oEmbedUrls = {
    instagram: `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}&omitscript=true`,
    youtube: `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    tiktok: `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  };

  const oEmbedUrl = oEmbedUrls[platform];
  if (!oEmbedUrl) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(oEmbedUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();
    console.log(`📡 oEmbed (${platform}): title="${(data.title || '').slice(0, 80)}", thumbnail=${!!data.thumbnail_url}`);
    return data;
  } catch (err) {
    console.log(`⚠️ oEmbed failed for ${platform}: ${err.message}`);
    return null;
  }
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
    if (data['@graph']) return findRecipeInJsonLd(data['@graph']);
  }
  return null;
}

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

function parseDuration(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  return (parseInt(match[1] || 0) * 60) + parseInt(match[2] || 0);
}

module.exports = { scrapeUrl, parseDuration };
