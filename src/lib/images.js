// Préparation des photos avant envoi : redimensionnées (1568 px max, la taille
// utile pour Claude) et recompressées en JPEG, pour un envoi rapide même en 4G.
export const MAX_SIDE = 1568;

export async function prepareImage(file, { maxSide = MAX_SIDE, quality = 0.85 } = {}) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`« ${file.name} » : format d'image non reconnu (utilise JPEG ou PNG).`);
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { media_type: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl, name: file.name, width: w, height: h };
}
