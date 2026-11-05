@echo off
title PaperGrade AI - 22 Student Playwright Mobile Load Test
cd /d "%~dp0"
echo =====================================================================
echo  PAPERGRADE AI - 22-STUDENT PLAYWRIGHT LOAD TEST (HEADED MOBILE MODE)
echo  Exam: Rotational Dynamics Mock Exam (Fresh)
echo  Frontend: https://papergrade-ai.vercel.app
echo  Backend: https://papergrade-ai-backend.onrender.com
echo =====================================================================
echo.
python scripts/simulate_playwright_e2e_load.py --frontend-url https://papergrade-ai.vercel.app --api-url https://papergrade-ai-backend.onrender.com --exam-id exam_3073500ee733 --headed
pause
