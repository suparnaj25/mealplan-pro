import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';

/**
 * AiResultSheet — A beautiful bottom-sheet / modal for displaying AI results.
 * 
 * Props:
 *   open       — boolean, whether the sheet is visible
 *   onClose    — function, called when user dismisses
 *   title      — string, e.g. "Cooking Tips"
 *   emoji      — string, e.g. "👨‍🍳"
 *   loading    — boolean, show loading skeleton
 *   children   — React nodes, the content to display
 *   gradient   — optional tailwind gradient classes (default: purple→brand)
 */
export default function AiResultSheet({ open, onClose, title, emoji = '✨', loading = false, children, gradient }) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const gradientClass = gradient || 'from-purple-500 via-brand-500 to-emerald-500';

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80]"
            onClick={onClose}
          />

          {/* Sheet — bottom on mobile, centered on desktop */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-[81] max-h-[85vh] md:max-h-[80vh] md:w-full md:max-w-lg flex flex-col"
          >
            <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] md:max-h-[80vh] overflow-hidden">
              {/* Drag handle (mobile) */}
              <div className="flex justify-center pt-3 md:hidden">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
              </div>

              {/* Header */}
              <div className={`px-6 pt-4 pb-4 bg-gradient-to-r ${gradientClass} relative`}>
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                >
                  <X size={18} />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Sparkles size={22} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{title}</h2>
                    <div className="flex items-center gap-1 text-white/70 text-xs">
                      <Sparkles size={12} />
                      <span>Smart suggestion</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {loading ? (
                  <div className="space-y-4 py-8">
                    <div className="flex justify-center">
                      <Loader2 size={32} className="animate-spin text-brand-500" />
                    </div>
                    <p className="text-center text-sm text-gray-500">Thinking...</p>
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse">
                          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-lg w-3/4 mb-2" />
                          <div className="h-3 bg-gray-100 dark:bg-gray-800/50 rounded-lg w-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  children
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-brand-500 to-purple-500 text-white hover:opacity-90 transition-opacity active:scale-[0.98]"
                >
                  Got it
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Reusable content building blocks ── */

export function AiCard({ icon, title, children, highlight = false }) {
  return (
    <div className={`p-3.5 rounded-xl text-sm ${
      highlight
        ? 'bg-gradient-to-r from-brand-500/10 to-purple-500/10 border border-brand-200 dark:border-brand-800'
        : 'bg-gray-50 dark:bg-gray-800/50'
    }`}>
      {(icon || title) && (
        <div className="flex items-center gap-2 mb-1.5">
          {icon && <span className="text-base">{icon}</span>}
          {title && <span className="font-semibold text-sm">{title}</span>}
        </div>
      )}
      <div className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

export function AiSection({ title, children }) {
  return (
    <div>
      {title && <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{title}</h3>}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function AiTag({ children, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    brand: 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
}

export function AiSwapCard({ original, replacement, reason, impact }) {
  return (
    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="line-through text-gray-400 text-xs">{original}</span>
        <span className="text-gray-400">→</span>
        <span className="font-semibold text-brand-500">{replacement}</span>
      </div>
      {reason && <p className="text-xs text-gray-500">{reason}</p>}
      {impact && <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">{impact}</p>}
    </div>
  );
}
