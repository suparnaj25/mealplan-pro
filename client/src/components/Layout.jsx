import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, ShoppingCart, Package, Settings, Moon, Sun, LogOut } from 'lucide-react';
import { useAuthStore, useThemeStore } from '../store/useStore';

const navItems = [
  { path: '/', icon: CalendarDays, label: 'Meals' },
  { path: '/groceries', icon: ShoppingCart, label: 'Groceries' },
  { path: '/pantry', icon: Package, label: 'Pantry' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const { dark, toggle } = useThemeStore();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top header */}
      <header className="glass sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍽️</span>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-brand-500 to-emerald-400 bg-clip-text text-transparent">
            MealPlan Pro
          </h1>
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
              <NavLink
                key={path}
                to={path}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'text-brand-500'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-xs font-medium">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -top-0.5 w-8 h-1 bg-brand-500 rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
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
            <NavLink
              key={path}
              to={path}
              className={`relative flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-brand-500 bg-brand-500/10'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              title={label}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}