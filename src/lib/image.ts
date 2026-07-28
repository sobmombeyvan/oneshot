/**
 * Reads an image File and returns a downscaled JPEG/PNG data URL.
 * Keeps payloads small enough to store directly in the `products.image` column
 * before uploading to Supabase Storage.
 */
export async function fileToCompressedDataUrl(
  file: File,
  maxSize = 512,
  quality = 0.8
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const hasAlpha = file.type === "image/png";
      resolve(canvas.toDataURL(hasAlpha ? "image/png" : "image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Image invalide"));
    img.src = dataUrl;
  });
}
