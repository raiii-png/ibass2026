/**
 * TRACK FILE IBASS 2026 — Google Apps Script
 * ============================================
 * Cara setup:
 * 1. Buka Google Sheets baru (beri nama: "Track File IBASS 2026")
 * 2. Klik menu Extensions → Apps Script
 * 3. Hapus semua kode yang ada, paste seluruh kode ini
 * 4. Klik Run → pilih fungsi "setupSpreadsheet" → jalankan sekali
 * 5. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy URL deployment → paste ke Dashboard IBASS (Track File tab)
 *
 * ── UPDATE KODE (kalau sudah pernah deploy) ──
 * 1. Paste kode baru ini menggantikan yang lama
 * 2. Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy
 *    (URL TIDAK berubah, dashboard tetap jalan)
 * 3. Saat diminta izin baru, klik Allow:
 *    - Google Forms  → membaca pembayaran DAP dari form
 *    - Google Docs   → tombol "Kirim ke Google Docs" untuk notulen
 *
 * ── FITUR ──
 * - Track File per divisi + REKAP (sync otomatis dari Dashboard Kadiv)
 * - Sheet "Penilaian" (skor dari web Penilaian Bizstar)
 * - Sheet "LAPORAN" (laporan turunan ber-stempel waktu) — generate lewat
 *   menu "Laporan IBASS → Perbarui Laporan" di bar menu spreadsheet ini
 * - ?action=dap (pembayaran form), ?action=penilaian, ?action=laporanurl
 */

// ─── Konfigurasi ────────────────────────────────────────────────
const SHEET_DIVISI = ['Secretary', 'Pubdok', 'Logistik', 'Event', 'Finance'];
// Form "PEMBAYARAN DAP IBASS 2026"
const DAP_FORM_ID = '1Ko8M-oRQisCxnOO5KDQXF2g8sS854yurR_qSxfJrYyE';
const HEADER_ROW = ['No', 'Divisi', 'Kegiatan & Detail', 'Priority', 'Penanggung Jawab', 'Tanggal Mulai', 'Deadline', 'Status', 'Catatan', 'File/Link'];
const DATA_START_ROW = 2; // header di baris 1, data mulai baris 2 — layout polos tanpa warna

// ─── AI (Gemini) — kunci disimpan AMAN di Script Properties, bukan di web ───
// Setup sekali: Project Settings (ikon gerigi) → Script properties → Add script property
//   Property: GEMINI_KEY   Value: <kunci dari aistudio.google.com/apikey>
const GEMINI_MODEL = 'gemini-2.5-flash';
function geminiKey() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_KEY') || '';
}

// Web Penilaian Bizstar — token harus sama dengan SUBMIT_TOKEN di index.html
const PENILAIAN_TOKEN = 'ibass26-vGDnSmco7cBoju';
const PENILAIAN_SHEET = 'Penilaian';
const HT_SHEET = 'HT'; // pesan suara/teks antar panitia saat kegiatan
/* Kehadiran Bizstar di proker HIMA lain (di luar IBASS).
   Bizstar melapor sendiri lewat sublink, buddy tinggal mengonfirmasi. */
const KEAKTIFAN_SHEET = 'Keaktifan';
const KEAKTIFAN_POIN = 2;   // poin per proker yang dikonfirmasi hadir
const KEAKTIFAN_MAKS = 10;  // batas atas tambahan nilai
const PENILAIAN_HEADER = ['Waktu', 'Peran', 'Penilai', 'Dept Penilai', 'Milestone', 'Nama Bizstar',
  'Adaptive (raw)', 'Collaborative (raw)', 'Growth (raw)',
  'Adaptive %', 'Collaborative %', 'Growth %', 'Skor KPI',
  'Skor Akhir', 'Kelebihan', 'Perlu Perbaikan'];

/* Delapan buddy IBASS 2026, satu per departemen. Dipakai untuk menebak departemen
   Bizstar dari buddy yang mengonfirmasi, dan untuk kolom "Buddy" di sheet Peringkat.
   Daftar yang sama ada di index.html dan keaktifan/index.html — kalau ganti orang,
   ganti di tiga tempat itu. */
const BUDDY_2026 = [
  { d: 'Secretary',        n: 'Ayu Diah Pramesti' },
  { d: 'Finance',          n: 'Nursyfa Alawiyah Thoyibah' },
  { d: 'HRD',              n: 'Eghina Salsabilla' },
  { d: 'Advocacy',         n: 'Muhammad Akram Ziyad' },
  { d: 'External Affairs', n: 'Razwa Zahara Maulidiya' },
  { d: 'MEIN',             n: 'Tyara Nadira Putri' },
  { d: 'Entrepreneurship', n: 'Marzya Zyalzyabila' },
  { d: 'ACT',              n: 'Anggun Puti Maharani' }
];

/* Tabel peringkat Bizstar.
   Nilai akhir = nilai KPI (0–100, dari sheet Penilaian) + poin keaktifan (maks +10).
   Kalau satu Bizstar dinilai buddy DAN panitia, nilai buddy dipakai 70% dan panitia 30%
   — buddy mengamati tiap hari, panitia cuma saat acara. Ubah angka di bawah kalau
   pembagiannya mau lain; sisanya ikut otomatis. */
const PERINGKAT_SHEET = 'Peringkat';
const BOBOT_BUDDY = 0.7;
const BOBOT_PANITIA = 0.3;

// ─── GET: baca data ──────────────────────────────────────────────
function doGet(e) {
  try {
    const action = (e.parameter.action || 'read');
    const divisi = e.parameter.divisi || 'all';
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'read') {
      if (divisi === 'all') {
        // Baca sheet REKAP
        const data = readSheet(ss, 'REKAP');
        return jsonOk({ data });
      } else {
        const data = readSheet(ss, divisi);
        return jsonOk({ data });
      }
    }

    if (action === 'rekap') {
      // Rekap per divisi: jumlah item & status
      const result = {};
      SHEET_DIVISI.forEach(name => {
        const rows = readSheet(ss, name);
        result[name] = {
          total: rows.length,
          selesai: rows.filter(r => r.status === 'Selesai').length,
          berlangsung: rows.filter(r => r.status === 'Berlangsung').length,
          terlambat: rows.filter(r => r.status === 'Terlambat').length,
          cancel: rows.filter(r => r.status === 'Cancel').length,
        };
      });
      return jsonOk({ rekap: result });
    }

    if (action === 'dap') {
      // Baca semua pembayaran DAP dari Google Form
      return jsonOk({ payments: readDapPayments() });
    }

    if (action === 'penilaian') {
      // Baca semua penilaian Bizstar yang sudah masuk
      return jsonOk({ penilaian: readPenilaian(ss) });
    }

    if (action === 'keaktifan') {
      // Laporan kehadiran proker dari Bizstar + rekap poin yang sudah dikonfirmasi buddy
      const sh = penilaianSS().getSheetByName(KEAKTIFAN_SHEET);
      const daftar = [];
      if (sh && sh.getLastRow() > 1) {
        sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().forEach(function (r) {
          if (!r[0]) return;
          daftar.push({
            id: Number(r[0]), waktu: String(r[1] || ''), nama: String(r[2] || '').trim(),
            dept: String(r[3] || ''), proker: String(r[4] || ''), tanggal: String(r[5] || ''),
            bukti: String(r[6] || ''), status: String(r[7] || 'Menunggu'), oleh: String(r[8] || '')
          });
        });
      }
      const poin = {};
      daftar.forEach(function (d) {
        if (d.status !== 'Hadir') return;
        const k = d.nama.toLowerCase();
        poin[k] = Math.min((poin[k] || 0) + KEAKTIFAN_POIN, KEAKTIFAN_MAKS);
      });
      return jsonOk({ daftar: daftar, poin: poin, perProker: KEAKTIFAN_POIN, maks: KEAKTIFAN_MAKS });
    }

    if (action === 'peringkat') {
      // Peringkat Bizstar: KPI + poin keaktifan, sudah terurut
      const segar = String(e.parameter.segarkan || '') === '1';
      const daftar = segar ? rebuildPeringkat() : hitungPeringkat();
      return jsonOk({
        peringkat: daftar, bobotBuddy: BOBOT_BUDDY, bobotPanitia: BOBOT_PANITIA,
        perProker: KEAKTIFAN_POIN, maks: KEAKTIFAN_MAKS
      });
    }

    if (action === 'laporanurl') {
      // URL sheet LAPORAN + riwayat waktu update
      const props = PropertiesService.getScriptProperties();
      let ups = [];
      try { ups = JSON.parse(props.getProperty('laporan_updates') || '[]'); } catch (e) {}
      const sh = ss.getSheetByName(LAPORAN_SHEET);
      return jsonOk({ url: sh ? ss.getUrl() + '#gid=' + sh.getSheetId() : '', updates: ups });
    }

    if (action === 'cadangan') {
      // Baca cadangan track file satu divisi (untuk tombol Pulihkan di dashboard)
      const divisi = e.parameter.divisi || '';
      const cad = ss.getSheetByName('CADANGAN_' + divisi);
      if (!cad || cad.getLastRow() < 3) return jsonOk({ data: [], waktu: '' });
      const waktu = String(cad.getRange(1, 2).getValue() || '');
      const vals = cad.getRange(3, 1, cad.getLastRow() - 2, HEADER_ROW.length).getValues();
      const data = vals.filter(r => r[2]).map(r => ({
        no: r[0], divisi: r[1], kegiatan: r[2], priority: r[3], pic: r[4],
        mulai: fmtDate(r[5]), deadline: fmtDate(r[6]), status: r[7] || 'Belum',
        catatan: r[8], file: r[9]
      }));
      return jsonOk({ data, waktu });
    }

    if (action === 'loadstate') {
      // Baca state dashboard untuk sync antar-perangkat
      const wanted = String(e.parameter.keys || '').split(',').filter(Boolean);
      const sh = ss.getSheetByName('STATE');
      const out = {};
      if (sh && sh.getLastRow() > 1) {
        sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(r => {
          if (r[0] && (!wanted.length || wanted.indexOf(r[0]) > -1)) {
            out[r[0]] = { json: String(r[1] || ''), updated: String(r[2] || '') };
          }
        });
      }
      return jsonOk({ states: out });
    }

    if (action === 'aifilestatus') {
      // Cek status file yang di-upload ke AI (dipakai fitur potong video Pubdok)
      if (!geminiKey()) return jsonErr('Kunci AI belum diisi di Script Properties');
      const r = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/' + e.parameter.name + '?key=' + geminiKey(),
        { muteHttpExceptions: true });
      return jsonOk({ file: JSON.parse(r.getContentText()) });
    }

    return jsonOk({ ok: true, message: 'Track File IBASS 2026 API aktif' });

  } catch (err) {
    return jsonErr(err.message);
  }
}

// ─── DAP: baca pembayaran dari Google Form ────────────────────────
function readDapPayments() {
  const form = FormApp.openById(DAP_FORM_ID);
  return form.getResponses().map(resp => {
    const out = {
      waktu: Utilities.formatDate(resp.getTimestamp(), 'Asia/Jakarta', "yyyy-MM-dd'T'HH:mm:ss"),
      email: resp.getRespondentEmail() || '',
      nama: '', divisi: '', termin: '', nominal: 0, bukti: ''
    };
    resp.getItemResponses().forEach(ir => {
      const judul = ir.getItem().getTitle().toLowerCase();
      const val = ir.getResponse();
      // Cek upload/bukti DULUAN — judul pertanyaan upload bisa mengandung kata 'nama'
      // (mis. "Upload bukti atas nama Anda") dan menimpa nama asli kalau dicek belakangan
      if (judul.indexOf('bukti') > -1 || judul.indexOf('upload') > -1 || Array.isArray(val)) {
        const ids = Array.isArray(val) ? val : [val];
        if (ids.length && ids[0]) out.bukti = 'https://drive.google.com/open?id=' + ids[0];
      } else if (judul.indexOf('divisi') > -1) {
        out.divisi = String(val);
      } else if (judul.indexOf('termin') > -1) {
        out.termin = String(val);
        out.nominal = parseNominalDAP(String(val));
      } else if (judul.indexOf('nama') > -1) {
        out.nama = String(val);
      }
    });
    return out;
  });
}

// "Termin 1 (Rp115.000)" → 115000, "Bayar Lunas Termin 1 & 2 (Rp215.000)" → 215000
function parseNominalDAP(teks) {
  const m = teks.match(/Rp\s?([\d.,]+)/i);
  if (!m) return 0;
  return parseInt(m[1].replace(/[^\d]/g, ''), 10) || 0;
}

// ─── POST: tulis data ────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = body.action;

    // Kiriman dari web Penilaian Bizstar (index.html)
    if (body.submissions) {
      if (body.token !== PENILAIAN_TOKEN) return jsonErr('Token salah');
      return savePenilaian(ss, body.submissions);
    }

    // ── Proxy AI: kunci tidak pernah keluar dari server ──
    if (action === 'ai') {
      if (!geminiKey()) return jsonErr('Kunci AI belum diisi di Script Properties');
      const r = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + geminiKey(),
        { method: 'post', contentType: 'application/json',
          payload: JSON.stringify(body.payload || {}), muteHttpExceptions: true });
      const parsed = JSON.parse(r.getContentText());
      if (r.getResponseCode() >= 400) {
        return jsonErr((parsed.error && parsed.error.message) || ('AI error ' + r.getResponseCode()));
      }
      return jsonOk({ ai: parsed });
    }

    // ── Simpan state dashboard (sync antar-perangkat) ──
    if (action === 'savestate') {
      if (!body.key) return jsonErr('key kosong');
      const sh = stateSheet(ss);
      const last = sh.getLastRow();
      let rowIdx = 0;
      if (last > 1) {
        const keys = sh.getRange(2, 1, last - 1, 1).getValues();
        for (let i = 0; i < keys.length; i++) {
          if (keys[i][0] === body.key) { rowIdx = i + 2; break; }
        }
      }
      const rowVals = [[body.key, body.json || '', body.updated || new Date().toISOString()]];
      if (rowIdx) sh.getRange(rowIdx, 1, 1, 3).setValues(rowVals);
      else sh.appendRow(rowVals[0]);
      return jsonOk({ saved: body.key });
    }

    // ── HT: satu panggilan = kirim sinyal + presensi + ambil sinyal masuk ──
    // Dipakai halaman /kadiv/ht/ untuk menyambungkan suara antar-HP (WebRTC).
    if (action === 'ht') {
      const room = String(body.room || 'umum');
      const me = String(body.me || '');
      if (!me) return jsonErr('Nama kosong');
      const sh = htSheet(ss);

      // 1) tulis sinyal keluar (offer/answer/ice/ring/bye)
      const kirim = Array.isArray(body.kirim) ? body.kirim : [];
      if (kirim.length) {
        const mulaiId = htNextId(kirim.length);
        const waktu = new Date().toISOString();
        const rows = kirim.map(function (m, i) {
          // m.room dipakai untuk panggilan darurat ('__SEMUA__') yang menembus semua saluran
          return [mulaiId + i + 1, waktu, String(m.room || room), me,
            String(m.to || ''), String(m.kind || ''), String(m.data || '')];
        });
        sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
      }

      // 2) presensi: perbarui jejak saya, lalu kumpulkan siapa saja yang masih aktif
      //    online  = orang di saluran yang sama (untuk sambungan suara)
      //    semuaOn = semua orang di semua saluran (untuk panggilan lintas divisi)
      const ph = htPresenceSheet(ss);
      const sekarang = Date.now();
      const online = [], semuaOn = [];
      const status = String(body.status || 'Siap');
      let barisSaya = 0;
      if (ph.getLastRow() > 1) {
        const pr = ph.getRange(2, 1, ph.getLastRow() - 1, 4).getValues();
        for (let i = 0; i < pr.length; i++) {
          const rRoom = String(pr[i][0]), rNama = String(pr[i][1]);
          if (rRoom === room && rNama === me) barisSaya = i + 2;
          if (sekarang - Number(pr[i][2] || 0) > 20000) continue; // lewat 20 dtk = dianggap keluar
          if (rNama === me) continue;
          const org = { nama: rNama, status: String(pr[i][3] || 'Siap'), room: rRoom };
          semuaOn.push(org);
          if (rRoom === room) online.push(org);
        }
      }
      if (body.keluar) {
        if (barisSaya) ph.getRange(barisSaya, 3).setValue(0);
      } else if (barisSaya) {
        ph.getRange(barisSaya, 3, 1, 2).setValues([[sekarang, status]]);
      } else {
        ph.appendRow([room, me, sekarang, status]);
      }

      // 3) ambil sinyal yang ditujukan ke saya (atau siaran ke semua)
      const sejak = Number(body.sejak || 0);
      const pesan = [];
      let terakhir = sejak;
      const lastRow = sh.getLastRow();
      if (lastRow > 1) {
        const mulai = Math.max(2, lastRow - 119); // cukup 120 baris terakhir
        sh.getRange(mulai, 1, lastRow - mulai + 1, 7).getValues().forEach(function (r) {
          const id = Number(r[0]) || 0;
          if (id > terakhir) terakhir = id;
          if (id <= sejak) return;
          const rRoom = String(r[2]);
          // saluran sendiri, atau panggilan darurat yang menembus semua saluran
          if (rRoom !== room && rRoom !== '__SEMUA__') return;
          if (String(r[3]) === me) return;                     // jangan pantulkan sinyal sendiri
          const to = String(r[4] || '');
          if (to && to !== me) return;                          // bukan untuk saya
          pesan.push({ id: id, dari: String(r[3]), kind: String(r[5]),
            data: String(r[6] || ''), room: rRoom, waktu: String(r[1] || '') });
        });
      }

      // 4) bersihkan sinyal lama supaya sheet tetap ringan
      if (lastRow > 400) sh.deleteRows(2, lastRow - 200);

      // 5) MODE HEMAT — dipakai hanya kalau suara langsung diblokir jaringan.
      //    Potongan suara dititipkan lewat server. Sheet terpisah supaya polling
      //    biasa tetap ringan (sel suara berukuran besar).
      const balasan = { pesan: pesan, terakhir: terakhir, online: online, semua: semuaOn };
      if (body.suara || body.sejakSuara !== undefined) {
        const vs = htSuaraSheet(ss);
        if (body.suara) {
          vs.appendRow([htNextId(1) + 1, new Date().toISOString(), room, me, String(body.suara)]);
          const vlast = vs.getLastRow();
          if (vlast > 40) vs.deleteRows(2, vlast - 20);   // suara cepat dibuang, hemat ruang
        }
        const sejakV = Number(body.sejakSuara || 0);
        const suara = [];
        let terakhirV = sejakV;
        const vLast = vs.getLastRow();
        if (vLast > 1) {
          const vMulai = Math.max(2, vLast - 11);          // cukup 12 potongan terakhir
          vs.getRange(vMulai, 1, vLast - vMulai + 1, 5).getValues().forEach(function (r) {
            const vid = Number(r[0]) || 0;
            if (vid > terakhirV) terakhirV = vid;
            if (vid <= sejakV) return;
            if (String(r[2]) !== room) return;
            if (String(r[3]) === me) return;
            suara.push({ id: vid, dari: String(r[3]), data: String(r[4] || '') });
          });
        }
        balasan.suara = suara;
        balasan.terakhirSuara = terakhirV;
      }
      return jsonOk(balasan);
    }

    // ── Cari contoh gambar referensi desain (untuk Pubdok) ──
    if (action === 'imgsearch') {
      const q = String(body.q || '').trim();
      if (!q) return jsonErr('kata kunci kosong');
      const html = UrlFetchApp.fetch(
        'https://www.bing.com/images/search?q=' + encodeURIComponent(q) + '&form=HDRSC2&first=1',
        { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }
      ).getContentText();
      const out = [];
      const re = /m="([^"]+)"/g;
      let mm;
      while ((mm = re.exec(html)) && out.length < 12) {
        try {
          const j = JSON.parse(mm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
          if (j.murl && j.purl) out.push({ img: j.murl, thumb: j.turl || j.murl, sumber: j.purl, judul: j.t || '' });
        } catch (err) {}
      }
      return jsonOk({ hasil: out });
    }

    // ── Upload foto bukti pembayaran Logistik → Google Drive ──
    if (action === 'uploadbukti') {
      if (!body.data) return jsonErr('Tidak ada gambar');
      const blob = Utilities.newBlob(
        Utilities.base64Decode(body.data),
        body.mime || 'image/jpeg',
        body.nama || ('bukti-' + Date.now() + '.jpg'));
      const folder = folderDrive('Bukti Pembayaran IBASS 2026', 'Bukti Pembayaran I-BASS 2026');
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return jsonOk({ url: file.getUrl() });
    }

    // ── Bizstar melaporkan kehadirannya di proker HIMA lain ──
    if (action === 'keaktifanlapor') {
      if (!body.nama || !body.proker) return jsonErr('Nama dan nama proker wajib diisi');
      const sh = keaktifanSheet();
      const nama = String(body.nama).trim(), proker = String(body.proker).trim();
      // Tolak laporan kembar dari orang yang sama
      if (sh.getLastRow() > 1) {
        const rapikan = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
        const nb = rapikan(nama), pb = rapikan(proker);
        const adaKembar = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues()
          .some(function (r) { return rapikan(r[2]) === nb && rapikan(r[4]) === pb; });
        if (adaKembar) return jsonOk({ kembar: true });
      }
      sh.appendRow([Date.now(), new Date().toISOString(), nama, String(body.dept || ''),
        proker, String(body.tanggal || ''), String(body.bukti || ''), 'Menunggu', '']);
      return jsonOk({ tersimpan: true });
    }

    // ── Buddy mengonfirmasi: benar hadir atau tidak ──
    if (action === 'keaktifankonfirm') {
      if (!body.id) return jsonErr('id kosong');
      const sh = keaktifanSheet();
      const last = sh.getLastRow();
      if (last < 2) return jsonErr('Belum ada laporan');
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (Number(ids[i][0]) === Number(body.id)) {
          const st = String(body.status || 'Hadir');
          // dikembalikan ke "Menunggu" berarti belum ada yang mengecek
          sh.getRange(i + 2, 8, 1, 2).setValues([[
            st, st === 'Menunggu' ? '' : String(body.oleh || 'Buddy')]]);
          // poin berubah → peringkat ikut disegarkan, tapi jangan sampai menggagalkan simpan
          try { rebuildPeringkat(); } catch (e2) {}
          return jsonOk({ id: body.id, status: body.status });
        }
      }
      return jsonErr('Laporan tidak ditemukan');
    }

    // ── Upload berkas Track File (Word/Sheet/PDF/gambar dll) → Google Drive ──
    if (action === 'uploadfile') {
      if (!body.data) return jsonErr('Tidak ada berkas');
      const blob = Utilities.newBlob(
        Utilities.base64Decode(body.data),
        body.mime || 'application/octet-stream',
        body.nama || ('berkas-' + Date.now()));
      const folder2 = folderDrive('Berkas Track File IBASS 2026', 'Berkas Track File I-BASS 2026');
      const file2 = folder2.createFile(blob);
      file2.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return jsonOk({ url: file2.getUrl(), nama: file2.getName() });
    }

    // ── Tiket upload file AI (video Pubdok): server buat sesi upload,
    //    file mengalir langsung browser → Google tanpa lewat sini ──
    if (action === 'aifileinit') {
      if (!geminiKey()) return jsonErr('Kunci AI belum diisi di Script Properties');
      const r = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/upload/v1beta/files?key=' + geminiKey() + '&uploadType=resumable',
        { method: 'post', contentType: 'application/json',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(body.size || 0),
            'X-Goog-Upload-Header-Content-Type': body.mime || 'application/octet-stream'
          },
          payload: JSON.stringify({ file: { display_name: body.displayName || 'upload' } }),
          muteHttpExceptions: true });
      const headers = r.getAllHeaders();
      const uploadUrl = headers['x-goog-upload-url'] || headers['X-Goog-Upload-URL'] || '';
      if (!uploadUrl) return jsonErr('Gagal membuat sesi upload (' + r.getResponseCode() + ')');
      return jsonOk({ uploadUrl: uploadUrl });
    }

    // Sync seluruh data divisi dari dashboard
    if (action === 'sync') {
      const sheetName = body.divisi || 'Unknown';
      const items = body.data || [];

      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) sheet = createDivisiSheet(ss, sheetName);
      ensurePlainLayout(sheet);

      // Cadangkan versi lama dulu (sheet tersembunyi CADANGAN_<divisi>) —
      // kalau data hilang, bisa dipulihkan dari dashboard
      const lastRow = sheet.getLastRow();
      if (lastRow >= DATA_START_ROW) {
        try {
          const lama = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, HEADER_ROW.length).getValues()
            .filter(r => r[2] && r[2] !== 'Kegiatan & Detail');
          if (lama.length) {
            let cad = ss.getSheetByName('CADANGAN_' + sheetName);
            if (!cad) {
              cad = ss.insertSheet('CADANGAN_' + sheetName);
              try { cad.hideSheet(); } catch (e2) {}
            }
            cad.clearContents();
            cad.getRange(1, 1, 1, 2).setValues([['Cadangan otomatis sebelum sync terakhir', new Date()]]);
            cad.getRange(2, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]);
            cad.getRange(3, 1, lama.length, HEADER_ROW.length).setValues(lama);
          }
        } catch (eBk) { /* cadangan gagal tidak boleh menggagalkan sync */ }
        sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, HEADER_ROW.length).clearContent();
      }

      // Tulis data baru
      if (items.length > 0) {
        const rows = items.map((item, i) => [
          i + 1,
          sheetName,
          item.kegiatan || '',
          item.priority || '',
          item.pic || '',
          item.mulai || '',
          item.deadline || '',
          item.status || 'Belum',
          item.catatan || '',
          item.file || ''
        ]);
        sheet.getRange(DATA_START_ROW, 1, rows.length, HEADER_ROW.length).setValues(rows);
      }

      // Update sheet REKAP
      rebuildRekap(ss);
      updateGrafik(ss);
      return jsonOk({ message: 'Sync ' + items.length + ' item ke sheet ' + sheetName });
    }

    // Tambah satu item baru
    if (action === 'addItem') {
      const sheetName = body.divisi || 'Unknown';
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) sheet = createDivisiSheet(ss, sheetName);
      ensurePlainLayout(sheet);

      const no = Math.max(sheet.getLastRow() - DATA_START_ROW + 2, 1);
      const newRow = [
        no, sheetName,
        body.kegiatan || '',
        body.priority || 'Medium',
        body.pic || '',
        body.mulai || '',
        body.deadline || '',
        body.status || 'Belum',
        body.catatan || '',
        body.file || ''
      ];
      sheet.appendRow(newRow);

      // Tambah ke REKAP juga
      const rekap = ss.getSheetByName('REKAP');
      if (rekap) {
        ensurePlainLayout(rekap);
        rekap.appendRow(newRow);
      }

      return jsonOk({ message: 'Item ditambahkan' });
    }

    // Notulen rapat → Google Doc baru (tombol "Kirim ke Google Docs" di Sekretaris)
    if (action === 'createDoc') {
      const doc = DocumentApp.create(body.title || ('Notulen IBASS — ' + tglIndo(new Date())));
      const b = doc.getBody();
      b.appendParagraph(body.title || 'Notulen Rapat').setHeading(DocumentApp.ParagraphHeading.TITLE);
      if (body.tanggal) b.appendParagraph('Tanggal: ' + body.tanggal);
      if (body.peserta) b.appendParagraph('Peserta: ' + body.peserta);
      b.appendHorizontalRule();
      String(body.content || '').split('\n').forEach(line => b.appendParagraph(line));
      doc.saveAndClose();
      return jsonOk({ message: 'Notulen tersimpan di Google Docs', url: doc.getUrl() });
    }

    // Laporan Perkembangan — tiap panggilan menambah bagian ber-stempel waktu di sheet LAPORAN
    if (action === 'laporan') {
      return jsonOk(generateLaporanSheet(ss, body.catatan || '', body.penulis || ''));
    }

    // Setup ulang struktur spreadsheet
    if (action === 'setup') {
      setupSpreadsheet();
      return jsonOk({ message: 'Setup selesai!' });
    }

    return jsonErr('Action tidak dikenal: ' + action);

  } catch (err) {
    return jsonErr(err.message);
  }
}

/* Ambil folder Drive dengan nama baru. Kalau belum ada tapi folder nama lama masih ada,
   folder lama itu yang diganti namanya — jadi bukti & berkas yang sudah terlanjur
   diunggah tidak tertinggal di folder terpisah. */
function folderDrive(nama, namaLama) {
  const it = DriveApp.getFoldersByName(nama);
  if (it.hasNext()) return it.next();
  if (namaLama) {
    const lama = DriveApp.getFoldersByName(namaLama);
    if (lama.hasNext()) {
      const f = lama.next();
      f.setName(nama);
      return f;
    }
  }
  return DriveApp.createFolder(nama);
}

// ─── Penilaian Bizstar: simpan & baca ─────────────────────────────
/* Sheet kehadiran proker — ikut file penilaian, jadi tetap terpisah dari Track File */
function keaktifanSheet() {
  const ss = penilaianSS();
  let sh = ss.getSheetByName(KEAKTIFAN_SHEET);
  if (!sh) {
    sh = ss.insertSheet(KEAKTIFAN_SHEET);
    sh.getRange(1, 1, 1, 9).setValues([['id', 'waktu lapor', 'nama bizstar', 'departemen',
      'proker', 'tanggal', 'bukti', 'status', 'dikonfirmasi oleh']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    [90, 150, 170, 120, 230, 100, 240, 110, 150]
      .forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  }
  return sh;
}

/* Penilaian boleh tinggal di file spreadsheet TERPISAH supaya nilai Bizstar tidak
   ikut terbaca saat file Track File dibagikan ke kadiv. ID file penilaian disimpan
   di Script Properties — kalau belum ada, penilaian tetap di file yang sama
   (jadi tidak ada yang rusak sebelum pemisahan dijalankan). */
const PENILAIAN_SS_KEY = 'penilaian_ss_id';
function penilaianSS() {
  const id = PropertiesService.getScriptProperties().getProperty(PENILAIAN_SS_KEY);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {}
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensurePenilaianSheet(ssAbaikan) {
  const ss = penilaianSS();
  let sheet = ss.getSheetByName(PENILAIAN_SHEET);
  if (sheet) return sheet;
  sheet = ss.insertSheet(PENILAIAN_SHEET);
  const header = sheet.getRange(1, 1, 1, PENILAIAN_HEADER.length);
  header.setValues([PENILAIAN_HEADER])
    .setBackground('#1e3a5f').setFontColor('#5bc4f5')
    .setFontWeight('bold').setFontSize(10);
  sheet.setFrozenRows(1);
  const widths = [140, 70, 150, 110, 110, 150, 90, 110, 80, 80, 100, 70, 80, 220, 220];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  return sheet;
}

function savePenilaian(ss, submissions) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return jsonErr('Tidak ada data penilaian');
  }
  const sheet = ensurePenilaianSheet(ss);
  /* Poin keaktifan yang SUDAH dikonfirmasi buddy saat penilaian ini masuk.
     Kolom "Skor Akhir" jadi terisi sejak awal; sheet Peringkat tetap menghitung
     ulang dari data terbaru, jadi kalau ada konfirmasi susulan peringkatnya ikut. */
  let poin = {};
  try { poin = poinKeaktifan(); } catch (e) {}

  const rows = submissions.map(s => {
    const kpi = Number(s.skor_kpi != null ? s.skor_kpi : s.skor_weighted) || 0;
    const tambahan = poin[normNama(s.nama_bizstar)] || 0;
    return [
      s.timestamp ? Utilities.formatDate(new Date(s.timestamp), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') : '',
      s.role || '',
      s.penilai || '',
      s.dept_penilai || '',
      s.milestone || '',
      s.nama_bizstar || '',
      s.skor_adaptive_raw, s.skor_collab_raw, s.skor_growth_raw,
      s.skor_adaptive, s.skor_collab, s.skor_growth,
      kpi,
      Math.round((kpi + tambahan) * 100) / 100,
      s.kelebihan || '',
      s.perbaikan || ''
    ];
  });
  // Lebar baris HARUS sama dengan lebar header, kalau tidak setValues menolak diam-diam
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, PENILAIAN_HEADER.length).setValues(rows);
  try { rebuildPeringkat(); } catch (e) {}
  return jsonOk({ message: rows.length + ' penilaian tersimpan' });
}

/* Baca sheet Penilaian lewat NAMA kolom, bukan urutan tetap — baris lama yang
   ditulis sebelum kolom "Skor Akhir" ada tetap kebaca dengan benar. */
function readPenilaian(ssAbaikan) {
  const sheet = penilaianSS().getSheetByName(PENILAIAN_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const lebar = Math.max(sheet.getLastColumn(), PENILAIAN_HEADER.length);
  const semua = sheet.getRange(1, 1, sheet.getLastRow(), lebar).getValues();
  const head = semua[0].map(h => String(h || '').trim().toLowerCase());
  const kol = function (judul, cadangan) {
    const i = head.indexOf(String(judul).toLowerCase());
    return i > -1 ? i : cadangan;
  };
  const iNama = kol('nama bizstar', 5);
  const iKel = kol('kelebihan', 13), iPer = kol('perlu perbaikan', 14);
  const iKpi = kol('skor kpi', 12), iAkhir = kol('skor akhir', 13);
  return semua.slice(1).filter(r => r[iNama]).map(r => {
    /* Baris yang ditulis sebelum 20 Agustus 2026 belum punya kolom "Skor Akhir",
       jadi catatannya bergeser satu kolom ke kiri. Dikenali dari: kolom terakhir
       kosong dan kolom "Skor Akhir" berisi teks, bukan angka. */
    let kelebihan = r[iKel], perbaikan = r[iPer], akhir = iAkhir === iKel ? '' : r[iAkhir];
    const geser = iAkhir !== iKel && String(perbaikan || '') === ''
      && String(akhir || '') !== '' && isNaN(Number(akhir));
    if (geser) { perbaikan = kelebihan; kelebihan = akhir; akhir = ''; }
    return {
      waktu: r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') : String(r[0]),
      role: r[kol('peran', 1)], penilai: r[kol('penilai', 2)],
      dept_penilai: r[kol('dept penilai', 3)], milestone: r[kol('milestone', 4)],
      nama_bizstar: r[iNama],
      skor_adaptive_raw: r[kol('adaptive (raw)', 6)],
      skor_collab_raw: r[kol('collaborative (raw)', 7)],
      skor_growth_raw: r[kol('growth (raw)', 8)],
      skor_adaptive: r[kol('adaptive %', 9)],
      skor_collab: r[kol('collaborative %', 10)],
      skor_growth: r[kol('growth %', 11)],
      skor_weighted: r[iKpi],
      skor_akhir: akhir,
      kelebihan: kelebihan, perbaikan: perbaikan
    };
  });
}

// ─── Peringkat Bizstar ────────────────────────────────────────────
/* Satu nama bisa ditulis beda-beda ("Ayu Diah", "ayu  diah pramesti") — semua
   dibandingkan dalam bentuk polos ini supaya tidak jadi dua baris peringkat. */
function normNama(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function deptBuddy(nama) {
  const k = normNama(nama);
  if (!k) return '';
  for (let i = 0; i < BUDDY_2026.length; i++) {
    const b = BUDDY_2026[i];
    if (normNama(b.n) === k) return b.d;
    // "Eghina" saja juga dianggap Eghina Salsabilla
    if (k.length >= 4 && normNama(b.n).indexOf(k) === 0) return b.d;
  }
  return '';
}

function buddyDept(dept) {
  const k = normNama(dept);
  for (let i = 0; i < BUDDY_2026.length; i++) {
    if (normNama(BUDDY_2026[i].d) === k) return BUDDY_2026[i].n;
  }
  return '';
}

/* Semua laporan kehadiran proker, dirangkum per Bizstar. */
function keaktifanRingkas() {
  const sh = penilaianSS().getSheetByName(KEAKTIFAN_SHEET);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues().forEach(function (r) {
    const nama = String(r[2] || '').trim();
    if (!nama) return;
    const k = normNama(nama);
    if (!out[k]) out[k] = { nama: nama, dept: '', hadir: 0, menunggu: 0, ditolak: 0, proker: [], oleh: '' };
    const o = out[k];
    if (!o.dept && r[3]) o.dept = String(r[3]).trim();
    const status = String(r[7] || 'Menunggu');
    if (status === 'Hadir') { o.hadir++; o.proker.push(String(r[4] || '')); }
    else if (status === 'Tidak Hadir') o.ditolak++;
    else o.menunggu++;
    if (!o.oleh && r[8]) o.oleh = String(r[8]).trim();
  });
  Object.keys(out).forEach(function (k) {
    out[k].poin = Math.min(out[k].hadir * KEAKTIFAN_POIN, KEAKTIFAN_MAKS);
  });
  return out;
}

/* Peta ringkas nama → poin, dipakai saat menyimpan penilaian. */
function poinKeaktifan() {
  const r = keaktifanRingkas(), out = {};
  Object.keys(r).forEach(function (k) { out[k] = r[k].poin; });
  return out;
}

function predikat(n) {
  if (n >= 90) return 'Istimewa';
  if (n >= 80) return 'Sangat Baik';
  if (n >= 70) return 'Baik';
  if (n >= 60) return 'Cukup';
  return 'Perlu Perhatian';
}

/* Gabungkan sheet Penilaian + sheet Keaktifan jadi satu daftar terurut. */
function hitungPeringkat() {
  const nilai = readPenilaian();
  const aktif = keaktifanRingkas();
  const orang = {};

  function slot(nama) {
    const k = normNama(nama);
    if (!orang[k]) orang[k] = {
      nama: String(nama).trim(), dept: '', buddy: '',
      buddyNilai: [], panitiaNilai: [], milestone: {}, penilai: {},
      hadir: 0, menunggu: 0, poin: 0
    };
    return orang[k];
  }

  nilai.forEach(function (p) {
    if (!p.nama_bizstar) return;
    const o = slot(p.nama_bizstar);
    const skor = Number(p.skor_weighted);
    if (!isNaN(skor) && skor > 0) {
      if (String(p.role).toLowerCase() === 'buddy') {
        o.buddyNilai.push(skor);
        if (p.dept_penilai && String(p.dept_penilai) !== '—') o.dept = String(p.dept_penilai).trim();
        if (p.penilai) o.buddy = String(p.penilai).trim();
      } else {
        o.panitiaNilai.push(skor);
      }
    }
    if (p.milestone) o.milestone[String(p.milestone)] = true;
    if (p.penilai) o.penilai[normNama(p.penilai)] = true;
  });

  Object.keys(aktif).forEach(function (k) {
    const a = aktif[k];
    const o = slot(a.nama);
    o.hadir = a.hadir; o.menunggu = a.menunggu; o.poin = a.poin;
    if (!o.dept && a.dept) o.dept = a.dept;
    if (!o.dept && a.oleh) o.dept = deptBuddy(a.oleh);
  });

  const rata = function (arr) {
    if (!arr.length) return null;
    return arr.reduce(function (s, v) { return s + v; }, 0) / arr.length;
  };

  const daftar = Object.keys(orang).map(function (k) {
    const o = orang[k];
    const rb = rata(o.buddyNilai), rp = rata(o.panitiaNilai);
    let kpi = null;
    if (rb !== null && rp !== null) kpi = rb * BOBOT_BUDDY + rp * BOBOT_PANITIA;
    else if (rb !== null) kpi = rb;
    else if (rp !== null) kpi = rp;
    const akhir = kpi === null ? null : kpi + o.poin;
    if (!o.buddy && o.dept) o.buddy = buddyDept(o.dept);
    return {
      nama: o.nama, dept: o.dept || '', buddy: o.buddy || '',
      kpi: kpi, poin: o.poin, akhir: akhir,
      nBuddy: o.buddyNilai.length, nPanitia: o.panitiaNilai.length,
      milestone: Object.keys(o.milestone).length,
      hadir: o.hadir, menunggu: o.menunggu,
      predikat: akhir === null ? '' : predikat(akhir)
    };
  });

  // Yang sudah punya nilai KPI di atas; yang baru lapor proker saja menyusul di bawah
  daftar.sort(function (a, b) {
    if ((a.akhir === null) !== (b.akhir === null)) return a.akhir === null ? 1 : -1;
    if (a.akhir !== null && b.akhir !== a.akhir) return b.akhir - a.akhir;
    if (a.kpi !== null && b.kpi !== null && b.kpi !== a.kpi) return b.kpi - a.kpi;
    return String(a.nama).localeCompare(String(b.nama), 'id');
  });
  daftar.forEach(function (d, i) { d.peringkat = d.akhir === null ? '' : i + 1; });
  return daftar;
}

const PERINGKAT_HEADER = ['Peringkat', 'Nama Bizstar', 'Departemen', 'Buddy',
  'Nilai KPI', 'Poin Keaktifan', 'Nilai Akhir', 'Predikat',
  'Dinilai Buddy', 'Dinilai Panitia', 'Milestone Terisi', 'Proker Hadir', 'Menunggu Konfirmasi'];

/* Tulis ulang sheet Peringkat dari nol. Dipanggil tiap penilaian masuk, tiap buddy
   mengonfirmasi kehadiran, dan lewat menu di spreadsheet. */
function rebuildPeringkat() {
  const ss = penilaianSS();
  let sh = ss.getSheetByName(PERINGKAT_SHEET);
  if (!sh) sh = ss.insertSheet(PERINGKAT_SHEET);
  sh.clear();

  const daftar = hitungPeringkat();
  const W = PERINGKAT_HEADER.length;

  sh.getRange(1, 1, 1, W).merge().setValue('PERINGKAT BIZSTAR IBASS 2026')
    .setFontSize(14).setFontWeight('bold').setHorizontalAlignment('center')
    .setBackground('#1e3a5f').setFontColor('#ffffff');
  sh.getRange(2, 1, 1, W).merge()
    .setValue('Nilai Akhir = Nilai KPI + Poin Keaktifan (maks +' + KEAKTIFAN_MAKS + ')   ·   '
      + 'Kalau dinilai buddy dan panitia sekaligus: buddy ' + Math.round(BOBOT_BUDDY * 100)
      + '%, panitia ' + Math.round(BOBOT_PANITIA * 100) + '%   ·   '
      + 'Diperbarui ' + tglIndo(new Date()))
    .setFontSize(9).setFontColor('#666666').setHorizontalAlignment('center').setWrap(true);

  const baris0 = 4;
  sh.getRange(baris0, 1, 1, W).setValues([PERINGKAT_HEADER])
    .setFontWeight('bold').setBackground('#e8eef7').setFontColor('#1e3a5f')
    .setHorizontalAlignment('center').setWrap(true);
  sh.setFrozenRows(baris0);

  if (!daftar.length) {
    sh.getRange(baris0 + 1, 1, 1, W).merge()
      .setValue('Belum ada data. Peringkat terisi otomatis begitu buddy mengirim penilaian '
        + 'atau mengonfirmasi laporan proker.')
      .setFontColor('#888888').setHorizontalAlignment('center');
    [70, 200, 140, 170, 80, 95, 85, 105, 95, 95, 105, 90, 120]
      .forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    return daftar;
  }

  const rows = daftar.map(function (d) {
    return [
      d.peringkat === '' ? '—' : d.peringkat,
      d.nama, d.dept || '—', d.buddy || '—',
      d.kpi === null ? '' : Math.round(d.kpi * 100) / 100,
      d.poin,
      d.akhir === null ? '' : Math.round(d.akhir * 100) / 100,
      d.akhir === null ? 'Belum dinilai' : d.predikat,
      d.nBuddy, d.nPanitia, d.milestone, d.hadir, d.menunggu
    ];
  });
  const r = sh.getRange(baris0 + 1, 1, rows.length, W);
  r.setValues(rows);
  r.setVerticalAlignment('middle');
  sh.getRange(baris0 + 1, 1, rows.length, 1).setHorizontalAlignment('center').setFontWeight('bold');
  sh.getRange(baris0 + 1, 5, rows.length, 3).setNumberFormat('0.00');
  sh.getRange(baris0 + 1, 6, rows.length, 1).setNumberFormat('0');
  sh.getRange(baris0 + 1, 9, rows.length, 5).setHorizontalAlignment('center');
  sh.getRange(baris0, 1, rows.length + 1, W).setBorder(true, true, true, true, true, true,
    '#c9d4e4', SpreadsheetApp.BorderStyle.SOLID);

  // Juara 1–3 diberi warna supaya langsung kelihatan
  const medali = ['#fff3cd', '#eef1f5', '#f7e5d3'];
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    if (daftar[i].akhir === null) break;
    sh.getRange(baris0 + 1 + i, 1, 1, W).setBackground(medali[i]);
  }
  // Baris "belum dinilai" dibuat kelabu
  daftar.forEach(function (d, i) {
    if (d.akhir === null) sh.getRange(baris0 + 1 + i, 1, 1, W).setFontColor('#999999');
  });

  // ── Blok kedua: yang teratas di tiap departemen ──
  const perDept = {};
  daftar.forEach(function (d) {
    if (d.akhir === null || !d.dept) return;
    if (!perDept[d.dept] || d.akhir > perDept[d.dept].akhir) perDept[d.dept] = d;
  });
  const deptUrut = BUDDY_2026.map(function (b) { return b.d; })
    .filter(function (dp) { return perDept[dp]; });
  Object.keys(perDept).forEach(function (dp) {
    if (deptUrut.indexOf(dp) === -1) deptUrut.push(dp);
  });

  let baris = baris0 + rows.length + 2;
  sh.getRange(baris, 1, 1, W).merge().setValue('TERBAIK DI TIAP DEPARTEMEN')
    .setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  baris++;
  const subHead = ['Departemen', 'Buddy', 'Nama Bizstar', 'Nilai Akhir', 'Predikat'];
  sh.getRange(baris, 1, 1, 5).setValues([subHead])
    .setFontWeight('bold').setBackground('#e8eef7').setFontColor('#1e3a5f');
  baris++;
  if (deptUrut.length) {
    const isi = deptUrut.map(function (dp) {
      const d = perDept[dp];
      return [dp, d.buddy || buddyDept(dp) || '—', d.nama, Math.round(d.akhir * 100) / 100, d.predikat];
    });
    sh.getRange(baris, 1, isi.length, 5).setValues(isi)
      .setBorder(true, true, true, true, true, true, '#c9d4e4', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(baris, 4, isi.length, 1).setNumberFormat('0.00');
  } else {
    sh.getRange(baris, 1, 1, 5).merge().setValue('Belum ada departemen yang nilainya masuk.')
      .setFontColor('#888888');
  }

  [70, 200, 140, 170, 80, 95, 85, 105, 95, 95, 105, 90, 120]
    .forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setRowHeight(1, 32);
  return daftar;
}

function menuPerbaruiPeringkat() {
  const ui = SpreadsheetApp.getUi();
  try {
    const daftar = rebuildPeringkat();
    const dinilai = daftar.filter(function (d) { return d.akhir !== null; });
    const juara = dinilai.length
      ? '\n\nTeratas saat ini: ' + dinilai[0].nama + ' (' + (Math.round(dinilai[0].akhir * 100) / 100) + ')'
      : '';
    const ss = penilaianSS();
    const beda = ss.getId() !== SpreadsheetApp.getActiveSpreadsheet().getId();
    ui.alert('Peringkat diperbarui',
      daftar.length + ' Bizstar masuk daftar, ' + dinilai.length + ' sudah punya nilai.'
      + juara + '\n\nSheet "Peringkat" ada di file '
      + (beda ? '"' + ss.getName() + '":\n' + ss.getUrl() : 'ini.'), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Gagal memperbarui peringkat', String(err.message || err), ui.ButtonSet.OK);
  }
}

// ─── Laporan Perkembangan (sheet LAPORAN, untuk penerus) ──────────
function tglIndo(d) {
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const tz = 'Asia/Jakarta';
  const dow = parseInt(Utilities.formatDate(d, tz, 'u'), 10) % 7;
  const day = Utilities.formatDate(d, tz, 'd');
  const mon = parseInt(Utilities.formatDate(d, tz, 'M'), 10) - 1;
  const yr = Utilities.formatDate(d, tz, 'yyyy');
  const hm = Utilities.formatDate(d, tz, 'HH:mm');
  return hari[dow] + ', ' + day + ' ' + bulan[mon] + ' ' + yr + ' · ' + hm + ' WIB';
}
function rp(n) { return 'Rp' + String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

const LAPORAN_SHEET = 'LAPORAN';
const LAP_W = 7; // lebar kolom laporan

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Laporan IBASS')
    .addItem('Perbarui Peringkat Bizstar', 'menuPerbaruiPeringkat')
    .addSeparator()
    .addItem('Perbarui Laporan', 'menuGenerateLaporan')
    .addItem('Perbarui Grafik', 'menuPerbaruiGrafik')
    .addItem('Reset Data Track File', 'menuResetTrackFile')
    .addSeparator()
    .addItem('Pisahkan File Penilaian (buat baru)', 'menuPisahPenilaian')
    .addItem('Pakai File Penilaian yang Sudah Ada', 'menuHubungkanPenilaian')
    .addItem('Lihat Lokasi File Penilaian', 'menuLokasiPenilaian')
    .addToUi();
}

/* Kalau file penilaian sudah dibuat sendiri, cukup hubungkan lewat link-nya.
   TIDAK perlu memasang ulang kode Apps Script di file itu — satu script ini
   sudah melayani semuanya. */
function menuHubungkanPenilaian() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Pakai File Penilaian yang Sudah Ada',
    'Tempel LINK (URL) file spreadsheet penilaian yang sudah kamu buat:',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const teks = String(resp.getResponseText() || '').trim();
  const cocok = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(teks);
  const id = cocok ? cocok[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(teks) ? teks : '');
  if (!id) { ui.alert('Link tidak dikenali.\n\nSalin URL lengkap dari bilah alamat file penilaian, lalu coba lagi.'); return; }

  let target;
  try { target = SpreadsheetApp.openById(id); }
  catch (e) { ui.alert('File tidak bisa dibuka. Pastikan kamu punya akses ke file itu.'); return; }

  // Pindahkan data lama kalau ada, supaya tidak ada penilaian yang tertinggal
  const asal = SpreadsheetApp.getActiveSpreadsheet();
  const lama = asal.getSheetByName(PENILAIAN_SHEET);
  let pindah = 0;
  if (lama && lama.getLastRow() > 1 && !target.getSheetByName(PENILAIAN_SHEET)) {
    const salinan = lama.copyTo(target);
    salinan.setName(PENILAIAN_SHEET);
    pindah = lama.getLastRow() - 1;
    lama.setName('Penilaian (pindah)');
  }
  PropertiesService.getScriptProperties().setProperty(PENILAIAN_SS_KEY, id);
  ui.alert('Terhubung ke: ' + target.getName() +
    (pindah ? '\n\n' + pindah + ' baris penilaian lama ikut dipindahkan.' : '') +
    '\n\nMulai sekarang semua penilaian masuk ke file itu.');
}

/* Pindahkan sheet Penilaian ke file spreadsheet sendiri.
   Tujuannya: file Track File boleh dibagikan ke kadiv tanpa ikut membocorkan
   nilai Bizstar. Setelah dipisah, semua penilaian baru langsung masuk ke file baru. */
function menuPisahPenilaian() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PENILAIAN_SS_KEY)) {
    ui.alert('Penilaian sudah berada di file terpisah.\n\n' +
      'Pakai menu "Lihat Lokasi File Penilaian" untuk membuka atau membagikannya.');
    return;
  }
  const jawab = ui.alert('Pisahkan File Penilaian',
    'Sheet "Penilaian" akan dipindahkan ke file spreadsheet baru beserta seluruh isinya.\n\n' +
    'Setelah ini, file Track File aman dibagikan ke kadiv tanpa memperlihatkan nilai Bizstar. ' +
    'Akses ke file penilaian kamu atur sendiri (untuk inti dan kadiv tertentu).\n\nLanjutkan?',
    ui.ButtonSet.YES_NO);
  if (jawab !== ui.Button.YES) return;

  const asal = SpreadsheetApp.getActiveSpreadsheet();
  const baru = SpreadsheetApp.create('Penilaian Bizstar IBASS 2026');
  const lama = asal.getSheetByName(PENILAIAN_SHEET);

  if (lama) {
    // salin isi apa adanya ke file baru
    const salinan = lama.copyTo(baru);
    salinan.setName(PENILAIAN_SHEET);
    const bawaan = baru.getSheets()[0];
    if (bawaan.getName() !== PENILAIAN_SHEET) baru.deleteSheet(bawaan);
    // sisakan penanda di file lama supaya tidak membingungkan
    lama.setName('Penilaian (pindah)');
    lama.getRange(1, 1).setNote('Data penilaian sudah pindah ke file "Penilaian Bizstar IBASS 2026".');
  }
  props.setProperty(PENILAIAN_SS_KEY, baru.getId());

  ui.alert('Berhasil dipisah.\n\nFile baru: Penilaian Bizstar IBASS 2026\n' + baru.getUrl() +
    '\n\nBagikan file ini HANYA ke inti dan kadiv yang berhak. ' +
    'Sheet lama di file ini sudah dinonaktifkan dan boleh dihapus.');
}

function menuLokasiPenilaian() {
  const ui = SpreadsheetApp.getUi();
  const id = PropertiesService.getScriptProperties().getProperty(PENILAIAN_SS_KEY);
  if (!id) { ui.alert('Penilaian masih menyatu dengan file ini.\n\nJalankan "Pisahkan File Penilaian" kalau mau dipisah.'); return; }
  try {
    const ss = SpreadsheetApp.openById(id);
    ui.alert('File penilaian:\n' + ss.getName() + '\n' + ss.getUrl());
  } catch (e) {
    ui.alert('File penilaian tidak bisa dibuka — mungkin terhapus.\n\n' +
      'Hapus properti "' + PENILAIAN_SS_KEY + '" di Project Settings supaya kembali menyatu.');
  }
}

// Hitung ulang REKAP + grafik dari isi sheet saat ini —
// dipakai setelah baris diedit/dihapus manual di spreadsheet.
function menuPerbaruiGrafik() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  rebuildRekap(ss);
  updateGrafik(ss);
  let total = 0, selesai = 0;
  SHEET_DIVISI.forEach(function (name) {
    const rows = readSheet(ss, name);
    total += rows.length;
    selesai += rows.filter(function (r) { return r.status === 'Selesai'; }).length;
  });
  ui.alert('Grafik diperbarui.\n\n' + total + ' kegiatan terdata, ' + selesai + ' selesai.' +
    '\nLihat sheet "GRAFIK".');
}

// Kosongkan seluruh data kegiatan (mis. sisa data uji coba), lalu bangun ulang grafik.
function menuResetTrackFile() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const jawab = ui.alert('Reset Data Track File',
    'Semua baris kegiatan di sheet divisi dan REKAP akan dikosongkan. ' +
    'Grafik ikut dihitung ulang.\n\nLanjutkan?',
    ui.ButtonSet.YES_NO);
  if (jawab !== ui.Button.YES) return;

  let terhapus = 0;
  SHEET_DIVISI.concat(['REKAP']).forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const lastRow = sh.getLastRow();
    if (lastRow >= DATA_START_ROW) {
      const n = lastRow - DATA_START_ROW + 1;
      sh.getRange(DATA_START_ROW, 1, n, HEADER_ROW.length).clearContent();
      if (name !== 'REKAP') terhapus += n;
    }
  });
  updateGrafik(ss);
  ui.alert('Reset selesai — ' + terhapus + ' baris dikosongkan, grafik sudah diperbarui.\n\n' +
    'Catatan: kalau di dashboard kadiv masih terlihat daftar lama, tekan tombol ' +
    '"Muat dari Sheets" di tab Track File supaya ikut kosong.');
}

function menuGenerateLaporan() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Catatan Evaluasi',
    'Tulis evaluasi, kendala, dan saran perbaikan untuk penerus (boleh dikosongkan):',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  generateLaporanSheet(SpreadsheetApp.getActiveSpreadsheet(), resp.getResponseText(), '');
  ui.alert('Laporan diperbarui — buka sheet "LAPORAN".');
}

function ensureLaporanSheet(ss) {
  let sh = ss.getSheetByName(LAPORAN_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(LAPORAN_SHEET);
  sh.getRange(1, 1, 1, LAP_W).merge();
  sh.getRange(1, 1).setValue('LAPORAN PERKEMBANGAN — IBASS 2026')
    .setBackground('#1e3a5f').setFontColor('#e8bf6a').setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1, 1, LAP_W).merge();
  sh.getRange(2, 1).setValue('Dokumen turunan untuk kepengurusan berikutnya · setiap update ber-stempel waktu · dibuat dari tombol "Perbarui Laporan" di Dashboard Kadiv atau menu "Laporan IBASS" di sheet ini')
    .setBackground('#13141f').setFontColor('#666688').setFontSize(9).setFontStyle('italic');
  sh.setFrozenRows(2);
  const widths = [130, 260, 110, 120, 95, 110, 220];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  return sh;
}

// Tulis 1 baris ke sheet LAPORAN dengan gaya opsional
function lapRow(sh, values, opt) {
  opt = opt || {};
  const row = sh.getLastRow() + 1;
  const vals = values.concat(Array(Math.max(0, LAP_W - values.length)).fill('')).slice(0, LAP_W);
  const rng = sh.getRange(row, 1, 1, LAP_W);
  if (opt.merge) {
    rng.merge();
    sh.getRange(row, 1).setValue(values[0]);
  } else {
    rng.setValues([vals]);
  }
  if (opt.bg) rng.setBackground(opt.bg);
  if (opt.fg) rng.setFontColor(opt.fg);
  if (opt.bold) rng.setFontWeight('bold');
  if (opt.size) rng.setFontSize(opt.size);
  if (opt.italic) rng.setFontStyle('italic');
  if (opt.wrap) rng.setWrap(true);
  return row;
}

function generateLaporanSheet(ss, catatan, penulis) {
  const sh = ensureLaporanSheet(ss);
  const now = new Date();

  lapRow(sh, ['']); // spacer
  lapRow(sh, ['UPDATE — ' + tglIndo(now)], { merge: true, bg: '#1e3a5f', fg: '#e8bf6a', bold: true, size: 11 });
  if (penulis) lapRow(sh, ['Dicatat oleh: ' + penulis], { merge: true, fg: '#666688', italic: true, size: 9 });

  // Ringkasan per divisi
  lapRow(sh, ['RINGKASAN DIVISI'], { merge: true, bg: '#13141f', fg: '#5bc4f5', bold: true, size: 10 });
  lapRow(sh, ['Divisi', 'Total Kegiatan', 'Selesai', 'Berlangsung', 'Belum', 'Terlambat', 'Batal'], { bg: '#13141f', fg: '#9999bb', bold: true, size: 9 });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lateAll = [];
  const cancelAll = [];
  SHEET_DIVISI.forEach(name => {
    const rows = readSheet(ss, name);
    const c = { Selesai: 0, Berlangsung: 0, Terlambat: 0, Cancel: 0, Belum: 0 };
    rows.forEach(r => {
      let st = r.status || 'Belum';
      const dl = r.deadline ? new Date(r.deadline) : null;
      if (st !== 'Selesai' && st !== 'Cancel' && dl && !isNaN(dl) && dl < today) st = 'Terlambat';
      c[st] = (c[st] || 0) + 1;
      if (st === 'Terlambat') lateAll.push({ divisi: name, r });
      if (st === 'Cancel') cancelAll.push({ divisi: name, r });
    });
    lapRow(sh, [name, rows.length, c.Selesai, c.Berlangsung, c.Belum, c.Terlambat, c.Cancel]);
  });

  // Kegiatan bermasalah = bahan evaluasi
  lapRow(sh, ['PERLU PERHATIAN — LEWAT DEADLINE'], { merge: true, bg: '#13141f', fg: '#f87171', bold: true, size: 10 });
  if (!lateAll.length) {
    lapRow(sh, ['Tidak ada — semua kegiatan berjalan sesuai jadwal.'], { merge: true, fg: '#4ecb8d' });
  } else {
    lapRow(sh, ['Divisi', 'Kegiatan', 'PIC', 'Deadline', '', '', 'Catatan'], { bg: '#13141f', fg: '#9999bb', bold: true, size: 9 });
    lateAll.forEach(x => lapRow(sh, [x.divisi, x.r.kegiatan || '—', x.r.pic || '—', x.r.deadline || '—', '', '', x.r.catatan || ''], { wrap: true }));
  }
  if (cancelAll.length) {
    lapRow(sh, ['KEGIATAN DIBATALKAN'], { merge: true, bg: '#13141f', fg: '#888899', bold: true, size: 10 });
    cancelAll.forEach(x => lapRow(sh, [x.divisi, x.r.kegiatan || '—', x.r.pic || '—', '', '', '', x.r.catatan || ''], { wrap: true }));
  }

  // Dana DAP
  try {
    const pays = readDapPayments();
    if (pays.length) {
      const total = pays.reduce((a, p) => a + (p.nominal || 0), 0);
      const lunas = pays.filter(p => /lunas/i.test(p.termin || '')).length;
      lapRow(sh, ['DANA DAP'], { merge: true, bg: '#13141f', fg: '#4ecb8d', bold: true, size: 10 });
      lapRow(sh, ['Terkumpul ' + rp(total) + ' dari ' + pays.length + ' pembayaran (' + lunas + ' lunas).'], { merge: true });
    }
  } catch (e) {}

  // Penilaian Bizstar
  try {
    const pen = readPenilaian(ss);
    if (pen.length) {
      const perMile = {};
      pen.forEach(p => { const k = p.milestone || '—'; perMile[k] = (perMile[k] || 0) + 1; });
      lapRow(sh, ['PENILAIAN BIZSTAR'], { merge: true, bg: '#13141f', fg: '#a78bfa', bold: true, size: 10 });
      lapRow(sh, [pen.length + ' penilaian masuk — ' + Object.keys(perMile).map(k => k + ': ' + perMile[k]).join(', ') + '.'], { merge: true });
    }
  } catch (e) {}

  // Evaluasi manual
  lapRow(sh, ['CATATAN EVALUASI UNTUK PENERUS'], { merge: true, bg: '#13141f', fg: '#e8bf6a', bold: true, size: 10 });
  lapRow(sh, [catatan && catatan.trim() ? catatan.trim() : '—'], { merge: true, wrap: true });

  // Catat waktu update
  const props = PropertiesService.getScriptProperties();
  let ups = [];
  try { ups = JSON.parse(props.getProperty('laporan_updates') || '[]'); } catch (e) {}
  ups.push(tglIndo(now));
  ups = ups.slice(-100);
  props.setProperty('laporan_updates', JSON.stringify(ups));

  return { message: 'Laporan diperbarui', url: ss.getUrl() + '#gid=' + sh.getSheetId(), updates: ups };
}

// ─── Helper: baca sheet → array of objects ───────────────────────
function readSheet(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return [];

  const values = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, HEADER_ROW.length).getValues();
  return values
    // skip baris kosong + baris header sisa layout lama (sebelum sheet termigrasi)
    .filter(r => r[2] && r[2] !== 'Kegiatan & Detail')
    .map(r => ({
      no:        r[0],
      divisi:    r[1],
      kegiatan:  r[2],
      priority:  r[3],
      pic:       r[4],
      mulai:     fmtDate(r[5]),
      deadline:  fmtDate(r[6]),
      status:    r[7] || 'Belum',
      catatan:   r[8],
      file:      r[9]
    }));
}

// ─── Helper: format tanggal ───────────────────────────────────────
function fmtDate(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'Asia/Jakarta', 'yyyy-MM-dd');
  return String(val);
}

// ─── Helper: sheet STATE (sync antar-perangkat, tersembunyi) ──────
// ─── Helper: sheet HT (lalu lintas sinyal panggilan suara, tersembunyi) ────
function htSheet(ss) {
  let sh = ss.getSheetByName(HT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(HT_SHEET);
    sh.getRange(1, 1, 1, 7).setValues([['id', 'waktu', 'room', 'dari', 'ke', 'kind', 'data']]);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

// Siapa saja yang sedang membuka HT (room, nama, jejak waktu terakhir, status)
function htPresenceSheet(ss) {
  let sh = ss.getSheetByName(HT_SHEET + '_ON');
  if (!sh) {
    sh = ss.insertSheet(HT_SHEET + '_ON');
    sh.getRange(1, 1, 1, 4).setValues([['room', 'nama', 'terakhir', 'status']]);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

// Potongan suara mode hemat (dipakai saat suara langsung diblokir jaringan)
function htSuaraSheet(ss) {
  let sh = ss.getSheetByName(HT_SHEET + '_V');
  if (!sh) {
    sh = ss.insertSheet(HT_SHEET + '_V');
    sh.getRange(1, 1, 1, 5).setValues([['id', 'waktu', 'room', 'dari', 'data']]);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

// Nomor urut sinyal yang selalu naik — supaya tidak ada sinyal terlewat/ganda
function htNextId(n) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (e) {}
  const props = PropertiesService.getScriptProperties();
  const cur = Number(props.getProperty('ht_counter') || 0);
  props.setProperty('ht_counter', String(cur + n));
  try { lock.releaseLock(); } catch (e) {}
  return cur;
}

function stateSheet(ss) {
  let sh = ss.getSheetByName('STATE');
  if (!sh) {
    sh = ss.insertSheet('STATE');
    sh.getRange(1, 1, 1, 3).setValues([['key', 'json', 'updated']]);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

// ─── Helper: layout polos ─────────────────────────────────────────
// Header di baris 1 (bold saja), data mulai baris 2. Tanpa judul, tanpa warna,
// tanpa catatan. Sheet berformat lama (judul 📋 dsb) otomatis dibangun ulang.
function ensurePlainLayout(sheet) {
  if (sheet.getRange(1, 1).getValue() === 'No') return;
  try { sheet.getDataRange().breakApart(); } catch (e) {}
  sheet.clear();
  sheet.getRange(1, 1, 1, HEADER_ROW.length).setValues([HEADER_ROW]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  const colWidths = [40, 100, 280, 80, 150, 100, 100, 100, 200, 200];
  colWidths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

// ─── Rebuild REKAP dari semua divisi ─────────────────────────────
function rebuildRekap(ss) {
  const rekap = ss.getSheetByName('REKAP');
  if (!rekap) return;
  ensurePlainLayout(rekap);

  // Hapus data lama
  const lastRow = rekap.getLastRow();
  if (lastRow >= DATA_START_ROW) {
    rekap.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, HEADER_ROW.length).clearContent();
  }

  let allRows = [];
  let no = 1;
  SHEET_DIVISI.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < DATA_START_ROW) return;
    const rows = sheet.getRange(DATA_START_ROW, 1, sheet.getLastRow() - DATA_START_ROW + 1, HEADER_ROW.length).getValues();
    rows.filter(r => r[2] && r[2] !== 'Kegiatan & Detail').forEach(r => {
      allRows.push([no++, r[1] || name, r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9]]);
    });
  });

  if (allRows.length > 0) {
    rekap.getRange(DATA_START_ROW, 1, allRows.length, HEADER_ROW.length).setValues(allRows);
  }
}

// ─── Grafik progress Track File per divisi (sheet GRAFIK) ────────
function updateGrafik(ss) {
  try {
    let sh = ss.getSheetByName('GRAFIK');
    if (!sh) sh = ss.insertSheet('GRAFIK');

    const stats = [['Divisi', 'Selesai', 'Berlangsung', 'Belum', 'Terlambat']];
    let totalAll = 0, selesaiAll = 0;
    SHEET_DIVISI.forEach(name => {
      const rows = readSheet(ss, name);
      const selesai = rows.filter(r => r.status === 'Selesai').length;
      totalAll += rows.length; selesaiAll += selesai;
      stats.push([name, selesai,
        rows.filter(r => r.status === 'Berlangsung').length,
        rows.filter(r => r.status === 'Belum').length,
        rows.filter(r => r.status === 'Terlambat').length]);
    });

    sh.clearContents();
    sh.getRange(1, 1, stats.length, 5).setValues(stats);
    sh.getRange(stats.length + 2, 1, 1, 2).setValues([[
      'Progress keseluruhan',
      totalAll ? Math.round(selesaiAll / totalAll * 100) + '% (' + selesaiAll + '/' + totalAll + ' selesai)' : 'belum ada data']]);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold');

    // Bangun ulang grafiknya supaya selalu mengikuti data terbaru
    sh.getCharts().forEach(c => sh.removeChart(c));
    const batang = sh.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(sh.getRange(1, 1, stats.length, 5))
      .setPosition(2, 7, 0, 0)
      .setOption('title', 'Progress Track File per Divisi')
      .setOption('isStacked', true)
      .setOption('width', 560).setOption('height', 320)
      .build();
    sh.insertChart(batang);
    const donat = sh.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(sh.getRange(1, 1, stats.length, 2))
      .setPosition(20, 7, 0, 0)
      .setOption('title', 'Kegiatan Selesai per Divisi')
      .setOption('pieHole', 0.45)
      .setOption('width', 560).setOption('height', 320)
      .build();
    sh.insertChart(donat);
  } catch (err) { /* grafik gagal tidak boleh mengganggu sync data */ }
}

// ─── Setup awal: buat semua sheet ────────────────────────────────
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename('Track File IBASS 2026');

  // Sheet REKAP (di posisi pertama)
  let rekap = ss.getSheetByName('REKAP');
  if (!rekap) {
    rekap = ss.insertSheet('REKAP', 0);
  } else {
    ss.setActiveSheet(rekap);
    ss.moveActiveSheet(1);
  }
  ensurePlainLayout(rekap);

  // Sheet per divisi
  SHEET_DIVISI.forEach((name, i) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name, i + 1);
    ensurePlainLayout(sheet);
  });

  // Hapus Sheet1 default jika ada dan masih kosong
  const default1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (default1 && default1.getLastRow() <= 1) {
    ss.deleteSheet(default1);
  }

  SpreadsheetApp.getUi().alert('Setup selesai.\n\nSheet yang dibuat:\n- REKAP\n- Secretary\n- Pubdok\n- Logistik\n- Event\n- Finance\n\nSekarang deploy sebagai Web App.');
}

function createDivisiSheet(ss, name) {
  const sheet = ss.insertSheet(name);
  ensurePlainLayout(sheet);
  return sheet;
}

// ─── JSON helpers ─────────────────────────────────────────────────
function jsonOk(obj) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, ...obj }))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonErr(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
