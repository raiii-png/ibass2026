/**
 * TRACK FILE I-BASS 2026 — Google Apps Script
 * ============================================
 * Cara setup:
 * 1. Buka Google Sheets baru (beri nama: "Track File I-BASS 2026")
 * 2. Klik menu Extensions → Apps Script
 * 3. Hapus semua kode yang ada, paste seluruh kode ini
 * 4. Klik Run → pilih fungsi "setupSpreadsheet" → jalankan sekali
 * 5. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy URL deployment → paste ke Dashboard I-BASS (Track File tab)
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
 *   menu "Laporan I-BASS → Perbarui Laporan" di bar menu spreadsheet ini
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
const PENILAIAN_HEADER = ['Waktu', 'Peran', 'Penilai', 'Dept Penilai', 'Milestone', 'Nama Bizstar',
  'Adaptive (raw)', 'Collaborative (raw)', 'Growth (raw)',
  'Adaptive %', 'Collaborative %', 'Growth %', 'Skor KPI',
  'Kegiatan Luar', 'Poin Keaktifan', 'Skor Akhir', 'Kelebihan', 'Perlu Perbaikan'];

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

    return jsonOk({ ok: true, message: 'Track File I-BASS 2026 API aktif' });

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
      let folder;
      const it = DriveApp.getFoldersByName('Bukti Pembayaran I-BASS 2026');
      folder = it.hasNext() ? it.next() : DriveApp.createFolder('Bukti Pembayaran I-BASS 2026');
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return jsonOk({ url: file.getUrl() });
    }

    // ── Upload berkas Track File (Word/Sheet/PDF/gambar dll) → Google Drive ──
    if (action === 'uploadfile') {
      if (!body.data) return jsonErr('Tidak ada berkas');
      const blob = Utilities.newBlob(
        Utilities.base64Decode(body.data),
        body.mime || 'application/octet-stream',
        body.nama || ('berkas-' + Date.now()));
      const it2 = DriveApp.getFoldersByName('Berkas Track File I-BASS 2026');
      const folder2 = it2.hasNext() ? it2.next() : DriveApp.createFolder('Berkas Track File I-BASS 2026');
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
      const doc = DocumentApp.create(body.title || ('Notulen I-BASS — ' + tglIndo(new Date())));
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

// ─── Penilaian Bizstar: simpan & baca ─────────────────────────────
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
  const widths = [140, 70, 150, 110, 110, 150, 90, 110, 80, 80, 100, 70, 80, 95, 105, 85, 220, 220];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  return sheet;
}

function savePenilaian(ss, submissions) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return jsonErr('Tidak ada data penilaian');
  }
  const sheet = ensurePenilaianSheet(ss);
  const rows = submissions.map(s => [
    s.timestamp ? Utilities.formatDate(new Date(s.timestamp), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') : '',
    s.role || '',
    s.penilai || '',
    s.dept_penilai || '',
    s.milestone || '',
    s.nama_bizstar || '',
    s.skor_adaptive_raw, s.skor_collab_raw, s.skor_growth_raw,
    s.skor_adaptive, s.skor_collab, s.skor_growth,
    s.skor_kpi !== undefined ? s.skor_kpi : s.skor_weighted,
    s.kegiatan_luar !== undefined ? s.kegiatan_luar : '',
    s.poin_keaktifan !== undefined ? s.poin_keaktifan : '',
    s.skor_weighted,
    s.kelebihan || '',
    s.perbaikan || ''
  ]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, PENILAIAN_HEADER.length).setValues(rows);
  return jsonOk({ message: rows.length + ' penilaian tersimpan' });
}

function readPenilaian(ssAbaikan) {
  const sheet = penilaianSS().getSheetByName(PENILAIAN_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, PENILAIAN_HEADER.length).getValues();
  return values.filter(r => r[5]).map(r => ({
    waktu: r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') : String(r[0]),
    role: r[1], penilai: r[2], dept_penilai: r[3], milestone: r[4],
    nama_bizstar: r[5],
    skor_adaptive_raw: r[6], skor_collab_raw: r[7], skor_growth_raw: r[8],
    skor_adaptive: r[9], skor_collab: r[10], skor_growth: r[11],
    skor_kpi: r[12], kegiatan_luar: r[13], poin_keaktifan: r[14],
    skor_weighted: r[15],
    kelebihan: r[16], perbaikan: r[17]
  }));
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
  SpreadsheetApp.getUi().createMenu('Laporan I-BASS')
    .addItem('Perbarui Laporan', 'menuGenerateLaporan')
    .addSeparator()
    .addItem('Perbarui Grafik', 'menuPerbaruiGrafik')
    .addItem('Reset Data Track File', 'menuResetTrackFile')
    .addSeparator()
    .addItem('Pisahkan File Penilaian', 'menuPisahPenilaian')
    .addItem('Lihat Lokasi File Penilaian', 'menuLokasiPenilaian')
    .addToUi();
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
  sh.getRange(1, 1).setValue('LAPORAN PERKEMBANGAN — I-BASS 2026')
    .setBackground('#1e3a5f').setFontColor('#e8bf6a').setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1, 1, LAP_W).merge();
  sh.getRange(2, 1).setValue('Dokumen turunan untuk kepengurusan berikutnya · setiap update ber-stempel waktu · dibuat dari tombol "Perbarui Laporan" di Dashboard Kadiv atau menu "Laporan I-BASS" di sheet ini')
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
  ss.rename('Track File I-BASS 2026');

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
