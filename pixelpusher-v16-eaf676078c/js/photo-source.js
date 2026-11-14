// Native device decoders only. No uploads, conversion service or codec dependency.
const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|heic|heif|avif)$/i;
const VIDEO_EXT = /\.(?:mov|mp4|m4v|webm)$/i;
export function fileKind(file) {
  const type = String(file.type || "")
    .trim()
    .toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (IMAGE_EXT.test(file.name || "")) return "image";
  if (VIDEO_EXT.test(file.name || "")) return "video";
  return null;
}
export function photoSize(width, height, maxTextureSize = 2048) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error("This photo has invalid dimensions. Choose another photo.");
  const cap = Math.max(
    1,
    Math.min(
      2048,
      Number.isFinite(maxTextureSize) ? Math.floor(maxTextureSize) : 2048,
    ),
  );
  const scale = Math.min(1, cap / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export async function decodePhoto(file, maxTextureSize = 2048) {
  let decoded = null,
    url = null,
    decoder = "bitmap";
  try {
    if (typeof createImageBitmap === "function") {
      try {
        decoded = await createImageBitmap(file, {
          imageOrientation: "from-image",
        });
      } catch {
        /* Safari may support this image only through its HTML decoder. */
      }
    }
    if (!decoded) {
      decoder = "img";
      url = URL.createObjectURL(file);
      const image = new Image();
      image.style.imageOrientation = "from-image";
      try {
        if (typeof image.decode === "function") {
          image.src = url;
          await image.decode();
        } else
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
          });
        decoded = image;
      } catch {
        image.removeAttribute("src");
        const heic =
          /\.(?:heic|heif)$/i.test(file.name || "") ||
          /hei[cf]/i.test(file.type || "");
        throw new Error(
          heic
            ? "This browser cannot open this HEIC/HEIF photo. Choose Most Compatible in iPhone Camera settings (Formats), or export the photo as JPEG and try again."
            : "This photo could not be decoded. Choose another photo, or export it as JPEG, PNG or WebP.",
        );
      }
    }
    const originalWidth = decoded.naturalWidth || decoded.width,
      originalHeight = decoded.naturalHeight || decoded.height;
    const size = photoSize(originalWidth, originalHeight, maxTextureSize),
      source = document.createElement("canvas");
    source.width = size.width;
    source.height = size.height;
    const context = source.getContext("2d");
    if (!context)
      throw new Error(
        "Photo memory is unavailable. Close other apps and choose a smaller photo.",
      );
    context.drawImage(decoded, 0, 0, size.width, size.height);
    // Canvas normalizes bitmap/HTML EXIF orientation and WebGL upload flip behavior.
    return { source, ...size, originalWidth, originalHeight, decoder };
  } finally {
    if (decoded?.close) decoded.close();
    else if (decoded?.removeAttribute) decoded.removeAttribute("src");
    if (url) URL.revokeObjectURL(url);
  }
}
