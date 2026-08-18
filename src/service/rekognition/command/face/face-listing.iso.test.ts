import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  IndexFacesCommand,
  ListFacesCommand,
} from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
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

const absentFaceId = "3b0b5b0e-0000-4000-8000-000000000000";

describe("Reading and removing the faces of a simulated Rekognition collection", () => {
  it("lists the faces of one collection and misses those of another", async () => {
    // Given a face indexed into one of two collections
    const simAws = await simAwsWithPhoto();
    const rekognition = simAws.rekognition();
    await rekognition.createCollection(
      new CreateCollectionCommand({ CollectionId: "visitors" }),
    );
    const indexed = await rekognition.indexFaces(indexing());

    // When each collection is listed
    const staff = await rekognition.listFaces(
      new ListFacesCommand({ CollectionId: "staff" }),
    );
    const visitors = await rekognition.listFaces(
      new ListFacesCommand({ CollectionId: "visitors" }),
    );

    // Then the face is in the one it was indexed into and no other
    assertArrayEquals(
      staff.Faces.map((face) => face.FaceId),
      indexed.FaceRecords.map((record) => record.Face.FaceId),
    );
    assertArrayLength(visitors.Faces, 0);
  });

  it("narrows a listing to the face ids it names", async () => {
    // Given two indexed faces
    const simAws = await simAwsWithPhoto();
    const rekognition = simAws.rekognition();
    const first = await rekognition.indexFaces(indexing());
    await rekognition.indexFaces(indexing("staff/ada.jpg", "grace"));

    const [wanted] = first.FaceRecords;
    assertNonNullable(wanted);

    // When one of them is asked for
    const listed = await rekognition.listFaces(
      new ListFacesCommand({
        CollectionId: "staff",
        FaceIds: [wanted.Face.FaceId],
      }),
    );

    // Then it is the only one reported
    assertArrayEquals(
      listed.Faces.map((face) => face.ExternalImageId),
      ["ada"],
    );
  });

  it("pages a listing the request asked to have paged", async () => {
    // Given three indexed faces
    const simAws = await simAwsWithPhoto("staff/team.jpg");
    const rekognition = simAws.rekognition();
    rekognition.faces().onName("staff/team.jpg", simRekognitionSeveralFaces);
    await rekognition.indexFaces(indexing("staff/team.jpg"));

    // When two are asked for at a time
    const first = await rekognition.listFaces(
      new ListFacesCommand({ CollectionId: "staff", MaxResults: 2 }),
    );

    assertArrayLength(first.Faces, 2);
    assertNonNullable(first.NextToken);

    const second = await rekognition.listFaces(
      new ListFacesCommand({
        CollectionId: "staff",
        MaxResults: 2,
        NextToken: first.NextToken,
      }),
    );

    // Then the rest come back and the listing ends
    assertArrayLength(second.Faces, 1);
    assertUndefined(second.NextToken);
  });

  it("removes faces by id and reports which were removed", async () => {
    // Given two indexed faces
    const simAws = await simAwsWithPhoto();
    const rekognition = simAws.rekognition();
    const first = await rekognition.indexFaces(indexing());
    await rekognition.indexFaces(indexing("staff/ada.jpg", "grace"));

    const [removing] = first.FaceRecords;
    assertNonNullable(removing);

    // When one is removed alongside an id the collection never held
    const deleted = await rekognition.deleteFaces(
      new DeleteFacesCommand({
        CollectionId: "staff",
        FaceIds: [removing.Face.FaceId, absentFaceId],
      }),
    );

    // Then only the one that was there is reported as removed, and the other
    // is answered for rather than dropped
    assertArrayEquals(deleted.DeletedFaces, [removing.Face.FaceId]);

    const [unsuccessful] = deleted.UnsuccessfulFaceDeletions;
    assertNonNullable(unsuccessful);
    assertIdentical(unsuccessful.FaceId, absentFaceId);
    assertArrayEquals(unsuccessful.Reasons, ["FACE_NOT_FOUND"]);

    const listed = await rekognition.listFaces(
      new ListFacesCommand({ CollectionId: "staff" }),
    );
    assertArrayEquals(
      listed.Faces.map((face) => face.ExternalImageId),
      ["grace"],
    );
  });

  it("refuses a face id that is not the shape Rekognition issues", async () => {
    // Given a collection to remove a face from
    const simAws = await simAwsWithPhoto();

    // When a request names an id in another shape
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().deleteFaces(
          new DeleteFacesCommand({
            CollectionId: "staff",
            FaceIds: ["the-face-of-ada"],
          }),
        ),
    );

    // Then it is a malformed request, as it is on AWS, rather than a face the
    // collection turns out not to hold
    assertIdentical(error.name, "InvalidParameterException");
  });
});
