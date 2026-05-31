/** Riduce foto/scansioni JPEG prima dell'upload (meno 502 / timeout su Edge Function). */
const MAX_EDGE_PX = 2040;
const JPEG_QUALITY = 0.82;
/** Sotto questa soglia e già piccola, non ricomprimere. */
const SKIP_BELOW_BYTES = 350_000;

function isRasterImage(file) {
  const mime = (file.type || '').toLowerCase();
  const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
  return mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
}

/**
 * @param {File[]} files
 * @returns {Promise<File[]>}
 */
export async function prepareFilesForImport(files) {
  const out = [];
  for (const file of files) {
    if (isRasterImage(file)) {
      try {
        out.push(await compressImageFile(file));
      } catch {
        out.push(file);
      }
    } else {
      out.push(file);
    }
  }
  return out;
}

/**
 * @param {File} file
 * @returns {Promise<File>}
 */
async function compressImageFile(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (file.size <= SKIP_BELOW_BYTES && longEdge <= MAX_EDGE_PX) {
      return file;
    }
    const scale = Math.min(1, MAX_EDGE_PX / longEdge);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('Compressione fallita'))),
        'image/jpeg',
        JPEG_QUALITY
      );
    });
    const base = (file.name || 'immagine').replace(/\.[^.]+$/i, '') || 'immagine';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    bitmap.close?.();
  }
}
