# 🍽️ MealPlan Pro

**AI-powered weekly meal planning with smart grocery lists and multi-store integration.**

A beautiful, mobile-first PWA that helps you plan weekly meals based on your diet preferences, creates smart grocery lists that subtract pantry items, and connects to your favorite grocery store with deep links or direct cart integration.

## ✨ Features

### 🎯 Smart Onboarding (7-Step Wizard)
- **Profile** — Name, household size, budget, meal structure
- **Diets** — 16 diet types, 9 allergy categories, custom notes
- **Macros** — Calorie/protein/carb/fat targets with presets (Balanced, High Protein, Keto, Low Carb)
- **Ingredients** — Like & dislike tags for common ingredients
- **Cuisines** — Favorite cuisines, variety preference slider
- **Recipe Sources** — Built-in recipes + Spoonacular API
- **Store** — Choose from 8 grocery stores with different integration levels

### 🗓️ Weekly Meal Planner
- Auto-generate meals based on your preferences
- Lock favorite meals and regenerate the rest
- Swap individual meal slots
- Daily nutrition summary
- Week-by-week navigation

### 🛒 Smart Grocery List
- Auto-aggregates ingredients from your meal plan
- Subtracts items already in your pantry
- Groups by category (Produce, Meat, Dairy, etc.)
- Check off items as you shop
- **Store deep links** — "Buy" button opens your selected store

### 🏪 Multi-Store Integration

| Store | Integration | How It Works |
|-------|------------|-------------|
| **Kroger** | 🥇 Full Cart | Direct API cart management |
| **Amazon/Whole Foods** | 🔗 Deep Link | Opens Amazon app to product search |
| **Instacart** | 🔗 Deep Link | Opens Instacart to product search |
| **Walmart** | 🔗 Deep Link | Opens Walmart to product search |
| **Target** | 🔗 Deep Link | Opens Target grocery search |
| **Costco** | 🔗 Deep Link | Opens Costco product search |
| **Safeway** | 🔗 Deep Link | Opens Safeway product search |
| **Trader Joe's** | 📋 List Export | Copy/print list (no online ordering) |

### 📦 Pantry Manager
- Add/edit/delete items with quantities and categories
- Expiry date tracking with warnings
- Smart subtraction from grocery lists

### 🎨 Premium UI
- Glass morphism design with subtle gradients
- Smooth Framer Motion animations
- Dark mode with system preference detection
- Mobile-first responsive layout
- Inter font family

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Clone & Install

```bash
cd mealplan-pro
npm run install:all
```

### 2. Setup Database

```bash
# Create the database
createdb mealplan_pro

# Run migrations
cd server
cp .env.example .env
# Edit .env with your database URL and JWT secret
npm run migrate

# Seed recipes
node src/db/seed.js
```

### 3. Configure Environment

Edit `server/.env`:
```
PORT=3001
DATABASE_URL=postgresql://localhost:5432/mealplan_pro
JWT_SECRET=your-secret-key-here
CLIENT_URL=http://localhost:5173
```

### 4. Run Development

```bash
# From project root
npm run dev
```

This starts both the API server (port 3001) and React dev server (port 5173).

Open **http://localhost:5173** in your browser.

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS + glass morphism |
| Animations | Framer Motion |
| State | Zustand |
| Routing | React Router v6 |
| Icons | Lucide React |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Auth | JWT + bcrypt |

---

## 📁 Project Structure

```
mealplan-pro/
├── client/                     # React PWA
│   ├── src/
│   │   ├── components/         # Shared components
│   │   │   └── Layout.jsx      # App shell with navigation
│   │   ├── pages/
│   │   │   ├── AuthPage.jsx    # Login / Signup
│   │   │   ├── Onboarding.jsx  # 7-step wizard
│   │   │   ├── MealPlan.jsx    # Weekly planner
│   │   │   ├── GroceryList.jsx # Shopping list
│   │   │   ├── Pantry.jsx      # Inventory manager
│   │   │   └── Settings.jsx    # User settings
│   │   ├── services/
│   │   │   └── api.js          # API client
│   │   ├── store/
│   │   │   └── useStore.js     # Zustand stores
│   │   ├── App.jsx             # Router setup
│   │   ├── main.jsx            # Entry point
│   │   └── index.css           # Tailwind + custom styles
│   └── ...config files
├── server/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js         # Authentication
│   │   │   ├── preferences.js  # User preferences
│   │   │   ├── meals.js        # Meal plan CRUD
│   │   │   ├── pantry.js       # Pantry CRUD
│   │   │   ├── groceries.js    # Grocery list generation
│   │   │   └── recipes.js      # Recipe search
│   │   ├── services/
│   │   │   ├── mealGenerator.js      # Meal plan algorithm
│   │   │   └── storeLinkGenerator.js # Store URL generator
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT middleware
│   │   ├── db/
│   │   │   ├── connection.js   # PostgreSQL pool
│   │   │   ├── migrate.js      # Schema migrations
│   │   │   └── seed.js         # Recipe seeder
│   │   ├── data/
│   │   │   └── recipes.json    # 28 built-in recipes
│   │   └── index.js            # Express server
│   └── .env.example
└── README.md
```

---

## 🔑 API Endpoints

### Auth
- `POST /api/auth/signup` — Create account
- `POST /api/auth/login` — Sign in
- `GET /api/auth/me` — Get current user

### Preferences
- `GET /api/preferences` — Get all preferences
- `PUT /api/preferences/profile` — Update profile
- `PUT /api/preferences/diets` — Update diet preferences
- `PUT /api/preferences/macros` — Update macro targets
- `PUT /api/preferences/ingredients` — Update ingredient preferences
- `PUT /api/preferences/cuisines` — Update cuisine preferences
- `PUT /api/preferences/sources` — Update recipe sources
- `PUT /api/preferences/store` — Update store preference
- `PUT /api/preferences/complete-onboarding` — Mark onboarding complete

### Meals
- `GET /api/meals/plan?weekStart=YYYY-MM-DD` — Get meal plan
- `POST /api/meals/generate` — Generate new meal plan
- `PUT /api/meals/plan/:planId/items/:itemId` — Update meal item
- `POST /api/meals/regenerate-slot` — Swap a single meal

### Pantry
- `GET /api/pantry` — List pantry items
- `POST /api/pantry` — Add item
- `PUT /api/pantry/:id` — Update item
- `DELETE /api/pantry/:id` — Delete item

### Groceries
- `POST /api/groceries/generate` — Generate from meal plan
- `GET /api/groceries` — Get latest list
- `PUT /api/groceries/:listId/items/:itemId` — Toggle item checked

---

## 📜 License

MIT