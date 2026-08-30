const express = require('express');
const path = require('path');
const { addExtra } = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Sajikan file statis dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi API
const FRONTEND_URL = 'https://kaze-reaction-wa.netlify.app';
const SUPABASE_RPC = 'https://efxbkdfimlyfbuugyykf.supabase.co/rest/v1/rpc/register_username';
const HANDSHAKE_API = 'https://anzzmodsofficial.edgeone.dev/api/v1/handshake';
const REACT_API = 'https://anzzmodsofficial.edgeone.dev/api/v1/react';
const SUPABASE_KEY = 'sb_publishable_reLxUleQtK6WXE-v7ZrEhw_F0TptyNC';
const ANZZ_KEY = 'anzz_live_3d094ee553d8512535de129347755fb351cabc04f753db35';

// Tambahkan stealth plugin
const puppeteer = addExtra(require('puppeteer'));
puppeteer.use(StealthPlugin());

// Helper functions
function generateUsername() { return `usr_${crypto.randomBytes(6).toString('hex')}`; }
function generateClientId() { return `zr_${crypto.randomBytes(10).toString('hex')}`; }

// Fungsi utama bot (tidak berubah)
async function runBot(waUrl, reactions) {
    const username = generateUsername();
    const clientId = generateClientId();
    let handshakeToken = '';

    console.log(`[*] Auto-gen Username : ${username}`);
    console.log(`[*] Auto-gen ClientID : ${clientId}`);
    console.log('[*] Launching stealth browser...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-gpu',
            '--disable-dev-shm-usage'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const mobileUA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
        await page.setUserAgent(mobileUA);

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'languages', { get: () => ['id-ID', 'id', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'platform', { get: () => 'Android' });
        });

        console.log('[PRE-STEP] Navigating to frontend origin...');
        await page.goto(FRONTEND_URL, { waitUntil: 'networkidle2', timeout: 30000 });
        console.log('[+] Frontend loaded. Native Origin established.\n');

        // STEP 1: Register username
        console.log('[STEP 1/3] Registering username...');
        const step1Data = await page.evaluate(async (url, apikey, cid, uname) => {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Apikey': apikey,
                    'Authorization': `Bearer ${apikey}`,
                    'Content-Type': 'application/json',
                    'X-Client-Info': 'supabase-js/2.112.4; runtime=web'
                },
                body: JSON.stringify({ p_client_id: cid, p_username: uname })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => 'Unknown')}`);
            return await res.json();
        }, SUPABASE_RPC, SUPABASE_KEY, clientId, username);

        if (!step1Data.success) throw new Error(`Register failed: ${JSON.stringify(step1Data)}`);
        console.log(`[+] Step 1 Success! Registered: ${step1Data.username}\n`);

        // STEP 2: Handshake
        console.log('[STEP 2/3] Getting handshake token...');
        const step2Data = await page.evaluate(async (url, apiKey, clientId) => {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-Api-Key': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ client_id: clientId })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => 'Unknown')}`);
            return await res.json();
        }, HANDSHAKE_API, ANZZ_KEY, clientId);

        if (!step2Data.ok || !step2Data.token) {
            throw new Error(`Handshake failed: ${JSON.stringify(step2Data)}`);
        }
        handshakeToken = step2Data.token;
        console.log(`[+] Step 2 Success! Token: ${handshakeToken.substring(0, 16)}... (${step2Data.expiresInMs}ms)\n`);

        // STEP 3: Kirim reaction
        console.log('[STEP 3/3] Sending VIP reaction...');
        console.log(`[*] Target  : ${waUrl}`);
        console.log(`[*] Emojis  : ${reactions.join(' ')}\n`);

        const step3Data = await page.evaluate(async (url, apiKey, token, payload) => {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-Api-Key': apiKey,
                    'X-Handshake-Token': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => 'Unknown')}`);
            return await res.json();
        }, REACT_API, ANZZ_KEY, handshakeToken, { url: waUrl, reactions });

        if (!step3Data.ok || !step3Data.data?.success) {
            throw new Error(`Reaction failed: ${JSON.stringify(step3Data)}`);
        }

        console.log('[+] Step 3 Success! VIP Reaction sent!\n');

        return {
            status: true,
            message: "VIP Reaction processed successfully",
            data: {
                username: username,
                client_id: clientId,
                target_url: waUrl,
                reactions_sent: reactions,
                task: step3Data.data.task,
                vip_info: step3Data.data.vip,
                handshake_token: handshakeToken
            }
        };

    } catch (err) {
        throw err;
    } finally {
        await browser.close();
    }
}

// Endpoint utama: menyajikan index.html (diatur oleh express.static, tapi kita juga bisa menangani secara eksplisit)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint API untuk reaction
app.post('/react', async (req, res) => {
    const { url, reactions } = req.body;

    if (!url) {
        return res.status(400).json({ status: false, message: 'url is required' });
    }
    if (!Array.isArray(reactions) || reactions.length === 0) {
        return res.status(400).json({ status: false, message: 'reactions must be a non-empty array' });
    }

    const limitedReactions = reactions.slice(0, 4);

    try {
        console.log(`[REQUEST] URL: ${url}, Reactions: ${limitedReactions.join(', ')}`);
        const result = await runBot(url, limitedReactions);
        return res.status(200).json(result);
    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        return res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
