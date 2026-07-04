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
 * 3. Saat diminta izin baru (akses Google Forms), klik Allow —
 *    dipakai untuk membaca pembayaran DAP dari Google Form.
 */

// ─── Konfigurasi ────────────────────────────────────────────────
const SHEET_DIVISI = ['Secretary', 'Pubdok', 'Logistik', 'Event', 'Finance'];
// Form "PEMBAYARAN DAP IBASS 2026"
const DAP_FORM_ID = '1Ko8M-oRQisCxnOO5KDQXF2g8sS854yurR_qSxfJrYyE';
const HEADER_ROW = ['No', 'Divisi', 'Kegiatan & Detail', 'Priority', 'Penanggung Jawab', 'Tanggal Mulai', 'Deadline', 'Status', 'Catatan', 'File/Link'];
const DATA_START_ROW = 5; // header di baris 4, data mulai baris 5

// Web Penilaian Bizstar — token harus sama dengan SUBMIT_TOKEN di index.html
const PENILAIAN_TOKEN = 'ibass26-vGDnSmco7cBoju';
const PENILAIAN_SHEET = 'Penilaian';
const PENILAIAN_HEADER = ['Waktu', 'Peran', 'Penilai', 'Dept Penilai', 'Milestone', 'Nama Bizstar',
  'Adaptive (raw)', 'Collaborative (raw)', 'Growth (raw)',
  'Adaptive %', 'Collaborative %', 'Growth %', 'Skor Akhir', 'Kelebihan', 'Perlu Perbaikan'];

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
      // URL + riwayat waktu update Laporan Perkembangan
      const props = PropertiesService.getScriptProperties();
      const id = props.getProperty('laporan_doc_id');
      let ups = [];
      try { ups = JSON.parse(props.getProperty('laporan_updates') || '[]'); } catch (e) {}
      return jsonOk({ url: id ? 'https://docs.google.com/document/d/' + id + '/edit' : '', updates: ups });
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
      if (judul.indexOf('nama') > -1) {
        out.nama = String(val);
      } else if (judul.indexOf('divisi') > -1) {
        out.divisi = String(val);
      } else if (judul.indexOf('termin') > -1) {
        out.termin = String(val);
        out.nominal = parseNominalDAP(String(val));
      } else if (judul.indexOf('bukti') > -1) {
        const ids = Array.isArray(val) ? val : [val];
        if (ids.length && ids[0]) out.bukti = 'https://drive.google.com/open?id=' + ids[0];
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

    // Sync seluruh data divisi dari dashboard
    if (action === 'sync') {
      const sheetName = body.divisi || 'Unknown';
      const items = body.data || [];

      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) sheet = createDivisiSheet(ss, sheetName);

      // Hapus data lama (baris 5 ke bawah)
      const lastRow = sheet.getLastRow();
      if (lastRow >= DATA_START_ROW) {
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
        applyStatusColors(sheet, DATA_START_ROW, rows.length);
      }

      // Update sheet REKAP
      rebuildRekap(ss);
      return jsonOk({ message: 'Sync ' + items.length + ' item ke sheet ' + sheetName });
    }

    // Tambah satu item baru
    if (action === 'addItem') {
      const sheetName = body.divisi || 'Unknown';
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) sheet = createDivisiSheet(ss, sheetName);

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
      applyStatusColors(sheet, sheet.getLastRow(), 1);

      // Tambah ke REKAP juga
      const rekap = ss.getSheetByName('REKAP');
      if (rekap) {
        rekap.appendRow(newRow);
        applyStatusColors(rekap, rekap.getLastRow(), 1);
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

    // Laporan Perkembangan — tiap panggilan menambah bagian ber-stempel waktu
    if (action === 'laporan') {
      return jsonOk(appendLaporanUpdate(ss, body.catatan || '', body.penulis || ''));
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
function ensurePenilaianSheet(ss) {
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
  const rows = submissions.map(s => [
    s.timestamp ? Utilities.formatDate(new Date(s.timestamp), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') : '',
    s.role || '',
    s.penilai || '',
    s.dept_penilai || '',
    s.milestone || '',
    s.nama_bizstar || '',
    s.skor_adaptive_raw, s.skor_collab_raw, s.skor_growth_raw,
    s.skor_adaptive, s.skor_collab, s.skor_growth,
    s.skor_weighted,
    s.kelebihan || '',
    s.perbaikan || ''
  ]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, PENILAIAN_HEADER.length).setValues(rows);
  return jsonOk({ message: rows.length + ' penilaian tersimpan' });
}

function readPenilaian(ss) {
  const sheet = ss.getSheetByName(PENILAIAN_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, PENILAIAN_HEADER.length).getValues();
  return values.filter(r => r[5]).map(r => ({
    waktu: r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') : String(r[0]),
    role: r[1], penilai: r[2], dept_penilai: r[3], milestone: r[4],
    nama_bizstar: r[5],
    skor_adaptive_raw: r[6], skor_collab_raw: r[7], skor_growth_raw: r[8],
    skor_adaptive: r[9], skor_collab: r[10], skor_growth: r[11],
    skor_weighted: r[12],
    kelebihan: r[13], perbaikan: r[14]
  }));
}

// ─── Laporan Perkembangan (Google Docs, untuk penerus) ────────────
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

function appendLaporanUpdate(ss, catatan, penulis) {
  const props = PropertiesService.getScriptProperties();
  let docId = props.getProperty('laporan_doc_id');
  let doc = null;
  if (docId) { try { doc = DocumentApp.openById(docId); } catch (e) { doc = null; } }
  if (!doc) {
    doc = DocumentApp.create('LAPORAN PERKEMBANGAN I-BASS 2026');
    docId = doc.getId();
    props.setProperty('laporan_doc_id', docId);
    const b = doc.getBody();
    b.appendParagraph('LAPORAN PERKEMBANGAN I-BASS 2026').setHeading(DocumentApp.ParagraphHeading.TITLE);
    b.appendParagraph('Dokumen turunan untuk kepengurusan berikutnya. Setiap bagian di bawah adalah potret kondisi saat tombol "Perbarui Laporan" ditekan di Dashboard Kadiv — lengkap dengan evaluasi, kendala, dan hal yang perlu diperbaiki ke depannya.');
  }
  const body = doc.getBody();
  const now = new Date();

  body.appendHorizontalRule();
  body.appendParagraph('Update — ' + tglIndo(now)).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (penulis) {
    const p = body.appendParagraph('Dicatat oleh: ' + penulis);
    p.editAsText().setItalic(true);
  }

  // Ringkasan Track File per divisi
  body.appendParagraph('Ringkasan Track File').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lateAll = [];
  const cancelAll = [];
  SHEET_DIVISI.forEach(name => {
    const rows = readSheet(ss, name);
    if (!rows.length) { body.appendListItem(name + ': belum ada kegiatan tercatat'); return; }
    const c = { Selesai: 0, Berlangsung: 0, Terlambat: 0, Cancel: 0, Belum: 0 };
    rows.forEach(r => {
      let st = r.status || 'Belum';
      const dl = r.deadline ? new Date(r.deadline) : null;
      if (st !== 'Selesai' && st !== 'Cancel' && dl && !isNaN(dl) && dl < today) st = 'Terlambat';
      c[st] = (c[st] || 0) + 1;
      if (st === 'Terlambat') lateAll.push({ divisi: name, r });
      if (st === 'Cancel') cancelAll.push({ divisi: name, r });
    });
    body.appendListItem(name + ': ' + rows.length + ' kegiatan — ' + c.Selesai + ' selesai, ' + c.Berlangsung + ' berlangsung, ' + c.Belum + ' belum, ' + c.Terlambat + ' terlambat, ' + c.Cancel + ' batal');
  });

  // Kegiatan bermasalah = bahan evaluasi
  body.appendParagraph('Perlu Perhatian — Lewat Deadline').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (!lateAll.length) body.appendParagraph('Tidak ada — semua kegiatan berjalan sesuai jadwal.');
  else lateAll.forEach(x => body.appendListItem('[' + x.divisi + '] ' + (x.r.kegiatan || '—') + ' — PIC: ' + (x.r.pic || '—') + ', deadline ' + (x.r.deadline || '—') + (x.r.catatan ? ' · ' + x.r.catatan : '')));
  if (cancelAll.length) {
    body.appendParagraph('Kegiatan yang Dibatalkan').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    cancelAll.forEach(x => body.appendListItem('[' + x.divisi + '] ' + (x.r.kegiatan || '—') + (x.r.catatan ? ' — ' + x.r.catatan : '')));
  }

  // Dana DAP
  try {
    const pays = readDapPayments();
    if (pays.length) {
      const total = pays.reduce((a, p) => a + (p.nominal || 0), 0);
      const lunas = pays.filter(p => /lunas/i.test(p.termin || '')).length;
      body.appendParagraph('Dana DAP').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph('Terkumpul ' + rp(total) + ' dari ' + pays.length + ' pembayaran (' + lunas + ' lunas).');
    }
  } catch (e) {}

  // Penilaian Bizstar
  try {
    const pen = readPenilaian(ss);
    if (pen.length) {
      const perMile = {};
      pen.forEach(p => { const k = p.milestone || '—'; perMile[k] = (perMile[k] || 0) + 1; });
      body.appendParagraph('Penilaian Bizstar').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(pen.length + ' penilaian masuk — ' + Object.keys(perMile).map(k => k + ': ' + perMile[k]).join(', ') + '.');
    }
  } catch (e) {}

  // Evaluasi manual dari dashboard
  body.appendParagraph('Catatan Evaluasi untuk Penerus').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(catatan && catatan.trim() ? catatan.trim() : '—');

  doc.saveAndClose();

  let ups = [];
  try { ups = JSON.parse(props.getProperty('laporan_updates') || '[]'); } catch (e) {}
  ups.push(tglIndo(now));
  ups = ups.slice(-100);
  props.setProperty('laporan_updates', JSON.stringify(ups));

  return { message: 'Laporan diperbarui', url: 'https://docs.google.com/document/d/' + docId + '/edit', updates: ups };
}

// ─── Helper: baca sheet → array of objects ───────────────────────
function readSheet(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return [];

  const values = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, HEADER_ROW.length).getValues();
  return values
    .filter(r => r[2]) // skip baris kosong (kolom Kegiatan harus ada)
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

// ─── Helper: warna status ─────────────────────────────────────────
function applyStatusColors(sheet, startRow, numRows) {
  const STATUS_COLORS = {
    'Selesai':     { bg: '#1a3a2a', fg: '#4ecb8d' },
    'Berlangsung': { bg: '#2a2a15', fg: '#f0c040' },
    'Terlambat':   { bg: '#3a1a1a', fg: '#f87171' },
    'Cancel':      { bg: '#222228', fg: '#888899' },
    'Belum':       { bg: '#1e1f2e', fg: '#9999bb' },
  };
  const statusCol = 8; // kolom H
  for (let i = 0; i < numRows; i++) {
    const cell = sheet.getRange(startRow + i, statusCol);
    const status = cell.getValue();
    const color = STATUS_COLORS[status] || STATUS_COLORS['Belum'];
    cell.setBackground(color.bg).setFontColor(color.fg);
  }
}

// ─── Rebuild REKAP dari semua divisi ─────────────────────────────
function rebuildRekap(ss) {
  const rekap = ss.getSheetByName('REKAP');
  if (!rekap) return;

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
    rows.filter(r => r[2]).forEach(r => {
      allRows.push([no++, r[1] || name, r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9]]);
    });
  });

  if (allRows.length > 0) {
    rekap.getRange(DATA_START_ROW, 1, allRows.length, HEADER_ROW.length).setValues(allRows);
    applyStatusColors(rekap, DATA_START_ROW, allRows.length);
  }
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
  setupSheetHeader(rekap, 'REKAP KESELURUHAN — I-BASS 2026', '#1e3a5f', '#5bc4f5');

  // Sheet per divisi
  SHEET_DIVISI.forEach((name, i) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name, i + 1);
    const colors = {
      Secretary: { bg: '#1e2a3e', fg: '#5bc4f5' },
      Pubdok:    { bg: '#2a1e3e', fg: '#a78bfa' },
      Logistik:  { bg: '#2a2a15', fg: '#f0c040' },
      Event:     { bg: '#1e2a2a', fg: '#4ecb8d' },
      Finance:   { bg: '#1a2e1a', fg: '#4ecb8d' },
    };
    const c = colors[name] || { bg: '#1e1f2e', fg: '#9999cc' };
    setupSheetHeader(sheet, 'TRACK FILE ' + name.toUpperCase() + ' — I-BASS 2026', c.bg, c.fg);
  });

  // Hapus Sheet1 default jika ada dan masih kosong
  const default1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (default1 && default1.getLastRow() <= 1) {
    ss.deleteSheet(default1);
  }

  SpreadsheetApp.getUi().alert('✓ Setup selesai!\n\nSheet yang dibuat:\n- REKAP\n- Secretary\n- Pubdok\n- Logistik\n- Event\n- Finance\n\nSekarang deploy sebagai Web App.');
}

function createDivisiSheet(ss, name) {
  const sheet = ss.insertSheet(name);
  setupSheetHeader(sheet, 'TRACK FILE ' + name.toUpperCase() + ' — I-BASS 2026', '#1e1f2e', '#9999cc');
  return sheet;
}

function setupSheetHeader(sheet, title, bgColor, fgColor) {
  sheet.clearContents();

  // Baris 1: judul
  sheet.getRange(1, 1, 1, HEADER_ROW.length).merge();
  const titleCell = sheet.getRange(1, 1);
  titleCell.setValue('📋 ' + title)
    .setBackground(bgColor).setFontColor(fgColor)
    .setFontWeight('bold').setFontSize(12);

  // Baris 2: catatan
  sheet.getRange(2, 1, 1, HEADER_ROW.length).merge();
  sheet.getRange(2, 1).setValue('Setelah update, konfirmasi ke Sekretaris I-BASS 2026 · Sync via Dashboard Kadiv')
    .setBackground('#13141f').setFontColor('#666688').setFontSize(9).setFontStyle('italic');

  // Baris 3: kosong (spacer)
  sheet.getRange(3, 1).setValue('');

  // Baris 4: header kolom
  const headerRange = sheet.getRange(4, 1, 1, HEADER_ROW.length);
  headerRange.setValues([HEADER_ROW])
    .setBackground('#13141f').setFontColor(fgColor)
    .setFontWeight('bold').setFontSize(10);
  headerRange.setBorder(false, false, true, false, false, false, fgColor, SpreadsheetApp.BorderStyle.SOLID);

  // Freeze header
  sheet.setFrozenRows(4);

  // Lebar kolom
  const colWidths = [40, 100, 280, 80, 150, 100, 100, 100, 200, 200];
  colWidths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // Warna background baris 1–3
  sheet.getRange(1, 1, 3, HEADER_ROW.length).setBackground(bgColor);
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
