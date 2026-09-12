# Laporan Keuangan — Aplikasi Akuntansi Offline (Windows .exe)

Aplikasi desktop **100% offline** untuk pembukuan double-entry (jurnal umum
lengkap), dibangun dengan Electron + database SQLite tertanam (bukan file
JSON) supaya data aman, cepat, dan tahan sekalipun datanya sudah puluhan
ribu baris.

## Fitur

- **Dashboard** — ringkasan pemasukan/pengeluaran/laba-rugi/saldo kas, grafik
  bulanan, dan komposisi beban terbesar.
- **Bagan Akun** — kelola akun Aset/Kewajiban/Modal/Pendapatan/Beban, akun
  kontra, dan penanda akun Kas/Bank (dipakai Laporan Arus Kas).
- **Jurnal Umum** — pencatatan transaksi *double-entry* penuh (banyak baris
  debit/kredit per transaksi), dengan validasi saldo real-time.
- **Buku Besar** — mutasi per akun dengan saldo berjalan.
- **5 Laporan Keuangan siap cetak**: Neraca Saldo, Laba Rugi, Neraca,
  Arus Kas (per kategori Operasional/Investasi/Pendanaan), dan Perubahan
  Modal. Semua bisa diekspor ke **Excel (.xlsx)** atau **PDF** langsung dari
  aplikasi (memakai mesin cetak PDF bawaan, tanpa perlu printer/software
  tambahan).
- **Impor/Ekspor Excel** — unduh template resmi, impor akun & transaksi
  massal dari Excel dengan validasi baris-per-baris (baris bermasalah
  dilaporkan lengkap alasannya, tidak pernah membuat data setengah tersimpan).
- **Database SQLite** (bukan JSON) dengan mode WAL, foreign key, dan
  transaksi atomik — setiap jurnal (banyak baris debit/kredit) tersimpan utuh
  atau tidak sama sekali.
- **Cadangan otomatis harian** + cadangan manual + pulihkan dari cadangan,
  semuanya dari dalam aplikasi.
- **Paginasi + virtual scroll** pada tabel Jurnal & Buku Besar — data yang
  ditampilkan ke layar tetap ringan walau tabel di database berisi ratusan
  ribu baris, sehingga aplikasi tidak macet/crash.
- Dibangun dengan prinsip keamanan Electron modern: `contextIsolation` aktif,
  `nodeIntegration` mati, sandbox renderer aktif, tidak ada koneksi internet
  sama sekali, dan setiap error ditangkap (tidak pernah menampilkan layar
  putih kosong).

## Cara Build Jadi File .exe

Ada dua cara. **Disarankan pakai GitHub Actions** karena lingkungan build-nya
sudah lengkap (tidak perlu install apapun di komputer Anda selain browser).

### Cara 1 — Build otomatis lewat GitHub (disarankan)

1. Buat repository baru di GitHub, lalu push seluruh isi folder ini ke sana:
   ```
   git init
   git add .
   git commit -m "Aplikasi Laporan Keuangan"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```
2. Buka repo Anda di GitHub → tab **Actions** → pilih workflow
   **"Build Aplikasi Windows (.exe)"** → klik **Run workflow**.
   (Push ke branch `main`/`master` juga otomatis memicu build.)
3. Tunggu ±5–10 menit sampai selesai (tanda centang hijau).
4. Buka hasil run tersebut → bagian **Artifacts** di bagian bawah halaman →
   unduh **LaporanKeuangan-Windows.zip**. Di dalamnya ada dua file:
   - `Laporan Keuangan-Setup-1.0.0.exe` — installer biasa (disarankan).
   - `Laporan Keuangan-Portable-1.0.0.exe` — versi portable, tinggal
     dijalankan tanpa instalasi (bisa dari flashdisk).
5. *(Opsional)* Kalau Anda push dengan **tag** versi (misal `v1.0.0`), file
   .exe juga otomatis muncul di halaman **Releases** repo, tidak perlu buka
   tab Actions:
   ```
   git tag v1.0.0
   git push origin v1.0.0
   ```

### Cara 2 — Build lokal di komputer sendiri

Butuh [Node.js versi LTS](https://nodejs.org/) terpasang lebih dulu.

1. Ekstrak folder ini di komputer Windows Anda.
2. Klik dua kali **`build.bat`**.
3. Tunggu sampai selesai — file .exe akan ada di folder **`dist`**, dan
   folder tersebut akan otomatis terbuka.

> Catatan: build lokal butuh koneksi internet saat pertama kali (untuk
> mengunduh Electron & dependensi dari npm). Kalau muncul error terkait
> "Visual Studio Build Tools" saat instalasi `better-sqlite3`, cara paling
> mudah adalah pakai **Cara 1 (GitHub Actions)** di atas — di sana semua
> perkakas build sudah tersedia otomatis.

Untuk sekadar mencoba aplikasi tanpa build .exe dulu, klik dua kali
**`jalankan.bat`**.

## Struktur Data

- Database tersimpan sebagai satu file di:
  `%APPDATA%\laporan-keuangan\data\laporan-keuangan.db`
  (folder ini otomatis dibuka lewat menu **Impor/Ekspor & Cadangan → Buka
  Folder Cadangan** untuk melihat cadangannya).
- Cadangan otomatis harian disimpan di subfolder `backups` pada lokasi yang
  sama, dan sebelum setiap impor/pemulihan data, aplikasi selalu membuat
  cadangan tambahan sebagai jaring pengaman.
- Semua data 100% tersimpan lokal di komputer Anda — aplikasi tidak pernah
  mengirim data kemanapun lewat internet.

## Struktur Proyek

```
main.js               Proses utama Electron (jendela, siklus hidup app)
preload.js             Jembatan aman renderer <-> main (contextBridge)
src/main/              Logika backend: database, akuntansi, Excel, backup, log
src/renderer/          Antarmuka (HTML/CSS/JS murni, tanpa framework/CDN)
assets/                Ikon aplikasi
.github/workflows/     Konfigurasi build otomatis GitHub Actions
build.bat / jalankan.bat   Skrip satu-klik untuk Windows
```

## Dukungan Teknis

Kalau aplikasi menampilkan pesan error, aplikasi juga mencatatnya ke file
log yang bisa dilihat lewat menu **Pengaturan → Tentang Aplikasi**. Sertakan
isi file tersebut saat meminta bantuan.
