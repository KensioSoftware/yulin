import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3StatesDefinitionStore } from "./sim-s3-states-definition-store.js";
import { SimStatesNoDefinitionStore } from "./sim-states-definition-store.js";

describe("Where a state machine definition is read from", () => {
  const objectKey = "a1b2c3.asl.json";
  const definition = JSON.stringify({
    StartAt: "Done",
    States: { Done: { Type: "Succeed" } },
  });

  /**
   * A store over the simulated S3 of a fresh simulation.
   */
  function storeOver(simAws: SimAws): SimS3StatesDefinitionStore {
    return new SimS3StatesDefinitionStore({ s3: simAws.s3() });
  }

  it("reads the definition an object holds", async () => {
    // Given a definition published to a bucket.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "cdk-assets" }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "cdk-assets",
        Key: objectKey,
        Body: definition,
      }),
    );

    // When the store reads that location.
    const read = await storeOver(simAws).read({
      bucketName: "cdk-assets",
      objectKey,
    });

    // Then it gives back the body the object holds, as text.
    assertIdentical(read, definition);
  });

  it("answers for a key the bucket holds nothing under", async () => {
    // Given a bucket with nothing in it.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "cdk-assets" }));

    // When the store reads a key that was never put there.
    const read = await storeOver(simAws).read({
      bucketName: "cdk-assets",
      objectKey,
    });

    // Then it answers with nothing, which is what the Resource is skipped on.
    assertUndefined(read);
  });

  it("answers for a bucket that is not there", async () => {
    // Given a simulation holding no buckets at all, as one deploying a
    // template without the assets alongside it has.
    const simAws = new SimAws();

    // When the store reads a location in a bucket nothing created.
    const read = await storeOver(simAws).read({
      bucketName: "cdk-assets",
      objectKey,
    });

    assertUndefined(read);
  });

  it("holds nothing where no object storage is wired up", async () => {
    // Given the store a SimStepFunctions built on its own has.
    const store = new SimStatesNoDefinitionStore();

    // When any location is read.
    const read = await store.read({
      bucketName: "cdk-assets",
      objectKey,
    });

    // Then it answers the way it answers for an object that is absent. Object
    // storage is another simulated service, reached through SimAws.
    assertUndefined(read);
  });
});
