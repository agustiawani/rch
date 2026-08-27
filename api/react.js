import { gotScraping } from 'got-scraping';

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
    const { url, reactions } = req.body;

    // Validasi input
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL postingan wajib diisi.' });
    }
    if (!Array.isArray(reactions) || reactions.length === 0) {
      return res.status(400).json({ success: false, message: 'Pilih minimal satu reaction.' });
    }
    if (reactions.length > 5) {
      return res.status(400).json({ success: false, message: 'Maksimal 5 reaction.' });
    }

    // Panggil API eksternal
    const apiUrl = 'https://react-w4.vercel.app/api/react';
    const payload = { url, reactions };

    const response = await gotScraping.post(apiUrl, {
      json: payload,
      headers: { 'Content-Type': 'application/json' },
      responseType: 'json',
      timeout: { request: 30000 },
      retry: {
        limit: 2,
        methods: ['POST'],
        statusCodes: [500, 502, 503, 504]
      }
    });

    return res.status(200).json(response.body);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      return res.status(error.response.statusCode || 500).json(error.response.body);
    }
    return res.status(500).json({ success: false, message: error.message });
  }
}
