import { SimRekognitionInvalidImageFormatException } from "../error/sim-rekognition.error.js";

/**
 * The image formats Rekognition detection operations accept.
 */
export type SimRekognitionImageFormatName = "PNG" | "JPEG";

const pngMagicBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpegMagicBytes = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return magic.every((byte, index) => bytes.at(index) === byte);
}

/**
 * Identify the format of some image bytes, from the bytes themselves.
 *
 * Real Rekognition accepts PNG and JPEG and refuses everything else, and it
 * decides which it has from the content rather than from anything the caller
 * said about it. The stored content type of an S3 object is deliberately not
 * consulted for the same reason: simulated S3 keeps a supplied `ContentType`
 * as a metadata key and has none at all unless the uploader set one, so
 * trusting it would make the same bytes detectable or not depending on how
 * they were uploaded.
 */
export function simRekognitionImageFormat(
  bytes: Uint8Array,
): SimRekognitionImageFormatName {
  if (startsWith(bytes, pngMagicBytes)) {
    return "PNG";
  }

  if (startsWith(bytes, jpegMagicBytes)) {
    return "JPEG";
  }

  throw new SimRekognitionInvalidImageFormatException(
    "Request has invalid image format: the image bytes are neither PNG " +
      "nor JPEG",
  );
}
