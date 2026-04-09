require('dotenv').config();
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const url = process.env.DATABASE_URL;
if (!url) { console.error("Missing DATABASE_URL"); process.exit(1); }

const sql = postgres(url, {});

function sanitizeName(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function extractBaseTableName(fileName) {
    let name = path.parse(fileName).name;
    // Handle: "Daily Heart Rate Variability Summary - 2020-11-(16)"
    name = name.replace(/\s*[-_]\s*\d{4}[-_]\d{2}[-_]\(?\d{1,2}\)?$/, '');
    name = name.replace(/\s*[-_]\s*\d{4}[-_]\d{2}$/, '');
    name = name.replace(/\s*[-_]\s*\d{4}$/, '');
    return sanitizeName(name);
}

function isDate(val) {
    if (!val || val.trim() === '') return false;
    if (!val.includes('-') && !val.includes('/') && !val.includes(':')) return false;
    return !isNaN(new Date(val).valueOf());
}

function isNumeric(val) {
    if (!val || val.trim() === '') return false;
    return !isNaN(Number(val));
}

const seenTables = new Set();

async function inferSchemaAndInsert(filePath, fileName) {
    const tableName = extractBaseTableName(fileName);
    console.log(`\n⏳ Processing ${fileName} -> table: ${tableName}`);

    return new Promise((resolve) => {
        const rows = [];
        let headers = [];

        fs.createReadStream(filePath)
            .pipe(csv({ mapHeaders: ({ header, index }) => sanitizeName(header) || `col_${index}` }))
            .on('headers', (h) => {
                const unique = []; const seen = new Set();
                for (let col of h) {
                    let u = col; let i = 1;
                    while (seen.has(u)) { u = `${col}_${i}`; i++; }
                    seen.add(u); unique.push(u);
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
                if (rows.length === 0) { console.log(`   ⏭️  Skipping empty: ${fileName}`); return resolve(); }

                try {
                    if (!seenTables.has(tableName)) {
                        const types = {};
                        for (const h of headers) {
                            let allNum = true, allDate = true, hasVal = false;
                            for (const r of rows) {
                                if (r[h] !== null) {
                                    hasVal = true;
                                    if (!isNumeric(r[h])) allNum = false;
                                    if (!isDate(r[h])) allDate = false;
                                }
                            }
                            types[h] = hasVal ? (allNum ? 'NUMERIC' : allDate ? 'TIMESTAMPTZ' : 'TEXT') : 'TEXT';
                        }
                        const cols = headers.map(h => `"${h}" ${types[h]}`).join(',\n');
                        await sql.unsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
                        await sql.unsafe(`CREATE TABLE "${tableName}" (_raw_id SERIAL PRIMARY KEY,\n${cols})`);
                        seenTables.add(tableName);
                        console.log(`   🏗️  Created table: "${tableName}"`);
                    }

                    for (let i = 0; i < rows.length; i += 500) {
                        await sql`INSERT INTO ${sql(tableName)} ${sql(rows.slice(i, i + 500))}`;
                    }
                    console.log(`   ✅ Migrated ${rows.length} rows into "${tableName}"`);
                } catch (e) {
                    console.error(`   ❌ Failed: ${e.message}`);
                }
                resolve();
            })
            .on('error', (e) => { console.error(`   ❌ Stream error: ${e.message}`); resolve(); });
    });
}

async function run() {
    const targetDir = path.join(__dirname, 'Heart Rate Variability');
    const files = fs.readdirSync(targetDir)
        .filter(f => f.toLowerCase().endsWith('.csv'))
        .map(f => ({ filePath: path.join(targetDir, f), fileName: f }));

    console.log(`Found ${files.length} HRV files to consolidate...`);
    for (const file of files) await inferSchemaAndInsert(file.filePath, file.fileName);
    console.log('\n🎉 HRV consolidation complete!');
    await sql.end();
}

run();
