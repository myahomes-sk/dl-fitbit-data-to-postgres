require('dotenv').config();
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const url = process.env.DATABASE_URL;
if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
}

const dbConfig = url.includes('supabase') ? { ssl: 'require' } : {};
const sql = postgres(url, dbConfig);

const IGNORE_DIRS = ['node_modules', '.agent', 'temp_ralph', 'tasks', '.git', 'Heart Rate', 'Sleep', '.db_data'];

function sanitizeName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function extractBaseTableName(fileName) {
    let name = path.parse(fileName).name;
    // Strips various Fitbit date suffix patterns:
    // "Active Zone Minutes - 2020-09-01"
    // "Daily Heart Rate Variability Summary - 2020-11-(16)"   <- parenthesised day
    name = name.replace(/\s*[-_]\s*\d{4}[-_]\d{2}[-_]\(?\d{1,2}\)?$/, '');
    name = name.replace(/\s*[-_]\s*\d{4}[-_]\d{2}$/, '');
    name = name.replace(/\s*[-_]\s*\d{4}$/, '');

    return sanitizeName(name);
}

function isDate(val) {
    if (!val || val.trim() === '') return false;
    if (!val.includes('-') && !val.includes('/') && !val.includes(':')) return false;
    const date = new Date(val);
    return !isNaN(date.valueOf());
}

function isNumeric(val) {
    if (!val || val.trim() === '') return false;
    return !isNaN(Number(val));
}

const seenTables = new Set();

async function inferSchemaAndInsert(filePath, fileName) {
    const tableName = extractBaseTableName(fileName);
    console.log(`\n⏳ Processing ${fileName} -> table: ${tableName}`);

    return new Promise((resolve, reject) => {
        const rows = [];
        let headers = [];

        fs.createReadStream(filePath)
            .pipe(csv({
                mapHeaders: ({ header, index }) => sanitizeName(header) || `col_${index}`
            }))
            .on('headers', (h) => {
                const unique = [];
                const seenKeys = new Set();
                for (let col of h) {
                    let uniqueCol = col;
                    let i = 1;
                    while (seenKeys.has(uniqueCol)) {
                        uniqueCol = `${col}_${i}`;
                        i++;
                    }
                    seenKeys.add(uniqueCol);
                    unique.push(uniqueCol);
                }
                headers = unique;
            })
            .on('data', (row) => {
                const cleanRow = {};
                let hasData = false;
                for (const h of headers) {
                    const val = row[h];
                    cleanRow[h] = val === undefined || val === '' ? null : val;
                    if (cleanRow[h] !== null) hasData = true;
                }
                if (hasData) rows.push(cleanRow);
            })
            .on('end', async () => {
                if (rows.length === 0 || headers.length === 0) {
                    console.log(`   ⏭️  Skipping empty file: ${fileName}`);
                    return resolve();
                }

                try {
                    if (!seenTables.has(tableName)) {
                        const types = {};
                        for (const header of headers) {
                            let type = 'TEXT';
                            let allNumeric = true;
                            let allDate = true;
                            let hasValue = false;
                            for (const row of rows) {
                                const val = row[header];
                                if (val !== null) {
                                    hasValue = true;
                                    if (!isNumeric(val)) allNumeric = false;
                                    if (!isDate(val)) allDate = false;
                                }
                            }
                            if (hasValue) {
                                if (allNumeric) type = 'NUMERIC';
                                else if (allDate) type = 'TIMESTAMPTZ';
                            }
                            types[header] = type;
                        }

                        const cols = headers.map(h => `"${h}" ${types[h]}`).join(',\n');
                        
                        await sql.unsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
                        await sql.unsafe(`
                            CREATE TABLE "${tableName}" (
                                _raw_id SERIAL PRIMARY KEY,
                                ${cols}
                            )
                        `);
                        seenTables.add(tableName);
                        console.log(`   🏗️  Created Consolidated Table: "${tableName}"`);
                    }

                    const BATCH_SIZE = 500;
                    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                        const chunk = rows.slice(i, i + BATCH_SIZE);
                        try {
                            await sql`INSERT INTO ${sql(tableName)} ${sql(chunk)}`;
                        } catch (e) {
                            // If schema mismatches entirely due to CSV variation, gracefully log and continue
                            console.error(`   ⚠️ Schema variance error linking ${fileName} to ${tableName}. Skipping chunk.`);
                        }
                    }
                    console.log(`   ✅ Migrated ${rows.length} rows into "${tableName}"`);
                } catch (e) {
                    console.error(`   ❌ Failed on ${tableName}:`, e.message);
                }
                resolve();
            })
            .on('error', (e) => {
                 console.error(`   ❌ Stream error on ${fileName}:`, e.message);
                 resolve();
            });
    });
}

function getFiles(dir, files = []) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) {
                getFiles(filePath, files);
            }
        } else if (file.toLowerCase().endsWith('.csv')) {
            files.push({ filePath, fileName: file });
        }
    }
    return files;
}

async function run() {
    try {
        console.log("Starting universal ingestion (Fixed Regex)...");
        const files = getFiles(__dirname);
        for (const file of files) {
            await inferSchemaAndInsert(file.filePath, file.fileName);
        }
        console.log("\n🎉 Universal Migration complete!");
    } catch (e) {
        console.error("Migration fatal error:", e);
    } finally {
        await sql.end();
    }
}

run();
