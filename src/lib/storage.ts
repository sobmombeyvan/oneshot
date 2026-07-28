import type { SupabaseClient } from "@supabase/supabase-js";
import { fileToCompressedDataUrl } from "@/lib/image";

/**
 * Compresses an image and uploads it to the public `products` Storage bucket.
 * Returns the public URL to store on `products.image`.
 */
export async function uploadProductImage(
  supabase: SupabaseClient,
  file: File,
  productKey = "new"
): Promise<string> {
  const dataUrl = await fileToCompressedDataUrl(file);

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const path = `${productKey}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("products").upload(path, blob, {
    upsert: true,
    contentType: blob.type || "image/jpeg",
  });

  if (error) {
    throw new Error(
      error.message.includes("Bucket not found")
        ? "Bucket Storage `products` manquant. Créez-le dans Supabase (public)."
        : error.message
    );
  }

  const { data } = supabase.storage.from("products").getPublicUrl(path);
  return data.publicUrl;
}
