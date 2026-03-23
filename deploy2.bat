@echo off
cd /d c:\Users\tayshete\Desktop\mealplan-pro
git add -A
git commit -m "Deep dive fix: strict disliked filtering everywhere, 2-week no-repeat, regenerate_week bug fix, AI prompt hardening"
git push origin prath_meal_plan_branch
git checkout main
git merge prath_meal_plan_branch --no-edit
git push origin main
git checkout prath_meal_plan_branch
del "%~f0"
