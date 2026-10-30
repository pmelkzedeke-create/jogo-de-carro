/**
 * Copia os decodificadores DRACO e Basis/KTX2 do pacote three para public/assets/decoders,
 * para que o GLTFLoader funcione offline e sem CDNs externos. Executado antes de dev/build.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const libs = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs');
const target = join(root, 'public', 'assets', 'decoders');
const pairs = [
  [join(libs, 'draco', 'gltf'), join(target, 'draco')],
  [join(libs, 'basis'), join(target, 'basis')],
];
for (const [from, to] of pairs) {
  if (!existsSync(from)) {
    console.error(`[decoders] Pasta não encontrada: ${from}. Execute "npm install".`);
    process.exit(1);
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith('README.md') });
}
console.log('[decoders] DRACO e Basis copiados para public/assets/decoders');
