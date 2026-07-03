---
name: ibass-project-state
description: "State lengkap proyek IBASS 2026 — arsitektur, fitur, file, GAS, dan progres terakhir (per 2026-07-02)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2d8cfa65-87c1-4024-91a3-8c8884848e6b
---

# Proyek I-BASS 2026 — HIMA Administrasi Bisnis, Universitas Telkom

## Arsitektur
- **Single-file HTML** (semua CSS + JS inline) — bukan framework, murni vanilla.
- **localStorage** untuk semua data persisten (tidak ada backend database).
- **Google Gemini 2.5 Flash API** untuk fitur AI (transkripsi, notulen, caption, storyboard, briefing, cut plan).
  - Key tersimpan di file HTML (`GEMINI_KEY`), jangan tulis di memory/docs.
- **Google Apps Script** sebagai middleware dashboard ↔ Google Sheets.
  - GAS URL dipakai dengan `mode:'no-cors'` untuk POST (write-only), normal fetch untuk GET.

## File Utama
1. **`PENILAIAN_IBASS_2026 (1).html`** — Web penilaian Bizstar.
   - Intro animasi: bintang meledak → membentuk kastil (Canvas 2D particle system).
   - Form penilaian KPI per milestone (Buddy, Workshop, dll — "Interview" sudah dihapus).
   - Fitur "Tidak Hadir" untuk Bizstar absent.
   - Webhook ke Google Apps Script (`APPS_URL`) — masih placeholder.
   - Mobile responsive.
   - **Hosted:** `raiii-png.github.io/ibass2026` (GitHub Pages). Update via `update.bat` di `C:\Users\mrraf\Downloads\ibass2026\`.

2. **`DASHBOARD_KADIV_IBASS2026.html`** (~218 KB, 4663 baris) — Dashboard untuk 5 divisi:
   - **Sekretaris**: upload 2 rekaman audio (2 HP), transkrip + notulen via Gemini, kirim ke Google Docs.
   - **Pubdok**: auto video cut tool (upload video → mark moments → AI cut plan → extract clips), caption generator, storyboard.
   - **Logistik**: manajemen barang, integrasi otomatis ke Finance (beli barang → potong budget).
   - **Acara**: rundown interaktif + countdown timer (besar, responsive, pulse animation, urgent glow ≤60 detik).
   - **Finance**: RAB pre-loaded (81 item, 7 sesi × 4 divisi dari proposal), input realisasi, tracking DAP.
   - **Track File**: terhubung ke Google Sheets (per-divisi + REKAP). Row overdue otomatis merah + ⚠.
   - Pattern: `switchTab(prefix, id, el)` untuk tab, `initX()` per divisi dari `openApp(div)`.

3. **`TRACKFILE_IBASS2026_GAS.gs`** — Kode Google Apps Script untuk Track File → Sheets.
   - Bug sebelumnya: `ss.setSpreadsheetName is not a function` → sudah difix pakai `ss.rename()`.
   - Jalankan `setupSpreadsheet()` setelah paste.

## File Pendukung (di `C:\Users\mrraf\Downloads\files IBASS\`)
- `RAB_IBASS_2026_LENGKAP.xlsx` — sumber data RAB.
- `PROPOSAL_IBASS_2026_TEMPLATE.docx`, `SUSUNAN_ACARA_IBASS_2026.docx`, `MANAJEMEN_RISIKO_IBASS_2026.docx`, `DAFTAR_ISI_IBASS_2026.docx`.
- `JOBDESC_KADIV_LOGISTIK_IBASS2026.html`, `konsep_pematerian_ibass2026.html`, `WORKSHIRT_DESIGN_KIT_IBASS2026.html`, `WORKSHIRT_MOCKUP_IBASS2026.html`, `games_twn1.html`.

## UI Terakhir — «Royal Magic» (per 07-03 sesi ke-4, commit ae44c3b)
- **PENTING: redesign Graphite (d721c89, Syne/Inter/indigo) DITOLAK user** — user lebih suka
  gaya lama: Cinzel/Cinzel Decorative/Raleway, tema kastil Disney/magic, navy + emas.
  File di-revert ke 1f2c94b lalu dipoles. Jangan ganti font/tema itu lagi.
- Intro: kastil emas line-art SVG yang menggambar dirinya sendiri (stroke-dashoffset,
  `pathLength="1"`) + 10 partikel debu magis melayang naik (`.i-dust`) + galaxy lama.
  JANGAN pakai `drop-shadow` filter di SVG animasi — bikin capture/compositing macet;
  glow pakai `::before` radial-gradient statis.
- Aksen royal: `.sec-eye/.page-eye` warna emas, `.sec-title::after` garis emas tipis,
  tombol hover bingkai emas, scrollbar gelap tipis.
- TANPA EMOJI di seluruh UI (aturan tetap dari user). Simbol tipografis (✎ × ↑ ↓ ▸ ✓) boleh.
- Semua jargon teknis ("Gemini File API" dll) tetap tidak ada di UI.

## Keputusan produk penting (sesi ke-4, 07-03)
- **Track File DISEMBUNYIKAN** dari semua divisi (tab dihapus; engine tf* masih ada, dorman).
  Kata user: "keep it secret, otomatis dan disesuaikan". Tab Finance "Kas & DAP" tetap
  (pakai id `fn-trackfile` — JANGAN dihapus, itu bukan track file).
- **Arsip Surat Sekretaris DIHAPUS** (tab, panel, semua fungsi skSurat*).
- **Pubdok: Briefing DIHAPUS** (tab, panel, generateBriefing/copyBriefing). Tab "Track File"
  jadi "Upload Konten" (panel pd-trackfile berisi upload tracker; renderTrackFileTab tak dipanggil lagi).
- **Caption prompt ditulis ulang** supaya natural: larangan frasa klise AI ("Tak hanya itu" dll),
  tanpa emoji, cerita momen konkret.
- **Acara: nama sesi bisa diganti** — `acLabel(k)` (custom label di `acData()[k].label`),
  `acRenameSesi()`, input `#ac-sesi-nama` + tombol "Simpan Nama" di kartu jam mulai.
- **Tab "Panduan" di semua 5 divisi** — `renderPanduan(prefix)` + `pgCard/pgSteps`,
  konten lengkap step-by-step per fitur, tanpa emoji.
- **Seed 9 pembayaran DAP asli** (`DAP_SEED` di JS, total Rp1.535.000): Aghni T1, Fakhri Lunas,
  Fikri Lunas, Rizky Lunas, Atika T1, Nicholas Lunas, Oktavina T1, Raffi Lunas, Khanza T1.
  `fnDapPay()` fallback ke seed kalau localStorage kosong; "Cek Pembayaran Baru" menimpanya.
- **Gemini API key AKTIF (dites 07-03, HTTP 200)** — AI notulen diverifikasi end-to-end di
  browser (input manual → generateNotulen → hasil terformat). GAS URL deployment MASIH LAMA
  (balas HTML, bukan JSON) — user tetap harus re-deploy supaya `?action=dap` hidup.

## ⏭️ LANJUT DARI SINI (per 2026-07-02, sesi ke-2)

**Status terakhir: Integrasi DAP + Kas Finance + fitur kadiv per divisi + UI V6 SELESAI, commit `1f2c94b`.**

**Yang baru dikerjakan sesi ini:**
- **GAS** (`TRACKFILE_IBASS2026_GAS.gs`): endpoint `?action=dap` baca respons form
  "PEMBAYARAN DAP IBASS 2026" (form ID `1Ko8M-oRQisCxnOO5KDQXF2g8sS854yurR_qSxfJrYyE`)
  via `FormApp.openById`. Nominal diparse dari teks termin (T1 115rb / T2 100rb / Lunas 215rb).
  **USER HARUS RE-DEPLOY:** paste kode baru → Manage deployments → Edit → New version
  (URL tetap) → authorize izin Forms.
- **Finance**: bug fatal difix (blok legacy pakai `FN_KATEGORI` undefined → tab blank).
  Tab baru "Kas & DAP": tombol "Cek Pembayaran Baru" fetch GAS, status lunas per orang
  (wajib Rp215.000, jumlah panitia editable default 18), rekap per divisi, pemasukan lain +
  pengeluaran manual. Saldo kas = DAP + pemasukan − belanja Logistik − pengeluaran manual.
  Laporan ada tombol "Salin Laporan untuk WhatsApp". Storage: `ibass_fn_dap_pay`,
  `ibass_fn_income`, `ibass_fn_manual`, `ibass_fn_npanitia`.
- **Logistik**: edit barang (✎), filter chips status + select sesi, tombol "Salin Daftar
  Belanja" (grup per sesi, format WA), strip saldo kas + warning kalau rencana belanja
  melebihi saldo. Fungsi: `lgSaveForm/lgEdit/lgCopyBelanja`, state `lgEditIdx/lgFilterStatus/lgFilterSesi`.
- **Acara**: jam mulai per sesi (`acData()[sesi].mulai`) → estimasi jam tiap agenda +
  perkiraan selesai; mode "Atur Agenda" (↑↓✎× reorder/edit/hapus); form tambah inline
  gantikan prompt(). Fungsi baru: `acMoveItem/acEditItem/acDelItem/acSaveItemForm/acSetMulai`.
- **Sekretaris**: tab baru "Arsip Surat" (`sk-surat`, `renderSkSurat`, storage `ibass_sk_surat`) —
  surat masuk/keluar, nomor, perihal, tujuan, tanggal, link file, status cycle
  (Draft→Dikirim→Diterima→Diarsipkan).
- **UI V6**: layer refinement di akhir `<style>` — angka tabular-nums (`.num`), stat pakai
  Raleway 600 (bukan Cinzel Decorative), radius 6px, chip status kapsul, teks mikro dinaikkan,
  komponen baru `.kas-hero/.kas-strip/.mini-grid/.pill/.inline-form/.filter-row/.list-title/.ac-mini`,
  layout desktop ≥760px (main 900–1040px, tabs kiri).
- Helper global `fmtRp(n)`. Verifikasi via server statis lokal (`.claude/launch.json`, port 8321,
  server.js di scratchpad — kalau hilang tinggal buat ulang), semua divisi nol error console.

**Sesi ke-4 (07-03): revert Graphite → Royal Magic + fitur** — detail di bagian "UI Terakhir"
dan "Keputusan produk" di atas. Commit `ae44c3b`. Semua diverifikasi di Chrome (localhost:8321):
tab bars benar, panduan render, rename sesi Acara jalan, Finance saldo Rp1.535.000 dari seed,
AI notulen sukses end-to-end. Catatan: preview_screenshot tool macet sesi ini — verifikasi visual
pakai claude-in-chrome ke localhost:8321.

**Sesi ke-5 (07-03, via Claude Code web/remote): koneksi Penilaian Bizstar → GAS**
- `index.html`: `APPS_URL` diisi GAS URL yang sama dengan dashboard; `SUBMIT_TOKEN` diisi
  token asli (`ibass26-…`, lihat file) — placeholder hilang, jalur kirim asli aktif.
- `TRACKFILE_IBASS2026_GAS.gs`: handler baru di `doPost` — kalau body punya `submissions`,
  validasi `PENILAIAN_TOKEN` (harus sama dengan `SUBMIT_TOKEN` index.html) lalu `savePenilaian()`
  append ke sheet **"Penilaian"** (dibuat otomatis saat submit pertama, `ensurePenilaianSheet`).
  Endpoint baca baru: `?action=penilaian`. Verifikasi: node --check OK, kedua HTML load
  tanpa error console di Chromium headless.

**Yang MUNGKIN masih perlu:**
- **User RE-DEPLOY GAS (wajib, sekali):** paste kode .gs terbaru → Manage deployments →
  Edit → New version → Deploy (URL tetap). Ini sekaligus menghidupkan `?action=dap` DAN
  penerima penilaian. Lalu test: tombol "Cek Pembayaran Baru" (9 respons asli) + submit
  penilaian dari `raiii-png.github.io/ibass2026` → cek sheet "Penilaian" terisi.
- Pubdok belum dapat fitur baru (sudah paling lengkap).
- GitHub Pages: pastikan main ter-update (sesi HP sudah push dashboard + memory ke main).

**Catatan penting:**
- User suka bilang "lanjut ke web kadiv sampai tahap sempurna" — artinya test semua fitur dan perbaiki kekurangan.
- User pernah kasih akses autonomous (`--dangerously-skip-permissions`) untuk kerja tanpa approval.
- File utama ada di `C:\Users\mrraf\Downloads\Project Flutter\` (historis) DAN `C:\Users\mrraf\Downloads\ibass2026\` (untuk hosting).
- GitHub: user `raiii-png`, repo `ibass2026`.

**Why:** Chat IBASS sebelumnya pakai folder "Project Flutter" yang salah — sekarang dipindah ke folder `ibass2026` dengan memory sendiri supaya chat baru langsung nyambung.

**How to apply:** Saat user bilang "lanjutkan IBASS" atau buka chat baru di folder ibass2026, baca file ini → Read file HTML terbaru dulu (karena user sering edit paralel) → lanjutkan dari state di atas.
