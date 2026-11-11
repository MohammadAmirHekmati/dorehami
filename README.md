# Dorehami | دورهمی

**A Persian multiplayer card club — یک دست، هزار خاطره.**

Online Crazy Sevens and simplified Blackjack with private rooms, invitation links, computer opponents, reconnect support and an installable PWA. Built with React, Vite, Node.js, Express, Socket.IO and PostgreSQL.

بازی آنلاین **هفت خبیث** و **۲۱** با رابط فارسی، روم خصوصی، دعوت دوستان، ربات و امکان نصب PWA. بازی‌ها صرفاً برای سرگرمی هستند و شرط‌بندی یا پول واقعی ندارند.

## Local development | اجرای محلی

Requires Node.js 24.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Without DATABASE_URL, development uses the ignored local SQLite file data/club.sqlite. Production requires PostgreSQL and never silently falls back to SQLite. Local accounts are not copied to the public server.

ثبت‌نام کنید، یک روم بسازید و برای تست تک‌نفره ربات اضافه کنید. برای تست چندنفره از حساب‌های متفاوت در مرورگرهای جدا استفاده کنید.

## Production | استقرار

1. Provision a new PostgreSQL database `dorehami` and a dedicated non-superuser role `dorehami_app`; never reuse another project's database or credentials.
2. Copy `.env.example` to a protected environment file outside the repository and configure the database connection.
3. Build the frontend on a development machine: `npm ci` then `npm run build`.
4. Transfer the source, lockfile and `dist/` to a release directory on the server.
5. Build the runtime image: `docker build -t dorehami:RELEASE .`.
6. Run one instance with a 256 MiB memory limit, 0.5 CPU and 128 PIDs. Configure log rotation, read-only filesystem and dropped capabilities. The app binds only to loopback behind Nginx; `deploy/nginx.conf` is the project-specific virtual host.
7. Issue a certificate for `dorehami.saeedghofrani.xyz`, validate Nginx configuration, then reload Nginx without restarting other services.

Users, hashed sessions and room snapshots are stored in PostgreSQL. The connection pool is capped at three connections. Password hashing is asynchronous with limited concurrent work. Room writes are serialized; rooms resume after a restart, although an abrupt power loss can lose the last in-flight write. A single process owns game turns; do not scale to multiple instances without coordinated ownership. Redis is not required for this single-instance release and existing Redis data is untouched.

دیتابیس، نقش اتصال و کانتینر برنامه مستقل هستند. هیچ رمز، توکن، دادهٔ حساب یا فایل تنظیمات محرمانه‌ای در این مخزن قرار نمی‌گیرد. روی سرور کم‌حافظه، build فرانت را محلی انجام دهید.

## Validation | تست

```sh
npm test
node server/integration.test.js
```

The integration check requires a running server and creates test accounts. TEST_BASE_URL can target another authorized environment. Health endpoint: /api/health.

## Rules | قوانین

Seven: match rank or suit. Seven stacks a two-card penalty, eight repeats a turn, ten reverses direction, ace skips, and jack chooses the suit (except during a seven penalty). Drawing ends the turn. Special cards may finish a hand. Turns last 30 seconds.

Blackjack: each player faces an automated dealer. Aces count as 1 or 11, face cards as 10. Dealer stands on all 17s. No wagers, split, double or special natural payout. A timeout stands automatically.

قوانین کامل داخل برنامه قابل مشاهده است. خروج از روم در طول بازی دست جاری را لغو می‌کند. نصب PWA روی موبایل نیازمند HTTPS است.

## Single-player | بازی‌های تک‌نفره

The sidebar separates multiplayer and single-player games. Klondike Solitaire uses draw-one with unlimited stock recycling, alternating descending tableau sequences, and same-suit foundations from ace to king. Pyramid removes exposed pairs totaling 13; kings are removed alone and the stock can be recycled once. Clearing all 28 pyramid cards wins.

Both games include touch-first card selection, undo (last 40 moves in the current visit), hints, restart confirmation and automatic progress saving in this browser. No signup is required. Progress is device-local, not synced to PostgreSQL or other devices. Random deals are not guaranteed solvable. No currency or ranking rewards are awarded. Once the PWA assets are cached, the games run without server requests.

سولیتر و هرم از بخش تک‌نفره در دسترس‌اند. پیشرفت روی همین دستگاه ذخیره می‌شود. برای انتقال کارت، ابتدا کارت و سپس مقصد را لمس کنید؛ کشیدن کارت لازم نیست. برگشت حرکت، پیشنهاد حرکت و قوانین داخل هر بازی وجود دارد.
