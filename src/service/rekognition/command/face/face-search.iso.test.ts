import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  IndexFacesCommand,
  ListFacesCommand,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  bluePngBytes,
  redPngBytes,
} from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simRekognitionNoFaces } from "../../face/sim-rekognition-face-defaults.js";

const staffPhoto = "staff/ada.jpg";
const visitorPhoto = "door/visitor.jpg";

/**
 * A simulation holding one collection with one face indexed under `ada`, and
 * a second photograph to search with.
 */
async function simAwsWithIndexedFace(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "photos" }));
  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "photos",
      Key: staffPhoto,
      Body: redPngBytes,
    }),
  );
  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "photos",
      Key: visitorPhoto,
      Body: bluePngBytes,
    }),
  );
  await simAws
    .rekognition()
    .createCollection(new CreateCollectionCommand({ CollectionId: "staff" }));
  await simAws.rekognition().indexFaces(
    new IndexFacesCommand({
      CollectionId: "staff",
      Image: { S3Object: { Bucket: "photos", Name: staffPhoto } },
      ExternalImageId: "ada",
    }),
  );

  return simAws;
}

function searching(threshold?: number): SearchFacesByImageCommand {
  return new SearchFacesByImageCommand({
    CollectionId: "staff",
    Image: { S3Object: { Bucket: "photos", Name: visitorPhoto } },
    ...(threshold !== undefined && { FaceMatchThreshold: threshold }),
  });
}

describe("Searching a simulated Rekognition collection by image", () => {
  it("finds nobody until a rule says otherwise", async () => {
    // Given a collection holding a face and no rule for the search image
    const simAws = await simAwsWithIndexedFace();

    // When it is searched
    const found = await simAws.rekognition().searchFacesByImage(searching());

    // Then nobody is found, rather than a match being invented
    assertArrayLength(found.FaceMatches, 0);
  });

  it("finds the face a rule names by the id it was indexed under", async () => {
    // Given a rule saying the visitor is the member of staff
    const simAws = await simAwsWithIndexedFace();
    simAws
      .rekognition()
      .faceMatches()
      .onName(visitorPhoto, {
        matches: [{ externalImageId: "ada", similarity: 98.5 }],
      });

    // When the collection is searched with the visitor's photograph
    const found = await simAws.rekognition().searchFacesByImage(searching());

    // Then the indexed face comes back at the similarity the rule stated
    assertArrayLength(found.FaceMatches, 1);

    const [match] = found.FaceMatches;
    assertNonNullable(match);
    assertIdentical(match.Face.ExternalImageId, "ada");
    assertIdentical(match.Similarity, 98.5);
  });

  it("finds the face a rule names by the id IndexFaces answered with", async () => {
    // Given a collection whose one face id is known
    const simAws = await simAwsWithIndexedFace();
    const rekognition = simAws.rekognition();
    const listed = await rekognition.listFaces(
      new ListFacesCommand({ CollectionId: "staff" }),
    );
    const [face] = listed.Faces;
    assertNonNullable(face);

    // When a rule names that face id
    rekognition
      .faceMatches()
      .onName(visitorPhoto, { matches: [{ faceId: face.FaceId }] });

    const found = await rekognition.searchFacesByImage(searching());

    // Then the search finds it, at the similarity an undeclared one reports
    assertArrayLength(found.FaceMatches, 1);

    const [match] = found.FaceMatches;
    assertNonNullable(match);
    assertIdentical(match.Face.FaceId, face.FaceId);
    assertIdentical(match.Similarity, 99.97222137451172);
  });

  it("leaves out a match the request was not confident enough for", async () => {
    // Given a declared match at a middling similarity
    const simAws = await simAwsWithIndexedFace();
    simAws
      .rekognition()
      .faceMatches()
      .onName(visitorPhoto, {
        matches: [{ externalImageId: "ada", similarity: 72 }],
      });

    // When it is searched for at the default threshold and then below it
    const strict = await simAws.rekognition().searchFacesByImage(searching());
    const lenient = await simAws
      .rekognition()
      .searchFacesByImage(searching(70));

    // Then the threshold decides, as it does on AWS
    assertArrayLength(strict.FaceMatches, 0);
    assertArrayLength(lenient.FaceMatches, 1);
  });

  it("stops finding a face once it is removed from the collection", async () => {
    // Given a face a rule finds
    const simAws = await simAwsWithIndexedFace();
    const rekognition = simAws.rekognition();
    rekognition
      .faceMatches()
      .onName(visitorPhoto, { matches: [{ externalImageId: "ada" }] });

    const before = await rekognition.searchFacesByImage(searching());
    const [match] = before.FaceMatches;
    assertNonNullable(match);
    assertNonNullable(match.Face.FaceId);

    // When the face is deleted
    await rekognition.deleteFaces(
      new DeleteFacesCommand({
        CollectionId: "staff",
        FaceIds: [match.Face.FaceId],
      }),
    );

    // Then the rule still says so and the search finds nobody
    const after = await rekognition.searchFacesByImage(searching());
    assertArrayLength(after.FaceMatches, 0);
  });

  it("reports the face it searched with, from the rules for that image", async () => {
    // Given a search image declared to hold one face
    const simAws = await simAwsWithIndexedFace();

    // When the collection is searched
    const found = await simAws.rekognition().searchFacesByImage(searching());

    // Then the face the search was made with is reported alongside the matches
    assertNonNullable(found.SearchedFaceBoundingBox);
    assertIdentical(found.SearchedFaceConfidence, 99.99872589111328);
  });

  it("refuses a search with an image holding nobody", async () => {
    // Given a search image declared to hold no faces
    const simAws = await simAwsWithIndexedFace();
    simAws.rekognition().faces().onName(visitorPhoto, simRekognitionNoFaces);

    // When the collection is searched with it
    const error = await assertThrowsErrorAsync(
      async () => await simAws.rekognition().searchFacesByImage(searching()),
    );

    // Then it is refused, as real Rekognition refuses a search with nothing
    // to search for
    assertIdentical(error.name, "InvalidParameterException");
  });

  it("answers a search in every Region the rule was registered in", async () => {
    // Given a rule and a collection in one Region
    const simAws = await simAwsWithIndexedFace();
    simAws
      .rekognition()
      .faceMatches()
      .onName(visitorPhoto, { matches: [{ externalImageId: "ada" }] });

    // When another Region is searched
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .accountRegionScope(undefined, "eu-west-2")
          .rekognition()
          .searchFacesByImage(searching()),
    );

    // Then it has no such collection, as a collection belongs to one Region
    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("reports a face once when two matches name it", async () => {
    // Given one face named twice over, by each kind of id
    const simAws = await simAwsWithIndexedFace();
    const rekognition = simAws.rekognition();
    const listed = await rekognition.listFaces(
      new ListFacesCommand({ CollectionId: "staff" }),
    );
    const [face] = listed.Faces;
    assertNonNullable(face);

    rekognition.faceMatches().onName(visitorPhoto, {
      matches: [
        { externalImageId: "ada", similarity: 91 },
        { faceId: face.FaceId, similarity: 97 },
      ],
    });

    // When the collection is searched
    const found = await rekognition.searchFacesByImage(searching());

    // Then it is one face in the collection and so one match in the response,
    // reported at the most alike of the two
    assertArrayEquals(
      found.FaceMatches.map((match) => match.Similarity),
      [97],
    );
  });
});
