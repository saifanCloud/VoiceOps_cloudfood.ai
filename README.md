# 🍲 CloudFood.Ai - Smart Restaurant Dashboard

A real-time restaurant management dashboard powered by **React (Vite) + Express + Google Gemini AI 3.5 Flash** and integrated seamlessly with **Firebase Firestore / Authentication**.

This project contains a **Full-Stack (Vite SPA + Custom Express Server)** architecture completely configured and certified ready for immediate upload to **GitHub** and production deployment onto **Google Cloud (Cloud Run)**.

---

## 💻 Fitur Utama / Main Features

1. **Voice AI Assistant**: Memproses rekaman audio masukan kasir/staf menggunakan model **Gemini 3.5 Flash** server-side untuk memanipulasi stok inventori atau membuat pesanan pelanggan secara otomatis.
2. **Kelola Menu & Stok Manual**: Form interaktif modal yang mendukung operasi Simpan, Ubah (Edit), dan Hapus (Delete) menu makanan/minuman dengan penanganan duplikasi database Firebase yang aman.
3. **Monitor Pesanan Terpadu**: Monitor pesanan aktif/selesai dengan fitur tambah pesanan manual, edit item pesanan, penyelesaian status, dan pembatalan (delete) yang menyinkronkan kembali kalkulasi stok inventori.
4. **Custom Delete Confirmation**: Panel dialog konfirmasi buatan khusus yang ramah pengguna sebelum melakukan tindakan penghapusan permanen.
5. **Real-time Synchronization**: Terkoneksi langsung dengan Firestore database untuk kemukhtahiran data instan tanpa me-refresh halaman.

---

## 📁 Struktur Folder Project / Project Directory Structure

Berikut adalah struktur kode yang dirancang modular agar mudah dikurasi, dipahami pencarian linter, dan ramah proses kompilasi container:

```text
├── src/                          # FRONTEND: React SPA (Vite)
│   ├── components/               # Komponen antarmuka modular
│   ├── main.tsx                  # Titik masuk utama Client-Side React
│   ├── App.tsx                   # Layar dashboard utama, modal, kontrol suara, dan interaksi
│   ├── firebase.ts               # Inisialisasi Firestore & Firebase Auth client-side
│   ├── types.ts                  # Deklarasi tipe data TypeScript (Inventory, Order, VoiceStatus)
│   └── index.css                 # Penerapan Tailwind CSS v4 & konfigurasi font kustom
│
├── server.ts                     # BACKEND: Express Server & Integrasi Gemini 3.5 Flash
├── package.json                  # Konfigurasi dependensi, build bundler, dan skrip start
├── tsconfig.json                 # Konfigurasi compiler TypeScript
├── vite.config.ts                # Konfigurasi pipeline bundling aset statis React
├── .gitignore                    # Konfigurasi git agar tidak mengunggah file sampah/rahasia ke GitHub
├── .env.example                  # Contoh template variabel lingkungan / environment secrets
├── firestore.rules               # Aturan keamanan database Firebase Firestore
├── firebase-blueprint.json       # Blueprint skema database pemula
└── metadata.json                 # Konfigurasi fitur kontainer sandbox & persetujuan izin browser
```

---

## 🚀 Panduan Menjalankan Secara Lokal / Local Setup

Sebelum memulai, pastikan Anda telah memasang **Node.js (versi 18+)** di komputer Anda.

### 1. Kloning & Persiapkan Berkas / Clone & Setup File
```bash
# Persiapkan berkas kredensial dari contoh template env
cp .env.example .env
```
*Buka berkas `.env` baru dan masukkan API Key dari Google Gemini AI Anda: `GEMINI_API_KEY="AIzaSy..."`*

### 2. Pasang Dependensi / Install Dependencies
```bash
npm install
```

### 3. Mulai Pengembangan / Run Development Server
```bash
npm run dev
```
Aplikasi akan langsung berjalan di browser pada alamat **`http://localhost:3000`**.

---

## 📦 Bundling Produksi / Production Build

Untuk meminimalkan ukuran file dan masalah latensi runtime di awan, sistem kompilasi kami otomatis memecah berkas front-end dan back-end dengan optimal:
```bash
npm run build
```
Skrip ini akan:
1. Mem-bundling seluruh kode React ke folder statis `/dist` menggunakan **Vite**.
2. Mem-bundling berkas server back-end Express (`server.ts`) menjadi berkas tunggal yang sangat ringan **`dist/server.cjs`** menggunakan **Esbuild Compiler** berciri CJS berkinerja tinggi, meminimalkan startup latency (cold-starts) di Cloud Run.

---

## 🐙 Langkah Mengunggah ke GitHub / Steps to Upload on GitHub

Karena aturan `.gitignore` sudah terkonfigurasi dengan sempurna untuk mengabaikan berkas besar (`node_modules`) dan kredensial sensitif (`.env`), Anda bisa mengunggah kode ke repositori visual Anda dengan aman:

```bash
# 1. Inisialisasi repositori Git lokal
git init

# 2. Tambahkan semua berkas aman
git add .

# 3. Lakukan Komit
git commit -m "feat: inisialisasi cloudfood dashboard siap cloud"

# 4. Hubungkan ke repositori GitHub Anda dan unggah
git branch -M main
git remote add origin https://github.com/USERNAME-ANDA/REPOS_ANDA.git
git push -u origin main
```

---

## ☁️ Deployment ke Google Cloud (Google Cloud Run)

Aplikasi ini sudah **100% cloud-native** dan didukung oleh port dinamis ingress internal (Port `3000`) yang ramah sistem proxy Google Cloud Run.

### Opsi A: Deployment menggunakan CLI (`gcloud`)
Pastikan Anda sudah menginstal [Google Cloud SDK](https://cloud.google.com/sdk) dan login ke akun GCP Anda:

```bash
# 1. Pastikan project GCP aktif Anda sudah terpasang
gcloud config set project ID-PROJECT-GCP-ANDA

# 2. Deploy kode ke Cloud Run secara langsung (GCP akan menyusun container otomotis via Cloud Build)
gcloud run deploy cloudfood-app \
  --source . \
  --port 3000 \
  --env-vars-file .env \
  --allow-unauthenticated \
  --region asia-east1
```

### Opsi B: Menggunakan Dockerfile (Opsional)
Jika Anda ingin mempertahankan pipeline kemasan Docker sendiri, Anda bisa membuat berkas `Dockerfile` di folder root dengan isi berikut:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Ambil berkas konfigurasi
COPY package*.json ./

# Pasang dependensi bersih
RUN npm ci

# Salin semua berkas kode
COPY . .

# Buat kompilasi build produksi server dan client
RUN npm run build

# Port ekspose internal
EXPOSE 3000

ENV NODE_ENV=production

# Jalankan server
CMD ["npm", "start"]
```

---

## 🔒 Konfigurasi Keamanan Firebase / Firebase Setup
Pastikan koleksi database Firestore Anda memiliki index dan aturan keamanan yang dikendalikan sesuai regulasi berkas `firestore.rules`.
Semua pesanan manual, perubahan menu, kelola stok bertumpu pada koleksi pendukung:
- `/inventory`: Berisi daftar menu, harga, kuantitas, dan kategori menu.
- `/orders`: Berisi status meja pelanggan, data pesanan historis terintegrasi, status persiapan makanan, dan cap waktu pembuatan (`createdAt`).

---

### Author / Owner
*Crafted in high fidelity workspace with Google AI Studio integrated tooling.*
