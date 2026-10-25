/**
 * Deletes the local SQLite database so the app returns to first-run setup.
 * Usage: npm run reset   (asks for confirmation unless --yes is passed)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const file = process.env.DB_FILE || path.resolve('server/data/hcm.db');
const yes = process.argv.includes('--yes');

if (!yes) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Delete ${file} and all local data? (y/N) `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Cancelled.');
    process.exit(0);
  }
}

for (const suffix of ['', '-wal', '-shm']) {
  const target = `${file}${suffix}`;
  if (fs.existsSync(target)) {
    fs.rmSync(target);
    console.log(`removed ${target}`);
  }
}
console.log('Done. The next run will start at first-run setup.');
