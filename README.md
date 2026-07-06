# I-BASS 2026 — HIMA Administrasi Bisnis, Universitas Telkom

Perangkat web untuk kegiatan I-BASS 2026. Semua halaman berupa single-file HTML (CSS + JS inline), tanpa framework dan tanpa proses build.

## Halaman

| Halaman | File | Alamat |
|---|---|---|
| Dashboard Kadiv (5 divisi) | `DASHBOARD_KADIV_IBASS2026.html` | `ibass2026.netlify.app` · `raiii-png.github.io/ibass2026/DASHBOARD_KADIV_IBASS2026.html` |
| Penilaian Bizstar | `index.html` | `raiii-png.github.io/ibass2026` · `ibass2026.netlify.app/penilaian` |

## Fitur Dashboard Kadiv

- **Sekretaris** — rekam rapat (langsung, upload, atau rapat online Meet/Zoom), transkripsi + notulen otomatis, kirim ke Google Docs.
- **Pubdok** — caption generator, storyboard, alat potong video, tracker upload konten.
- **Logistik** — pengadaan barang dengan tombol progres 3 tahap, bukti pembayaran, integrasi saldo kas.
- **Acara** — rundown interaktif per sesi, jam mulai, countdown timer.
- **Finance** — RAB & realisasi per sesi, Kas & DAP, pembelian Logistik, laporan.
- **Track File** di semua divisi — kegiatan tersinkron otomatis ke spreadsheet.

## Backend

`TRACKFILE_IBASS2026_GAS.gs` — Google Apps Script yang terpasang di spreadsheet "Track File I-BASS 2026": sync track file per divisi + REKAP, penerima skor penilaian, pembayaran DAP dari Google Form, sheet LAPORAN (menu "Laporan I-BASS" di spreadsheet), dan pembuatan notulen di Google Docs. Petunjuk pemasangan ada di komentar atas file tersebut.

## Catatan pengembangan

Konvensi dan state proyek terbaru ada di `CLAUDE.md` dan `memory/MEMORY.md`.
