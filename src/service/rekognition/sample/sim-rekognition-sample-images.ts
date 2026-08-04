import { simRekognitionSampleImageFiles as files } from "./sim-rekognition-sample-image-files.js";

/**
 * The images simulated Rekognition ships with, each already declared as a
 * rule.
 *
 * They are for the case the hash rules exist for: a system that generates its
 * own object keys, where the name a detection sees is not something a test can
 * match on. A test uploads one of these through its own code and gets a known
 * answer without configuring anything.
 *
 * ```typescript
 * await simAws.s3().putObject(
 *   new PutObjectCommand({
 *     Bucket: "uploads",
 *     Key: randomUUID(),
 *     Body: simRekognitionSampleImages.flaggedByModeration(),
 *   }),
 * );
 * ```
 *
 * Each image is declared for the one operation it is named for. The
 * moderation images say nothing about faces, and the face images say nothing
 * about moderation, so those detections answer from their own rules as they
 * would for any other image.
 */
export class SimRekognitionSampleImages {
  /**
   * A PNG that content moderation finds nothing in.
   */
  passesModeration(): Uint8Array {
    return files.passesModeration.bytes();
  }

  /**
   * A JPEG that content moderation flags, as `Weapon Violence` and the two
   * labels above it in the taxonomy.
   */
  flaggedByModeration(): Uint8Array {
    return files.flaggedByModeration.bytes();
  }

  /**
   * A PNG with nobody in it.
   */
  noFaces(): Uint8Array {
    return files.noFaces.bytes();
  }

  /**
   * A JPEG with one face in it, reported as the built-in default face.
   */
  oneFace(): Uint8Array {
    return files.oneFace.bytes();
  }

  /**
   * A PNG with three faces in it.
   */
  severalFaces(): Uint8Array {
    return files.severalFaces.bytes();
  }
}

/**
 * The sample images simulated Rekognition ships with.
 */
export const simRekognitionSampleImages = new SimRekognitionSampleImages();
