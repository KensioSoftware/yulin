import { createHash } from "node:crypto";

/**
 * The content hash simulated Rekognition matches a rule against.
 *
 * It is the sha256 digest of the image bytes as they were received, as
 * lowercase hex, with no normalisation of any kind. Re-encoding an image
 * between uploading it and detecting on it therefore changes it, as does any
 * resizing, stripping of metadata or change of quality setting, so hash the
 * exact bytes the test will put through the system.
 */
export function simRekognitionImageHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Whether a string is shaped like an image content hash.
 */
export function isSimRekognitionImageHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
