/**
 * Image bytes for simulated Rekognition tests.
 *
 * The two PNGs are complete 1x1 PNG files, differing only in the colour of
 * their one pixel, so they are genuinely different images with genuinely
 * different content hashes.
 *
 * The JPEG fixture is a JPEG file header rather than a whole photograph.
 * Simulated Rekognition identifies a format from an image's leading bytes and
 * decodes nothing, so a header is the whole of what it reads. Simulated
 * Rekognition sample images, which are whole files, are a separate piece of
 * work.
 *
 * This lives under `test/` because eslint rejects a test file that exports
 * helpers alongside its own `describe` calls, and `test/**` is type-checked
 * with everything else while being excluded from the published build.
 */

const redPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC";

const bluePngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQs7kDAAGyATf/cv8XAAAAAElFTkSuQmCC";

/**
 * A 1x1 red PNG.
 */
export const redPngBytes = Uint8Array.from(Buffer.from(redPngBase64, "base64"));

/**
 * A 1x1 blue PNG, which is a different image to the red one.
 */
export const bluePngBytes = Uint8Array.from(
  Buffer.from(bluePngBase64, "base64"),
);

/**
 * The start of a JFIF JPEG file: the SOI marker and an APP0 segment.
 */
export const jpegBytes = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

/**
 * Bytes that are not an image at all, as a test putting a placeholder string
 * in a Bucket would produce.
 */
export const notAnImageBytes = Uint8Array.from(
  Buffer.from("cat picture", "utf8"),
);
