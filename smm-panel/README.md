# SMM Panel — Phase 1 MVP (Telegram bot channel)

Custom SMM panel yang menggunakan `smmcost.com/api/v2` sebagai upstream provider.
Ini adalah implementasi **Phase 1** sesuai roadmap: connect provider → sync
services → tampilkan → customer membuat order → cek status. Belum ada
auth/saldo/admin panel — itu Phase 2+ (lihat bagian "Roadmap" di bawah).

Customer sekarang berinteraksi lewat **Telegram bot**, bukan halaman web.
Halaman web di `app/services/` dan `app/orders/` tetap ada dan tetap
berfungsi (dipakai untuk verifikasi manual / demo), tapi bot adalah channel
utama. Keduanya memanggil logic yang sama persis di `lib/orders.ts` dan
`lib/services.ts` — jadi harga, validasi, dan idempotency tidak pernah beda
antara web dan bot.

## Setup bot Telegram

1. Chat `@BotFather` di Telegram → `/newbot` → catat token yang diberikan → isi `TELEGRAM_BOT_TOKEN`.
2. Generate string acak untuk `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 24`).
3. (Opsional) chat `@userinfobot` untuk dapat chat id Anda sendiri → isi `TELEGRAM_ADMIN_CHAT_ID`.
4. Deploy dulu ke Vercel dengan env vars di atas terisi.
5. Daftarkan webhook (jalankan sekali saja, ganti `<TOKEN>`, `<SECRET>`, dan domain):

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://domain-anda.vercel.app/api/telegram/webhook" \
     -d "secret_token=<SECRET>"
   ```

6. Chat bot Anda di Telegram, ketik `/start`.

Alur bot: `/start` → tombol "Lihat Services" → pilih kategori → pilih
service → bot minta quantity (dan link kalau service butuh) → tampilkan
harga → tombol Konfirmasi/Batal → order dibuat lewat provider adapter yang
sama dengan channel web. `/orders` menampilkan riwayat order per chat
(disimpan sebagai `orderedBy` = chat id Telegram).

## Kenapa stack ini

| Keputusan | Alasan |
|---|---|
| Next.js App Router, deploy di Vercel | Satu deployment untuk UI + API routes sebagai serverless functions, tanpa perlu server terpisah |
| Postgres serverless (Neon / Vercel Postgres) + Prisma | Butuh transaksi relasional (nanti untuk saldo di Phase 2); driver serverless cocok untuk lingkungan tanpa koneksi persisten |
| Vercel Cron (`vercel.json`) untuk sync status | Tidak butuh worker/queue terpisah untuk MVP; cukup untuk polling berkala ke provider |
| Adapter pattern di `lib/provider/` | Semua komunikasi ke provider terisolasi di satu layer; multi-provider nanti = tambah adapter baru, bukan rewrite |

## PENTING — asumsi yang harus diverifikasi

Response asli dari `smmcost.com/api/v2` belum tersedia untuk saya. Field-field
di `lib/provider/types.ts` dan mapping di `lib/provider/smmcost-adapter.ts`
mengikuti konvensi umum "SMM API v2" yang dipakai banyak provider sejenis
(field seperti `service`, `name`, `rate`, `min`, `max`, `refill`, `cancel`,
`order`, `status`, `charge`, `remains`). **Ini asumsi, bukan fakta yang
dikonfirmasi.** Sebelum production:

1. Set `PROVIDER_MODE=live` dan `SMMCOST_API_KEY` asli di `.env`.
2. Panggil tiap action provider sekali secara manual (misal lewat `POST /api/services/sync`) dan `console.log` raw response-nya.
3. Bandingkan dengan mapping di `smmcost-adapter.ts`, perbaiki field yang berbeda.
4. Field mana pun yang saya tandai "ASUMSI" di komentar kode — cek dulu.

Sampai itu selesai, jalankan dengan `PROVIDER_MODE=mock` (default) yang
memakai data contoh di `lib/provider/mock-adapter.ts` — cukup untuk
mengembangkan & menguji UI/flow order tanpa menyentuh provider asli.

## Menjalankan secara lokal

```bash
cp .env.example .env       # isi DATABASE_URL (bisa pakai Neon free tier)
npm install
npm run prisma:migrate     # buat tabel
npm run dev
```

Karena `PROVIDER_MODE=mock` secara default di luar production, Anda bisa
langsung membuka `/services`, memilih service contoh, dan membuat order
tanpa API key provider asli.

Untuk mengisi database dengan service (dari mock atau provider asli):

```bash
curl -X POST http://localhost:3000/api/services/sync
```

## Struktur

```
lib/provider/         → abstraction layer (types.ts = kontrak, smmcost-adapter.ts
                         = implementasi asli, mock-adapter.ts = data contoh,
                         index.ts = pemilih adapter aktif)
lib/db.ts             → Prisma client singleton
lib/pricing.ts        → supplier price → customer price (markup)
prisma/schema.prisma  → skema DB (Service, Category, Order — field Phase 2
                         seperti User/Balance sudah disiapkan tempatnya)
app/api/services/     → GET list (customer-facing, harga sudah di-markup),
                         POST sync (tarik dari provider)
app/api/orders/       → POST create (idempotent), GET list, GET :id/status
app/api/cron/         → sync-orders, dijadwalkan via vercel.json
app/services/, app/orders/ → halaman customer (channel web, opsional)
app/api/telegram/webhook/ → satu-satunya endpoint bot Telegram
lib/telegram/api.ts    → wrapper tipis ke Telegram Bot API (token server-only)
lib/telegram/session.ts → state percakapan per chat, disimpan di DB (BotSession)
lib/services.ts, lib/orders.ts → logic bersama dipakai web API & bot
```

## Keputusan keamanan Phase 1

- API key provider hanya dibaca di `smmcost-adapter.ts`, yang di-import
  dengan `server-only` — build akan gagal jika file ini pernah ter-bundle
  ke client.
- Browser **tidak pernah** memanggil provider langsung; semua lewat API
  route kita sendiri.
- Order dibuat dengan `idempotencyKey` unik per percobaan, supaya
  double-click atau retry jaringan tidak membuat order ganda ke provider.
- Endpoint cron dilindungi `CRON_SECRET` (dikirim otomatis oleh Vercel
  Cron sebagai header `Authorization`).
- Harga supplier (`supplierRate`, `supplierPrice`) tidak pernah dikirim ke
  response customer-facing (`/api/services`, halaman order) — hanya harga
  yang sudah di-markup.

## Yang SENGAJA belum dibuat di Phase 1

Sesuai instruksi untuk tidak over-build MVP:

- **Auth & saldo** — order Phase 1 belum terikat user login atau saldo
  internal. Skema `Order.orderedBy` sudah disiapkan sebagai string bebas
  (session id) supaya Phase 2 tinggal menambah relasi ke `User`, bukan
  migrasi ulang.
- **Admin panel UI** — sync service saat ini lewat `POST /api/services/sync`
  langsung (belum ada halaman admin dengan auth).
- **Refill / cancel UI** — sudah ada di provider adapter (`refill()`,
  `cancel()`), tapi belum ada tombol di UI customer karena keputusan
  kapan menampilkannya butuh data `refillSupported`/`cancelSupported` per
  order yang baru berguna setelah ada riwayat order nyata dari provider.
- **Payment gateway** — belum relevan sebelum ada sistem saldo.

## Roadmap (mengikuti pembagian Anda)

**Phase 2** — auth (NextAuth/Auth.js), `User` model + relasi ke `Order`,
saldo internal dengan transaksi atomic (Postgres transaction dengan row
lock saat charge saldo, sebelum memanggil provider), admin panel dasar
(kelola service, kategori, pricing, lihat semua order & saldo provider).

**Phase 3** — deposit & payment gateway (desain dengan interface
`PaymentProvider` seperti pola `SmmProviderAdapter`, agar QRIS/bank
transfer/crypto/gateway lain tinggal tambah adapter), tombol refill &
cancel di UI (mengaktifkan yang sudah ada di adapter), cron sync sudah
ada dari Phase 1 sehingga tinggal diperluas.

**Phase 4** — reseller API (endpoint publik dengan API key reseller
terpisah dari API key provider, rate limiting, dan skema
`services/add/status/refill/refill_status/cancel/balance` seperti yang
Anda minta), multi-provider (tambah adapter baru + kolom `providerId`
pada `Service`, yang skemanya sudah disiapkan), analytics.
