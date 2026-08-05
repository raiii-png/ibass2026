@echo off
echo ============================================
echo    UPDATE WEBSITE IBASS 2026
echo ============================================
echo.

cd /D "C:\Users\mrraf\Downloads\ibass2026"

REM Pengaman: pastikan index.html memang web Penilaian, bukan file lain yang menimpanya
findstr /C:"Penilaian Bizstar" index.html >nul
if errorlevel 1 (
    echo [BATAL] index.html sepertinya BUKAN web Penilaian.
    echo Kemungkinan tertimpa file lain.
    echo.
    echo Pulihkan dulu dengan perintah:
    echo     copy /Y penilaian.html index.html
    echo.
    pause
    exit /b 1
)

REM Jaga salinan cadangan tetap sama dengan yang tayang
copy /Y index.html penilaian.html >nul

echo [OK] Pemeriksaan file lolos.
echo.
echo Perubahan yang akan dikirim:
git status --short
echo.

git add -A
git commit -m "update: website IBASS 2026"
git push origin main

echo.
echo ============================================
echo    SELESAI - tayang dalam ~1 menit
echo.
echo    Penilaian : https://raiii-png.github.io/ibass2026/
echo    Kadiv     : https://raiii-png.github.io/ibass2026/kadiv/
echo    HT        : https://raiii-png.github.io/ibass2026/kadiv/ht/
echo ============================================
echo.
pause
