@echo off
echo ============================================
echo   UPDATE WEBSITE I-BASS 2026
echo ============================================
echo.

REM Copy file terbaru dari Downloads ke folder ini
copy /Y "C:\Users\mrraf\Downloads\PENILAIAN_IBASS_2026 (1).html" "C:\Users\mrraf\Downloads\ibass2026\index.html"

if errorlevel 1 (
    echo [ERROR] File tidak ditemukan di Downloads!
    echo Pastikan nama file masih: PENILAIAN_IBASS_2026 (1).html
    pause
    exit /b 1
)

echo [OK] File berhasil di-copy.
echo.

REM Masuk ke folder repo
cd /D "C:\Users\mrraf\Downloads\ibass2026"

REM Git add + commit + push
git add index.html
git commit -m "update: website I-BASS 2026"
git push origin main

echo.
echo ============================================
echo   SELESAI! Website akan update dalam ~1 menit
echo   Link: https://raiii-png.github.io/ibass2026
echo ============================================
echo.
pause
