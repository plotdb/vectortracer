/**
 * Bundle step: pkg/api.js + pkg/vectortracer_bg.wasm → pkg/vectortracer.bundle.js
 *
 * Called by ./build after wasm-pack and js copy steps.
 * Inlines WASM as base64 so the bundle is fully self-contained.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.join(__dirname, 'pkg');

// --- read & encode WASM ---
const wasmB64 = readFileSync(path.join(pkgDir, 'vectortracer_bg.wasm')).toString('base64');

// --- write temp bundle entry inside pkg/ so relative imports resolve correctly ---
const entryPath = path.join(pkgDir, '_bundle_entry_.mjs');
writeFileSync(entryPath, `
import { trace, _setWasmInput } from './api.js';
const bytes = Uint8Array.from(atob("${wasmB64}"), c => c.charCodeAt(0));
_setWasmInput(bytes);
export { trace };
`);

const outfile = path.join(pkgDir, 'vectortracer.bundle.js');

try {
  execSync(
    `npx --yes esbuild "${entryPath}" --bundle --format=iife --global-name=vectortracer --log-level=error --outfile="${outfile}"`,
    { stdio: 'inherit', cwd: pkgDir }
  );
  const size = (readFileSync(outfile).length / 1024).toFixed(1);
  console.log(`  vectortracer.bundle.js  (${size} KB)`);
} finally {
  unlinkSync(entryPath);
}
