import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { randomUUID } from 'crypto';

// Base URL website (bukan API)
const BASE_URL = 'https://reactgo.order-rz.my.id';

// Daftar User-Agent untuk rotasi
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

// Fungsi untuk membuat client dengan cookie jar baru (tab samaran)
function createFreshClient() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      'Content-Type': 'application/json',
      'Origin': BASE_URL,
      'Referer': BASE_URL + '/'
    }
  }));
  return { client, jar };
}

// Fungsi untuk mendapatkan CSRF token atau session awal (jika diperlukan)
// Tapi karena kita hanya perlu POST ke endpoint react, mungkin tidak perlu

// Fungsi utama: kirim reaksi dengan session baru
async function sendReactionWithNewSession(url, emojis) {
  const { client } = createFreshClient();

  // Coba langsung POST ke endpoint web (biasanya /api/react atau /react)
  // Kita perlu tahu endpoint yang digunakan web. Dari analisis, kemungkinan /api/react
  // Tapi karena web menggunakan Socket.IO, mungkin ada endpoint REST juga.
  // Kita coba endpoint yang umum: /api/react atau /react
  const endpoints = ['/api/react', '/react', '/api/web/react', '/react/send'];

  for (const endpoint of endpoints) {
    try {
      const response = await client.post(`${BASE_URL}${endpoint}`, {
        link: url,
        emojis: emojis
      }, {
        timeout: 30000,
        validateStatus: () => true
      });

      // Jika berhasil (status 200 dan ok true)
      if (response.status === 200 && response.data?.ok === true) {
        return { success: true, data: response.data, endpoint };
      }
    } catch (_) { /* ignore */ }
  }

  // Jika semua endpoint gagal, coba cari endpoint dari halaman utama
  // Sebagai fallback, kita coba scrape atau gunakan socket.io? Tapi untuk sederhana,
  // kita asumsikan ada endpoint /react yang menerima POST.
  // Karena kita tidak tahu pasti, kita coba satu endpoint terakhir yang paling mungkin.
  try {
    const { client } = createFreshClient();
    const response = await client.post(`${BASE_URL}/react`, {
      link: url,
      emojis: emojis
    }, {
      timeout: 30000,
      validateStatus: () => true
    });
    if (response.status === 200 && response.data?.ok === true) {
      return { success: true, data: response.data, endpoint: '/react' };
    }
  } catch (_) {}

  // Jika gagal total
  return { success: false, message: 'Tidak ada endpoint yang berhasil' };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { url, emojis, jumlah = 1, delayMs = 1500 } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, message: 'URL wajib diisi' });
    }
    if (!Array.isArray(emojis) || emojis.length === 0) {
      return res.status(400).json({ success: false, message: 'Pilih minimal satu emoji' });
    }
    if (jumlah < 1 || jumlah > 50) {
      return res.status(400).json({ success: false, message: 'Jumlah antara 1-50' });
    }

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < jumlah; i++) {
      // Kirim dengan session baru (seperti tab samaran)
      const result = await sendReactionWithNewSession(url, emojis);
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
      results.push({
        index: i + 1,
        success: result.success,
        message: result.success ? 'OK' : (result.message || 'Gagal'),
        endpoint: result.endpoint || 'unknown'
      });

      // Jeda antar request (agar tidak mencurigakan)
      if (i < jumlah - 1 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return res.status(200).json({
      success: true,
      message: `Berhasil: ${successCount}, Gagal: ${failedCount}`,
      data: {
        url,
        emojis,
        jumlah,
        successCount,
        failedCount,
        results
      }
    });
  } catch (error) {
    console.error('Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
