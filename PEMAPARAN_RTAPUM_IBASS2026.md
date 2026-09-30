# Pemaparan RTAPUM — Sistem Penilaian Bizstar IBASS 2026

Bahan bicara di RTAPUM. Bagian **"Kamu bilang"** itu yang diucapkan, bagian *(catatan)* buat
kamu sendiri. Perkiraan waktu: **10 menit** tanpa tanya jawab.

Versi yang enak dibuka di HP: https://claude.ai/artifact/Ca6gjL6WDKvE5vefR3XL9J

---

## Kalau waktumu cuma dua menit

Penentuan Best Bizstar tahun ini tidak lagi mengandalkan ingatan di akhir acara. Nilainya
dicatat tiap milestone lewat web, diisi buddy dan panitia, digabung otomatis jadi satu tabel
peringkat. Web-nya sudah jadi dan sudah dibriefingkan. Yang belum: nama Bizstar asli belum
dimasukkan, dan server penyimpanannya belum diperbarui.

---

## 1. Masalah yang mau dibereskan

> **Kamu bilang:**
>
> "Selama ini penentuan Best Bizstar itu dibahas di akhir, pas semua rangkaian sudah selesai.
> Masalahnya, yang kita ingat di akhir biasanya cuma yang paling sering kelihatan — yang
> suaranya paling keras, atau yang kebetulan dekat sama kita. Bukan berarti dia yang paling
> berkembang.
>
> Jadi tahun ini penilaiannya dipecah. Dicatat sedikit-sedikit tiap milestone, waktu ingatannya
> masih segar. Nanti di akhir tinggal dibuka, bukan diperdebatkan dari nol."

*(Jangan menyalahkan kepengurusan sebelumnya. Bingkainya: penyempurnaan cara kerja, bukan
koreksi kesalahan siapa-siapa.)*

---

## 2. Apa yang sudah dibangun

> **Kamu bilang:**
>
> "Bentuknya satu web, dibuka dari HP, tidak perlu install apa-apa. Alamatnya
> **raiii-png.github.io/ibass2026**.
>
> Di dalamnya ada dua pintu. Yang pertama untuk **buddy** — delapan orang, satu per departemen.
> Yang kedua untuk **panitia**, siapa pun yang ikut menilai saat acara.
>
> Buddy punya dua tugas. **Isi Penilaian**, dibuka tiap habis milestone. Dan **Catat Proker**,
> untuk mencatat Bizstar-nya yang ikut proker HIMA di luar IBASS.
>
> Semua yang masuk langsung tersimpan dan langsung terhitung. Tidak ada rekap manual."

*(Kalau ada proyektor, buka web-nya sekalian dan masuk sebagai Buddy. Satu layar lebih cepat
dipahami daripada tiga paragraf.)*

---

## 3. Cara nilainya terbentuk

> **Kamu bilang:**
>
> "Nilai akhir satu Bizstar datang dari dua sumber.
>
> Yang utama **nilai KPI**. Tiap Bizstar dinilai tiga hal: **Adaptive** — seberapa cepat dia
> tanggap dan mau gerak duluan. **Collaborate** — seberapa enak dia diajak kerja bareng.
> **Growth** — sikap, keberanian memimpin, dan perubahannya dari pertemuan pertama.
>
> Buddy menilai di skala 1 sampai 10, panitia 1 sampai 5. Kalau satu orang dinilai dua-duanya,
> **nilai buddy dipakai 70 persen, panitia 30 persen**. Alasannya sederhana: buddy mendampingi
> tiap hari, panitia cuma ketemu pas acara.
>
> Yang kedua **poin keaktifan**. Kalau Bizstar ikut proker HIMA di luar IBASS, dia dapat **+1**,
> maksimal **+5**. Ini cuma nilai tambahan — yang menentukan peringkat tetap nilai KPI.
>
> Dua-duanya digabung otomatis jadi satu tabel peringkat, urut dari nilai tertinggi."

**Alurnya:**

```
   Bizstar ikut proker HIMA
            ↓  (buddy yang melihat)
   Buddy catat di web
            ↓
     +1 poin, maks +5                Buddy nilai (1–10) ──┐ 70%
            ↓                                             ├──→ Nilai KPI (0–100)
            │                        Panitia nilai (1–5) ─┘ 30%
            ↓                                             ↓
            └──────────→  Tabel Peringkat  ←──────────────┘
                       nilai akhir = KPI + poin
```

### Hati-hati di bagian ini

Di layar penilaian ada label "Bobot 15%", "Bobot 20%", "Bobot 25%". Kalau dijumlah cuma 60,
dan bisa ada yang bertanya sisanya ke mana.

Jawabannya: angka itu perbandingan antar tiga kriteria **di dalam form buddy**, bukan persen
dari nilai akhir. Di form panitia angkanya 15, 15, 10. Yang 70/30 itu pembagian antara buddy
dan panitia, urusan terpisah.

Kalau tidak mau ambil risiko ditanya, lewati saja angka bobot per kriteria. Cukup bilang
"Growth paling berat, lalu Collaborate, lalu Adaptive".

---

## 4. Kenapa buddy yang menilai

> **Kamu bilang:**
>
> "Ada dua keputusan yang sengaja diambil, dan dua-duanya berhubungan.
>
> Pertama, **yang mencatat semuanya buddy**, bukan Bizstar-nya sendiri. Awalnya kami sempat
> bikin jalur supaya Bizstar bisa lapor sendiri kalau dia ikut proker. Itu dibatalkan.
>
> Kedua, dan ini alasannya: **Bizstar tidak diberi tahu ada poin tambahan.** Begitu mereka tahu
> ikut proker itu menambah nilai, yang datang jadi datang karena mengejar angka. Kami mau tahu
> siapa yang memang mau muncul, bukan siapa yang paling rajin mengumpulkan poin.
>
> Buddy bisa tahu karena buddy juga fungsionaris — proker HIMA manapun mereka ikut hadir. Kalau
> kebetulan berhalangan, tinggal minta daftar di grup departemen."

*(Ini keputusan Fikri dan Fakhri, bukan keputusanmu sendiri. Sebut itu kalau ada yang
mempersoalkan — supaya forum tahu ini sudah dibahas, bukan asal jalan.)*

---

## 5. Yang sudah jalan dan yang belum

> **Kamu bilang:**
>
> "Biar jelas posisinya sekarang.
>
> **Yang sudah selesai:** web penilaiannya jadi dan sudah dibriefingkan ke delapan buddy. Menu
> catat proker jalan. Tabel peringkat terbentuk otomatis. Dashboard kadiv lima divisi juga sudah
> ada, terhubung ke file track yang sama.
>
> **Yang belum:** nama Bizstar di form masih sementara, masih kode seperti HRD-01. Itu harus
> diisi nama asli sebelum penilaian pertama, karena kalau terlanjur terisi atas nama kode,
> membenahinya repot.
>
> Satu lagi, server penyimpanannya belum saya perbarui ke versi terakhir. Selama belum, menu
> catat proker belum bisa menyimpan. Itu pekerjaan saya, bukan pekerjaan forum."

*(Sebutkan yang belum selesai duluan sebelum ada yang menemukannya sendiri.)*

---

## 6. Penutup

> **Kamu bilang:**
>
> "Dua hal yang saya butuhkan dari forum.
>
> **Satu**, daftar nama Bizstar per departemen yang sudah final. Begitu masuk, form-nya langsung
> bisa dipakai menilai.
>
> **Dua**, tolong jangan bahas poin proker di depan Bizstar. Ini yang paling gampang bocor, dan
> kalau bocor sistemnya jadi tidak ada gunanya.
>
> Selebihnya sudah jalan. Kalau ada yang mau lihat langsung, web-nya bisa dibuka sekarang."

---

## Angka yang mungkin ditanya

| Hal | Angkanya | Catatan |
|---|---|---|
| Buddy | 8 orang | satu per departemen |
| Milestone dinilai | 4 | Townhall 1, PMT 1, Townhall 2, PMT 2 |
| Townhall 3 | tidak dinilai | tombolnya dikunci |
| Kriteria | 3 | Adaptive, Collaborate, Growth |
| Skala buddy | 1–10 | tiap hari bersama |
| Skala panitia | 1–5 | hanya bertemu saat acara |
| Pembagian | buddy 70% · panitia 30% | kalau dinilai dua-duanya |
| Poin proker | +1 per proker | maksimal +5 |
| Yang dihitung | proker HIMA di luar IBASS | UKM dan acara luar tidak masuk |
| Nilai akhir | KPI + poin | KPI skala 0–100 |

---

## Pertanyaan yang mungkin muncul

**"Kalau buddy-nya subjektif, pilih kasih ke Bizstar yang dekat, gimana?"**
Makanya dipecah jadi empat milestone, bukan sekali di akhir. Kalau ada yang menilai berdasarkan
kedekatan, polanya kelihatan — nilainya rata tinggi dari awal tanpa perubahan. Panitia juga ikut
menilai orang yang sama, dan nilainya masuk 30 persen.

**"Siapa yang bisa lihat nilainya?"**
Tabel peringkat hanya dibuka di layar saat dibahas, tidak dibagikan. Buddy tidak bisa melihat
nilai departemen lain. Bizstar tidak bisa melihat apa pun.

**"Kenapa Bizstar tidak boleh tahu soal poin proker?"**
Supaya yang datang ke proker datang karena mau, bukan karena mengejar nilai. Begitu diumumkan,
yang terukur bukan lagi keaktifan, tapi kerajinan mengumpulkan poin.

**"Kalau ada buddy yang malas mengisi?"**
Kelihatan di tabel — ada kolom berapa milestone yang sudah terisi per Bizstar.

**"Bizstar yang tidak hadir di satu milestone jadi rugi?"**
Tidak. Ada tombol "Tidak Hadir" — dia tidak ikut dihitung untuk milestone itu, bukan diberi
nilai nol.

**"Datanya disimpan di mana? Aman?"**
Di spreadsheet milik HIMA, bukan di HP siapa-siapa. Buddy ganti HP pun datanya tetap ada.

**"Kenapa Townhall 3 tidak dinilai?"**
Karena di Townhall 3 ada agenda lain. Kalau ditanya lebih jauh di forum terbuka, cukup bilang
belum bisa disampaikan.

**"Ini dipakai lagi tahun depan?"**
Bisa. Yang perlu diganti cuma daftar nama dan angka pembobotan, dan itu ada di satu tempat.

**"Berapa biayanya?"**
Tidak ada. Web-nya menumpang hosting gratis, penyimpanannya pakai spreadsheet.

---

## Apa saja yang sudah dikerjakan

Bukan untuk dibacakan. Ini supaya kamu sendiri tahu isinya apa saja.

**Web penilaian**
- Dua peran: buddy dan panitia, skala dan bobot berbeda.
- Buddy memilih namanya dari kartu nama — departemen dan daftar Bizstar terisi sendiri.
- Tiga kriteria per orang, plus dua kolom catatan yang boleh dilewat.
- Tombol "Tidak Hadir" supaya yang absen tidak terpaksa diberi nilai kecil.
- Halaman review sebelum kirim.
- Isian tersimpan sementara di HP, aman kalau web tertutup di tengah jalan.
- Panitia bisa memilih Bizstar lintas departemen, dengan pencarian.

**Catat proker**
- Buddy memilih Bizstar dari kartu nama departemennya, menulis nama proker dan tanggal.
- Proker yang sama untuk orang yang sama ditolak, jadi tidak terhitung dua kali.
- Daftar tampil dikelompokkan per orang berikut poinnya.
- Halaman lapor mandiri untuk Bizstar sudah ditutup sesuai keputusan Fikri.

**Penyimpanan dan peringkat**
- Semua penilaian masuk ke satu spreadsheet, terpisah antara penilaian dan kehadiran proker.
- Tabel Peringkat dibangun ulang otomatis tiap ada data masuk: nama, departemen, buddy, nilai
  KPI, poin, nilai akhir, predikat, jumlah milestone terisi.
- Tiga teratas ditandai. Ada ringkasan terbaik per departemen.

**Kenyamanan saat menilai**
- Tiga nilai terisi → muncul tanda selesai dan pindah sendiri ke orang berikutnya, bisa ditahan.
- Getaran tipis tiap nilai masuk.
- Geser kiri-kanan untuk pindah Bizstar.
- Semua gerakan mengikuti setelan "kurangi animasi" di HP.

**Dashboard kadiv**
- Lima divisi: Sekretaris, Pubdok, Logistik, Acara, Finance.
- Terhubung ke file track yang sama, tidak ada rekap ganda.

---

## Sisa pekerjaan

- **Nama Bizstar asli** belum dimasukkan — masih kode sementara. Paling mendesak; penilaian
  tidak boleh dimulai sebelum namanya benar.
- **Server penyimpanan** perlu di-deploy ulang ke versi terakhir. Sampai itu dilakukan, menu
  catat proker belum bisa menyimpan.
- **Label bobot per kriteria** di layar penilaian bisa disalahpahami karena jumlahnya 60, bukan
  100. Belum diubah supaya tampilannya tidak berbeda dari yang sudah dibriefingkan ke buddy.
