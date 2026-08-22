# IBASS 2026 — HIMA Administrasi Bisnis, Universitas Telkom

Perangkat web untuk kegiatan IBASS 2026. Semua halaman berupa single-file HTML (CSS + JS inline), tanpa framework dan tanpa proses build.

## Halaman

| Halaman | File | Alamat |
|---|---|---|
| Penilaian Bizstar | `index.html` | `raiii-png.github.io/ibass2026/` |
| Lapor Proker HIMA (Bizstar) | `keaktifan/index.html` | `raiii-png.github.io/ibass2026/keaktifan/` |
| Dashboard Kadiv (5 divisi) | `kadiv/index.html` | `raiii-png.github.io/ibass2026/kadiv/` |

> Catatan: `DASHBOARD_KADIV_IBASS2026.html` kini hanya halaman pengalih ke `kadiv/` (menjaga link lama tetap hidup).

## Alur penilaian Bizstar

Nilai satu Bizstar datang dari dua tempat yang jalan sendiri-sendiri:

1. **Nilai KPI** — buddy (skala 1–10) dan panitia (skala 1–5) mengisi lewat `index.html` tiap
   milestone. Dinormalkan ke 0–100. Kalau keduanya menilai orang yang sama, buddy berbobot 70%.
2. **Poin keaktifan** — Bizstar melapor sendiri di `keaktifan/`, buddy mengonfirmasi hadir/tidak
   lewat menu **Konfirmasi Proker**. +2 per proker HIMA, maksimal +10.

Keduanya digabung otomatis di sheet **Peringkat** (`Nilai Akhir = Nilai KPI + Poin Keaktifan`),
lengkap dengan blok "Terbaik di Tiap Departemen". Bobot dan besaran poin diatur lewat konstanta
`BOBOT_BUDDY`, `BOBOT_PANITIA`, `KEAKTIFAN_POIN`, dan `KEAKTIFAN_MAKS` di file Apps Script.

Tiap buddy punya link sendiri untuk dibagikan ke Bizstar-nya
(`keaktifan/?dept=<departemen>&buddy=<nama>`) — tombol salinnya ada di layar Konfirmasi Proker.
Daftar delapan buddy tersimpan sebagai `BUDDY_2026` di tiga tempat yang harus selalu sama:
`index.html`, `keaktifan/index.html`, dan `TRACKFILE_IBASS2026_GAS.gs`.

Skrip untuk membriefing para buddy ada di `PANDUAN_BUDDY_IBASS2026.md`.

## Fitur Dashboard Kadiv

- **Sekretaris** — rekam rapat (langsung, upload, atau rapat online Meet/Zoom), transkripsi + notulen otomatis, kirim ke Google Docs.
- **Pubdok** — caption generator, storyboard, alat potong video, tracker upload konten.
- **Logistik** — pengadaan barang dengan tombol progres 3 tahap, bukti pembayaran, integrasi saldo kas.
- **Acara** — rundown interaktif per sesi, jam mulai, countdown timer.
- **Finance** — RAB & realisasi per sesi, Kas & DAP, pembelian Logistik, laporan.
- **Track File** di semua divisi — kegiatan tersinkron otomatis ke spreadsheet.

## Backend

`TRACKFILE_IBASS2026_GAS.gs` — Google Apps Script yang terpasang di spreadsheet "Track File IBASS 2026": sync track file per divisi + REKAP, penerima skor penilaian, pembayaran DAP dari Google Form, sheet LAPORAN dan sheet **Peringkat** (menu "Laporan IBASS" di spreadsheet), serta pembuatan
notulen di Google Docs. Petunjuk pemasangan ada di komentar atas file tersebut.

## Catatan pengembangan

Konvensi dan state proyek terbaru ada di `CLAUDE.md` dan `memory/MEMORY.md`.
