const API_BASE = '/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  async request(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  // Auth
  signup(email, password, name) {
    return this.request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) });
  }
  login(email, password) {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  }
  getMe() {
    return this.request('/auth/me');
  }

  // Preferences
  getPreferences() {
    return this.request('/preferences');
  }
  updateProfile(data) {
    return this.request('/preferences/profile', { method: 'PUT', body: JSON.stringify(data) });
  }
  updateDiets(data) {
    return this.request('/preferences/diets', { method: 'PUT', body: JSON.stringify(data) });
  }
  updateMacros(data) {
    return this.request('/preferences/macros', { method: 'PUT', body: JSON.stringify(data) });
  }
  updateIngredients(data) {
    return this.request('/preferences/ingredients', { method: 'PUT', body: JSON.stringify(data) });
  }
  updateCuisines(data) {
    return this.request('/preferences/cuisines', { method: 'PUT', body: JSON.stringify(data) });
  }
  updateSources(data) {
    return this.request('/preferences/sources', { method: 'PUT', body: JSON.stringify(data) });
  }
  updateStore(data) {
    return this.request('/preferences/store', { method: 'PUT', body: JSON.stringify(data) });
  }
  getStores() {
    return this.request('/recipes/stores/all');
  }
  completeOnboarding() {
    return this.request('/preferences/complete-onboarding', { method: 'PUT' });
  }

  // Meals
  getMealPlan(weekStart) {
    return this.request(`/meals/plan?weekStart=${weekStart}`);
  }
  generateMealPlan(weekStart) {
    return this.request('/meals/generate', { method: 'POST', body: JSON.stringify({ weekStart }) });
  }
  updateMealPlanItem(planId, itemId, data) {
    return this.request(`/meals/plan/${planId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  regenerateSlot(planId, itemId) {
    return this.request('/meals/regenerate-slot', { method: 'POST', body: JSON.stringify({ planId, itemId }) });
  }
  skipMeal(planId, itemId) {
    return this.request('/meals/skip', { method: 'POST', body: JSON.stringify({ planId, itemId }) });
  }

  // Pantry
  getPantry() {
    return this.request('/pantry');
  }
  addPantryItem(data) {
    return this.request('/pantry', { method: 'POST', body: JSON.stringify(data) });
  }
  updatePantryItem(id, data) {
    return this.request(`/pantry/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  deletePantryItem(id) {
    return this.request(`/pantry/${id}`, { method: 'DELETE' });
  }

  // Groceries
  generateGroceryList(mealPlanId) {
    return this.request('/groceries/generate', { method: 'POST', body: JSON.stringify({ mealPlanId }) });
  }
  getGroceryList(listId) {
    return this.request(`/groceries/${listId}`);
  }
  getLatestGroceryList() {
    return this.request('/groceries');
  }
  toggleGroceryItem(listId, itemId, checked) {
    return this.request(`/groceries/${listId}/items/${itemId}`, { method: 'PUT', body: JSON.stringify({ checked }) });
  }

  // Kroger
  getKrogerStatus() {
    return this.request('/kroger/status');
  }
  getKrogerAuthUrl() {
    return this.request('/kroger/auth-url');
  }
  krogerAutoFill(groceryListId) {
    return this.request('/kroger/auto-fill', { method: 'POST', body: JSON.stringify({ groceryListId }) });
  }
  krogerConfirmCart(selections) {
    return this.request('/kroger/confirm-cart', { method: 'POST', body: JSON.stringify({ selections }) });
  }
  krogerSearchLocations(zipCode) {
    return this.request(`/kroger/locations?zipCode=${zipCode}`);
  }
  krogerSetLocation(locationId) {
    return this.request('/kroger/set-location', { method: 'POST', body: JSON.stringify({ locationId }) });
  }

  // Recipes
  searchRecipes(params) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/recipes/search?${qs}`);
  }
  getRecipe(id) {
    return this.request(`/recipes/${id}`);
  }
}

export const api = new ApiService();