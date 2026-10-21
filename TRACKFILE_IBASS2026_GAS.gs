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
const KEAKTIFAN_POIN = 1;   // poin per proker yang dikonfirmasi hadir
const KEAKTIFAN_MAKS = 5;   // batas atas tambahan nilai — ini cuma nilai plus,
                            // jangan sampai menggeser urutan yang dibentuk KPI
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
   Nilai akhir = nilai KPI (0–100, dari sheet Penilaian) + poin keaktifan (maks +5).
   Kalau satu Bizstar dinilai buddy DAN panitia, nilai buddy dipakai 70% dan panitia 30%
   — buddy mengamati tiap hari, panitia cuma saat acara. Ubah angka di bawah kalau
   pembagiannya mau lain; sisanya ikut otomatis. */
const PERINGKAT_SHEET = 'Peringkat';
const BIZSTAR_SHEET   = 'Bizstar';
const REKAP_SHEET     = 'Rekap';
const PROKER_SHEET    = 'Proker';

/* Urutan departemen dipakai untuk validasi isian di sheet Bizstar dan untuk
   mengurutkan baris di sheet Rekap. */
const DEPT_LIST = ['Secretary', 'Finance', 'HRD', 'Advocacy',
  'External Affairs', 'MEIN', 'Entrepreneurship', 'ACT'];

const MILESTONE_LIST = ['Townhall 1', 'Pematerian 1', 'Townhall 2', 'Pematerian 2'];
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
            dept: String(r[3] || ''), proker: String(r[4] || ''), tanggal: tglPendek(r[5]),
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

    if (action === 'bizstar') {
      // Daftar nama Bizstar untuk web penilaian. Dikelompokkan per departemen
      // supaya web tinggal pakai, tidak perlu menyaring sendiri.
      const roster = bacaRoster();
      const perDept = {};
      roster.forEach(function (o) {
        if (!o.dept) return;
        if (!perDept[o.dept]) perDept[o.dept] = [];
        perDept[o.dept].push(o.nama);
      });
      return jsonOk({ daftar: roster, perDept: perDept, jumlah: roster.length });
    }

    if (action === 'proker') {
      // Daftar proker untuk tombol pilihan di menu Catat Proker.
      const daftar = bacaProker();
      return jsonOk({ daftar: daftar, jumlah: daftar.length });
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
      /* Catatan kehadiran menambah nilai, jadi tidak boleh bisa ditulis siapa saja
         yang kebetulan tahu alamat ini. Tokennya sama dengan yang dipakai kiriman
         penilaian. Ini menahan tulisan iseng dan pindaian acak, bukan orang yang
         memang membuka kode halaman — untuk itu perlu login, dan login bikin buddy
         tidak bisa mengisi cepat lewat HP. */
      if (body.token !== PENILAIAN_TOKEN) return jsonErr('Token salah');
      if (!body.nama || !body.proker) return jsonErr('Nama dan nama proker wajib diisi');
      const sh = keaktifanSheet();
      const nama = String(body.nama).trim(), proker = String(body.proker).trim();

      /* Buddy boleh mencatat sendiri (jalur kedua). Kalau yang mengirim menyertakan
         status 'Hadir' berikut namanya, laporan langsung sah tanpa perlu dikonfirmasi
         lagi — yang mencatat memang orang yang berhak mengonfirmasi. */
      /* Buddy boleh menandai hadir ATAU tidak hadir. Dua-duanya keputusan yang sudah
         pasti, jadi tidak perlu lewat status "Menunggu". Yang tidak hadir tetap
         tercatat supaya kelihatan sudah diperiksa, tapi tidak menambah poin. */
      const statusKirim = String(body.status || '');
      const olehBersih = String(body.oleh || '').trim();
      const langsung = olehBersih && (statusKirim === 'Hadir' || statusKirim === 'Tidak Hadir');

      /* Orang + proker yang sama tidak boleh jadi dua baris — poinnya dobel.
         Tapi menolak mentah-mentah bikin salah tandai tidak bisa dibetulkan lewat
         Catat Proker: yang terlanjur 'Tidak Hadir' mentok di situ. Jadi kalau buddy
         mengirim keputusan yang BERBEDA, baris lamanya diperbarui, bukan ditolak. */
      if (sh.getLastRow() > 1) {
        const rapikan = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); };
        const nb = rapikan(nama), pb = rapikan(proker);
        const isi = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
        for (let i = 0; i < isi.length; i++) {
          if (rapikan(isi[i][2]) !== nb || rapikan(isi[i][4]) !== pb) continue;
          const statusLama = String(isi[i][7] || 'Menunggu');
          if (langsung && statusLama !== statusKirim) {
            sh.getRange(i + 2, 8, 1, 2).setValues([[statusKirim, olehBersih]]);
            try { rebuildPeringkat(); rebuildRekapBizstar(); } catch (e2) {}
            return jsonOk({ diperbarui: true, dari: statusLama, status: statusKirim });
          }
          return jsonOk({ kembar: true });
        }
      }
      // Kolom 3 = nama bizstar, penanda baris berisi.
      const barisBaru = barisTerakhirBerisi(sh, 3) + 1;
      sh.getRange(barisBaru, 1, 1, 9).setValues([[Date.now(), new Date().toISOString(),
        nama, String(body.dept || ''), proker, String(body.tanggal || ''),
        String(body.bukti || ''),
        langsung ? statusKirim : 'Menunggu', langsung ? olehBersih : '']]);
      /* Proker yang diketik buddy lewat "Proker lain" ikut dimasukkan ke daftar,
         jadi lain kali tinggal ditekan — daftarnya tumbuh sendiri dari pemakaian,
         tidak perlu ada yang mengisi dari pusat. */
      try { tambahProkerKalauBaru(proker); } catch (e3) {}
      if (langsung) { try { rebuildPeringkat(); rebuildRekapBizstar(); } catch (e2) {} }
      return jsonOk({ tersimpan: true });
    }

    // ── Buddy mengonfirmasi: benar hadir atau tidak ──
    if (action === 'keaktifankonfirm') {
      if (body.token !== PENILAIAN_TOKEN) return jsonErr('Token salah');
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
          try { rebuildPeringkat(); rebuildRekapBizstar(); } catch (e2) {}
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
      'proker', 'tanggal', 'bukti', 'status', 'dikonfirmasi oleh']]);
    rapikanJudul(sh, 9);
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
  sheet.getRange(1, 1, 1, PENILAIAN_HEADER.length).setValues([PENILAIAN_HEADER]);
  rapikanJudul(sheet, PENILAIAN_HEADER.length);
  const widths = [140, 70, 150, 110, 110, 150, 90, 110, 80, 80, 100, 70, 80, 90, 220, 220];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  return sheet;
}

/* getLastRow() ikut menghitung baris yang cuma punya format atau pernah diisi lalu
   dikosongkan, jadi penilaian baru bisa mendarat jauh di bawah dan menyisakan baris
   kosong di atasnya. Dari luar itu terlihat seperti data tidak masuk. Di sini baris
   terakhir dicari dari kolom yang pasti terisi kalau barisnya memang data. */
function barisTerakhirBerisi(sheet, kolomPenanda) {
  const n = sheet.getLastRow();
  if (n < 2) return 1;
  const nilai = sheet.getRange(2, kolomPenanda, n - 1, 1).getValues();
  for (let i = nilai.length - 1; i >= 0; i--) {
    if (String(nilai[i][0]).trim() !== '') return i + 2;
  }
  return 1;
}

/* Rapikan baris kosong yang menyelip antara judul dan data pertama. Hanya baris yang
   benar-benar kosong di semua kolom yang dibuang, jadi tidak ada data yang hilang. */
function rapikanBarisKosong(sheet, lebar) {
  const n = sheet.getLastRow();
  if (n < 2) return 0;
  const nilai = sheet.getRange(2, 1, n - 1, lebar).getValues();
  let kosong = 0;
  while (kosong < nilai.length &&
         nilai[kosong].every(function (v) { return String(v).trim() === ''; })) kosong++;
  if (kosong > 0 && kosong < nilai.length) {
    sheet.deleteRows(2, kosong);
    return kosong;
  }
  return 0;
}

function savePenilaian(ss, submissions) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return jsonErr('Tidak ada data penilaian');
  }
  const sheet = ensurePenilaianSheet(ss);

  /* Satu penilai cuma boleh menilai satu Bizstar sekali per milestone.
     Waktu Pematerian 1 ada buddy yang terkirim dua kali dengan isi sama persis, jadi
     kolom "Dinilai Buddy" jadi 2 dan hitungan Rekap ikut dobel. Kuncinya harus di
     sini, bukan cuma di layar: kunci di layar bisa dilewati dengan membuka dari HP
     lain. Yang sudah ada tidak ditimpa — kalau memang perlu dibetulkan, barisnya
     dihapus dulu di sheet, baru dikirim ulang. */
  const sudahAda = {};
  readPenilaian().forEach(function (r) {
    sudahAda[kunciPenilaian(r.role, r.penilai, r.milestone, r.nama_bizstar)] = true;
  });
  const dobel = [];
  submissions = submissions.filter(function (s) {
    const k = kunciPenilaian(s.role, s.penilai, s.milestone, s.nama_bizstar);
    if (sudahAda[k]) { dobel.push(String(s.nama_bizstar || '')); return false; }
    sudahAda[k] = true;   // dobel di dalam satu kiriman juga ikut tersaring
    return true;
  });
  if (!submissions.length) {
    return jsonOk({ message: 'Semua sudah pernah dikirim', tersimpan: 0, dobel: dobel });
  }

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
  // Kolom 6 = Nama Bizstar, selalu terisi kalau barisnya memang data.
  const mulai = barisTerakhirBerisi(sheet, 6) + 1;
  sheet.getRange(mulai, 1, rows.length, PENILAIAN_HEADER.length).setValues(rows);
  try { rebuildPeringkat(); rebuildRekapBizstar(); } catch (e) {}
  return jsonOk({ message: rows.length + ' penilaian tersimpan', tersimpan: rows.length, dobel: dobel });
}

/* Satu penilaian = satu penilai menilai satu Bizstar di satu milestone, dari satu
   peran. Nama dibandingkan tanpa besar kecil huruf dan spasi, sama seperti di
   tempat lain, supaya "fakhri haidar" dan "Fakhri Haidar" terbaca orang yang sama. */
function kunciPenilaian(peran, penilai, milestone, bizstar) {
  return [String(peran || '').toLowerCase(), normNama(penilai),
    String(milestone || '').trim(), normNama(bizstar)].join('|');
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

  /* Departemen cuma terbaca dari baris penilaian buddy. Bizstar yang baru dinilai
     panitia saja jadi tidak punya departemen — padahal panitia biasanya menilai
     lebih dulu, waktu acara. Daftar Bizstar menutup lubang itu. */
  try {
    bacaRoster().forEach(function (r) {
      // slot() sekalian membuat barisnya kalau orang ini belum pernah dinilai,
      // supaya Peringkat memuat semua Bizstar — yang kosong tampil "Belum dinilai"
      // dan jatuh ke bawah, bukan hilang dari daftar seolah tidak ada orangnya.
      const o = slot(r.nama);
      if (r.dept && !o.dept) o.dept = r.dept;
    });
  } catch (e) {}

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
      nilaiBuddy: rb, nilaiPanitia: rp,
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

  /* Peringkat versi panitia saja.
     Nilai buddy tidak bisa dibandingkan lintas departemen karena tiap departemen
     dinilai orang yang berbeda, dan tiap orang punya standar sendiri. Panitia
     menilai siapa saja lintas departemen, jadi ukurannya seragam — ini pembanding
     paling jujur kalau harus memilih satu Best Bizstar dari semua.
     Kosong untuk yang belum pernah dinilai panitia. */
  daftar.filter(function (d) {
    return d.nilaiPanitia !== null && d.nilaiPanitia !== undefined;
  }).sort(function (a, b) {
    if (b.nilaiPanitia !== a.nilaiPanitia) return b.nilaiPanitia - a.nilaiPanitia;
    return String(a.nama).localeCompare(String(b.nama), 'id');
  }).forEach(function (d, i) { d.peringkatPanitia = i + 1; });

  return daftar;
}

/* Judul kolom dibuat sama di semua sheet: tebal, abu-abu muda, tanpa warna.
   Dipisah jadi fungsi sendiri supaya sheet yang terlanjur berwarna ikut
   dirapikan waktu menu Siapkan Sheet dijalankan, bukan cuma yang baru dibuat. */
/* ── Grafik per departemen di sheet Rekap ──
   Dibuat sekali saja, tidak tiap penilaian masuk. Grafik Sheets menunjuk rentang sel,
   jadi angkanya ikut berubah sendiri waktu tabelnya ditulis ulang — tidak perlu
   dibongkar pasang. Baris tabel departemen selalu di tempat yang sama (judul baris 5,
   isi baris 6 ke bawah sebanyak jumlah departemen), jadi rentangnya tidak pernah geser.

   Dibungkus try supaya kegagalan menggambar tidak pernah menggagalkan penyimpanan
   nilai — grafik itu pelengkap, bukan datanya. */
function pastikanGrafikRekap(sh, barisJudul, jumlahDept) {
  if (!sh || !jumlahDept) return;
  try {
    if (sh.getCharts().length) return;   // sudah ada, rentangnya masih benar

    const dept  = sh.getRange(barisJudul, 1, jumlahDept + 1, 1);   // nama departemen
    const rata  = sh.getRange(barisJudul, 6, jumlahDept + 1, 1);   // rata-rata nilai
    const maju  = sh.getRange(barisJudul, 4, jumlahDept + 1, 2);   // sudah + belum dinilai

    sh.insertChart(sh.newChart().asColumnChart()
      .addRange(dept).addRange(rata)
      .setNumHeaders(1)
      .setOption('title', 'Rata-rata nilai akhir per departemen')
      .setOption('legend', { position: 'none' })
      .setOption('colors', ['#6b7f99'])
      .setOption('hAxis', { slantedText: true, slantedTextAngle: 45 })
      .setOption('width', 460).setOption('height', 260)
      .setPosition(barisJudul, 9, 0, 0)
      .build());

    sh.insertChart(sh.newChart().asColumnChart()
      .addRange(dept).addRange(maju)
      .setNumHeaders(1)
      .setOption('title', 'Sudah dinilai dan yang belum')
      .setOption('isStacked', true)
      .setOption('legend', { position: 'top' })
      .setOption('colors', ['#6b7f99', '#d6d6d6'])
      .setOption('hAxis', { slantedText: true, slantedTextAngle: 45 })
      .setOption('width', 460).setOption('height', 260)
      .setPosition(barisJudul + 14, 9, 0, 0)
      .build());
  } catch (e) {}
}

/* Peringkat dan Rekap ditulis ulang dari nol tiap ada data masuk, jadi apa pun yang
   diketik tangan di situ pasti hilang tanpa pemberitahuan. Peringatan ini muncul
   sebelum orang terlanjur mengetik. Sengaja hanya peringatan, bukan kunci mati —
   supaya Boss tetap bisa menyalin atau menandai sesuatu kalau memang perlu. */
function lindungiSheet(sh, alasan) {
  if (!sh) return;
  try {
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .forEach(function (pr) { pr.remove(); });
    sh.protect().setDescription(alasan).setWarningOnly(true);
  } catch (e) {}
}

/* Filter bawaan Sheets, dipasang ulang karena yang lama ikut terbawa gaya lama. */
function pasangFilter(sh, jumlahKolom) {
  if (!sh || sh.getLastRow() < 1) return;
  const lama = sh.getFilter();
  if (lama) lama.remove();
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), jumlahKolom).createFilter();
}

function rapikanJudul(sh, jumlahKolom) {
  if (!sh || jumlahKolom < 1) return;
  sh.getRange(1, 1, 1, jumlahKolom)
    .setBackground('#f3f3f3')
    .setFontColor('#000000')
    .setFontWeight('bold')
    .setFontSize(10);
  sh.setFrozenRows(1);
}

/* ── Daftar nama Bizstar ──
   Diisi tangan di sheet, bukan di kode, supaya ganti nama tidak perlu ubah web.
   Web membacanya lewat action=bizstar saat dibuka; kalau sheet masih kosong web
   memakai daftar bawaannya sendiri, jadi tidak ada yang mati mendadak. */
function bizstarSheet() {
  const ss = penilaianSS();
  let sh = ss.getSheetByName(BIZSTAR_SHEET);

  /* Sheet yang dibuat versi lama cuma punya dua kolom dan catatannya nyangkut di
     kolom D. Dulu fungsi ini langsung berhenti kalau sheetnya sudah ada, jadi kolom
     Line ID tidak pernah muncul di spreadsheet yang terlanjur dibuat duluan.
     Sekarang dirapikan di tempat, tanpa menyentuh nama yang sudah diketik. */
  if (sh) {
    if (String(sh.getRange(1, 3).getValue()).trim() !== 'Line ID') {
      sh.getRange(1, 3).setValue('Line ID');
      sh.setColumnWidth(3, 170);
    }
    const catatanLama = String(sh.getRange(1, 4).getValue());
    if (catatanLama.indexOf('Isi satu nama per baris') > -1) sh.getRange(1, 4).clearContent();
    sh.getRange(1, 5).setValue('Satu nama per baris. Line ID cuma catatan, tidak dipakai web.')
      .setFontColor('#888888');
    rapikanJudul(sh, 3);
    return sh;
  }

  sh = ss.insertSheet(BIZSTAR_SHEET);
  sh.getRange(1, 1, 1, 3).setValues([['Nama Bizstar', 'Departemen', 'Line ID']]);
  rapikanJudul(sh, 3);
  sh.setColumnWidth(1, 260);
  sh.setColumnWidth(2, 160);
  sh.setColumnWidth(3, 170);

  // Departemen dipilih dari daftar supaya tidak ada salah ketik yang bikin
  // nama Bizstar tidak ketemu buddy-nya.
  const aturan = SpreadsheetApp.newDataValidation()
    .requireValueInList(DEPT_LIST, true)
    .setAllowInvalid(false)
    .setHelpText('Pilih salah satu departemen dari daftar.')
    .build();
  sh.getRange(2, 2, 400, 1).setDataValidation(aturan);

  sh.getRange(1, 5).setValue('Satu nama per baris. Line ID cuma catatan, tidak dipakai web.')
    .setFontColor('#888888');
  return sh;
}

/* ── Daftar proker HIMA ──
   Nama proker diketik tangan juga berantakan: "Aspire 2026", "aspire", "ASPIRE".
   Penolakan kembar memang mengabaikan besar kecil huruf dan spasi, tapi di sheet
   dan di rekap tetap terbaca sebagai tulisan yang berbeda-beda. Dengan daftar
   tetap, buddy tinggal menekan. */
function prokerSheet() {
  const ss = penilaianSS();
  let sh = ss.getSheetByName(PROKER_SHEET);
  if (sh) return sh;

  sh = ss.insertSheet(PROKER_SHEET);
  sh.getRange(1, 1, 1, 2).setValues([['Nama Proker', 'Keterangan']]);
  rapikanJudul(sh, 2);
  sh.setColumnWidth(1, 260);
  sh.setColumnWidth(2, 260);
  sh.getRange(1, 4).setValue('Satu proker per baris. Yang ada di sini muncul sebagai '
    + 'pilihan di menu Catat Proker.').setFontColor('#888888');
  return sh;
}

/* Tambahkan ke sheet Proker kalau namanya belum ada. Pembandingnya mengabaikan
   besar kecil huruf dan spasi, jadi "aspire 2026" tidak menambah baris baru kalau
   "Aspire 2026" sudah ada. */
function tambahProkerKalauBaru(nama) {
  const bersih = String(nama || '').trim();
  if (!bersih) return false;
  const kunci = bersih.toLowerCase().replace(/[^a-z0-9]/g, '');
  const sudah = bacaProker().some(function (x) {
    return x.toLowerCase().replace(/[^a-z0-9]/g, '') === kunci;
  });
  if (sudah) return false;
  const sh = prokerSheet();
  sh.getRange(sh.getLastRow() + 1, 1, 1, 2)
    .setValues([[bersih, 'Ditambahkan sendiri waktu buddy mencatat']]);
  return true;
}

function bacaProker() {
  const sh = prokerSheet();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 1).getValues()
    .map(function (r) { return String(r[0] || '').trim(); })
    .filter(function (v) { return v; });
}

/* Baca daftar Bizstar dari sheet. Baris tanpa nama dilewati. */
function bacaRoster() {
  const sh = bizstarSheet();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 2).getValues()
    .map(function (r) {
      return { nama: String(r[0] || '').trim(), dept: String(r[1] || '').trim() };
    })
    .filter(function (o) { return o.nama; });
}

/* "Nilai Buddy" dan "Nilai Panitia" sengaja ditaruh sebelum "Nilai KPI" supaya
   kelihatan nilai akhir itu datang dari mana. Tanpa itu, sumbangan panitia tenggelam
   di dalam satu angka dan tidak bisa dicek ulang tanpa menghitung tangan. */
const PERINGKAT_HEADER = ['Peringkat', 'Nama Bizstar', 'Departemen', 'Buddy',
  'Nilai Buddy', 'Nilai Panitia', 'Peringkat Panitia',
  'Nilai KPI', 'Poin Keaktifan', 'Nilai Akhir', 'Predikat',
  'Dinilai Buddy', 'Dinilai Panitia', 'Milestone Terisi', 'Proker Hadir', 'Menunggu Konfirmasi'];

/* Tulis ulang sheet Peringkat dari nol. Dipanggil tiap penilaian masuk, tiap buddy
   mengonfirmasi kehadiran, dan lewat menu di spreadsheet. */
function rebuildPeringkat() {
  const ss = penilaianSS();
  let sh = ss.getSheetByName(PERINGKAT_SHEET);
  if (!sh) sh = ss.insertSheet(PERINGKAT_SHEET);

  // Filter lama harus dilepas dulu, kalau tidak sheet tidak bisa ditulis ulang.
  const filterLama = sh.getFilter();
  if (filterLama) filterLama.remove();
  sh.clear();

  const daftar = hitungPeringkat();
  const W = PERINGKAT_HEADER.length;

  sh.getRange(1, 1).setValue('Peringkat Bizstar IBASS 2026').setFontWeight('bold');
  sh.getRange(2, 1).setValue('Diperbarui ' + tglIndo(new Date())
    + '. Nilai akhir = nilai KPI + poin keaktifan (maksimal ' + KEAKTIFAN_MAKS + '). '
    + 'Kalau dinilai buddy dan panitia, buddy ' + Math.round(BOBOT_BUDDY * 100)
    + ' persen dan panitia ' + Math.round(BOBOT_PANITIA * 100) + ' persen. '
    + 'Kolom Peringkat Panitia memakai nilai panitia saja, satu-satunya ukuran yang '
    + 'seragam lintas departemen karena penilainya orang yang sama.')
    .setFontColor('#888888').setFontSize(9);

  const baris0 = 4;
  sh.getRange(baris0, 1, 1, W).setValues([PERINGKAT_HEADER])
    .setBackground('#f3f3f3').setFontColor('#000000')
    .setFontWeight('bold').setFontSize(10);
  sh.setFrozenRows(baris0);

  if (!daftar.length) {
    sh.getRange(baris0 + 1, 1)
      .setValue('Belum ada data. Terisi sendiri begitu penilaian pertama masuk.')
      .setFontColor('#888888');
    lebarPeringkat(sh);
    return daftar;
  }

  const rows = daftar.map(function (d) {
    return [
      d.peringkat === '' ? '' : d.peringkat,
      d.nama, d.dept, d.buddy,
      d.nilaiBuddy === null || d.nilaiBuddy === undefined ? '' : Math.round(d.nilaiBuddy * 100) / 100,
      d.nilaiPanitia === null || d.nilaiPanitia === undefined ? '' : Math.round(d.nilaiPanitia * 100) / 100,
      d.peringkatPanitia || '',
      d.kpi === null ? '' : Math.round(d.kpi * 100) / 100,
      d.poin,
      d.akhir === null ? '' : Math.round(d.akhir * 100) / 100,
      d.akhir === null ? 'Belum dinilai' : d.predikat,
      d.nBuddy, d.nPanitia, d.milestone, d.hadir, d.menunggu
    ];
  });
  sh.getRange(baris0 + 1, 1, rows.length, W).setValues(rows);
  sh.getRange(baris0 + 1, 5, rows.length, 2).setNumberFormat('0.00');   // nilai buddy, nilai panitia
  sh.getRange(baris0 + 1, 7, rows.length, 1).setNumberFormat('0');      // peringkat panitia
  sh.getRange(baris0 + 1, 8, rows.length, 1).setNumberFormat('0.00');   // nilai KPI
  sh.getRange(baris0 + 1, 9, rows.length, 1).setNumberFormat('0');      // poin keaktifan
  sh.getRange(baris0 + 1, 10, rows.length, 1).setNumberFormat('0.00');  // nilai akhir

  // Yang belum punya nilai dibuat kelabu supaya tidak terbaca sebagai peringkat bawah.
  daftar.forEach(function (d, i) {
    if (d.akhir === null) sh.getRange(baris0 + 1 + i, 1, 1, W).setFontColor('#999999');
  });

  sh.getRange(baris0, 1, rows.length + 1, W).createFilter();
  lebarPeringkat(sh);
  return daftar;
}

function lebarPeringkat(sh) {
  [75, 210, 150, 180, 95, 100, 110, 85, 100, 90, 110, 100, 100, 110, 95, 130]
    .forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

/* ── Sheet Rekap ──
   Dua hal yang sering ditanya menjelang hari-H: departemen mana yang penilaiannya
   belum masuk, dan siapa saja yang belum tersentuh sama sekali. Dihitung dari
   daftar Bizstar di sheet, jadi angkanya baru benar setelah daftar itu diisi. */
function rebuildRekapBizstar() {
  const ss = penilaianSS();
  let sh = ss.getSheetByName(REKAP_SHEET);
  if (!sh) sh = ss.insertSheet(REKAP_SHEET);
  /* clearContents, bukan clear: clear() ikut membuang format tapi grafik tetap
     tinggal — yang penting di sini isinya saja yang disegarkan. */
  sh.clearContents();
  sh.clearFormats();

  const daftar = hitungPeringkat();
  const roster = bacaRoster();

  const nilaiPer = {};
  daftar.forEach(function (d) { nilaiPer[normNama(d.nama)] = d; });

  sh.getRange(1, 1).setValue('Rekap Penilaian Bizstar IBASS 2026').setFontWeight('bold');
  sh.getRange(2, 1).setValue('Diperbarui ' + tglIndo(new Date())
    + (roster.length ? '' : '. Sheet Bizstar masih kosong, jadi kolom jumlah belum terisi.'))
    .setFontColor('#888888').setFontSize(9);

  // ── Per departemen ──
  let baris = 4;
  sh.getRange(baris, 1).setValue('Per departemen').setFontWeight('bold');
  baris++;
  sh.getRange(baris, 1, 1, 7).setValues([['Departemen', 'Buddy', 'Jumlah Bizstar',
    'Sudah dinilai', 'Belum dinilai', 'Rata-rata nilai', 'Tertinggi']])
    .setFontWeight('bold').setBackground('#f3f3f3');
  baris++;

  const deptIsi = DEPT_LIST.map(function (dp) {
    const anggota = roster.filter(function (o) { return o.dept === dp; });
    const dinilai = [];
    anggota.forEach(function (o) {
      const d = nilaiPer[normNama(o.nama)];
      if (d && d.akhir !== null) dinilai.push(d);
    });
    // Kalau daftar Bizstar belum diisi, pakai saja nama yang sudah masuk penilaian.
    if (!anggota.length) {
      daftar.forEach(function (d) {
        if (d.dept === dp && d.akhir !== null) dinilai.push(d);
      });
    }
    const jumlah = anggota.length || dinilai.length;
    const rata = dinilai.length
      ? dinilai.reduce(function (t, d) { return t + d.akhir; }, 0) / dinilai.length
      : '';
    let top = '';
    dinilai.forEach(function (d) {
      if (!top || d.akhir > top.akhir) top = d;
    });
    return [dp, buddyDept(dp) || '', jumlah, dinilai.length,
      jumlah ? jumlah - dinilai.length : '',
      rata === '' ? '' : Math.round(rata * 100) / 100,
      top ? top.nama : ''];
  });
  sh.getRange(baris, 1, deptIsi.length, 7).setValues(deptIsi);
  sh.getRange(baris, 6, deptIsi.length, 1).setNumberFormat('0.00');
  // baris - 1 = baris judul tabel, dipakai grafik sebagai nama kolomnya
  pastikanGrafikRekap(sh, baris - 1, deptIsi.length);
  baris += deptIsi.length + 2;

  // ── Per milestone ──
  sh.getRange(baris, 1).setValue('Per milestone').setFontWeight('bold');
  baris++;
  sh.getRange(baris, 1, 1, 5).setValues([['Milestone', 'Dari buddy', 'Dari panitia',
    'Penilaian masuk', 'Bizstar tersentuh']])
    .setFontWeight('bold').setBackground('#f3f3f3');
  baris++;

  const rowsPen = readPenilaian();
  const msIsi = MILESTONE_LIST.map(function (ms) {
    const cocok = rowsPen.filter(function (r) { return String(r.milestone) === ms; });
    const dariBuddy = cocok.filter(function (r) {
      return String(r.role).toLowerCase() === 'buddy';
    }).length;
    const orang = {};
    cocok.forEach(function (r) { orang[normNama(r.nama_bizstar)] = true; });
    return [ms, dariBuddy, cocok.length - dariBuddy, cocok.length, Object.keys(orang).length];
  });
  sh.getRange(baris, 1, msIsi.length, 5).setValues(msIsi);
  baris += msIsi.length + 2;

  /* ── Buddy per milestone ──
     Siapa yang sudah mengisi dan siapa yang belum, supaya tidak perlu menanyai
     satu per satu di grup. Angkanya jumlah Bizstar yang sudah dia nilai (bukan
     jumlah baris), jadi kiriman dobel tidak membuatnya terlihat lebih rajin.
     Penilaian dihitung milik buddy departemen itu walau yang mengisi orang lain
     — yang penting departemennya sudah dinilai. */
  sh.getRange(baris, 1).setValue('Buddy per milestone').setFontWeight('bold');
  baris++;
  sh.getRange(baris, 1).setValue('Angka = jumlah Bizstar yang sudah dia nilai. '
    + 'Kosong = belum mengisi.').setFontColor('#888888').setFontSize(9);
  baris++;
  sh.getRange(baris, 1, 1, 2 + MILESTONE_LIST.length)
    .setValues([['Buddy', 'Departemen'].concat(MILESTONE_LIST)])
    .setFontWeight('bold').setBackground('#f3f3f3');
  baris++;

  const isiBuddy = BUDDY_2026.map(function (b) {
    return [b.n, b.d].concat(MILESTONE_LIST.map(function (ms) {
      const orang = {};
      rowsPen.forEach(function (r) {
        if (String(r.role).toLowerCase() !== 'buddy' || String(r.milestone) !== ms) return;
        const punyaDia = normNama(r.penilai) === normNama(b.n)
          || String(r.dept_penilai || '').trim() === b.d;
        if (punyaDia) orang[normNama(r.nama_bizstar)] = true;
      });
      const n = Object.keys(orang).length;
      return n || '';
    }));
  });
  sh.getRange(baris, 1, isiBuddy.length, isiBuddy[0].length).setValues(isiBuddy);
  baris += isiBuddy.length;

  /* Teks pengingat untuk milestone terakhir yang sudah ada isinya — tinggal salin
     ke grup. Milestone yang belum dimulai siapa pun tidak dianggap terlambat. */
  let msAktif = -1;
  MILESTONE_LIST.forEach(function (ms, i) {
    if (isiBuddy.some(function (r) { return r[2 + i] !== ''; })) msAktif = i;
  });
  if (msAktif > -1) {
    const belumIsi = isiBuddy.filter(function (r) { return r[2 + msAktif] === ''; });
    sh.getRange(baris, 1).setValue(belumIsi.length
      ? 'Belum mengisi ' + MILESTONE_LIST[msAktif] + ': '
        + belumIsi.map(function (r) { return r[0] + ' (' + r[1] + ')'; }).join(', ') + '.'
      : 'Semua buddy sudah mengisi ' + MILESTONE_LIST[msAktif] + '.')
      .setFontColor(belumIsi.length ? '#000000' : '#888888');
  }
  baris += 3;

  /* ── Kecenderungan penilai ──
     Satu departemen cuma dinilai satu buddy, dan nilai buddy menentukan 70 persen.
     Jadi posisi seorang Bizstar di peringkat ikut bergantung pada siapa buddy-nya,
     bukan cuma pada dirinya. Tabel ini memperlihatkan hal itu apa adanya: kalau
     rata-rata satu penilai jauh di bawah yang lain, peringkat antar departemen
     tidak bisa dibaca mentah-mentah. */
  sh.getRange(baris, 1).setValue('Kecenderungan penilai').setFontWeight('bold');
  baris++;
  sh.getRange(baris, 1).setValue('Kalau rata-rata antar penilai selisihnya jauh, bandingkan '
    + 'Bizstar di dalam departemen yang sama dulu, jangan langsung lintas departemen.')
    .setFontColor('#888888').setFontSize(9);
  baris++;
  sh.getRange(baris, 1, 1, 6).setValues([['Penilai', 'Peran', 'Orang dinilai',
    'Rata-rata diberi', 'Terendah', 'Tertinggi']])
    .setFontWeight('bold').setBackground('#f3f3f3');
  baris++;

  const perPenilai = {};
  rowsPen.forEach(function (r) {
    const nm = String(r.penilai || '').trim();
    if (!nm) return;
    const nilai = Number(r.skor_weighted);
    if (isNaN(nilai) || nilai <= 0) return;
    const k = normNama(nm);
    if (!perPenilai[k]) {
      perPenilai[k] = { nama: nm, peran: String(r.role || ''), nilai: [], orang: {} };
    }
    perPenilai[k].nilai.push(nilai);
    perPenilai[k].orang[normNama(r.nama_bizstar)] = true;
  });

  const kunciPenilai = Object.keys(perPenilai);
  if (!kunciPenilai.length) {
    sh.getRange(baris, 1).setValue('Belum ada penilaian yang masuk.').setFontColor('#888888');
    baris += 2;
  } else {
    const isiPenilai = kunciPenilai.map(function (k) {
      const o = perPenilai[k];
      const total = o.nilai.reduce(function (t, v) { return t + v; }, 0);
      return [o.nama, o.peran === 'buddy' ? 'Buddy' : 'Panitia',
        Object.keys(o.orang).length,
        Math.round((total / o.nilai.length) * 100) / 100,
        Math.round(Math.min.apply(null, o.nilai) * 100) / 100,
        Math.round(Math.max.apply(null, o.nilai) * 100) / 100];
    }).sort(function (a, b) {
      if (a[1] !== b[1]) return a[1] === 'Buddy' ? -1 : 1;
      return b[3] - a[3];
    });
    sh.getRange(baris, 1, isiPenilai.length, 6).setValues(isiPenilai);
    sh.getRange(baris, 4, isiPenilai.length, 3).setNumberFormat('0.00');
    baris += isiPenilai.length + 2;
  }

  // ── Belum tersentuh sama sekali ──
  sh.getRange(baris, 1).setValue('Belum dinilai sama sekali').setFontWeight('bold');
  baris++;
  const belum = roster.filter(function (o) {
    const d = nilaiPer[normNama(o.nama)];
    return !d || d.akhir === null;
  });
  if (!roster.length) {
    sh.getRange(baris, 1).setValue('Daftar Bizstar belum diisi di sheet Bizstar.')
      .setFontColor('#888888');
  } else if (!belum.length) {
    sh.getRange(baris, 1).setValue('Tidak ada. Semua Bizstar sudah punya nilai.')
      .setFontColor('#888888');
  } else {
    sh.getRange(baris, 1, 1, 3).setValues([['Nama Bizstar', 'Departemen', 'Buddy']])
      .setFontWeight('bold').setBackground('#f3f3f3');
    baris++;
    const isi = belum.map(function (o) {
      return [o.nama, o.dept, buddyDept(o.dept) || ''];
    });
    sh.getRange(baris, 1, isi.length, 3).setValues(isi);
  }

  [200, 190, 120, 110, 110, 125, 200]
    .forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  return { dept: deptIsi.length, belum: belum.length };
}

/* Dipakai sekali di awal: bikin ketiga sheet berikut judul kolomnya sekaligus,
   tanpa menunggu penilaian pertama masuk. Aman diklik berulang — sheet yang
   sudah ada tidak disentuh dan isinya tidak hilang. */
function menuSiapkanSheet() {
  const ui = SpreadsheetApp.getUi();
  try {
    const ss = penilaianSS();
    const sebelum = ss.getSheets().map(function (sh) { return sh.getName(); });

    const shPenilaian = ensurePenilaianSheet(ss);
    const shKeaktifan = keaktifanSheet();
    const shBizstar = bizstarSheet();
    const shProker = prokerSheet();

    // Sheet yang dibuat versi lama masih berjudul navy dengan teks biru —
    // dirapikan di sini supaya seragam dengan yang lain.
    rapikanJudul(shPenilaian, PENILAIAN_HEADER.length);
    rapikanJudul(shKeaktifan, 9);
    rapikanJudul(shBizstar, 3);
    rapikanJudul(shProker, 2);

    // Baris kosong yang terlanjur menyelip di atas data dibuang di sini.
    const dibuang = rapikanBarisKosong(shPenilaian, PENILAIAN_HEADER.length)
                  + rapikanBarisKosong(shKeaktifan, 9);

    // Filter di sheet Penilaian supaya kolom Peran bisa disaring jadi panitia saja.
    pasangFilter(shPenilaian, PENILAIAN_HEADER.length);
    pasangFilter(shKeaktifan, 9);

    lindungiSheet(ss.getSheetByName(PERINGKAT_SHEET),
      'Ditulis ulang otomatis tiap penilaian masuk. Ketikan tangan di sini akan hilang.');
    lindungiSheet(ss.getSheetByName(REKAP_SHEET),
      'Ditulis ulang otomatis tiap penilaian masuk. Ketikan tangan di sini akan hilang.');

    rebuildPeringkat();
    rebuildRekapBizstar();

    const sesudah = ss.getSheets().map(function (sh) { return sh.getName(); });
    const baru = sesudah.filter(function (n) { return sebelum.indexOf(n) === -1; });

    const kabar = [
      'File: ' + ss.getName(),
      '',
      baru.length ? 'Baru dibuat: ' + baru.join(', ') : 'Semua sheet sudah ada sebelumnya.',
      dibuang ? dibuang + ' baris kosong di atas data dibuang.' : '',
      '',
      'Sheet yang dipakai:',
      '- ' + BIZSTAR_SHEET + ': daftar nama Bizstar, diisi tangan',
      '- ' + PROKER_SHEET + ': daftar proker HIMA, diisi tangan',
      '- ' + PENILAIAN_SHEET + ': nilai KPI dari buddy dan panitia',
      '- ' + KEAKTIFAN_SHEET + ': kehadiran proker yang dicatat buddy',
      '- ' + PERINGKAT_SHEET + ': gabungan keduanya, tersusun sendiri',
      '- ' + REKAP_SHEET + ': progres per departemen dan per milestone',
      '',
      'Isi dulu sheet ' + BIZSTAR_SHEET + '. Web membaca nama dari situ.'
    ].join(String.fromCharCode(10));

    ui.alert('Sheet siap dipakai', kabar, ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Gagal menyiapkan sheet', String((err && err.message) || err), ui.ButtonSet.OK);
  }
}

/* Dipakai kalau grafiknya terlanjur kehapus atau posisinya digeser-geser. */
/* Baris yang dipakai waktu menguji sistem: nama Bizstar diawali "ZZZ" atau penilainya
   "UJI SISTEM". Dibuang dari sheet Penilaian dan Keaktifan sekaligus, lalu peringkat
   dihitung ulang. Dihapus dari bawah ke atas supaya nomor barisnya tidak bergeser
   waktu penghapusan berjalan. */
function menuHapusBarisUji() {
  const ui = SpreadsheetApp.getUi();
  const ujiCoba = function (teks) {
    const t = String(teks || '').trim().toUpperCase();
    return t.indexOf('ZZZ') === 0 || t === 'UJI SISTEM';
  };
  try {
    const ss = penilaianSS();
    let total = 0;
    const laporan = [];

    [[PENILAIAN_SHEET, [6, 3]], [KEAKTIFAN_SHEET, [3, 9]]].forEach(function (pasangan) {
      const sh = ss.getSheetByName(pasangan[0]);
      if (!sh || sh.getLastRow() < 2) return;
      const kolom = pasangan[1];
      const lebar = Math.max(kolom[0], kolom[1]);
      const data = sh.getRange(2, 1, sh.getLastRow() - 1, lebar).getValues();
      let dibuang = 0;
      for (let i = data.length - 1; i >= 0; i--) {
        if (ujiCoba(data[i][kolom[0] - 1]) || ujiCoba(data[i][kolom[1] - 1])) {
          sh.deleteRow(i + 2);
          dibuang++;
        }
      }
      if (dibuang) laporan.push(dibuang + ' di ' + pasangan[0]);
      total += dibuang;
    });

    if (total) { rebuildPeringkat(); rebuildRekapBizstar(); }
    ui.alert('Baris uji coba',
      total ? 'Dihapus: ' + laporan.join(', ') + '. Peringkat sudah dihitung ulang.'
            : 'Tidak ada baris uji coba yang ditemukan.',
      ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Gagal menghapus', String((err && err.message) || err), ui.ButtonSet.OK);
  }
}

/* Buang penilaian yang terkirim lebih dari sekali — penilai, milestone, Bizstar,
   dan perannya sama. Yang dipertahankan kiriman PERTAMA. Ini untuk membersihkan
   yang terlanjur masuk sebelum kunci dobel di savePenilaian terpasang; setelah itu
   seharusnya tidak ada lagi yang perlu dibuang. Tanya dulu sebelum menghapus. */
function menuBuangPenilaianDobel() {
  const ui = SpreadsheetApp.getUi();
  try {
    const sh = penilaianSS().getSheetByName(PENILAIAN_SHEET);
    if (!sh || sh.getLastRow() < 3) {
      ui.alert('Penilaian dobel', 'Tidak ada penilaian dobel.', ui.ButtonSet.OK);
      return;
    }
    const lebar = Math.max(sh.getLastColumn(), PENILAIAN_HEADER.length);
    const semua = sh.getRange(1, 1, sh.getLastRow(), lebar).getValues();
    const head = semua[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
    const kol = function (judul, cadangan) {
      const i = head.indexOf(judul);
      return i > -1 ? i : cadangan;
    };
    const iPeran = kol('peran', 1), iPenilai = kol('penilai', 2);
    const iMs = kol('milestone', 4), iNama = kol('nama bizstar', 5);

    const dilihat = {};
    const buang = [];          // nomor baris di sheet
    const ringkas = {};        // "Penilai — Milestone" -> jumlah
    for (let i = 1; i < semua.length; i++) {
      const r = semua[i];
      if (!String(r[iNama] || '').trim()) continue;
      const k = kunciPenilaian(r[iPeran], r[iPenilai], r[iMs], r[iNama]);
      if (dilihat[k]) {
        buang.push(i + 1);
        const label = String(r[iPenilai]).trim() + ' — ' + String(r[iMs]).trim();
        ringkas[label] = (ringkas[label] || 0) + 1;
      } else {
        dilihat[k] = true;
      }
    }

    if (!buang.length) {
      ui.alert('Penilaian dobel', 'Tidak ada penilaian dobel.', ui.ButtonSet.OK);
      return;
    }
    const daftar = Object.keys(ringkas).map(function (l) { return l + ': ' + ringkas[l]; });
    const jawab = ui.alert('Buang penilaian dobel?',
      buang.length + ' baris akan dihapus. Kiriman pertama tetap disimpan.\n\n'
      + daftar.join('\n'), ui.ButtonSet.YES_NO);
    if (jawab !== ui.Button.YES) return;

    // dari bawah ke atas, supaya nomor baris di atasnya tidak bergeser
    buang.sort(function (a, b) { return b - a; })
      .forEach(function (n) { sh.deleteRow(n); });
    rebuildPeringkat();
    rebuildRekapBizstar();
    ui.alert('Penilaian dobel', buang.length + ' baris dibuang. Peringkat dan Rekap sudah '
      + 'dihitung ulang.', ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Gagal membuang', String((err && err.message) || err), ui.ButtonSet.OK);
  }
}

function menuGambarUlangGrafik() {
  const ui = SpreadsheetApp.getUi();
  try {
    const sh = penilaianSS().getSheetByName(REKAP_SHEET);
    if (!sh) { ui.alert('Sheet Rekap belum ada. Jalankan Siapkan Sheet Penilaian dulu.'); return; }
    sh.getCharts().forEach(function (c) { sh.removeChart(c); });
    rebuildRekapBizstar();
    ui.alert('Grafik digambar ulang',
      'Dua grafik di sheet Rekap: rata-rata nilai per departemen, dan perbandingan '
      + 'sudah dinilai dengan yang belum.', ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Gagal menggambar grafik', String((err && err.message) || err), ui.ButtonSet.OK);
  }
}

function menuPerbaruiRekap() {
  const ui = SpreadsheetApp.getUi();
  try {
    const hasil = rebuildRekapBizstar();
    ui.alert('Rekap diperbarui',
      hasil.belum
        ? hasil.belum + ' Bizstar belum punya nilai sama sekali. Daftarnya ada di bagian bawah sheet Rekap.'
        : 'Semua Bizstar di daftar sudah punya nilai.',
      ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Gagal memperbarui rekap', String((err && err.message) || err), ui.ButtonSet.OK);
  }
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
/* Sel tanggal di sheet berisi objek Date. Dikirim apa adanya, di layar jadi
   "Mon Oct 12 2026 00:00:00 GMT+0700 (Waktu Indonesia Barat)" — panjang dan
   berbahasa Inggris. Di sini dipendekkan jadi "12 Oktober 2026". */
function tglPendek(v) {
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  if (v instanceof Date && !isNaN(v.getTime())) {
    const tz = 'Asia/Jakarta';
    const hari = Utilities.formatDate(v, tz, 'd');
    const bln = parseInt(Utilities.formatDate(v, tz, 'M'), 10) - 1;
    const thn = Utilities.formatDate(v, tz, 'yyyy');
    return hari + ' ' + bulan[bln] + ' ' + thn;
  }
  const teks = String(v == null ? '' : v).trim();
  const cocok = teks.match(/^(\d{4})-(\d{2})-(\d{2})/);   // dari input tanggal di web
  if (cocok) return Number(cocok[3]) + ' ' + bulan[Number(cocok[2]) - 1] + ' ' + cocok[1];
  return teks;
}

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
    .addItem('Siapkan Sheet Penilaian', 'menuSiapkanSheet')
    .addItem('Perbarui Peringkat Bizstar', 'menuPerbaruiPeringkat')
    .addItem('Perbarui Rekap', 'menuPerbaruiRekap')
    .addItem('Gambar Ulang Grafik', 'menuGambarUlangGrafik')
    .addSeparator()
    .addItem('Hapus Baris Uji Coba', 'menuHapusBarisUji')
    .addItem('Buang Penilaian Dobel', 'menuBuangPenilaianDobel')
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
  sh.getRange(1, 1).setValue('Laporan Perkembangan IBASS 2026')
    .setFontWeight('bold').setFontSize(12);
  sh.getRange(2, 1, 1, LAP_W).merge();
  sh.getRange(2, 1).setValue('Dokumen turunan untuk kepengurusan berikutnya. Tiap pembaruan dicatat waktunya. Dibuat dari tombol Perbarui Laporan di Dashboard Kadiv, atau menu Laporan IBASS di sheet ini.')
    .setFontColor('#888888').setFontSize(9);
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
  /* Sheet dibuat polos: latar gelap dan teks berwarna dibuang, yang tersisa cuma
     tebal dan ukuran untuk menandai tingkatan. Pemanggil boleh tetap mengirim bg
     dan fg, nilainya diseragamkan di sini supaya tidak perlu diubah satu-satu. */
  if (opt.bg) rng.setBackground('#f3f3f3');
  rng.setFontColor('#000000');
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
  lapRow(sh, ['Pembaruan ' + tglIndo(now)], { merge: true, bg: true, bold: true, size: 11 });
  if (penulis) lapRow(sh, ['Dicatat oleh ' + penulis], { merge: true, size: 9 });

  // Ringkasan per divisi
  lapRow(sh, ['Ringkasan divisi'], { merge: true, bg: true, bold: true, size: 10 });
  lapRow(sh, ['Divisi', 'Total Kegiatan', 'Selesai', 'Berlangsung', 'Belum', 'Terlambat', 'Batal'], { bg: true, bold: true, size: 9 });
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
  lapRow(sh, ['Lewat tenggat'], { merge: true, bg: true, bold: true, size: 10 });
  if (!lateAll.length) {
    lapRow(sh, ['Tidak ada. Semua kegiatan berjalan sesuai jadwal.'], { merge: true });
  } else {
    lapRow(sh, ['Divisi', 'Kegiatan', 'PIC', 'Tenggat', '', '', 'Catatan'], { bg: true, bold: true, size: 9 });
    lateAll.forEach(x => lapRow(sh, [x.divisi, x.r.kegiatan || '—', x.r.pic || '—', x.r.deadline || '—', '', '', x.r.catatan || ''], { wrap: true }));
  }
  if (cancelAll.length) {
    lapRow(sh, ['Kegiatan dibatalkan'], { merge: true, bg: true, bold: true, size: 10 });
    cancelAll.forEach(x => lapRow(sh, [x.divisi, x.r.kegiatan || '—', x.r.pic || '—', '', '', '', x.r.catatan || ''], { wrap: true }));
  }

  // Dana DAP
  try {
    const pays = readDapPayments();
    if (pays.length) {
      const total = pays.reduce((a, p) => a + (p.nominal || 0), 0);
      const lunas = pays.filter(p => /lunas/i.test(p.termin || '')).length;
      lapRow(sh, ['Dana DAP'], { merge: true, bg: true, bold: true, size: 10 });
      lapRow(sh, ['Terkumpul ' + rp(total) + ' dari ' + pays.length + ' pembayaran (' + lunas + ' lunas).'], { merge: true });
    }
  } catch (e) {}

  // Penilaian Bizstar
  try {
    const pen = readPenilaian(ss);
    if (pen.length) {
      const perMile = {};
      pen.forEach(p => { const k = p.milestone || '—'; perMile[k] = (perMile[k] || 0) + 1; });
      lapRow(sh, ['Penilaian Bizstar'], { merge: true, bg: true, bold: true, size: 10 });
      lapRow(sh, [pen.length + ' penilaian masuk — ' + Object.keys(perMile).map(k => k + ': ' + perMile[k]).join(', ') + '.'], { merge: true });
    }
  } catch (e) {}

  // Evaluasi manual
  lapRow(sh, ['Catatan evaluasi untuk penerus'], { merge: true, bg: true, bold: true, size: 10 });
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
