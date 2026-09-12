/**
 * Publishes public/registry/index.json -- the static pack registry.
 *
 * Adding a community pack is a pull request that drops a JSON file next to the others and
 * re-runs this. No backend, no database, no account.
 *
 * Run: node scripts/build-registry-index.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seedDir = path.join(root, 'src/recipes/seed');
const publicPackDir = path.join(root, 'public/registry/packs');
mkdirSync(publicPackDir, { recursive: true });

const files = readdirSync(seedDir).filter((f) => f.endsWith('.json')).sort();

const entries = files.map((file) => {
  const full = path.join(seedDir, file);
  const pack = JSON.parse(readFileSync(full, 'utf8'));
  // Serve a copy from public/ so a pack is downloadable without bundling.
  copyFileSync(full, path.join(publicPackDir, file));
  const kinds = {};
  for (const r of pack.recipes) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  return {
    packId: pack.packId,
    name: pack.name,
    description: pack.description,
    version: pack.version,
    locale: pack.locale,
    provenance: pack.provenance,
    contentHash: pack.contentHash,
    recipeCount: pack.recipes.length,
    kinds,
    bytes: statSync(full).size,
    url: `packs/${file}`,
  };
});

const index = {
  registryVersion: 1,
  description:
    'Kitchen Compiler recipe packs. A pack is a JSON file of structured recipes; add one by opening a pull request with the file and an entry here.',
  packs: entries,
};

writeFileSync(path.join(root, 'public/registry/index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`registry: ${entries.length} packs, ${entries.reduce((n, e) => n + e.recipeCount, 0)} recipes`);
for (const e of entries) console.log(`  ${e.packId.padEnd(22)} ${e.recipeCount} recipes  ${(e.bytes / 1024).toFixed(1)}kB  ${e.url}`);
