import { useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ShoppingCart, Package, Settings, Moon, Sun, LogOut, ChefHat, Menu, X, Bot } from 'lucide-react';
import { useAuthStore, useThemeStore } from '../store/useStore';

const navItems = [
  { path: '/', icon: CalendarDays, label: 'Meal Plan' },
  { path: '/my-recipes', icon: ChefHat, label: 'My Recipes' },
  { path: '/groceries', icon: ShoppingCart, label: 'Grocery List' },
  { path: '/pantry', icon: Package, label: 'Pantry' },
  { path: '/ai', icon: Bot, label: 'AI' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { dark, toggle } = useThemeStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogoClick = () => {
    navigate('/');
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top header */}
      <header className="glass sticky top-0 z-50 px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden btn-ghost p-2 rounded-lg"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <button
            onClick={handleLogoClick}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span className="text-2xl">🍽️</span>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-brand-500 to-emerald-400 bg-clip-text text-transparent">
              MealPlan Pro
            </h1>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="btn-ghost p-2 rounded-full" aria-label="Toggle theme">
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={logout} className="btn-ghost p-2 rounded-full text-red-500 hover:text-red-600" aria-label="Sign out">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Mobile slide-out menu overlay */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 z-[60] md:hidden"
              onClick={() => setMenuOpen(false)}
            />
            <motion.nav
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-72 z-[70] md:hidden glass bg-white/95 dark:bg-gray-900/95 shadow-2xl"
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                  <button onClick={handleLogoClick} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <span className="text-2xl">🍽️</span>
                    <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-brand-500 to-emerald-400 bg-clip-text text-transparent">MealPlan Pro</span>
                  </button>
                  <button onClick={() => setMenuOpen(false)} className="btn-ghost p-2 rounded-lg" aria-label="Close menu">
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 py-4 px-3 space-y-1">
                  {navItems.map(({ path, icon: Icon, label }) => {
                    const isActive = location.pathname === path;
                    return (
                      <NavLink key={path} to={path} onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive ? 'text-brand-500 bg-brand-500/10 font-semibold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                        <span className="text-sm">{label}</span>
                      </NavLink>
                    );
                  })}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                  <button onClick={() => { toggle(); }}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                    {dark ? <Sun size={20} /> : <Moon size={20} />}
                    <span className="text-sm">{dark ? 'Light Mode' : 'Dark Mode'}</span>
                  </button>
                  <button onClick={() => { setMenuOpen(false); logout(); }}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                    <LogOut size={20} />
                    <span className="text-sm font-medium">Sign Out</span>
                  </button>
                </div>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 pb-24 md:pb-6 md:ml-20">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <Outlet />
        </motion.div>
      </main>

      {/* Bottom navigation (mobile) */}
      <nav className="glass fixed bottom-0 left-0 right-0 z-50 md:hidden">
        <div className="flex justify-around py-2">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <NavLink key={path} to={path}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 ${isActive ? 'text-brand-500' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{label}</span>
                {isActive && (
                  <motion.div layoutId="nav-indicator" className="absolute -top-0.5 w-8 h-1 bg-brand-500 rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Side navigation (desktop) */}
      <nav className="hidden md:flex fixed left-0 top-16 bottom-0 w-20 flex-col items-center py-6 gap-4 glass">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <NavLink key={path} to={path}
              className={`relative flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200 ${isActive ? 'text-brand-500 bg-brand-500/10' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              title={label}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}