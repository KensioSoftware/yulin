import type { Brand } from "../../../util/brand.type.js";

export type SimRekognitionCollectionId = Brand<
  string,
  "SimRekognitionCollectionId"
>;

/**
 * The face model version every collection this simulation makes reports.
 *
 * Real Rekognition stamps a collection with the model version in force when it
 * was created, and the version moves as AWS retrains. Nothing here recognises a
 * face, so one fixed version is stated rather than a moving one invented.
 */
export const simRekognitionFaceModelVersion = "7.0";

/**
 * One simulated Rekognition face collection.
 *
 * A collection holds indexed faces in real Rekognition. This simulation has no
 * faces to put in one yet, so what a collection is here is its identity, which
 * is what the operations that create, list and remove it work with.
 */
export interface SimRekognitionCollection {
  readonly collectionId: SimRekognitionCollectionId;
  readonly arn: string;
  readonly faceModelVersion: string;
  readonly createdAt: Date;
}
