import path from "node:path";
import { SimS3ObjectMetadata } from "../../object/s3-object.js";
import { simS3DefaultContentType } from "../../object/s3-system-metadata.js";

/**
 * Make up reasonable metadata for an Object based on the file on disk.
 *
 * Anything the mount declared about the key is laid over the guess, so a
 * declared `content-type` replaces the one the extension suggested, and a
 * declared `content-encoding` is reported for a file whose name says nothing
 * about how it was compressed.
 */
export function metadataForFilesystemS3ObjectKey(
  key: string,
  declaredHeaders: Readonly<Record<string, string>> = {},
): SimS3ObjectMetadata {
  return new SimS3ObjectMetadata({
    // Octet-stream for anything the table below has never heard of, which is
    // what S3 reports for an Object whose type it was never told. That case
    // arrives by way of `additionalFileExtensions`: the table is the web's own
    // types, and the option exists for files that are not one of them.
    "content-type":
      contentTypeForFilesystemS3ObjectKey(key) ?? simS3DefaultContentType,
    ...declaredHeaders,
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
