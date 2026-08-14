# Roadmap & Sub-Task Backend Engineer — Sistem Manajemen Inventori (SIMBAR)

Roadmap ini disusun berdasarkan **FSD (Functional Specification Document)** dan **PRD (Product Requirement Document)** Sistem Manajemen Inventori SIMBAR. Pengembangan backend berbasis bahasa pemrograman **Go 1.23+** dengan pendekatan **Clean Architecture (Modular Monolith)**.

---

## 📋 Daftar Isi

1. [Fase 1: Setup Proyek, Konfigurasi & Migrasi Database](#-fase-1-setup-proyek-konfigurasi--migrasi-database)
2. [Fase 2: Autentikasi, Rotasi Token & Otorisasi RBAC](#-fase-2-autentikasi-rotasi-token--otorisasi-rbac)
3. [Fase 3: Modul Master Data (M1) & Import Asinkron](#-fase-3-modul-master-data-m1--import-asinkron)
4. [Fase 4: Core Engine Persediaan (Balances, Movements & Ledger)](#-fase-4-core-engine-persediaan-balances-movements--ledger)
5. [Fase 5: Manajemen Dokumen, Generator Nomor & State Machine](#-fase-5-manajemen-dokumen-generator-nomor--state-machine)
6. [Fase 6: Modul Inbound (M2) & Alur Putaway](#-fase-6-modul-inbound-m2--alur-putaway)
7. [Fase 7: Modul Outbound (M4) & Algoritma Alokasi FEFO/FIFO](#-fase-7-modul-outbound-m4--algoritma-alokasi-fefofifo)
8. [Fase 8: Mutasi Antar Gudang (M5) & Stock Opname (M6)](#-fase-8-mutasi-antar-gudang-m5--stock-opname-m6)
9. [Fase 9: Background Jobs, Perencanaan Stok (M8) & Penjadwal](#-fase-9-background-jobs-perencanaan-stok-m8--penjadwal)
10. [Fase 10: Pengujian Konkurensi, Observabilitas & Validasi Kontrak](#-fase-10-pengujian-konkurensi-observabilitas--validasi-kontrak)

---

## 🛠 Fase 1: Setup Proyek, Konfigurasi & Migrasi Database

Fokus pada inisialisasi struktur folder Clean Architecture, setup middleware standar, integrasi package apperr, dan migrasi skema database.

- [x] **1.1 Inisialisasi Struktur Folder Clean Architecture**
    - Membuat layout standar proyek Go sesuai spesifikasi FSD:
        ```
        cmd/
          api/main.go            # Entrypoint HTTP Server
          worker/main.go         # Entrypoint Background Job Worker
        internal/
          config/                # Config & Env Loader
          domain/                # Entity + Repository Interface (Murni tanpa dep luar)
            item/ stock/ document/ user/
          usecase/               # Orkestrasi Bisnis & Transaksi (Core Logic)
            inbound/ outbound/ transfer/ counting/ planning/
          repository/postgres/   # Query Database (sqlc & pgx)
          delivery/http/         # HTTP Handlers, DTO, Middleware & Routing (Echo)
            handler/ dto/ middleware/ router.go
          pkg/
            apperr/              # Error handling terpadu (sesuai apperr/error.go)
            logger/              # Structured logging (log/slog JSON)
            pagination/          # Keyset pagination helper
            docnum/              # Generator nomor dokumen
            idempotency/         # Filter idempotensi request
        db/
          migrations/            # SQL migration files
          queries/               # sqlc query files
        api/openapi.yaml         # Spesifikasi OpenAPI 3.1
        ```

- [x] **1.2 Setup Migrasi Database (golang-migrate)**
    - Menyiapkan script migrasi dalam folder `db/migrations/` berdasarkan skema DDL di FSD.
    - Memisahkan skema ke dalam 5 namespace: `master`, `inv`, `doc`, `sec`, dan `aud`.
    - Pastikan relasi FK, konvensi penamaan (`snake_case`), tipe data (kuantitas menggunakan `NUMERIC(18,4)`), dan constraints (`chk_onhand_nonneg`, `chk_reserved_valid`, `chk_expiry_needs_batch`) terdefinisi dengan tepat.

- [x] **1.3 Integrasi sqlc & pgx/v5**
    - Menulis file konfigurasi `sqlc.yaml`.
    - Membuat query dasar CRUD dan database queries awal di folder `db/queries/`.
    - Melakukan `sqlc generate` untuk menghasilkan type-safe database handler di `internal/repository/postgres/`.

- [x] **1.4 Konfigurasi & Environment Loader**
    - Mengimplementasikan loader konfigurasi menggunakan variabel lingkungan (mengikuti kaidah _12-factor app_).
    - Variabel lingkungan wajib: `DB_POOL_MAX`, `DB_CONN_STRING`, `REDIS_ADDR`, `JWT_SECRET`, `APP_ENV`, `PORT`.

- [x] **1.5 Integrasi Standard Response & Error Handling Middleware**
    - Mengintegrasikan package `internal/pkg/apperr/` yang sudah ada ke dalam middleware Echo.
    - Membuat format response envelope yang standar untuk seluruh API:
        - **Success response:** `{ "success": true, "data": ..., "meta": ... }`
        - **Error response:** `{ "success": false, "data": null, "error": { "code": "...", "message": "...", "details": [...], "request_id": "..." } }`
    - Menyediakan middleware global `X-Request-Id` (menggunakan UUID) dan inject ke dalam logger (`log/slog`) di setiap request context.

---

## 🔒 Fase 2: Autentikasi, Rotasi Token & Otorisasi RBAC

Membangun pintu masuk sistem yang aman dengan autentikasi berbasis JWT rotasi dan otorisasi berlingkup gudang (warehouse domain-scoped).

- [x] **2.1 Autentikasi Argon2id & Registrasi Pengguna**
    - Mengimplementasikan enkripsi password menggunakan algoritma **Argon2id** (`memory=64MB, iterations=3, parallelism=2`) sesuai standar keamanan FSD.
    - Membuat unit test verifikasi enkripsi password untuk memastikan standardisasi hashing.

- [x] **2.2 Login & Penerbitan Token (JWT)**
    - Endpoint `POST /api/v1/auth/login`.
    - Menghasilkan **Access Token** JWT (masa aktif 15 menit) dengan claims: `sub` (userID), `roles`, `warehouses` (daftar gudang yang diizinkan), dan `jti`.
    - Menghasilkan **Refresh Token** (masa aktif 7 hari) yang di-rotate setiap kali digunakan, disimpan secara terenkripsi/hashed di Redis.

- [x] **2.3 Token Rotation Endpoint**
    - Endpoint `POST /api/v1/auth/refresh`.
    - Memvalidasi refresh token lama di Redis, mencabut token lama (token revocation), dan menerbitkan pasangan Access + Refresh Token baru (Rotating Refresh Token pattern).

- [x] **2.4 Otorisasi Multi-Gudang Menggunakan Casbin**
    - Setup Casbin model RBAC dengan domain (gudang): `sub, dom, obj, act`.
    - Menulis middleware otorisasi yang mengekstrak ID gudang aktif dari header wajib `X-Warehouse-Id`, mencocokkannya dengan klaim token, dan melakukan pengecekan hak akses Casbin (`role_permissions` & `user_roles`).

- [x] **2.5 Integrasi Rate Limiter & Security Headers**
    - Menambahkan middleware rate limiter menggunakan Redis (default: 100 req/menit per user, 5 login attempts/15 menit per IP).
    - Menambahkan security headers (CSP, X-Content-Type-Options, X-Frame-Options: DENY).

---

## 📦 Fase 3: Modul Master Data (M1) & Import Asinkron

Menyediakan API untuk pengelolaan master entitas dan fitur import data bervolume besar secara asinkron guna mencegah request timeout.

- [x] **3.1 CRUD Item & Satuan Konversi (UoM)**
    - Endpoint `GET /api/v1/items`, `POST /api/v1/items`, `PUT /api/v1/items/{id}`.
    - Implementasi relational mapping `master.items` dengan `master.item_uoms`.
    - Aturan validasi: constraint `chk_expiry_needs_batch` (jika `is_expiry` true, `is_batch` wajib true).
    - Implementasi soft-delete: mengubah bendera `is_active` menjadi `false` (tidak boleh mendelete fisik jika item sudah memiliki data transaksi).

- [x] **3.2 CRUD Gudang & Lokasi Bin Berhierarki**
    - Endpoint `GET /api/v1/locations?warehouse_id=`.
    - Hierarki lokasi: `Gudang -> Zona -> Rak -> Level -> Bin`.
    - Enumerasi lokasi tipe: `staging`, `pick`, `bulk`, `quarantine`, `damaged`, `transit`.
    - Pastikan validasi keunikan kode lokasi per gudang terjamin.

- [x] **3.3 CRUD Mitra (Partners)**
    - Endpoint `/api/v1/partners`.
    - Jenis mitra: `supplier`, `customer`, `internal_unit`.
    - Implementasi enkripsi kolom data sensitif (nama kontak & nomor telepon) menggunakan pgcrypto / enkripsi tingkat aplikasi sesuai standar UU No. 27/2022 tentang Perlindungan Data Pribadi (PDP).

- [x] **3.4 Import Massal SKU Asinkron via hibiken/asynq**
    - Endpoint `POST /api/v1/items/import`.
    - Handler menerima file CSV/Excel, menyimpannya di storage lokal/S3, memasukkan tugas ke antrean Redis `hibiken/asynq`, dan langsung mengembalikan HTTP 202 dengan `job_id`.
    - Membuat worker di `cmd/worker/main.go` untuk memproses file secara asinkron, melakukan validasi skema per baris, menyimpannya ke database, dan menghasilkan laporan baris-baris data yang gagal divalidasi.

---

## ⚙️ Fase 4: Core Engine Persediaan (Balances, Movements & Ledger)

Jantung dari aplikasi inventori. Mengimplementasikan double-entry ledger pembukuan stok yang append-only untuk konsistensi tingkat tinggi.

- [x] **4.1 Desain Model Data Ledger & Balances**
    - Mempersiapkan tabel `inv.stock_balances` and `inv.stock_movements`.
    - Implementasi unique index `uq_balance_key` pada `stock_balances` untuk kombinasi: `(item_id, location_id, COALESCE(batch_id, 0), status)`.

- [x] **4.2 Proteksi Append-Only Ledger via PostgreSQL Rules**
    - Menerapkan rule pencegahan modifikasi data pada database level:
        ```sql
        CREATE RULE no_update_movements AS ON UPDATE TO inv.stock_movements DO INSTEAD NOTHING;
        CREATE RULE no_delete_movements AS ON DELETE TO inv.stock_movements DO INSTEAD NOTHING;
        ```
    - Mencabut akses `UPDATE` and `DELETE` pada tabel `inv.stock_movements` untuk pengguna database aplikasi (`app_user`).

- [x] **4.3 Implementasi Unit Transaksi Posting Stok**
    - Membuat service fungsi `PostStockMovement(ctx, docNo, movements []StockMovementInput)` yang berjalan dalam satu transaksi database:
        - **Urutkan target balance secara deterministik** berdasarkan `(item_id, location_id, batch_id)` sebelum melakukan query.
        - Lakukan penguncian baris (`SELECT ... FOR UPDATE`) berdasarkan ID yang telah diurutkan untuk **mencegah deadlock** akibat konkurensi.
        - Hitung saldo baru. Jika saldo menjadi negatif (`qty_onhand < 0`), lakukan rollback transaksi secara paksa dan kembalikan error `ERR_STOCK_INSUFFICIENT` beserta detail item yang bermasalah.
        - Update `stock_balances` and tambahkan baris histori baru ke `stock_movements` (mengisi kolom saldo akhir `qty_after`).

- [x] **4.4 Keyset Pagination Kartu Stok**
    - Endpoint `GET /api/v1/stock/movements`.
    - Wajib menyertakan filter rentang tanggal (untuk optimalisasi _partition pruning_ karena tabel dipartisi bulanan berdasarkan `moved_at`).
    - Mengimplementasikan **keyset pagination** (`WHERE (moved_at, id) < ($1, $2) ORDER BY moved_at DESC, id DESC LIMIT 50`) guna menjaga performa query tetap stabil saat volume data jutaan baris.

---

## 📄 Fase 5: Manajemen Dokumen, Generator Nomor & State Machine

Mengatur alur hidup seluruh transaksi dokumen, penomoran terpusat yang aman, dan penegakan idempoten transaksi.

- [x] **5.1 Generator Nomor Dokumen Terpusat (BR-04)**
    - Membuat fungsi generator nomor dokumen yang berjalan secara atomik menggunakan transaksi database:
        ```sql
        INSERT INTO doc.document_numbers (doc_type, period, last_seq)
        VALUES ($1, to_char(now(), 'YYYYMM'), 1)
        ON CONFLICT (doc_type, period)
        DO UPDATE SET last_seq = doc.document_numbers.last_seq + 1
        RETURNING last_seq;
        ```
    - Format keluaran nomor: `{TIPE}/{KODE_GUDANG}/{YYMM}/{SEQ:5}` (contoh: `GRN/JKT01/2608/00042`).

- [x] **5.2 Implementasi State Machine Dokumen**
    - Menerapkan transisi status dokumen: `draft -> submitted -> approved -> in_progress -> completed -> cancelled`.
    - Mencegah perubahan status tidak valid (transisi di luar diagram status harus mengembalikan error `ERR_INVALID_STATE`).
    - Dokumen yang berstatus `completed` bersifat final and mutlak tidak boleh diubah atau dibatalkan (BR-10). Koreksi wajib menggunakan dokumen pembalik/retur.

- [x] **5.3 Penegakan Aturan Pembuat & Penyetuju (Maker-Checker - BR-05)**
    - Pada usecase persetujuan dokumen (`/approve`), lakukan validasi untuk memastikan user ID penyetuju tidak sama dengan user ID pembuat dokumen (`approved_by != created_by`). Jika sama, gagalkan and kembalikan error `ERR_SELF_APPROVAL`.

- [x] **5.4 Mekanisme Idempotensi API**
    - Membuat middleware idempotensi yang mengevaluasi header `Idempotency-Key` (UUID).
    - Menyimpan kunci idempotensi pada kolom `doc.documents.idempotency_key` (UNIQUE).
    - Jika kunci yang sama dikirim ulang, server mengembalikan status HTTP 200 beserta payload dokumen yang sudah ada di database, alih-alih membuat transaksi baru.

---

## 📥 Fase 6: Modul Inbound (M2) & Alur Putaway

Mengelola alur penerimaan barang dari pemasok dari mulai pencatatan draft hingga pemindahan fisik ke lokasi penyimpanan akhir.

- [x] **6.1 Pembuatan & Pengajuan GRN (Goods Receipt Note)**
    - Endpoint `POST /api/v1/receipts` (membuat draft GRN dengan/atau tanpa referensi Purchase Order).
    - Endpoint `POST /api/v1/receipts/{id}/submit` (mengajukan verifikasi fisik barang).
    - Melakukan validasi kesesuaian data baris barang (SKU, qty, satuan dasar, data batch/exp jika diwajibkan oleh item).

- [x] **6.2 Persetujuan GRN & Penempatan di Lokasi Staging**
    - Endpoint `POST /api/v1/receipts/{id}/approve`.
    - Menyetujui dokumen GRN (menjalankan aturan Maker-Checker).
    - Setelah disetujui, panggil service _Posting Stok_ untuk memasukkan kuantitas barang ke lokasi **staging** (gudang penerimaan sementara). Status stok diset berdasarkan hasil QC (`available` / `quarantine` / `damaged`).

- [x] **6.3 Engine Saran Lokasi Putaway**
    - Endpoint `GET /api/v1/receipts/{id}/putaway-suggestion`.
    - Membuat algoritma penentuan lokasi penyimpanan akhir berdasarkan:
        - Kategori barang & kesesuaian tipe lokasi bin (misal: barang fast-moving ditaruh dekat pintu keluar).
        - Kapasitas volume/berat maksimal lokasi bin yang masih kosong.

- [x] **6.4 Eksekusi Putaway (Scan Bin)**
    - Endpoint `POST /api/v1/receipts/{id}/putaway`.
    - Staf gudang melakukan scan barcode lokasi bin tujuan and item untuk mengonfirmasi penempatan barang.
    - Di backend, buat transaksi database untuk memindahkan saldo stok dari lokasi `staging` ke lokasi bin penyimpanan akhir (mengurangi saldo staging, menambah saldo lokasi bin tujuan).

---

## 📤 Fase 7: Modul Outbound (M4) & Algoritma Alokasi FEFO/FIFO

Mengotomasi proses pengambilan barang secara cerdas berdasarkan umur kadaluwarsa barang untuk meminimalisasi kerugian barang expired.

- [ ] **7.1 Alur Permintaan Barang (Requests) & Delivery Order (DO)**
    - Endpoint `POST /api/v1/requests` (pengajuan dari unit internal/customer).
    - Endpoint `POST /api/v1/deliveries` (pembuatan dokumen DO/Surat Jalan berdasarkan permintaan barang yang disetujui).

- [ ] **7.2 Implementasi Engine Alokasi Otomatis FEFO/FIFO (FR-4.2)**
    - Endpoint `POST /api/v1/deliveries/{id}/allocate`.
    - Menjalankan kueri pencarian kandidat stok secara real-time berdasarkan aturan FEFO (First Expired First Out) untuk barang ber-expired date, and FIFO (First In First Out) untuk barang non-expired:
        ```sql
        SELECT b.id, b.qty_onhand - b.qty_reserved AS qty_free, bt.expiry_date, l.pick_seq
        FROM inv.stock_balances b
        JOIN master.locations l ON l.id = b.location_id
        LEFT JOIN master.batches bt ON bt.id = b.batch_id
        WHERE b.item_id = $1
          AND l.warehouse_id = $2
          AND b.status = 'available'
          AND l.loc_type IN ('pick','bulk')
          AND b.qty_onhand > b.qty_reserved
          AND (bt.expiry_date IS NULL OR bt.expiry_date > CURRENT_DATE)
        ORDER BY
          bt.expiry_date NULLS LAST,   -- Prioritaskan kadaluwarsa terdekat (FEFO)
          b.id,                        -- FIFO (Urutan id record terkecil)
          l.pick_seq                   -- Optimasi jalur jalan staf gudang
        FOR UPDATE;
        ```
    - Mengurangi kuantitas dari kolom `qty_free` di aplikasi, membuat data alokasi baru pada `doc.allocations`, and mengupdate `qty_reserved` pada tabel `inv.stock_balances`.
    - Jika sisa kuantitas bebas tidak mencukupi permintaan, gagalkan seluruh transaksi alokasi and kembalikan error `ERR_STOCK_INSUFFICIENT` lengkap dengan list shortage detail.

- [ ] **7.3 Mekanisme Override Alokasi**
    - Menyediakan logika override penentuan alokasi manual khusus untuk pengguna yang memiliki izin `outbound.override_allocation` and mewajibkan pengisian `reason_code` dalam transaksi.

- [ ] **7.4 Generator PDF Picking List Terurut Jalur**
    - Endpoint `GET /api/v1/deliveries/{id}/picking-list`.
    - Menghasikan daftar picking list (format JSON / PDF siap cetak) yang diurutkan secara sekuensial berdasarkan kolom `pick_seq` pada lokasi bin untuk efisiensi jarak tempuh jalan staf gudang.

- [ ] **7.5 Verifikasi Hasil Scan Picking (FR-4.4)**
    - Endpoint `POST /api/v1/deliveries/{id}/pick`.
    - Menerima payload array data hasil scan barcode oleh petugas picker.
    - Memvalidasi kecocokan item barcode and lokasi barcode terhadap data alokasi. Jika terjadi ketidaksesuaian, sistem langsung memblokir proses and mengembalikan error `ERR_SCAN_MISMATCH` (tidak boleh melanjutkan pengeluaran sebelum ketidaksesuaian diselesaikan).

- [ ] **7.6 Posting Pengiriman (Shipment Posting) & Surat Jalan**
    - Endpoint `POST /api/v1/deliveries/{id}/ship`.
    - Melakukan posting pengurangan stok akhir: mengurangi `qty_onhand` and `qty_reserved` pada `inv.stock_balances` sejumlah barang yang di-pick, serta memasukkan baris pengeluaran stok bernilai negatif ke `inv.stock_movements`.
    - Status dokumen berubah menjadi `in_progress`.

- [ ] **7.7 Proof of Delivery (POD) & Penutupan Dokumen**
    - Endpoint `POST /api/v1/deliveries/{id}/pod`.
    - Mencatat data serah terima barang: nama penerima, waktu kedatangan, unggah berkas foto/tanda tangan kurir ke S3/MinIO.
    - Mengubah status dokumen DO secara final menjadi `completed` (selesai).

---

## 🔄 Fase 8: Mutasi Antar Gudang (M5) & Stock Opname (M6)

Mengontrol akurasi stok fisik di gudang melalui mekanisme perpindahan stok antar lokasi fisik and audit stok berkala.

- [ ] **8.1 Alur Mutasi Antar Gudang (Transfer Out & In)**
    - Endpoint `POST /api/v1/transfers` (pembuatan dokumen transfer).
    - Endpoint `POST /api/v1/transfers/{id}/send` (proses pengiriman dari gudang asal):
        - Mengurangi `qty_onhand` gudang asal and memindahkannya ke dalam baris stock balances khusus bersatus **in_transit** di gudang tujuan.
    - Endpoint `POST /api/v1/transfers/{id}/receive` (konfirmasi penerimaan di gudang tujuan):
        - Memverifikasi jumlah barang yang sampai. Jika ada selisih, buat log selisih and kirim notifikasi darurat.
        - Memposting perpindahan saldo dari status `in_transit` ke status `available` di lokasi bin yang ditunjuk.

- [ ] **8.2 Sesi Opname (Cycle Counting & Snapshot - FR-6.1)**
    - Endpoint `POST /api/v1/counts` (membuka sesi opname berdasarkan zonasi atau siklus ABC).
    - Saat sesi opname dibuka, backend harus melakukan **snapshot kuantitas sistem saat ini** secara instan and menyimpannya di kolom `qty_system` pada tabel `doc.count_lines` (Blind Count pattern - kuantitas sistem dirahasiakan dari petugas penghitung lapangan).

- [ ] **8.3 Input Hasil Opname & Validasi Selisih (Variance)**
    - Endpoint `POST /api/v1/counts/{id}/lines`.
    - Petugas menginput data hitung fisik barang di lapangan. Backend secara otomatis mengalkulasi nilai selisih (`variance = qty_counted - qty_system`).

- [ ] **8.4 Persetujuan Berjenjang & Posting Penyesuaian (M6.4 - M6.5)**
    - Endpoint `POST /api/v1/counts/{id}/post`.
    - Menerapkan logika persetujuan berjenjang: selisih bernilai total > Rp X juta membutuhkan persetujuan berjenjang dari Supervisor hingga Inventory Manager.
    - Jika disetujui, panggil service _Posting Stok_ untuk melakukan penyesuaian saldo pada `stock_balances` and mencatatkan tipe gerakan `adjustment (ADJ)` pada ledger `stock_movements`.

- [ ] **8.5 Penyesuaian Manual (Manual Adjustment)**
    - Endpoint `POST /api/v1/adjustments`.
    - Digunakan untuk penyesuaian langsung di luar stock opname (karena barang rusak/hilang mendadak). Wajib menyertakan parameter `reason_code` and pesan penjelasan tertulis.

---

## ⏰ Fase 9: Background Jobs, Perencanaan Stok (M8) & Penjadwal

Mengatur penanganan proses otomatisasi sistem, perhitungan berkala berskala besar, serta asuransi integritas data persediaan.

- [ ] **9.1 Setup Antrean Job & Penjadwal (hibiken/asynq)**
    - Menyiapkan engine worker asynq yang berjalan secara independen pada `cmd/worker/main.go`.
    - Mengonfigurasi penjadwalan berkala (_cron scheduling_) menggunakan Redis sebagai penyimpanan state antrean.

- [ ] **9.2 Job Alert Kadaluwarsa (`expiry.alert` - Harian 06:00)**
    - Membuat job harian untuk menyisir database mendeteksi item/batch yang mendekati masa kadaluwarsa (H-90 dan H-30).
    - Mengirim notifikasi otomatis ke tim inventori and menandai status stok batch tersebut menjadi `quarantine` jika telah melewati masa expired date.

- [ ] **9.3 Perhitungan Reorder Point (`reorder.calc` - Harian 01:00)**
    - Mengimplementasikan penghitung otomatis berbasis data pemakaian riil:
        - Cari total kuantitas barang keluar dalam 90 hari terakhir untuk mendapatkan nilai rata-rata pemakaian harian (`avg_daily_usage`).
        - Hitung titik pemesanan ulang: `ROP = (avg_daily_usage * lead_time_days) + safety_stock`.
        - Jika saldo stok tersedia saat ini < ROP, masukkan item tersebut ke dalam tabel usulan pembelian `inv.replenishment_suggestions` and kirim alert push notification.

- [ ] **9.4 Rekonsiliasi Ledger–Balance Mingguan (`ledger.reconcile` - Mingguan)**
    - **Jaring pengaman bug posting**: Membuat script pengujian rekonsiliasi integritas data:
        - Bandingkan hasil penjumlahan matematis seluruh mutasi stok pada ledger `SUM(qty)` di tabel `inv.stock_movements` untuk setiap kunci barang unik, terhadap nilai saldo akhir `qty_onhand` di tabel `inv.stock_balances`.
        - Jika terdeteksi adanya deviasi/selisih sekecil apa pun, sistem wajib menerbitkan log dengan tingkat keparahan **CRITICAL** and mengirimkan alert/email darurat kepada tim Inventory Manager dan administrator.

- [ ] **9.5 Job Pemeliharaan Bulanan (`partition.maintain` & `report.refresh`)**
    - Membuat scheduler bulanan untuk membuat partisi tabel `inv.stock_movements` baru untuk bulan berikutnya secara otomatis guna menjaga kecepatan indeks pencarian database.
    - Membuat scheduler harian (02:00) untuk me-refresh _materialized views_ database yang digunakan untuk menyajikan data laporan mutasi stok bulanan, ABC classification, dan dashboard.

---

## 🧪 Fase 10: Pengujian Konkurensi, Observabilitas & Validasi Kontrak

Menyediakan perlindungan tingkat akhir sebelum kode masuk ke lingkungan produksi guna menjamin kestabilan and akurasi tinggi.

- [ ] **10.1 Unit Test Bisnis Logika (Usecase Layer)**
    - Menulis pengujian unit test pada package `internal/usecase/` (target cakupan test coverage **minimal 80%**).
    - Wajib menguji usecase: konversi UoM, state machine transisi dokumen, and penentuan ROP.

- [ ] **10.2 Uji Integrasi Database (Testcontainers-Go)**
    - Setup pengujian integrasi yang memutar container database PostgreSQL riil secara lokal menggunakan package `testcontainers-go`.
    - Menguji kebenaran constraint database, aturan Maker-Checker, and rule anti-delete/update pada ledger transaksi.

- [ ] **10.3 Uji Konkurensi Tinggi & Race Conditions**
    - **Uji Krusial:** Membuat simulasi pengujian dengan meluncurkan **50 goroutines secara bersamaan** untuk mencoba melakukan posting pengeluaran dan pemasukan pada satu SKU barang yang sama:
        - Verifikasi bahwa hasil akhir saldo on-hand dan reserved di tabel `stock_balances` bernilai tepat secara matematis.
        - Verifikasi bahwa mekanisme row-locking deterministik berhasil menangani beban konkurensi dengan sukses tanpa menghasilkan error deadlock database atau race condition saldo bocor.

- [ ] **10.4 Validasi Kontrak OpenAPI**
    - Menulis pengujian untuk memastikan setiap payload response and request dari HTTP API Echo benar-benar selaras dengan definisi skema pada file `api/openapi.yaml`.

- [ ] **10.5 Integrasi Structured Logging, Metrics & Health Checks**
    - Mengonfigurasi output log terstruktur JSON (`log/slog`) agar memuat korelasi `request_id`, `user_id`, and `doc_no` pada level error/info.
    - Setup endpoint probe `/healthz` (Liveness) and `/readyz` (Readiness - memverifikasi status koneksi aktif ke PostgreSQL dan Redis).
    - Mengekspos metrik internal (latensi p95 API, kedalaman antrean job, database connection pool) menggunakan Prometheus exporter.
