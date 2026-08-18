import type { SimRekognitionIndexedFace } from "./sim-rekognition-indexed-face.js";

/**
 * What one removal reached, and what it asked for and did not find.
 */
export interface SimRekognitionFaceRemoval {
  readonly removed: readonly string[];
  readonly missing: readonly string[];
}

/**
 * The faces one collection holds.
 *
 * They are kept in the order they were indexed, which is the order a listing
 * reports them in. Real Rekognition documents no order for `ListFaces`, so
 * indexing order is a simulator convention rather than AWS behaviour.
 */
export class SimRekognitionCollectionFaces {
  private readonly faces = new Map<string, SimRekognitionIndexedFace>();

  /**
   * Record a face against this collection.
   */
  index(face: SimRekognitionIndexedFace): void {
    this.faces.set(face.faceId, face);
  }

  /**
   * Every face held here.
   */
  all(): readonly SimRekognitionIndexedFace[] {
    return this.faces.values().toArray();
  }

  /**
   * The faces with these ids, leaving out any id this collection does not
   * hold.
   */
  withIds(faceIds: readonly string[]): readonly SimRekognitionIndexedFace[] {
    const wanted = new Set(faceIds);

    return this.all().filter((face) => wanted.has(face.faceId));
  }

  /**
   * The face with this id, when this collection holds it.
   */
  withFaceId(faceId: string): SimRekognitionIndexedFace | undefined {
    return this.faces.get(faceId);
  }

  /**
   * The faces indexed under this external image id.
   *
   * There can be several. Real Rekognition takes an `ExternalImageId` as a
   * label the caller chose rather than as a key, so a photograph of the same
   * person indexed twice leaves two faces under one id.
   */
  withExternalImageId(
    externalImageId: string,
  ): readonly SimRekognitionIndexedFace[] {
    return this.all().filter(
      (face) => face.externalImageId === externalImageId,
    );
  }

  /**
   * Remove the faces with these ids.
   *
   * An id this collection does not hold is reported back rather than dropped,
   * because real Rekognition answers for every id a request named. A request
   * naming the same id twice is one removal, since the second one would
   * otherwise be reported as a face that could not be found.
   */
  remove(faceIds: readonly string[]): SimRekognitionFaceRemoval {
    const removed: string[] = [];
    const missing: string[] = [];
    const wanted = new Set(faceIds);

    for (const faceId of wanted) {
      if (this.faces.delete(faceId)) {
        removed.push(faceId);
      } else {
        missing.push(faceId);
      }
    }

    return { removed, missing };
  }
}
