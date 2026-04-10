#!/usr/bin/env node
/**
 * fitbit_auth.js — One-time OAuth login to get Fitbit tokens
 *
 * Usage: node fitbit_auth.js
 *
 * Before running:
 *  1. Register a "Personal" app at https://dev.fitbit.com/apps/new
 *     - OAuth 2.0 Application Type: Personal
 *     - Redirect URI: http://localhost:8000/callback
 *  2. Put FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET in your .env
 *
 * After running, ACCESS_TOKEN and REFRESH_TOKEN are saved to .env automatically.
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.FITBIT_CLIENT_ID;
const CLIENT_SECRET = process.env.FITBIT_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8000/callback';
const ENV_FILE = path.join(__dirname, '.env');

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Missing FITBIT_CLIENT_ID or FITBIT_CLIENT_SECRET in .env');
    process.exit(1);
}

// Scopes we need
const SCOPES = [
    'activity',
    'heartrate',
    'sleep',
    'oxygen_saturation',
    'respiratory_rate',
    'temperature',
    'profile'
].join('%20');

const AUTH_URL = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES}&expires_in=604800`;

// ── Update a key in .env file ────────────────────────────────────────────────
function updateEnv(key, value) {
    let content = fs.readFileSync(ENV_FILE, 'utf8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const newLine = `${key}="${value}"`;
    if (regex.test(content)) {
        content = content.replace(regex, newLine);
    } else {
        content += `\n${key}="${value}"`;
    }
    fs.writeFileSync(ENV_FILE, content);
}

// ── Exchange auth code for tokens ────────────────────────────────────────────
function exchangeCode(code) {
    return new Promise((resolve, reject) => {
        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
        const body = `client_id=${CLIENT_ID}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`;

        const options = {
            hostname: 'api.fitbit.com',
            path: '/oauth2/token',
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse token response: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── Open browser cross-platform ──────────────────────────────────────────────
function openBrowser(url) {
    const platform = process.platform;
    const cmd = platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, (err) => {
        if (err) console.log(`\n⚠️  Could not auto-open browser. Please open this URL manually:\n\n${url}\n`);
    });
}

// ── Start local callback server ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost:8000');

    if (url.pathname !== '/callback') {
        res.end('Not found');
        return;
    }

    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>❌ Authorization failed: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        process.exit(1);
    }

    if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h2>❌ No code received</h2>');
        server.close();
        return;
    }

    console.log('\n✅ Got authorization code. Exchanging for tokens...');

    try {
        const tokens = await exchangeCode(code);

        if (tokens.errors) {
            console.error('❌ Token exchange failed:', tokens.errors);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h2>❌ Token exchange failed</h2><pre>${JSON.stringify(tokens.errors, null, 2)}</pre>`);
            server.close();
            return;
        }

        // Save to .env
        updateEnv('FITBIT_ACCESS_TOKEN', tokens.access_token);
        updateEnv('FITBIT_REFRESH_TOKEN', tokens.refresh_token);

        console.log('✅ Tokens saved to .env');
        console.log(`   Access token expires in: ${tokens.expires_in}s (~8 hours)`);
        console.log('\n🎉 Auth complete! You can now run: node sync.js\n');

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html><body style="font-family:sans-serif;padding:40px;text-align:center">
            <h2>✅ Fitbit Auth Complete!</h2>
            <p>Tokens have been saved to your <code>.env</code> file.</p>
            <p>You can close this tab and run <code>node sync.js</code></p>
            </body></html>
        `);
        server.close();

    } catch (err) {
        console.error('❌ Error during token exchange:', err.message);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h2>Error</h2><pre>${err.message}</pre>`);
        server.close();
    }
});

server.listen(8000, () => {
    console.log('\n🔐 Fitbit OAuth Login\n');
    console.log('Opening browser to authorize your Fitbit account...');
    console.log('(If the browser does not open, visit the URL printed below)\n');
    openBrowser(AUTH_URL);
    console.log('Waiting for callback on http://localhost:8000/callback ...\n');
});
