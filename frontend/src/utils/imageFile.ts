// Client-side sanity check before an image is sent to the server. The server decodes the file
// and is the real judge, so this stays permissive: browsers often report an empty or odd
// Content-Type for perfectly good pictures (.svg, .avif, .heic, some .jpg), which the old
// whitelist (jpeg/png/webp only) rejected.
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|svg|avif|bmp|tiff?|heic|heif|jfif)$/i

export const isImageFile = (f: File) => f.type.startsWith('image/') || IMAGE_EXT.test(f.name)
export const IMAGE_ACCEPT = 'image/*,.svg,.avif,.heic,.heif,.jfif'
