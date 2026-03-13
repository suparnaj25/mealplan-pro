import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, useThemeStore } from './store/useStore';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import Onboarding from './pages/Onboarding';
import MealPlan from './pages/MealPlan';
import GroceryList from './pages/GroceryList';
import Pantry from './pages/Pantry';
import Settings from './pages/Settings';
import MyRecipes from './pages/MyRecipes';
import RecipeDetail from './pages/RecipeDetail';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return children;
}

function OnboardingRoute({ children }) {
  const { user, loading } = useAuthStore();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (user.onboardingCompleted) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const initTheme = useThemeStore((s) => s.init);

  useEffect(() => {
    initialize();
    initTheme();
  }, []);

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/onboarding"
        element={
          <OnboardingRoute>
            <Onboarding />
          </OnboardingRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<MealPlan />} />
        <Route path="my-recipes" element={<MyRecipes />} />
        <Route path="groceries" element={<GroceryList />} />
        <Route path="pantry" element={<Pantry />} />
        <Route path="settings" element={<Settings />} />
        <Route path="recipe/:id" element={<RecipeDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}