/** Validação e compressão da logomarca da clínica (JPG/PNG/WEBP, máx. 2 MB). */

export const CLINIC_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const CLINIC_LOGO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const CLINIC_LOGO_MAX_DIMENSION = 1200;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Falha ao processar a imagem da logomarca.'));
      else resolve(blob);
    }, type, quality);
  });
}

export function validateClinicLogoFile(file) {
  if (!file) {
    return { ok: false, message: 'Nenhum arquivo selecionado.' };
  }
  if (!CLINIC_LOGO_ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, message: 'Formato inválido. Use JPG, PNG ou WEBP.' };
  }
  return { ok: true };
}

async function renderToBlob(source, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a imagem.');
  ctx.drawImage(source, 0, 0, width, height);
  return canvasToBlob(canvas, 'image/webp', quality);
}

/**
 * Redimensiona e comprime se necessário. Retorna Blob pronto para Storage (WEBP).
 */
export async function compressClinicLogoFile(file, maxBytes = CLINIC_LOGO_MAX_BYTES) {
  const validation = validateClinicLogoFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const maxDim = CLINIC_LOGO_MAX_DIMENSION;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    let quality = 0.9;
    let blob = await renderToBlob(bitmap, width, height, quality);

    while (blob.size > maxBytes && quality > 0.45) {
      quality -= 0.08;
      blob = await renderToBlob(bitmap, width, height, quality);
    }

    let scale = 0.85;
    while (blob.size > maxBytes && scale > 0.35) {
      width = Math.max(1, Math.round(bitmap.width * scale));
      height = Math.max(1, Math.round(bitmap.height * scale));
      if (width > maxDim || height > maxDim) {
        const fit = maxDim / Math.max(width, height);
        width = Math.round(width * fit);
        height = Math.round(height * fit);
      }
      blob = await renderToBlob(bitmap, width, height, 0.82);
      scale -= 0.12;
    }

    if (blob.size > maxBytes) {
      throw new Error('Não foi possível comprimir a logomarca abaixo de 2 MB. Use uma imagem menor.');
    }

    return { blob, mime: 'image/webp', ext: 'webp', originalSize: file.size, compressedSize: blob.size };
  } finally {
    bitmap.close?.();
  }
}
