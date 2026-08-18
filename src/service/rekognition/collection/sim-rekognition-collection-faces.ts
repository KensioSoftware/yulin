import type { SimRekognitionIndexedFace } from "./sim-rekognition-indexed-face.js";

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
   * Remove the faces with these ids, answering with the ids that were held.
   */
  remove(faceIds: readonly string[]): readonly string[] {
    const removed = this.withIds(faceIds).map((face) => face.faceId);

    for (const faceId of removed) {
      this.faces.delete(faceId);
    }

    return removed;
  }
}
