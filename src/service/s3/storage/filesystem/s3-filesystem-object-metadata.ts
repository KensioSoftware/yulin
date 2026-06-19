import path from "node:path";
import { SimS3ObjectMetadata } from "../../object/s3-object.js";

/**
 * Make up reasonable metadata for an Object based on the file on disk.
 */
export function metadataForFilesystemS3ObjectKey(
  key: string,
): SimS3ObjectMetadata {
  const contentType = contentTypeForFilesystemS3ObjectKey(key);

  /* v8 ignore if -- defensive fallback */
  if (contentType === undefined) {
    return new SimS3ObjectMetadata();
  }

  return new SimS3ObjectMetadata({
    "content-type": contentType,
  });
}

/**
 * Guess a reasonable content type for an Object key based on its file extension
 * on disk.
 */
function contentTypeForFilesystemS3ObjectKey(key: string): string | undefined {
  const extension = path.extname(key).toLowerCase();

  return contentTypesByExtension.get(extension);
}

const contentTypesByExtension: ReadonlyMap<string, string> = new Map([
  [".css", "text/css"],
  [".eot", "application/vnd.ms-fontobject"],
  [".gif", "image/gif"],
  [".html", "text/html"],
  [".htm", "text/html"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".json", "application/json"],
  [".map", "application/json"],
  [".png", "image/png"],
  [".otf", "font/otf"],
  [".svg", "image/svg+xml"],
  [".ttc", "font/collection"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml"],
]);
