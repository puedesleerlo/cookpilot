import { contentHash, type RecipePack } from '@kitchen/domain';

/**
 * Export a pack as a file the user owns.
 *
 * The hash is recomputed on the way out rather than copied, so an exported pack is always
 * self-consistent even if the one in memory was hand-edited and warned about on load.
 */
export const packToJson = (pack: RecipePack): string =>
  JSON.stringify({ ...pack, contentHash: contentHash(pack.recipes) }, null, 2);

export const packFilename = (pack: RecipePack): string => `${pack.packId}-${pack.version}.json`;

/**
 * Hand the file to the browser. Returns false where downloads are unavailable — an
 * artifact viewer sandbox, for instance — so the caller can offer copy-to-clipboard
 * instead of a link that silently does nothing.
 */
export const downloadPack = (pack: RecipePack): boolean => {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  try {
    const blob = new Blob([packToJson(pack)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = packFilename(pack);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
};
