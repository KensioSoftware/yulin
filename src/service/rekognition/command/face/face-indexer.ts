import { randomUUID } from "node:crypto";

import type { SimRekognitionCollection } from "../../collection/sim-rekognition-collection.js";
import { SimRekognitionIndexedFace } from "../../collection/sim-rekognition-indexed-face.js";
import type { SimRekognitionDetectedFace } from "../../face/sim-rekognition-detected-face.js";
import type { SimRekognitionFaceDetection } from "../../face/sim-rekognition-face-detection.js";
import type { SimIndexFacesCommandOutput } from "./face.command.js";
import type { IndexFacesRequest } from "./index-faces-request.js";

/**
 * Why real Rekognition leaves a face out of a collection when the request
 * asked for fewer faces than the image holds.
 */
const exceedsMaxFaces = "EXCEEDS_MAX_FACES";

interface SimRekognitionFaceIndexerProperties {
  readonly collection: SimRekognitionCollection;
  readonly detection: SimRekognitionFaceDetection;
  readonly request: IndexFacesRequest;
}

/**
 * Records the faces one image holds against one collection.
 *
 * The faces are the ones the `faces()` rules declare for that image, so a face
 * indexed from an image and a face detected in it are the same face, with the
 * same bounding box and the same confidence. An image no rule matches indexes
 * the built-in default face.
 *
 * Every face indexed from one image shares an `ImageId` and gets a `FaceId` of
 * its own, as they do on AWS.
 */
export class SimRekognitionFaceIndexer {
  private readonly collection: SimRekognitionCollection;
  private readonly detection: SimRekognitionFaceDetection;
  private readonly request: IndexFacesRequest;
  private readonly imageId = randomUUID();

  constructor(properties: SimRekognitionFaceIndexerProperties) {
    this.collection = properties.collection;
    this.detection = properties.detection;
    this.request = properties.request;
  }

  /**
   * Index the faces and report what was stored.
   *
   * Real Rekognition indexes the largest faces first and reports the rest as
   * unindexed. Nothing here measures a face, so a `MaxFaces` takes them in the
   * order they were declared.
   */
  index(): SimIndexFacesCommandOutput {
    const detected = this.detection.detected();
    const wanted = this.request.maxFaces ?? detected.length;
    const { attributes } = this.request;

    return {
      FaceRecords: detected
        .slice(0, wanted)
        .map((face) => this.store(face).record(attributes)),
      UnindexedFaces: detected.slice(wanted).map((face) => ({
        Reasons: [exceedsMaxFaces],
        FaceDetail: face.detailFor(attributes),
      })),
      FaceModelVersion: this.collection.faceModelVersion,
      $metadata: {},
    };
  }

  private store(
    detected: SimRekognitionDetectedFace,
  ): SimRekognitionIndexedFace {
    const face = new SimRekognitionIndexedFace({
      faceId: randomUUID(),
      imageId: this.imageId,
      externalImageId: this.request.externalImageId,
      faceModelVersion: this.collection.faceModelVersion,
      detected,
    });

    this.collection.faces.index(face);

    return face;
  }
}
