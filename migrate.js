require('dotenv').config();
const postgres = require('postgres');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const url = process.env.DATABASE_URL;
if (!url) {
    console.error("Missing DATABASE_URL in .env");
    process.exit(1);
}

// Disable SSL for localhost, but use ssl: 'require' for Supabase remote connections
const dbConfig = url.includes('supabase.co') || url.includes('supabase.com') ? { ssl: 'require' } : {};
const sql = postgres(url, dbConfig);

async function createSchemas() {
    await sql`
        CREATE TABLE IF NOT EXISTS heart_rate_alerts (
            id BIGINT PRIMARY KEY,
            start_timestamp TIMESTAMPTZ,
            end_timestamp TIMESTAMPTZ,
            type TEXT,
            threshold INT,
            value INT
        );
    `;
    console.log("✅ Created heart_rate_alerts schema");

    await sql`
        CREATE TABLE IF NOT EXISTS sleep_profiles (
            creation_date DATE PRIMARY KEY,
            sleep_type TEXT,
            deep_sleep NUMERIC,
            rem_sleep NUMERIC,
            sleep_duration NUMERIC,
            sleep_start_time NUMERIC,
            schedule_variability NUMERIC,
            restorative_sleep NUMERIC,
            time_before_sound_sleep NUMERIC,
            sleep_stability NUMERIC,
            nights_with_long_awakenings NUMERIC,
            days_with_naps NUMERIC
        );
    `;
    console.log("✅ Created sleep_profiles schema");
}

async function migrateHeartRate() {
    return new Promise((resolve, reject) => {
        const rows = [];
        const filePath = path.join(__dirname, 'Heart Rate', 'Heart Rate Notifications Alerts.csv');
        
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ File not found: ${filePath}`);
            return resolve();
        }

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                if (row.id) {
                    const cleanRow = {};
                    for (const key of Object.keys(row)) {
                        cleanRow[key] = row[key] === '' ? null : row[key];
                    }
                    rows.push(cleanRow);
                }
            })
            .on('end', async () => {
                if (rows.length > 0) {
                    try {
                        for (let i = 0; i < rows.length; i += 500) {
                            const chunk = rows.slice(i, i + 500);
                            await sql`
                                INSERT INTO heart_rate_alerts ${sql(chunk)}
                                ON CONFLICT (id) DO NOTHING
                            `;
                        }
                        console.log(`✅ Migrated ${rows.length} Heart Rate Alerts`);
                    } catch (e) {
                         console.error("Error migrating Heart Rate Alerts:", e);
                         return reject(e);
                    }
                } else {
                    console.log("ℹ️ No Heart Rate Alerts to migrate");
                }
                resolve();
            });
    });
}

async function migrateSleepProfiles() {
    return new Promise((resolve, reject) => {
        const rows = [];
        const filePath = path.join(__dirname, 'Sleep', 'Sleep Profile.csv');
        
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️ File not found: ${filePath}`);
            return resolve();
        }

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                if (row.creation_date) {
                    const cleanRow = {};
                    for (const key of Object.keys(row)) {
                        cleanRow[key] = row[key] === '' ? null : row[key];
                    }
                    rows.push(cleanRow);
                }
            })
            .on('end', async () => {
                if (rows.length > 0) {
                    try {
                         for (let i = 0; i < rows.length; i += 500) {
                            const chunk = rows.slice(i, i + 500);
                            await sql`
                                INSERT INTO sleep_profiles ${sql(chunk)}
                                ON CONFLICT (creation_date) DO NOTHING
                            `;
                        }
                        console.log(`✅ Migrated ${rows.length} Sleep Profiles`);
                    } catch (e) {
                         console.error("Error migrating Sleep Profiles:", e);
                         return reject(e);
                    }
                } else {
                     console.log("ℹ️ No Sleep Profiles to migrate");
                }
                resolve();
            });
    });
}

async function run() {
    try {
        console.log("Starting migration...");
        await createSchemas();
        await migrateHeartRate();
        await migrateSleepProfiles();
        console.log("🎉 Migration fully complete!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await sql.end();
    }
}

run();
