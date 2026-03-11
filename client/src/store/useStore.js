import { create } from 'zustand';
import { api } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  loading: true,
  error: null,

  initialize: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const user = await api.getMe();
      set({ user, loading: false });
    } catch {
      api.setToken(null);
      set({ user: null, loading: false });
    }
  },

  signup: async (email, password, name) => {
    set({ error: null });
    try {
      const data = await api.signup(email, password, name);
      api.setToken(data.token);
      set({ user: data.user });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const data = await api.login(email, password);
      api.setToken(data.token);
      set({ user: data.user });
      return data;
    } catch (err) {
      set({ error: err.message });
      throw err;
    }
  },

  logout: () => {
    api.setToken(null);
    set({ user: null });
  },

  setUser: (user) => set({ user }),
}));

export const useOnboardingStore = create((set) => ({
  step: 0,
  data: {
    profile: { name: '', householdSize: 2, budgetPreference: 'moderate', mealStructure: { breakfast: true, lunch: true, dinner: true, snacks: false } },
    diets: { diets: [], customDiet: '', allergies: [], restrictions: [] },
    macros: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 67, macroPreset: 'balanced' },
    ingredients: { dislikedIngredients: [], lovedIngredients: [] },
    cuisines: { favoriteCuisines: [], avoidedCuisines: [], varietyPreference: 5 },
    sources: { sources: [{ sourceName: 'spoonacular', enabled: true, apiKey: '' }] },
    store: { primaryStore: 'amazon_wholefoods', organicPreference: 'no_preference' },
  },

  setStep: (step) => set({ step }),
  nextStep: () => set((state) => ({ step: Math.min(state.step + 1, 8) })),
  prevStep: () => set((state) => ({ step: Math.max(state.step - 1, 0) })),
  updateData: (section, values) =>
    set((state) => ({
      data: { ...state.data, [section]: { ...state.data[section], ...values } },
    })),
}));

export const useThemeStore = create((set) => ({
  dark: localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches),
  toggle: () =>
    set((state) => {
      const next = !state.dark;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', next);
      return { dark: next };
    }),
  init: () =>
    set((state) => {
      document.documentElement.classList.toggle('dark', state.dark);
      return state;
    }),
}));