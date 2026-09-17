# Yeni Nesil Eğitim Kurumları – Yoklama Sistemi

Günlük / ders bazında yoklama, veli bilgilendirme takibi, devamsızlık raporları ve sürekli devamsız tespiti.

Next.js 16 · Prisma 7 · MySQL

## Veritabanı

İdari projeler için ortak veritabanı (`yeninesilegitimkurumlari_tools`).

**Ortak tablolar:** `users`, `user_project_roles` (proje bazlı yetki, bu proje: `yoklama`), `branches`, `academic_years`, `students`, `guardians`, `student_guardians`, `class_groups`, `student_enrollments`

**Yoklama tabloları:** `lesson_periods`, `attendance_settings`, `attendance_sessions`, `attendance_records`, `attendance_contact_logs`

Şema bu projedeki `prisma/schema.prisma` ile yönetilir. Başka bir proje aynı veritabanını kullanacaksa ortak tablolara migration eklemeden önce bu şemayla uyumlu olmalı.

## Özellikler

- **Kurum ve yıl seçimi:** Tüm ekranlar seçili kurum ve eğitim-öğretim yılına göre çalışır.
- **Yoklama Al:** Tarih, yoklama türü (günlük veya tanımlı ders) ve sınıf seçilir. Varsayılan "Var"; yalnızca Gelmedi / Geç / Erken çıkış / Mazeretli işaretlenir.
- **Veli Bilgilendirme:** Günün devamsızları; anne/baba telefonları (tıkla-ara), görüşülen veli, sonuç ve açıklama.
- **Öğrenciler:** K12 "Öğrenci Bilgilerini Güncelle" Excel aktarımı, öğrenci ve veli düzenleme, kayıt iptali.
- **Raporlar:** Tarih aralığı ve sınıfa göre öğrenci / sınıf / gün özetleri, Excel çıktısı.
- **Sürekli Devamsızlar:** Kurum bazında ayarlanabilir eşik.
- **Yönetici:** Yoklama ayarları, kurumlar ve yıllar, kullanıcılar.

- **Telegram botu:** Öğretmenler ve kullanıcılar yoklama fişinin fotoğrafını bota gönderir; yapay zeka (kurum bazlı OpenAI uyumlu API) fişi çözümler, sınıf/öğrenci eşleştirmesi yapılır, gönderen onayladıktan sonra yoklama kaydedilir. Eşleştirme yönetici panelinde üretilen kodla (`/baglan KOD`) yapılır.

İlk açılışta bu projede yönetici yoksa giriş ekranı ilk yönetici hesabını oluşturur.

## Telegram kurulumu

1. BotFather'dan bot oluşturun, token'ı `TELEGRAM_BOT_TOKEN` olarak tanımlayın; `TELEGRAM_WEBHOOK_SECRET` için rastgele bir değer, `APP_URL` için uygulamanın https adresini girin.
2. Yoklama Ayarları → Yapay zeka: base URL, API anahtarı ve görsel okuyabilen model (kurum bazlı).
3. Yoklama Ayarları → Telegram → **Webhook'u kur**.
4. Öğretmenler veya Kullanıcılar sayfasında "Telegram bağlantı kodu oluştur"; kişi bota `/baglan KOD` yazar.
5. Fiş fotoğrafı gönderilir → bot özet + Onayla/İptal → onayda yoklama kaydedilir. Açıklamaya tarih/ders yazılabilir (örn. "12.09.2026 3. ders"). Gönderimler "Telegram Fişleri" sayfasında listelenir.

## Geliştirme

```bash
cp .env.example .env   # DB_* ve SESSION_SECRET doldurun
npm install
npx prisma migrate deploy
npm run dev
```

Şema değişikliğinde: `npx prisma migrate dev --name aciklama`

## Dokploy kurulumu

1. **Application** oluşturun, bu repoyu bağlayın, Build Type: **Dockerfile**.
2. Environment:
   ```
   DB_HOST=...
   DB_PORT=3306
   DB_USER=...
   DB_PASSWORD=...
   DB_NAME=yeninesilegitimkurumlari_tools
   SESSION_SECRET=<openssl rand -base64 32>
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 16>
   APP_URL=https://yoklama.yeninesilkurs.tr
   ```
3. Domains: `yoklama.yeninesilkurs.tr` → port `3000`, HTTPS açık.
4. Şema değiştiyse deploy'dan önce yerelden `npm run db:deploy` (canlı DB'ye migration). Konteyner migration çalıştırmaz.

Sağlık kontrolü: `GET /api/health`
