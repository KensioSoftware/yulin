import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  IndexFacesCommand,
  ListFacesCommand,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { redPngBytes } from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";

const faceActions = [
  "rekognition:IndexFaces",
  "rekognition:ListFaces",
  "rekognition:SearchFacesByImage",
  "rekognition:DeleteFaces",
];

/**
 * The image is passed as bytes, so these tests are about the Rekognition
 * decision alone. The S3 read a request naming an object makes is authorized
 * separately, as the caller, and the detection tests cover that.
 */
const photo = { Bytes: redPngBytes };

async function simAwsWithCollection(collectionId: string): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws
    .rekognition()
    .createCollection(
      new CreateCollectionCommand({ CollectionId: collectionId }),
    );

  return simAws;
}

describe("Authorizing simulated Rekognition face operations", () => {
  it("allows a caller whose policy names the collection it works on", async () => {
    // Given a Role allowed the face operations on one collection
    const simAws = await simAwsWithCollection("staff");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "FaceIndexer",
        actions: faceActions,
        resource: `arn:aws:rekognition:${simAws.defaultRegionName}:${simAws.defaultAccountId}:collection/staff`,
      },
      simAws,
    );
    const caller = { kind: "arn" as const, arn: role.Arn };

    // When it indexes a face and lists the collection back
    const indexed = await simAws
      .rekognition()
      .indexFaces(
        new IndexFacesCommand({ CollectionId: "staff", Image: photo }),
        { caller },
      );
    const listed = await simAws
      .rekognition()
      .listFaces(new ListFacesCommand({ CollectionId: "staff" }), { caller });

    // Then both run
    assertArrayLength(indexed.FaceRecords, 1);
    assertArrayLength(listed.Faces, 1);
  });

  it("refuses a caller whose policy names another collection", async () => {
    // Given a Role allowed the face operations on one collection only
    const simAws = await simAwsWithCollection("visitors");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "StaffIndexer",
        actions: faceActions,
        resource: `arn:aws:rekognition:${simAws.defaultRegionName}:${simAws.defaultAccountId}:collection/staff`,
      },
      simAws,
    );

    // When it indexes into the collection it was not named for
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .rekognition()
          .indexFaces(
            new IndexFacesCommand({ CollectionId: "visitors", Image: photo }),
            { caller: { kind: "arn", arn: role.Arn } },
          ),
    );

    // Then it is refused, which a wildcard resource could not have expressed
    assertIdentical(error.name, "AccessDeniedException");
    assertStringIncludes(error.message, "rekognition:IndexFaces");
  });

  it("tells a caller with no permission nothing about the collection", async () => {
    // Given a caller allowed nothing and a collection that was never created
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Nobody", actions: [] },
      simAws,
    );

    // When it lists a collection that does not exist
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .rekognition()
          .listFaces(new ListFacesCommand({ CollectionId: "absent" }), {
            caller: { kind: "arn", arn: role.Arn },
          }),
    );

    // Then the denial comes first, so whether the collection is there is not
    // something an unauthorized caller can find out
    assertIdentical(error.name, "AccessDeniedException");
  });
});

describe("Working on a simulated Rekognition collection that was never created", () => {
  it("refuses to index a face into it", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().indexFaces(
          new IndexFacesCommand({
            CollectionId: "absent",
            Image: { Bytes: redPngBytes },
          }),
        ),
    );

    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("refuses to list its faces", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .rekognition()
          .listFaces(new ListFacesCommand({ CollectionId: "absent" })),
    );

    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("refuses to search it", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().searchFacesByImage(
          new SearchFacesByImageCommand({
            CollectionId: "absent",
            Image: { Bytes: redPngBytes },
          }),
        ),
    );

    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("refuses to remove faces from it", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().deleteFaces(
          new DeleteFacesCommand({
            CollectionId: "absent",
            FaceIds: ["0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d"],
          }),
        ),
    );

    assertIdentical(error.name, "ResourceNotFoundException");
  });
});
