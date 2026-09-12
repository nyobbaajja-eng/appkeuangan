@echo off
setlocal
title Build Laporan Keuangan - .exe
color 0B

echo ============================================================
echo   BUILD APLIKASI LAPORAN KEUANGAN MENJADI FILE .EXE
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [GAGAL] Node.js belum terpasang di komputer ini.
  echo Silakan unduh dan install dulu dari https://nodejs.org/ ^(versi LTS^)
  echo lalu jalankan ulang file ini.
  echo.
  pause
  exit /b 1
)

echo [1/3] Memeriksa Node.js... OK
node -v
echo.

if not exist "node_modules" (
  echo [2/3] Menginstall dependensi ^(sekali saja, mohon tunggu^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo [GAGAL] npm install gagal. Periksa koneksi internet Anda.
    echo Jika error menyinggung "better-sqlite3" / Visual Studio Build Tools,
    echo cara paling mudah adalah build lewat GitHub Actions ^(lihat README.md^).
    pause
    exit /b 1
  )
) else (
  echo [2/3] Dependensi sudah terpasang, lanjut...
)
echo.

echo [3/3] Membangun file .exe ^(installer + portable^)...
call npm run dist
if errorlevel 1 (
  echo.
  echo [GAGAL] Proses build gagal. Lihat pesan error di atas.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   SELESAI! File .exe ada di folder "dist"
echo ============================================================
start "" "%~dp0dist"
pause
