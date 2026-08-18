/**
 * Creating, listing and removing a Rekognition face collection.
 */

import {
  CreateCollectionCommand,
  DeleteCollectionCommand,
  ListCollectionsCommand,
} from "@aws-sdk/client-rekognition";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simRekognition = simAws.rekognition();

const created = await simRekognition.createCollection(
  new CreateCollectionCommand({ CollectionId: "staff" }),
);

console.log(created.CollectionArn);
// arn:aws:rekognition:us-east-1:888888888888:collection/staff

const listed = await simRekognition.listCollections(
  new ListCollectionsCommand({}),
);

console.log(listed.CollectionIds); // ["staff"]
console.log(listed.FaceModelVersions); // ["7.0"]

await simRekognition.deleteCollection(
  new DeleteCollectionCommand({ CollectionId: "staff" }),
);
