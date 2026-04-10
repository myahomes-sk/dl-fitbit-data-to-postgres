#!/usr/bin/env node
/**
 * sync.js — Smart incremental Fitbit API sync
 *
 * Usage: node sync.js
 *
 * This script is self-aware: for each metric it checks the MAX timestamp
 * already in the local database and only fetches newer data from the API.
 * It works correctly whether your DB is fresh or years ahead — it will
 * always pick up exactly where the data left off.
 *
 * Run this daily (or via cron) to keep your local DB up to date.
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

// ── Config ───────────────────────────────────────────────────────────────────
const ENV_FILE = path.join(__dirname, '.env');
const DATABASE_URL = process.env.DATABASE_URL;
const CLIENT_ID = process.env.FITBIT_CLIENT_ID;
const CLIENT_SECRET = process.env.FITBIT_CLIENT_SECRET;
let ACCESS_TOKEN = process.env.FITBIT_ACCESS_TOKEN;
let REFRESH_TOKEN = process.env.FITBIT_REFRESH_TOKEN;

if (!DATABASE_URL) { console.error('❌ Missing DATABASE_URL in .env'); process.exit(1); }
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('❌ Missing FITBIT_CLIENT_ID or FITBIT_CLIENT_SECRET in .env'); process.exit(1); }
if (!ACCESS_TOKEN || ACCESS_TOKEN === 'your_access_token') {
    console.error('❌ No access token found. Run: node fitbit_auth.js first');
    process.exit(1);
}

// Timezone of the Fitbit WEARER — used for sleep date attribution.
// This should match the timezone of the person whose data is being tracked.
// It does NOT depend on where this script is run (IST user, PST colleague — all the same).
const USER_TZ = process.env.FITBIT_USER_TIMEZONE || 'Asia/Kolkata';
console.log(`   Using Fitbit wearer timezone: ${USER_TZ}`);

const sql = postgres(DATABASE_URL);

// ── Helpers ──────────────────────────────────────────────────────────────────
function updateEnv(key, value) {
    let content = fs.readFileSync(ENV_FILE, 'utf8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const newLine = `${key}="${value}"`;
    content = regex.test(content) ? content.replace(regex, newLine) : content + `\n${key}="${value}"`;
    fs.writeFileSync(ENV_FILE, content);
}

function formatDate(d) {
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function addDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

// ── Fitbit API request (with auto token refresh) ─────────────────────────────
function fitbitGet(endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.fitbit.com',
            path: endpoint,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let body = {};
                try { body = data ? JSON.parse(data) : {}; } catch (e) { body = {}; }
                resolve({ status: res.statusCode, body });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// ── Refresh access token ──────────────────────────────────────────────────────
async function refreshAccessToken() {
    console.log('🔄 Access token expired. Refreshing...');
    return new Promise((resolve, reject) => {
        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
        const body = `grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}`;
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
                const parsed = JSON.parse(data);
                if (parsed.access_token) {
                    ACCESS_TOKEN = parsed.access_token;
                    REFRESH_TOKEN = parsed.refresh_token;
                    updateEnv('FITBIT_ACCESS_TOKEN', ACCESS_TOKEN);
                    updateEnv('FITBIT_REFRESH_TOKEN', REFRESH_TOKEN);
                    console.log('   ✅ Token refreshed and saved to .env');
                    resolve();
                } else {
                    reject(new Error(`Token refresh failed: ${JSON.stringify(parsed)}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// Wrapper: auto-retry once on 401 after refresh
async function fitbitGetSafe(endpoint) {
    let result = await fitbitGet(endpoint);
    if (result.status === 401) {
        await refreshAccessToken();
        result = await fitbitGet(endpoint);
    }
    return result;
}

// ── Per-metric query: what's the latest date in our DB? ──────────────────────
async function getLastSyncDate(table, dateCol, fallbackDays = 30) {
    try {
        const res = await sql.unsafe(`SELECT MAX("${dateCol}") AS last FROM "${table}"`);
        const last = res[0]?.last;
        if (last) {
            // Start syncing from the day AFTER the last known record
            const d = new Date(last);
            d.setUTCDate(d.getUTCDate() + 1);
            return d;
        }
    } catch (e) {
        // Table might not exist yet
    }
    // Fall back: sync last N days if no data exists
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - fallbackDays);
    return d;
}

// ── Sync: Steps (intraday 1min) ───────────────────────────────────────────────
async function syncSteps() {
    const startDate = await getLastSyncDate('steps', 'timestamp');
    const today = new Date();
    console.log(`\n🚶 Steps: syncing from ${formatDate(startDate)} to ${formatDate(today)}`);

    let current = new Date(startDate);
    let totalRows = 0;

    while (current <= today) {
        const date = formatDate(current);
        const { status, body } = await fitbitGetSafe(`/1/user/-/activities/steps/date/${date}/1d/1min.json`);

        if (status === 200) {
            const dataset = body?.['activities-steps-intraday']?.dataset || [];
            const rows = dataset
                .filter(d => d.value > 0)
                .map(d => ({
                    timestamp: new Date(`${date}T${d.time}`).toISOString(),
                    steps: String(d.value),
                    data_source: 'Fitbit API'
                }));

            if (rows.length > 0) {
                await sql`
                    INSERT INTO steps (timestamp, steps, data_source) 
                    SELECT x.timestamp::timestamptz, x.steps::numeric, x.data_source FROM ${sql(rows)} AS x(timestamp, steps, data_source)
                    ON CONFLICT DO NOTHING
                `;
                totalRows += rows.length;
            }
        } else if (status === 429) {
            console.log('   ⏳ Rate limited — stopping for now. Run again later.');
            break;
        }

        current = addDays(current, 1);
    }
    console.log(`   ✅ Inserted ${totalRows} new step records`);
}

// ── Sync: Heart Rate (intraday 1sec) ─────────────────────────────────────────
async function syncHeartRate() {
    const startDate = await getLastSyncDate('heart_rate', 'timestamp');
    const today = new Date();
    console.log(`\n❤️  Heart Rate: syncing from ${formatDate(startDate)} to ${formatDate(today)}`);

    let current = new Date(startDate);
    let totalRows = 0;

    while (current <= today) {
        const date = formatDate(current);
        const { status, body } = await fitbitGetSafe(`/1/user/-/activities/heart/date/${date}/1d/1sec.json`);

        if (status === 200) {
            const dataset = body?.['activities-heart-intraday']?.dataset || [];
            const rows = dataset.map(d => ({
                timestamp: new Date(`${date}T${d.time}`).toISOString(),
                beats_per_minute: String(d.value),
                data_source: 'Fitbit API'
            }));

            if (rows.length > 0) {
                for (let i = 0; i < rows.length; i += 500) {
                    const chunk = rows.slice(i, i + 500);
                    await sql`
                        INSERT INTO heart_rate (timestamp, beats_per_minute, data_source) 
                        SELECT x.ts::timestamptz, x.bpm::numeric, x.src 
                        FROM (VALUES ${sql(chunk.map(r => [r.timestamp, r.beats_per_minute, r.data_source]))}) AS x(ts, bpm, src)
                        ON CONFLICT DO NOTHING
                    `;
                }
                totalRows += rows.length;
            }
        } else if (status === 429) {
            console.log('   ⏳ Rate limited — stopping for now. Run again later.');
            break;
        }

        current = addDays(current, 1);
    }
    console.log(`   ✅ Inserted ${totalRows} new heart rate records`);
}

// ── Sync: Calories (intraday 1min) ────────────────────────────────────────────
async function syncCalories() {
    const startDate = await getLastSyncDate('calories', 'timestamp');
    const today = new Date();
    console.log(`\n🔥 Calories: syncing from ${formatDate(startDate)} to ${formatDate(today)}`);

    let current = new Date(startDate);
    let totalRows = 0;

    while (current <= today) {
        const date = formatDate(current);
        const { status, body } = await fitbitGetSafe(`/1/user/-/activities/calories/date/${date}/1d/1min.json`);

        if (status === 200) {
            const dataset = body?.['activities-calories-intraday']?.dataset || [];
            const rows = dataset
                .filter(d => d.value > 0)
                .map(d => ({
                    timestamp: new Date(`${date}T${d.time}`).toISOString(),
                    calories: String(d.value),
                    data_source: 'Fitbit API'
                }));

            if (rows.length > 0) {
                await sql`
                    INSERT INTO calories (timestamp, calories, data_source)
                    SELECT x.ts::timestamptz, x.cal::numeric, x.src
                    FROM (VALUES ${sql(rows.map(r => [r.timestamp, r.calories, r.data_source]))}) AS x(ts, cal, src)
                    ON CONFLICT DO NOTHING
                `;
                totalRows += rows.length;
            }
        } else if (status === 429) {
            console.log('   ⏳ Rate limited. Run again later.');
            break;
        }

        current = addDays(current, 1);
    }
    console.log(`   ✅ Inserted ${totalRows} new calorie records`);
}

// ── Sync: Sleep stages (with dedup fix) ────────────────────────────────
async function syncSleep() {
    const startDate = await getLastSyncDate('usersleepstages', 'sleep_stage_start');
    const today = new Date();
    // Fitbit sleep API supports 100-day ranges max
    const rangeEnd = new Date(Math.min(addDays(startDate, 99).getTime(), today.getTime()));
    console.log(`\n😴 Sleep: syncing from ${formatDate(startDate)} to ${formatDate(rangeEnd)}`);

    const { status, body } = await fitbitGetSafe(
        `/1.2/user/-/sleep/date/${formatDate(startDate)}/${formatDate(rangeEnd)}.json`
    );

    if (status !== 200) {
        console.log(`   ⚠️  Sleep API returned ${status}`);
        return;
    }

    const sessions = body?.sleep || [];
    if (sessions.length === 0) {
        console.log('   ✅ No new sleep sessions to sync');
        return;
    }

    // DEDUP FIX: delete any existing 'Fitbit API' records for these sleep_ids
    // before re-inserting, so we never accumulate duplicate API sessions
    const logIds = sessions.map(s => String(s.logId));
    await sql`DELETE FROM usersleepstages WHERE sleep_id = ANY(${logIds}) AND data_source = 'Fitbit API'`;

    let totalRows = 0;
    for (const session of sessions) {
        const stages = session.levels?.data || [];
        const rows = stages.map(s => ({
            sleep_id: String(session.logId),
            sleep_stage_id: String(s.dateTime).replace(/\D/g, '') + String(session.logId).slice(-4),
            sleep_stage_type: s.level.toUpperCase(),
            start_utc_offset: (session.startTime || '').slice(-6) || '+00:00',
            sleep_stage_start: new Date(s.dateTime).toISOString(),
            end_utc_offset: (session.endTime || '').slice(-6) || '+00:00',
            sleep_stage_end: new Date(new Date(s.dateTime).getTime() + s.seconds * 1000).toISOString(),
            data_source: 'Fitbit API',
            algorithm_version: 'none',
            sleep_stage_created: new Date().toISOString(),
            sleep_stage_last_updated: new Date().toISOString()
        }));

        if (rows.length > 0) {
            await sql`INSERT INTO usersleepstages ${sql(rows)} ON CONFLICT DO NOTHING`;
            totalRows += rows.length;
        }
    }
    console.log(`   ✅ Inserted ${totalRows} new sleep stage records from ${sessions.length} sessions`);
}

// ── Sync: Active Zone Minutes ─────────────────────────────────────────────────
async function syncActiveZoneMinutes() {
    const startDate = await getLastSyncDate('active_zone_minutes', 'date_time');
    const today = new Date();
    console.log(`\n⚡ Active Zone Minutes: syncing from ${formatDate(startDate)} to ${formatDate(today)}`);

    const { status, body } = await fitbitGetSafe(
        `/1/user/-/activities/active-zone-minutes/date/${formatDate(startDate)}/${formatDate(today)}.json`
    );

    if (status !== 200) { console.log(`   ⚠️  AZM API returned ${status}: ${JSON.stringify(body)}`); return; }

    // The API returns a flat list: [{dateTime, value: {fatBurnActiveZoneMinutes, cardioActiveZoneMinutes, peakActiveZoneMinutes, activeZoneMinutes}}]
    const days = body?.['activities-active-zone-minutes'] || [];
    let totalRows = 0;

    for (const day of days) {
        const val = day.value || {};
        // Map each zone type individually
        const zoneMap = [
            { type: 'FAT_BURN',  minutes: val.fatBurnActiveZoneMinutes },
            { type: 'CARDIO',    minutes: val.cardioActiveZoneMinutes },
            { type: 'PEAK',      minutes: val.peakActiveZoneMinutes },
        ];

        for (const zone of zoneMap) {
            if (zone.minutes > 0) {
                await sql`
                    INSERT INTO active_zone_minutes (date_time, heart_zone_id, total_minutes)
                    VALUES (${new Date(day.dateTime).toISOString()}, ${zone.type}, ${String(zone.minutes)})
                    ON CONFLICT DO NOTHING
                `;
                totalRows++;
            }
        }
    }
    console.log(`   ✅ Inserted ${totalRows} new AZM records`);
}

// ── Sync: SpO2 ────────────────────────────────────────────────────────────────
async function syncSpO2() {
    const startDate = await getLastSyncDate('oxygen_saturation', 'timestamp');
    const today = new Date();
    // SpO2 max range is 30 days
    const rangeEnd = new Date(Math.min(addDays(startDate, 29).getTime(), today.getTime()));
    console.log(`\n🫁 SpO2: syncing from ${formatDate(startDate)} to ${formatDate(rangeEnd)}`);

    const { status, body } = await fitbitGetSafe(
        `/1/user/-/spo2/date/${formatDate(startDate)}/${formatDate(rangeEnd)}/minutely.json`
    );

    if (status !== 200) { console.log(`   ⚠️  SpO2 API returned ${status}`); return; }

    const records = Array.isArray(body) ? body : [];
    let totalRows = 0;

    for (const day of records) {
        const minutes = day.minutes || [];
        const rows = minutes.map(m => ({
            timestamp: new Date(m.minute).toISOString(),
            oxygen_saturation_percentage: String(m.value),
            data_source: 'Fitbit API'
        }));

        if (rows.length > 0) {
            await sql`INSERT INTO oxygen_saturation ${sql(rows)} ON CONFLICT DO NOTHING`;
            totalRows += rows.length;
        }
    }
    console.log(`   ✅ Inserted ${totalRows} new SpO2 records`);
}

// ── Sync: Heart Rate Variability ──────────────────────────────────────────────
async function syncHRV() {
    const startDate = await getLastSyncDate('heart_rate_variability', 'timestamp');
    const today = new Date();
    const rangeEnd = new Date(Math.min(addDays(startDate, 29).getTime(), today.getTime()));
    console.log(`\n💓 HRV: syncing from ${formatDate(startDate)} to ${formatDate(rangeEnd)}`);

    const { status, body } = await fitbitGetSafe(
        `/1/user/-/hrv/date/${formatDate(startDate)}/${formatDate(rangeEnd)}.json`
    );

    if (status !== 200) { console.log(`   ⚠️  HRV API returned ${status}`); return; }

    const records = body?.hrv || [];
    let totalRows = 0;

    for (const day of records) {
        const readings = day.minutes || [];
        const rows = readings.map(m => ({
            timestamp: new Date(m.minute).toISOString(),
            root_mean_square_of_successive_differences_milliseconds: String(m.value?.rmssd ?? 0),
            standard_deviation_milliseconds: String(m.value?.coverage ?? 0),
            data_source: 'Fitbit API'
        }));
        if (rows.length > 0) {
            await sql`INSERT INTO heart_rate_variability ${sql(rows)} ON CONFLICT DO NOTHING`;
            totalRows += rows.length;
        }
    }
    console.log(`   ✅ Inserted ${totalRows} new HRV records`);
}

// ── Sync: Skin Temperature ────────────────────────────────────────────────────
async function syncTemperature() {
    const startDate = await getLastSyncDate('device_temperature', 'recorded_time');
    const today = new Date();
    const rangeEnd = new Date(Math.min(addDays(startDate, 29).getTime(), today.getTime()));
    console.log(`\n🌡️  Temperature: syncing from ${formatDate(startDate)} to ${formatDate(rangeEnd)}`);

    const { status, body } = await fitbitGetSafe(
        `/1/user/-/temp/skin/date/${formatDate(startDate)}/${formatDate(rangeEnd)}.json`
    );

    if (status !== 200) { console.log(`   ⚠️  Temperature API returned ${status}`); return; }

    const records = body?.tempSkin || [];
    let totalRows = 0;

    for (const day of records) {
        if (day.value?.nightlyRelative != null) {
            await sql`
                INSERT INTO device_temperature (recorded_time, temperature, sensor_type)
                VALUES (${new Date(day.dateTime).toISOString()}, ${String(day.value.nightlyRelative)}, ${'Fitbit API'})
                ON CONFLICT DO NOTHING
            `;
            totalRows++;
        }
    }
    console.log(`   ✅ Inserted ${totalRows} new temperature records`);
}

// ── Sync: Distance (intraday 1min) ────────────────────────────────────────────
async function syncDistance() {
    const startDate = await getLastSyncDate('distance', 'timestamp');
    const today = new Date();
    console.log(`\n📍 Distance: syncing from ${formatDate(startDate)} to ${formatDate(today)}`);

    let current = new Date(startDate);
    let totalRows = 0;

    while (current <= today) {
        const date = formatDate(current);
        const { status, body } = await fitbitGetSafe(`/1/user/-/activities/distance/date/${date}/1d/1min.json`);

        if (status === 200) {
            const dataset = body?.['activities-distance-intraday']?.dataset || [];
            const rows = dataset
                .filter(d => d.value > 0)
                .map(d => ({
                    timestamp: new Date(`${date}T${d.time}`).toISOString(),
                    distance: String(d.value),
                    data_source: 'Fitbit API'
                }));
            if (rows.length > 0) {
                await sql`
                    INSERT INTO distance (timestamp, distance, data_source)
                    SELECT x.ts::timestamptz, x.dist::numeric, x.src
                    FROM (VALUES ${sql(rows.map(r => [r.timestamp, r.distance, r.data_source]))}) AS x(ts, dist, src)
                    ON CONFLICT DO NOTHING
                `;
                totalRows += rows.length;
            }
        } else if (status === 429) {
            console.log('   ⏳ Rate limited. Run again later.');
            break;
        }
        current = addDays(current, 1);
    }
    console.log(`   ✅ Inserted ${totalRows} new distance records`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
    console.log('🔄 Starting smart Fitbit sync...');
    console.log('   Each metric will sync from its last known DB date forward.\n');

    const metrics = [
        { name: 'Steps',               fn: syncSteps },
        { name: 'Heart Rate',          fn: syncHeartRate },
        { name: 'Calories',            fn: syncCalories },
        { name: 'Distance',            fn: syncDistance },
        { name: 'Sleep',               fn: syncSleep },
        { name: 'Active Zone Minutes', fn: syncActiveZoneMinutes },
        { name: 'SpO2',                fn: syncSpO2 },
        { name: 'HRV',                 fn: syncHRV },
        { name: 'Temperature',         fn: syncTemperature },
    ];

    for (const metric of metrics) {
        try {
            await metric.fn();
        } catch (err) {
            console.error(`\n❌ Error syncing ${metric.name}: ${err.message}`);
        }
    }

    console.log('\n🎉 Sync complete!\n');
    await sql.end();
}

run();
