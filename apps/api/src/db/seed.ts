import process from 'node:process';
import { loadSeedPacks } from '@kitchen/recipes';
import { createDb, type Database } from './client';
import { recipePacks, recipes } from './schema';

/**
 * Seeds the corpus from the bundled packs.
 *
 * Idempotent by content hash: running it twice leaves the database where the first run
 * left it. A seed that duplicates on re-run is a seed people stop trusting, and then stop
 * running, and then the local environment drifts from everyone else's.
 */

export type SeedResult = { packs: number; recipes: number; skipped: number };

export const seedCorpus = async (db: Database): Promise<SeedResult> => {
  const { packs, warnings } = loadSeedPacks();
  for (const w of warnings) process.stderr.write(`warning: ${w.packId}: ${w.message}\n`);

  let recipeCount = 0;
  let skipped = 0;

  for (const pack of packs) {
    const inserted = await db
      .insert(recipePacks)
      .values({
        id: pack.packId,
        name: pack.name,
        version: pack.version,
        contentHash: pack.contentHash,
        provenance: pack.provenance,
        visibility: 'public',
      })
      // Identity is the content hash, so an unchanged pack is a no-op.
      .onConflictDoNothing({ target: recipePacks.contentHash })
      .returning({ id: recipePacks.id });

    if (inserted.length === 0) {
      skipped++;
      continue;
    }

    for (const recipe of pack.recipes) {
      await db
        .insert(recipes)
        .values({
          id: recipe.id,
          packId: pack.packId,
          ir: recipe,
          canonicalName: recipe.title,
          kind: recipe.kind,
        })
        .onConflictDoNothing({ target: recipes.id });
      recipeCount++;
    }
  }

  return { packs: packs.length - skipped, recipes: recipeCount, skipped };
};

const isEntryPoint = process.argv[1]?.endsWith('seed.ts') ?? false;
if (isEntryPoint) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    process.stderr.write('DATABASE_URL is not set.\n');
    process.exit(1);
  }
  const handle = createDb(url, { max: 1 });
  seedCorpus(handle.db)
    .then(async (result) => {
      process.stdout.write(
        `seeded ${result.packs} pack(s), ${result.recipes} recipe(s)` +
          (result.skipped > 0 ? `, ${result.skipped} already present\n` : '\n'),
      );
      await handle.close();
      process.exit(0);
    })
    .catch(async (err: unknown) => {
      process.stderr.write(`seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
      await handle.close();
      process.exit(1);
    });
}
