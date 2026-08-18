import { CreateUserCommand, PutUserPolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateCollectionCommand,
  DeleteCollectionCommand,
  ListCollectionsCommand,
} from "@aws-sdk/client-rekognition";
import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

/**
 * Face collections, which are what lets an application recognise the same
 * person twice rather than answer what is in one image.
 *
 * Nothing here indexes a face yet. What a collection is at this point is its
 * identity, and these cover the lifecycle of that identity.
 */
describe("Simulated Rekognition face collections", () => {
  it("creates a collection and lists it back with its ARN and model version", async () => {
    // Given a simulation with no collections
    const simAws = new SimAws();
    const rekognition = simAws.rekognition();

    // When one is created
    const created = await rekognition.createCollection(
      new CreateCollectionCommand({ CollectionId: "faces" }),
    );

    // Then it reports the ARN real Rekognition would issue
    assertIdentical(
      created.CollectionArn,
      `arn:aws:rekognition:${simAws.defaultRegionName}:${simAws.defaultAccountId}:collection/faces`,
    );
    assertIdentical(created.StatusCode, 200);

    // And the listing reports it alongside the model version it was made under
    const listed = await rekognition.listCollections(
      new ListCollectionsCommand({}),
    );

    assertArrayEquals(listed.CollectionIds ?? [], ["faces"]);
    assertArrayEquals(listed.FaceModelVersions ?? [], [
      created.FaceModelVersion ?? "",
    ]);
  });

  it("holds collections per Account and Region", async () => {
    // Given a collection created in one Region
    const simAws = new SimAws();
    await simAws
      .rekognition()
      .createCollection(new CreateCollectionCommand({ CollectionId: "faces" }));

    // When another Region is asked
    const elsewhere = await simAws
      .accountRegionScope(undefined, "eu-west-2")
      .rekognition()
      .listCollections(new ListCollectionsCommand({}));

    // Then it sees nothing, as real Rekognition scopes a collection to both
    assertArrayEquals(elsewhere.CollectionIds ?? [], []);
  });

  it("refuses a second collection under a name it already holds", async () => {
    // Given a collection that exists
    const simAws = new SimAws();
    const rekognition = simAws.rekognition();
    await rekognition.createCollection(
      new CreateCollectionCommand({ CollectionId: "faces" }),
    );

    // When the same name is created again
    const error = await assertThrowsErrorAsync(
      async () =>
        await rekognition.createCollection(
          new CreateCollectionCommand({ CollectionId: "faces" }),
        ),
    );

    // Then it is refused rather than answered with the one that is there
    assertIdentical(error.name, "ResourceAlreadyExistsException");
  });

  it("refuses to remove a collection that was never created", async () => {
    // Given a simulation holding no collections
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .rekognition()
          .deleteCollection(
            new DeleteCollectionCommand({ CollectionId: "absent" }),
          ),
    );

    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("stops listing a collection once it is removed", async () => {
    // Given two collections
    const simAws = new SimAws();
    const rekognition = simAws.rekognition();
    await rekognition.createCollection(
      new CreateCollectionCommand({ CollectionId: "faces" }),
    );
    await rekognition.createCollection(
      new CreateCollectionCommand({ CollectionId: "staff" }),
    );

    // When one is removed
    const removed = await rekognition.deleteCollection(
      new DeleteCollectionCommand({ CollectionId: "faces" }),
    );

    // Then only the other is left
    assertIdentical(removed.StatusCode, 200);

    const listed = await rekognition.listCollections(
      new ListCollectionsCommand({}),
    );
    assertArrayEquals(listed.CollectionIds ?? [], ["staff"]);
  });

  it("authorizes each operation against the collection's own ARN", async () => {
    // Given a caller allowed to work on one collection and no other
    const simAws = new SimAws();
    const accountId = simAws.defaultAccountId;
    const regionName = simAws.defaultRegionName;

    await simAws.iam().createUser(new CreateUserCommand({ UserName: "Faces" }));
    await simAws.iam().putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Faces",
        PolicyName: "OneCollection",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "rekognition:CreateCollection",
            Resource: `arn:aws:rekognition:${regionName}:${accountId}:collection/allowed`,
          },
        }),
      }),
    );
    const caller = {
      kind: "arn" as const,
      arn: `arn:aws:iam::${accountId}:user/Faces`,
    };

    // When it creates the collection it was named for
    const created = await simAws
      .rekognition()
      .createCollection(
        new CreateCollectionCommand({ CollectionId: "allowed" }),
        { caller },
      );

    assertIdentical(created.StatusCode, 200);

    // Then another collection is refused, which a wildcard resource could not
    // have expressed
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .rekognition()
          .createCollection(
            new CreateCollectionCommand({ CollectionId: "denied" }),
            { caller },
          ),
    );

    assertIdentical(error.name, "AccessDeniedException");
    assertStringIncludes(error.message, "rekognition:CreateCollection");
  });
});
