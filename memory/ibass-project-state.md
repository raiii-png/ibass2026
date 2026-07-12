---
name: ibass-project-state
description: "State lengkap proyek IBASS 2026 — arsitektur, fitur, file, GAS, keputusan produk, dan titik resume (per 2026-07-05)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b58bde3-339d-4414-b122-b7aaba92099c
---

# Proyek I-BASS 2026 — HIMA Administrasi Bisnis, Universitas Telkom

## KEAMANAN KUNCI AI (per 2026-07-11) — PENTING
- **Kunci Gemini TIDAK ADA lagi di HTML/repo.** Semua panggilan AI lewat proxy GAS:
  `aiCall(payload)` di dashboard → `gasPost(GAS_URL,{action:'ai',payload})` → GAS
  `UrlFetchApp` ke Gemini pakai kunci dari **Script Properties `GEMINI_KEY`**.
- Upload file besar (audio/video >18MB): `action:'aifileinit'` bikin tiket upload di server,
  file mengalir langsung browser→Google. Status file: GET `?action=aifilestatus&name=...`.
- **Kunci tipe `AQ...` (AI Studio express) kadaluarsa tiap beberapa hari.** Kalau AI mati:
  user cukup ganti VALUE Script Property GEMINI_KEY (Project Settings → Script properties)
  — TANPA redeploy, langsung aktif. Jangan pernah taruh kunci di HTML lagi.
- Kunci-kunci lama yang bocor di riwayat git akan direvoke user (hapus service account
  `ais-gemini-key-*` di console.cloud.google.com Credentials, project ibass-2026).

## Sesi 8 (2026-07-11 malam, Boss tidur — kerja mandiri): 6 fitur + fix kritis
- **Background dicerahkan** (2 panitia komplain gelap): gradasi canvas galaxy `#22406f→#0b1c3c`,
  token `--bg` dkk naik, kabut intro ikut. Jangan digelapkan lagi.
- **Pubdok tab "Referensi"** (untuk Tika): `renderPdReferensi/pdGenReferensi` — 3 konsep desain
  feed IG via aiCall (JSON), palet hex visual, link pencarian Pinterest. Storage `ibass_pd_ref`.
- **Acara tab "Penilaian"**: `renderAcPenilaian/acPenLoad/acPenCopyBelum` — fetch `?action=penilaian`,
  roster buddy editable (`ibass_ac_buddy`), status per milestone (AC_MILESTONES 5), salin WA.
- **Logistik foto bukti**: `lgUploadBukti/lgCompressImage` (canvas 1280px JPEG) → GAS
  `action:uploadbukti` → Drive folder "Bukti Pembayaran I-BASS 2026" (anyone-with-link) → URL.
- **Edit nama agenda rundown**: tombol ✎ sekarang selalu tampil per baris (dulu hanya di mode Atur).
- **Sync antar-perangkat**: GAS sheet STATE (hidden, key/json/updated) + `action:savestate` /
  `?action=loadstate`. Dashboard: `STATE_KEYS` (lg_items, ac_data, ac_notes, fn_income, fn_manual,
  fn_npanitia, fn_roster, ac_buddy, sk_history, pd_captions), intersepsi `localStorage.setItem`
  → `statePush` debounce 2.5s; `statePullAll()` di `openApp` (timestamp menang yang baru) →
  `reinitCurrentDiv()`. Track File: `tfAutoLoad(div)` saat buka tab tugas (throttle 60 dtk).
- **FIX KRITIS: `index.html` APPS_URL masih URL GAS lama yang MATI** — penilaian yang disubmit
  selama ini hilang. Sudah diganti ke URL baru.
- Auto-sync script laptop Boss commit+push sendiri tiap jam (a4b3c0b dkk) — cek `git log` dulu
  sebelum commit manual, sering sudah ter-commit.

## Sesi 9 (2026-07-11 siang): RAB editable + roster panitia asli
- **Nama item RAB per sesi bisa diedit** — kolom Item jadi input teks (override `ovr.nama`
  di `ibass_fn2`, `fnSetItem` handle field 'nama' string; kosong = balik ke default).
  `ibass_fn2` masuk STATE_KEYS (ikut sync antar-perangkat).
- **Roster 18 panitia asli** (`FN_ROSTER_SEED`, fallback `fnRoster()`) — nama lengkap dicocokkan
  dari daftar workshirt Boss + mastersheet KPI (`KPI HIMA ADBIS 2026 .csv` di Downloads) +
  nama pembayar form DAP. **BELUM KETEMU nama lengkap: "Dyba" dan "Tika (Acara)"** — masih
  panggilan, Boss harus konfirmasi. (Tika Pubdok = Yulia Dwi Kartika, dari data pembayar form.)
- **Daftar "Belum bayar sama sekali" tampil di kartu DAP** (`fnBelumBayarList`, info-box amber).
  Per 07-11: Tri Utami Widyaningsih, Aqila Diana Sofi, Dyba, Tika (Acara), Tommy Rizkya.
- `fnNormName`/`acPenNorm` buang tanda baca (kasus "Khotibul Umam Al 'Isyrafi").

## Sesi 9 (2026-07-11 malam): GAS FULL LIVE + RAB proposal + LPJ
- **GAS SUDAH DIOTORISASI & DEPLOY (semua endpoint hijau per 2026-07-11 malam):**
  ai (proxy Gemini), uploadbukti (→Drive), savestate/loadstate (sync). JANGAN suruh
  Boss re-deploy lagi kecuali kode .gs berubah.
- Sesi RAB "PROP" (RAB Proposal Resmi, 22 item, total Rp11.980.000, flag ref:true —
  di-skip fnCalcAll). Tombol +Item / × per divisi per sesi (`fnAddRabItem/fnDelRabItem/
  fnItemsFor`; custom = entri `cu-*` di fnData, hapus default = flag hapus).
- **LPJ**: `fnBuatLPJ()` (dokumen cetak putih + lampiran nota via Drive thumbnail) dan
  `fnCopyLPJ()` (salin tabel text/html via ClipboardItem → paste di template HIMA Word/GDocs
  jadi tabel). Tombol di Finance → Laporan.
- Fix: [object Object] di daftar belum-bayar, kamera otomatis saat Sudah Beli tanpa bukti
  (klik file input dalam gesture), toast wrap di HP (max-width 92vw).
- Roster DAP per divisi (FN_ROSTER_SEED objek {n,d}, 18 panitia dari proposal) + tabel
  Kas&DAP dikelompokkan per divisi + fnRosterStatus() matching longgar.
- Referensi Pubdok diverifikasi end-to-end dengan AI asli (konsep + palet + link Pinterest).

## Sesi 10 (2026-07-12): RAB = proposal, referensi bergambar, checklist Hari-H
- **RAB per sesi DIGANTI TOTAL**: 22 item proposal didistribusi ke sesi pemakaian
  (OR 125rb: admin+poster; TWN1 4.525rb: idcard+workshirt panitia+pin+cuecard+rundown;
  TWN2 6.745rb: workshirt peserta+hadiah; TWN3 483rb: confetti+selempang+sertifikat+hadiah;
  PMT1 102rb: sticky+plakat; ITV/PMT2 kosong). fnCalcAll = 11.980.000 = RAB Proposal.
  Id lama or-*/tw* mati; id baru or2-*, t1-*, t2-*, t3-*, p1-*.
- **Referensi Pubdok bergambar**: GAS `action:imgsearch` (scrape Bing Images via UrlFetchApp,
  balik {img,thumb,sumber,judul}×12). Klien: `pdRefCariGambar(q)` render grid #pdref-grid,
  klik gambar → sumber asli; keyword chip = tombol pencarian; auto-load setelah generate.
  **BUTUH DEPLOY NEW VERSION GAS** (tanpa authorize ulang — scope sudah ada).
- **Logistik tab "Hari-H"**: checklist barang per sesi, status Belum→Disiapkan→Dibawa→Kembali,
  tarik otomatis dari Pengadaan (`lgHhImport`), salin WA. Storage `ibass_lg_harih` (ikut sync).

## Sesi 10b (2026-07-12 malam): fix total dobel + roster update + grafik
- **Fix Total RAB 23,96jt → 11,98jt**: renderFnLaporan & fnCopyLaporan skip s.ref (sesi PROP
  referensi tidak dihitung/ditampilkan dobel; fnCalcAll sudah skip dari sebelumnya).
- **Nur Hafiizh Puta Iskandar KELUAR dari panitia** → roster 17 orang. FN_KELUAR (norm names)
  difilter permanen di fnRoster() (roster tersimpan lama ikut bersih). fnNPanitia default =
  panjang roster (17); nilai '18' lama dimigrasi otomatis.
- **AC_BUDDY_SEED**: 8 buddy resmi per dept (Ayu/Secre, Nursyfa/Finance, Eghina/HRD,
  Akram/Advocacy, Razwa/ExtAff, Tyara/MEIN, Marzya/Entre, Anggun/ACT) — default
  acBuddyRoster; matching longgar tetap jalan walau nama diketik sebagian.
- **GAS `updateGrafik(ss)`**: sheet GRAFIK berisi tabel status per divisi + chart kolom
  bertumpuk + donat "Selesai per Divisi", dibangun ulang tiap action:sync (setelah
  rebuildRekap), try/catch supaya tidak ganggu sync. BUTUH deploy New version
  (bareng imgsearch — user belum deploy dua-duanya per 2026-07-12 malam).

## PENDING pagi Boss (2026-07-11):
1. Paste .gs terbaru → di editor RUN fungsi apa saja (mis. doGet) → dialog izin → Allow
   (UrlFetchApp + Drive) → Deploy New version. Tanpa ini: AI, foto bukti, sync state MATI
   (error "tidak memiliki izin UrlFetchApp"). Fitur lama tetap jalan.
2. Hapus 3 service account `ais-gemini-key-*` LAMA di console.cloud.google.com Credentials
   (revoke kunci bocor di riwayat git) — sisakan yang dipakai Script Property.
3. Hapus repo `kadivibass2026/kadivibass2026.github.io` + organisasinya (Danger Zone) — batal dipakai.

## Sesi 9 (2026-07-11 siang): roster panitia + wajib nota + referensi multi-platform
- **Roster 18 panitia RESMI** (`FN_ROSTER_SEED`, objek `{n,d}`) dari Proposal I-BASS 2026 —
  Kas & DAP menampilkan status per orang DIKELOMPOKKAN per divisi (Inti/Acara/Pubdok/Logistik)
  + "Pembayar Lain". `fnRosterStatus()` mencocokkan pembayar↔roster (longgar, greedy exact dulu).
  Kamus panggilan: Sofi=Aghni Alicia Sofi, Tami=Tri Utami Widyaningsih, Dyba=Nadya Badzlin,
  Tika Acara=Thyka Agusthy Dwi Yumandha, Vina=Oktavina Rizky Alana, Tika Pubdok=Yulia Dwi
  Kartika, Nichol=Nicholas Saputra, Rikep=Rizky Akmal Fadhillah, Tibul=Khotibul Umam Al Isyrafi,
  Tommy=Tommy Rizkya, +Nur Hafiizh Puta Iskandar (Logistik). Format edit roster: "Nama, Divisi".
- **Wajib nota**: `lgSetStatus` menolak "Sudah Beli" tanpa `bukti` → buka form bukti,
  `lgAfterBukti(idx)` (dipanggil lgSaveBukti & lgUploadBukti) otomatis menuntaskan status.
- **Referensi Pubdok multi-platform**: `pdRefPlatforms(q)` → IG/TikTok/Behance/Dribbble/IG-tag
  per konsep + kartu "Jelajah Inspirasi Umum". RAB nama item sudah editable (sesi HP) —
  `ibass_fn2` masuk STATE_KEYS.
- Verifikasi via jsdom (browser tools terputus): `test_dashboard.js` di scratchpad — pola
  berguna untuk test headless tanpa Chrome.
- Proposal PDF: `C:/Users/mrraf/Downloads/PROPOSAL IBASS 2026 terbaru 1.pdf` (teks diekstrak
  pakai pdf-parse; susunan panitia di halaman 8-10).

## Arsitektur
- **Single-file HTML** (semua CSS + JS inline) — bukan framework, murni vanilla.
- **localStorage** untuk semua data persisten (tidak ada backend database).
- **Google Gemini 2.5 Flash API** untuk fitur AI (transkripsi, notulen, caption, storyboard, cut plan).
  - Key tersimpan di file HTML (`GEMINI_KEY`), jangan tulis di memory/docs.
  - Key AKTIF (dites 2026-07-03, HTTP 200).
- **Google Apps Script** sebagai middleware dashboard ↔ Google Sheets + Google Docs.
  - GAS URL dipakai dengan `mode:'no-cors'` untuk POST (write-only), normal fetch untuk GET.
  - Form DAP ID: `1Ko8M-oRQisCxnOO5KDQXF2g8sS854yurR_qSxfJrYyE`.

## File Utama
1. **`index.html`** (dulunya `PENILAIAN_IBASS_2026 (1).html`) — Web penilaian Bizstar.
   - Intro animasi: bintang meledak → membentuk kastil (Canvas 2D particle system).
   - Form penilaian KPI per milestone (Buddy, Workshop, dll — "Interview" sudah dihapus).
   - `APPS_URL` + `SUBMIT_TOKEN` sudah diisi — jalur kirim ke GAS aktif.
   - **Hosted:** `raiii-png.github.io/ibass2026` (GitHub Pages).

2. **`DASHBOARD_KADIV_IBASS2026.html`** — Dashboard untuk 5 divisi:
   - **Sekretaris**: rekaman audio (2 HP) + rekam rapat online (Meet/Zoom via getDisplayMedia + mic digabung), transkrip + notulen via Gemini, kirim ke Google Docs, tab Laporan Perkembangan → GDocs persisten.
   - **Pubdok**: video cut tool, caption generator (prompt natural, tanpa klise AI), storyboard, Upload Konten (`pd-trackfile`).
   - **Logistik**: manajemen barang + bukti pembayaran (link foto/nota), filter status+sesi, salin daftar belanja, integrasi otomatis ke Finance.
   - **Acara**: rundown interaktif + countdown timer, nama sesi bisa di-rename kadiv, jam mulai per sesi.
   - **Finance**: RAB pre-loaded (81 item), Kas & DAP (`fn-trackfile`), seed 9 pembayaran DAP (Rp1.535.000), pemasukan lain + pengeluaran manual.
   - **Track File**: tab di semua 5 divisi (panel id `{prefix}-tugas`), auto-sync 2 dtk ke GAS/Sheets.
   - **Panduan**: tab di semua 5 divisi, step-by-step per fitur.
   - Pattern: `switchTab(prefix, id, el)` untuk tab, `initX()` per divisi dari `openApp(div)`.

3. **`TRACKFILE_IBASS2026_GAS.gs`** — Google Apps Script:
   - GET: `?action=read/rekap/dap/penilaian/laporanurl`
   - POST: `action:sync/addItem/setup` + `submissions` (penilaian) + `action:laporan` + `action:createDoc`
   - Handler laporan: append ke Google Doc persisten, stempel waktu WIB.
   - Handler createDoc: notulen → Google Docs baru.

## UI — «Royal Grandeur» V8 (per 2026-07-05)
- **PENTING: redesign Graphite (Syne/Inter/indigo) DITOLAK** — user lebih suka Cinzel/Cinzel Decorative/Raleway, tema kastil Disney/magic, navy + emas. JANGAN ganti font/tema.
- Intro: kastil emas line-art SVG (stroke-dashoffset, `pathLength="1"`) + 10 partikel debu magis + galaxy.
  JANGAN pakai `drop-shadow` filter di SVG animasi — glow pakai `::before` radial-gradient.
- V8 layer: vignette, segel divisi bundar cincin ganda, tab aktif EMAS + underline menyala, card-label emas + garis, tombol kilau menyapu, kas-hero aura emas, fadeUp animasi panel, hover lift.
- `openDivisiSelect()` delay 950ms (fade intro) — screenshot otomatis harus tunggu >1s.
- TANPA EMOJI di seluruh UI. Simbol tipografis (✎ × ↑ ↓ ▸ ✓) boleh.
- Semua jargon teknis ("Gemini", "API", "localStorage") tidak ada di UI.

## Keputusan produk (kumulatif)
- **Track File AKTIF** di 5 divisi — panel id `{sk,pd,lg,ac,fn}-tugas`. Jangan pakai `-trackfile` untuk Track File: `fn-trackfile` = Kas&DAP, `pd-trackfile` = Upload Konten.
- **Arsip Surat Sekretaris DIHAPUS** (tab, panel, semua fungsi skSurat*).
- **Pubdok: Briefing DIHAPUS**. Caption prompt ditulis ulang: natural, tanpa klise AI, tanpa emoji.
- **Acara: nama sesi bisa diganti** — `acLabel(k)`, `acRenameSesi()`, input `#ac-sesi-nama`.
- **Logistik: bukti pembayaran** — field `bukti` di data barang, inline quick-add saat "Sudah Beli", link di tabel + laporan. Ditambahkan sesi ke-6 (2026-07-05).
- **Seed 9 pembayaran DAP asli** (total Rp1.535.000): `fnDapPay()` fallback ke `DAP_SEED`.
- **Rekam Rapat Online**: `startRecordOnline()` → `getDisplayMedia` + mic via AudioContext.
- **Laporan Perkembangan**: tab Sekretaris → POST GAS → Google Doc persisten.

## Riwayat sesi
| Sesi | Tanggal | Device | Commit/PR | Ringkasan |
|------|---------|--------|-----------|-----------|
| 1-2 | 07-02 | Laptop | `1f2c94b` | Integrasi DAP, Kas Finance, fitur kadiv, UI V6 |
| 3 | 07-03 | Laptop | `d721c89` | Redesign Graphite — DITOLAK |
| 4 | 07-03 | Laptop | `ae44c3b` | Revert → Royal Magic, panduan, arsip/briefing hapus, seed DAP |
| 5 | 07-03 | Remote+HP | PR #1-#7 | Penilaian→GAS, rekam online, laporan, Track File aktif, UI V8 |
| 6 | 07-05 | Laptop | `458591e`,`fc26dcc` | Bukti pembayaran Logistik, fix loop SR, kunci AI baru, rekam online terverifikasi |

## Sesi 7 (2026-07-10) — GAS beres total, Finance live dari form
- **GAS URL BARU** (deployment baru dari sesi Antigravity): `AKfycbxCTCMFY1KEBuT6TeiBbMeDgB-JL2o3zOXtdvpDagd1E-tMScq45uxX-nwUqA9qf9Becg`.
  Yang lama (`AKfycbx5iNCi...`) MATI. `tfGetUrl()` sekarang SELALU pakai konstanta `GAS_URL`
  dan auto-hapus URL nyangkut di localStorage.
- **Track File → Sheets JALAN** (POST sync dibalas `{"ok":true}`). Bug sebelumnya: kode
  ter-deploy ≠ repo (error "action is not defined") → fixed dengan paste ulang + redeploy.
- **DAP parsing fix di GAS**: cek 'bukti'/'upload'/Array SEBELUM 'nama' — judul pertanyaan
  upload form mengandung kata "nama" sehingga ID file menimpa nama asli. Sekarang 13 nama
  asli + link bukti transfer semua muncul.
- **Finance auto-update**: `fnDapAutoStart()` fetch diam-diam saat Finance dibuka + tiap 60 dtk
  (hanya saat tab visible), notif "X pembayaran baru masuk". Selalu menimpa data lama.
- **Fitur roster + salin belum bayar**: `fnRoster()` (localStorage `ibass_fn_roster`, satu nama
  per baris, auto-set jumlah panitia), `fnCopyBelumBayar()` — teks WA 3 seksi: belum bayar
  sama sekali (dari roster), belum lunas (+ kurang berapa), sudah lunas.
- **Kunci AI diganti lagi (10 Jul)**, notulen diverifikasi end-to-end. Ingat: kunci `AQ...`
  umurnya pendek — kalau AI mati (401), minta Boss buat kunci baru. Kunci permanen `AIza`
  gagal dibuat (Cloud Console ruwet buat Boss) — jangan paksa, cukup ganti kunci saat mati.
- **Push ke origin/main sukses** (`848c655`) setelah Boss klik Allow di GitHub secret scanning.
  Tiap push baru dengan kunci baru akan kena blok lagi — kasih link unblock ke Boss.
- Catatan: ada branch cloud `claude/*` di remote dari sesi HP — belum di-merge, abaikan
  kecuali Boss menyebutnya.
- **HOSTING: Boss pakai `kadivibass2026.netlify.app`** (dashboard = halaman utama, dibuat
  sesi Antigravity). Versi di sana BUILD RUSAK (panggil `gasPost` yang tak ada → semua
  kirim gagal "Gagal kirim"). Deploy ulang GAGAL: kredit akun Netlify habis
  ("account credit usage exceeded", plan gratis). RENCANA saat kredit reset (awal bulan):
  deploy sekali isi `netlify_site/_redirects` (proxy 200! ke GitHub Pages) via MCP Netlify
  (siteId `9982f851-f4e6-4ad4-ba42-c20b66eed2e8`) — setelah itu Netlify jadi cermin
  otomatis GitHub selamanya tanpa build. `netlify.toml` publish=netlify_site sudah di repo.
- **Sementara Boss pakai link GitHub Pages** (selalu auto-update tiap push, terverifikasi
  serve versi terbaru): `raiii-png.github.io/ibass2026/DASHBOARD_KADIV_IBASS2026.html`.
  Script auto-sync di laptop Boss ikut push ke GitHub otomatis.
- localStorage per origin: data Track File yang diketik di netlify.app tidak muncul di
  github.io — pakai tombol "Muat dari Sheets" untuk menarik data dari sheet.

## ⏭️ Resume (per 2026-07-05)

**Status: semua fitur selesai, commit `fc26dcc` (main).**

Sesi ke-6 (07-05):
- **Bukti pembayaran Logistik** — field `bukti` di form, inline quick-add (`lgAddBukti/lgSaveBukti`), link "Lihat Bukti" di tabel, link di laporan pengeluaran.
- **Rekam Rapat Online TERVERIFIKASI end-to-end** di browser (mock getDisplayMedia + mic → gabung → rekam → stop → transkripsi Gemini 200 → hasil tampil).
- **Fix loop SR**: preview real-time berhenti retry kalau izin mikrofon `not-allowed` (dulu infinite loop, banjir warning).
- **Kunci AI diganti** (2026-07-05, dites 200). PENTING: kunci format `AQ...` = token sementara,
  expired ±2 hari (yang lama mati 401 pada 07-05). Kalau AI mati lagi → minta Boss buat kunci
  baru. Boss ingin kunci PERMANEN format `AIza...` dari aistudio.google.com/apikey —
  Boss harus buat sendiri (login Google), lalu Claude pasang di `GEMINI_KEY`.

**GAS status:** user bilang sudah re-deploy (2026-07-05). Perlu ditest:
- Tombol "Cek Pembayaran Baru" di Finance (9 respons asli dari form)
- Laporan Perkembangan → cek Google Doc terbuat
- Submit penilaian dari `raiii-png.github.io/ibass2026` → cek sheet "Penilaian"

**Catatan penting:**
- User ("Boss") sering edit paralel dari HP — SELALU baca file HTML dulu sebelum edit.
- User suka bilang "lanjut ke web kadiv sampai tahap sempurna" — artinya test semua fitur dan perbaiki kekurangan.
- GitHub: user `raiii-png`, repo `ibass2026`.
- Verifikasi via server statis lokal (`.claude/launch.json`, port 8321).

**Why:** Memory ini adalah sumber konteks utama supaya sesi baru (laptop atau HP) langsung nyambung tanpa tanya ulang.

**How to apply:** Baca file ini → Read file HTML terbaru (user sering edit paralel) → lanjutkan dari state di atas.
