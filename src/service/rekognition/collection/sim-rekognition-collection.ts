import type { Brand } from "../../../util/brand.type.js";
import type { SimRekognitionCollectionFaces } from "./sim-rekognition-collection-faces.js";

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
 * A collection is its identity and the faces indexed into it. The faces belong
 * to the collection record rather than to a store of their own, so removing a
 * collection removes the faces with it, as it does on AWS.
 */
export interface SimRekognitionCollection {
  readonly collectionId: SimRekognitionCollectionId;
  readonly arn: string;
  readonly faceModelVersion: string;
  readonly createdAt: Date;
  readonly faces: SimRekognitionCollectionFaces;
}
