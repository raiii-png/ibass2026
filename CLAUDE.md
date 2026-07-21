# I-BASS 2026 — HIMA Administrasi Bisnis, Universitas Telkom

Proyek web untuk kegiatan I-BASS 2026. Semua file HTML = single-file (CSS + JS inline).

## File utama
- `index.html` = web **Penilaian Bizstar** — hosted di GitHub Pages, link `raiii-png.github.io/ibass2026/`
- `kadiv/index.html` = **Dashboard Kadiv** 5 divisi (Sekretaris, Pubdok, Logistik, Acara, Finance) + Track File —
  link `raiii-png.github.io/ibass2026/kadiv/`. **INI FILE DASHBOARD YANG DIEDIT** (dulu `DASHBOARD_KADIV_IBASS2026.html`).
- `DASHBOARD_KADIV_IBASS2026.html` = HANYA halaman redirect ke `kadiv/` (jangan edit isinya, jangan taruh dashboard di sini lagi).
- `penilaian.html` = cadangan identik dari `index.html` (kalau penilaian ketimpa, restore dari sini).
- `TRACKFILE_IBASS2026_GAS.gs` — Google Apps Script untuk integrasi Track File ↔ Google Sheets

## PENTING: jangan tertukar
- Penilaian = `index.html` (root). Dashboard = `kadiv/index.html`. Antigravity pernah menimpa index.html
  dengan dashboard 2× — kalau title `index.html` bukan "Penilaian Bizstar", berarti ketimpa: restore dari `penilaian.html`.

## Konvensi
- Selalu **Read file HTML dulu** sebelum edit — user sering edit paralel.
- Jangan tambah jargon teknis di UI (no "Gemini", "API", "localStorage" di teks yang user lihat).
- Pattern dashboard: `switchTab(prefix, id, el)`, `initX()` per divisi, `openApp(div)`.
- User = "Boss". Bahasa Indonesia.

## Memory
Baca `memory/MEMORY.md` untuk state proyek lengkap dan titik resume terakhir.
