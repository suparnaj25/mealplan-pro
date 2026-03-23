/**
 * Safely parse a JSON string, returning a fallback value on failure.
 * Eliminates duplicated parseJSON helpers across the codebase.
 *
 * @param {string} str - The string to parse
 * @param {*} fallback - Value to return if parsing fails (default: [])
 * @returns {*} Parsed value or fallback
 */
function parseJSON(str, fallback = []) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = { parseJSON };
