@echo off
cd /d c:\Users\tayshete\Desktop\mealplan-pro
git add -A
git commit -m "Fix AI chat: support next week meal plan changes in chat"
git push origin prath_meal_plan_branch
git stash
git checkout main
git merge prath_meal_plan_branch --no-edit
git push origin main
git checkout prath_meal_plan_branch
git stash pop
del commit.bat
