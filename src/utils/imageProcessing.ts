/**
 * Client-side image optimisation for admin uploads.
 *
 * The admin panel used to reject any picture over 2MB, which meant a photo
 * straight off a phone camera could never be used. Instead of refusing the
 * file we downscale and re-encode it in the browser, so the operator can pick
 * any normal photo and still end up with a small, fast-loading dish image.
 */

/** Anything larger than this is refused outright: decoding it would blow up the tab. */
export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;

const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45];

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileToDataUrl(file): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

type DecodedImage = CanvasImageSource & {
  width?: number; height?: number;
  naturalWidth?: number; naturalHeight?: number;
  close?: () => void;
};

async function loadBitmap(file): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch (_error) {
      // Safari/older engines: fall through to the <img> decode path.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This file could not be decoded as an image.'));
      img.src = objectUrl;
    });
  } finally {
    // Revoked on the next tick so the decoded image stays usable for drawImage.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

function drawScaled(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Photos re-encoded as JPEG have no alpha channel, so flatten onto white
  // rather than letting transparent PNG areas turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas, mimeType, quality): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Image encoding failed.'))),
      mimeType,
      quality
    );
  });
}

/**
 * Downscale + re-encode an image until it fits `maxBytes`.
 *
 * @returns {Promise<{blob: Blob, dataUrl: string, width: number, height: number, bytes: number, type: string, originalBytes: number}>}
 */
export async function compressImage(
  file,
  options: { maxDimension?: number; maxBytes?: number; mimeType?: string } = {}
) {
  const {
    maxDimension = 1280,
    maxBytes = 400 * 1024,
    mimeType = 'image/jpeg'
  } = options;

  if (!file) throw new Error('No file selected.');
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error(`Image is ${formatBytes(file.size)}. Please pick one under ${formatBytes(MAX_SOURCE_IMAGE_BYTES)}.`);
  }

  // SVGs are vectors: rasterising them only loses quality, and they are tiny.
  if (file.type === 'image/svg+xml') {
    const dataUrl = await fileToDataUrl(file);
    return {
      blob: file,
      dataUrl,
      width: 0,
      height: 0,
      bytes: file.size,
      type: file.type,
      originalBytes: file.size
    };
  }

  const bitmap = await loadBitmap(file);
  const sourceWidth = bitmap.width || bitmap.naturalWidth || 0;
  const sourceHeight = bitmap.height || bitmap.naturalHeight || 0;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('This file could not be decoded as an image.');
  }

  let scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  let best = null;

  // Try progressively lower quality; if even the lowest quality is too big,
  // halve the dimensions and start over (at most three times).
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = drawScaled(bitmap, sourceWidth * scale, sourceHeight * scale);
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, mimeType, quality);
      best = { blob, width: canvas.width, height: canvas.height };
      if (blob.size <= maxBytes) break;
    }
    if (best && best.blob.size <= maxBytes) break;
    scale = scale * 0.7;
  }

  if (!best) throw new Error('Image encoding failed.');

  if (typeof bitmap.close === 'function') bitmap.close();

  const dataUrl = await fileToDataUrl(best.blob);
  return {
    blob: best.blob,
    dataUrl,
    width: best.width,
    height: best.height,
    bytes: best.blob.size,
    type: best.blob.type || mimeType,
    originalBytes: file.size
  };
}
