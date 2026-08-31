import {
  CreateCollectionCommand,
  IndexFacesCommand,
  ListFacesCommand,
} from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertSetSize,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { redPngBytes } from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simRekognitionSeveralFaces } from "../../face/sim-rekognition-face-defaults.js";

async function simAwsWithPhoto(objectName = "staff/ada.jpg"): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "photos" }));
  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "photos",
      Key: objectName,
      Body: redPngBytes,
    }),
  );
  await simAws
    .rekognition()
    .createCollection(new CreateCollectionCommand({ CollectionId: "staff" }));

  return simAws;
}

function indexing(
  objectName = "staff/ada.jpg",
  externalImageId = "ada",
): IndexFacesCommand {
  return new IndexFacesCommand({
    CollectionId: "staff",
    Image: { S3Object: { Bucket: "photos", Name: objectName } },
    ExternalImageId: externalImageId,
  });
}

describe("Indexing faces into a simulated Rekognition collection", () => {
  it("records the face an image holds and answers with what a caller reads", async () => {
    // Given a photograph in a Bucket and an empty collection
    const simAws = await simAwsWithPhoto();

    // When it is indexed
    const indexed = await simAws.rekognition().indexFaces(indexing());

    // Then the face comes back with the identity a caller stores
    assertArrayLength(indexed.FaceRecords, 1);

    const [record] = indexed.FaceRecords;
    assertNonNullable(record);
    assertIdentical(record.Face.ExternalImageId, "ada");
    assertIdentical(record.Face.IndexFacesModelVersion, "7.0");
    assertNonNullable(record.Face.FaceId);
    assertNonNullable(record.Face.ImageId);
    assertNonNullable(record.Face.BoundingBox);
    assertIdentical(indexed.FaceModelVersion, "7.0");
    assertArrayEmpty(indexed.UnindexedFaces);
  });

  it("indexes the faces the image is declared to hold, under one image id", async () => {
    // Given an image declared to hold three faces
    const simAws = await simAwsWithPhoto("staff/team.jpg");
    simAws
      .rekognition()
      .faces()
      .onName("staff/team.jpg", simRekognitionSeveralFaces);

    // When it is indexed
    const indexed = await simAws
      .rekognition()
      .indexFaces(indexing("staff/team.jpg"));

    // Then each face is stored under its own id and the one image id they
    // were all found in
    assertArrayLength(indexed.FaceRecords, 3);

    const faceIds = new Set(
      indexed.FaceRecords.map((record) => record.Face.FaceId),
    );
    const imageIds = new Set(
      indexed.FaceRecords.map((record) => record.Face.ImageId),
    );

    assertSetSize(faceIds, 3);
    assertSetSize(imageIds, 1);
  });

  it("reports the faces a MaxFaces left out, and does not store them", async () => {
    // Given an image declared to hold three faces
    const simAws = await simAwsWithPhoto("staff/team.jpg");
    const rekognition = simAws.rekognition();
    rekognition.faces().onName("staff/team.jpg", simRekognitionSeveralFaces);

    // When only one is asked for
    const indexed = await rekognition.indexFaces(
      new IndexFacesCommand({
        CollectionId: "staff",
        Image: { S3Object: { Bucket: "photos", Name: "staff/team.jpg" } },
        MaxFaces: 1,
      }),
    );

    // Then the other two are reported as unindexed rather than stored
    assertArrayLength(indexed.FaceRecords, 1);
    assertArrayLength(indexed.UnindexedFaces, 2);

    const [unindexed] = indexed.UnindexedFaces;
    assertNonNullable(unindexed);
    assertArrayEquals(unindexed.Reasons, ["EXCEEDS_MAX_FACES"]);

    const listed = await rekognition.listFaces(
      new ListFacesCommand({ CollectionId: "staff" }),
    );
    assertArrayLength(listed.Faces, 1);
  });

  it("refuses an external image id real Rekognition would refuse", async () => {
    // Given a photograph to index
    const simAws = await simAwsWithPhoto();

    // When it is indexed under an id holding a space
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .rekognition()
          .indexFaces(indexing("staff/ada.jpg", "ada lovelace")),
    );

    // Then it is refused where AWS would refuse it rather than stored
    assertIdentical(error.name, "InvalidParameterException");
  });
});
