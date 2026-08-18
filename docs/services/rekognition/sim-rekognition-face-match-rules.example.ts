/**
 * The two ways a rule names the face a search finds.
 */

import {
  CreateCollectionCommand,
  IndexFacesCommand,
} from "@aws-sdk/client-rekognition";
import { SimAws } from "@kensio/yulin";
import { simRekognitionSampleImages } from "@kensio/yulin/rekognition";

const simAws = new SimAws();
const simRekognition = simAws.rekognition();
const faceMatches = simRekognition.faceMatches();

// Every image starts here, finding nobody.
faceMatches.byDefault({ matches: [] });

// By the id the indexing chose. A test can write this before the face exists.
faceMatches.onName("door/visitor.jpg", {
  matches: [{ externalImageId: "ada", similarity: 98.5 }],
});

// By the id IndexFaces answered with, for an application that keeps it.
await simRekognition.createCollection(
  new CreateCollectionCommand({ CollectionId: "staff" }),
);

const indexed = await simRekognition.indexFaces(
  new IndexFacesCommand({
    CollectionId: "staff",
    Image: { Bytes: simRekognitionSampleImages.oneFace() },
  }),
);

faceMatches.onName("door/courier.jpg", {
  matches: indexed.FaceRecords.map((record) => ({
    faceId: record.Face.FaceId,
  })),
});
