@echo off
title KY TUC XA DI NGU ONLINE - 20 GIUONG NGU
chcp 65001 >nul
cls

echo ===================================================================
echo   🌙 KY TUC XA DI NGU ONLINE - 20 GIUONG NGU (TIKTOK LIVE STUDIO)
echo ===================================================================
echo.
echo   [1] Khoi dong Server + Mo Bang Dieu Khien Streamer (Admin)
echo   [2] Mo Man Hinh Stream Overlay 9:16 (Cho OBS / TikTok Studio)
echo   [3] Mo Ca Hai Trang (Overlay + Bang Dieu Khien)
echo   [4] Mo truc tiep file HTML tren trinh duyet (Khong can Server)
echo.
echo ===================================================================

set /p choice="Nhap lua chon cua ban (1, 2, 3 hoac 4) [Mac dinh la 1]: "

if "%choice%"=="2" (
    start http://127.0.0.1:3000/overlay.html
    exit /b
)

if "%choice%"=="3" (
    start http://127.0.0.1:3000/admin.html
    start http://127.0.0.1:3000/overlay.html
    exit /b
)

if "%choice%"=="4" (
    start admin.html
    start overlay.html
    exit /b
)

echo Dang khoi dong Server Node.js...
start http://127.0.0.1:3000/admin.html
node server.js
pause
