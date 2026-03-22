@echo off
cd /d c:\Users\tayshete\Desktop\mealplan-pro
git add -A
git commit -m "Fix: strict disliked ingredient filtering + 2-week no-repeat meals"
git push origin prath_meal_plan_branch
git checkout main
git merge prath_meal_plan_branch --no-edit
git push origin main
git checkout prath_meal_plan_branch
