/**
 * Indexing a face into a collection and recognising the same person later.
 */

import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  IndexFacesCommand,
  ListFacesCommand,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { simRekognitionSampleImages } from "@kensio/yulin/rekognition";

const simAws = new SimAws();
const simRekognition = simAws.rekognition();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "photos" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "photos",
    Key: "staff/ada.jpg",
    Body: simRekognitionSampleImages.oneFace(),
  }),
);
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "photos",
    Key: "door/visitor.jpg",
    Body: simRekognitionSampleImages.oneFace(),
  }),
);

await simRekognition.createCollection(
  new CreateCollectionCommand({ CollectionId: "staff" }),
);

const indexed = await simRekognition.indexFaces(
  new IndexFacesCommand({
    CollectionId: "staff",
    Image: { S3Object: { Bucket: "photos", Name: "staff/ada.jpg" } },
    ExternalImageId: "ada",
  }),
);

console.log(indexed.FaceRecords.map((record) => record.Face.ExternalImageId));
// [ "ada" ]

const listed = await simRekognition.listFaces(
  new ListFacesCommand({ CollectionId: "staff" }),
);

console.log(listed.Faces.length); // 1

// The visitor at the door is declared to be that member of staff.
simRekognition
  .faceMatches()
  .onName("door/visitor.jpg", { matches: [{ externalImageId: "ada" }] });

const found = await simRekognition.searchFacesByImage(
  new SearchFacesByImageCommand({
    CollectionId: "staff",
    Image: { S3Object: { Bucket: "photos", Name: "door/visitor.jpg" } },
  }),
);

console.log(found.FaceMatches.map((match) => match.Face.ExternalImageId));
// [ "ada" ]

const deleted = await simRekognition.deleteFaces(
  new DeleteFacesCommand({
    CollectionId: "staff",
    FaceIds: listed.Faces.map((face) => face.FaceId),
  }),
);

console.log(deleted.DeletedFaces.length); // 1
