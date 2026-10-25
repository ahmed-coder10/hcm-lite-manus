/**
 * Runs the API and the Vite dev server together with one command:
 *   npm run dev
 * Ctrl+C stops both. No extra dependencies.
 */
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];

const run = (label, args, color) => {
  const child = spawn(npm, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n[${label}] exited with code ${code}`);
    }
    shutdown(code ?? 0);
  });
  children.push(child);
};

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (!c.killed) c.kill();
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`
  HCM Lite — starting API + web client
  ────────────────────────────────────
  API    http://localhost:5000/api/health
  Web    http://localhost:5173
`);

run('api', ['--prefix', 'server', 'run', 'dev']);
run('web', ['--prefix', 'client', 'run', 'dev']);
