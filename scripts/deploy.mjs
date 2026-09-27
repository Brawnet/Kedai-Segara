// Deploy ke deployment yang SUDAH ADA agar URL tablet tidak berubah.
// ID diambil dari env SEGARA_DEPLOYMENT_ID atau field "deploymentId" di .clasp.json.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let id = process.env.SEGARA_DEPLOYMENT_ID || '';
if (!id) {
  try {
    id = JSON.parse(readFileSync('.clasp.json', 'utf8')).deploymentId || '';
  } catch {
    // .clasp.json belum ada
  }
}
if (!id) {
  console.error(
    'Deployment ID belum diisi.\n' +
      'Isi "deploymentId" di .clasp.json (lihat: npx clasp deployments) atau set SEGARA_DEPLOYMENT_ID.',
  );
  process.exit(1);
}

if (!/^[\w-]+$/.test(id)) {
  console.error('Deployment ID tidak valid: ' + id);
  process.exit(1);
}

const win = process.platform === 'win32';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: win });
const desc = 'Stok Segara ' + new Date().toISOString().slice(0, 16).replace('T', ' ');

run('npm', ['run', 'push']);
run('npx', ['clasp', 'redeploy', id, '-d', win ? `"${desc}"` : desc]);
console.log('\nSelesai. URL web app tetap sama.');
