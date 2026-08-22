# IBASS 2026 — HIMA Administrasi Bisnis, Universitas Telkom

Proyek web untuk kegiatan IBASS 2026. Semua file HTML = single-file (CSS + JS inline).

## File utama
- `index.html` = web **Penilaian Bizstar** — hosted di GitHub Pages, link `raiii-png.github.io/ibass2026/`
- `kadiv/index.html` = **Dashboard Kadiv** 5 divisi (Sekretaris, Pubdok, Logistik, Acara, Finance) + Track File —
  link `raiii-png.github.io/ibass2026/kadiv/`. **INI FILE DASHBOARD YANG DIEDIT** (dulu `DASHBOARD_KADIV_IBASS2026.html`).
- `DASHBOARD_KADIV_IBASS2026.html` = HANYA halaman redirect ke `kadiv/` (jangan edit isinya, jangan taruh dashboard di sini lagi).
- `keaktifan/index.html` = halaman **Bizstar lapor proker HIMA** — link `raiii-png.github.io/ibass2026/keaktifan/`.
  Menerima `?dept=` dan `?buddy=` dari link yang dibagikan buddy.
- `penilaian.html` = cadangan identik dari `index.html` (kalau penilaian ketimpa, restore dari sini).
- `TRACKFILE_IBASS2026_GAS.gs` — Google Apps Script: Track File ↔ Sheets, sheet Penilaian,
  sheet Keaktifan, dan sheet **Peringkat** (KPI + poin, dibangun ulang otomatis).
- `PANDUAN_BUDDY_IBASS2026.md` — skrip presentasi untuk membriefing 8 buddy.

## PENTING: jangan tertukar
- Penilaian = `index.html` (root). Dashboard = `kadiv/index.html`. Antigravity pernah menimpa index.html
  dengan dashboard 2× — kalau title `index.html` bukan "Penilaian Bizstar", berarti ketimpa: restore dari `penilaian.html`.

## Konvensi
- Selalu **Read file HTML dulu** sebelum edit — user sering edit paralel.
- Jangan tambah jargon teknis di UI (no "Gemini", "API", "localStorage" di teks yang user lihat).
- Pattern dashboard: `switchTab(prefix, id, el)`, `initX()` per divisi, `openApp(div)`.
- User = "Boss". Bahasa Indonesia.
- Tulis UI seperti orang, bukan seperti AI: kalimat pendek, tanpa kata pemanis
  ("memukau", "komprehensif", "optimal"), tanpa emoji.
- Daftar 8 buddy (`BUDDY_2026`) ada di TIGA file: `index.html`, `keaktifan/index.html`,
  `TRACKFILE_IBASS2026_GAS.gs`. Ganti orang = ganti di ketiganya.
- Ejaan resmi: **IBASS** (bukan I-BASS).

## Memory
Baca `memory/MEMORY.md` untuk state proyek lengkap dan titik resume terakhir.
