# I-BASS 2026 — HIMA Administrasi Bisnis, Universitas Telkom

Proyek web untuk kegiatan I-BASS 2026. Semua file HTML = single-file (CSS + JS inline).

## File utama
- `index.html` = `PENILAIAN_IBASS_2026` — web penilaian Bizstar, hosted di GitHub Pages (`raiii-png.github.io/ibass2026`)
- `DASHBOARD_KADIV_IBASS2026.html` — dashboard 5 divisi (Sekretaris, Pubdok, Logistik, Acara, Finance) + Track File
- `TRACKFILE_IBASS2026_GAS.gs` — Google Apps Script untuk integrasi Track File ↔ Google Sheets

## Konvensi
- Selalu **Read file HTML dulu** sebelum edit — user sering edit paralel.
- Jangan tambah jargon teknis di UI (no "Gemini", "API", "localStorage" di teks yang user lihat).
- Pattern dashboard: `switchTab(prefix, id, el)`, `initX()` per divisi, `openApp(div)`.
- User = "Boss". Bahasa Indonesia.

## Memory
Baca `memory/MEMORY.md` untuk state proyek lengkap dan titik resume terakhir.
