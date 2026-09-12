@echo off
setlocal
title Laporan Keuangan - Mode Uji Coba
color 0A

where node >nul 2>nul
if errorlevel 1 (
  echo [GAGAL] Node.js belum terpasang. Unduh di https://nodejs.org/ ^(versi LTS^)
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Menginstall dependensi ^(hanya sekali^)...
  call npm install
  if errorlevel 1 (
    echo [GAGAL] npm install gagal. Periksa koneksi internet.
    pause
    exit /b 1
  )
)

echo Menjalankan aplikasi...
call npm start
pause
