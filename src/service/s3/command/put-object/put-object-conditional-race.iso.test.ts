import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayIdentical,
  assertIdentical,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimSdk } from "../../../../sdk/index.js";

/**
 * Conditional puts racing for one key.
 *
 * Real S3 lets the first conditional write to finish succeed and refuses the
 * rest with PreconditionFailed.
 */
describe("S3 PutObjectCommand conditional writes racing for one key", () => {
  it("lets one of several concurrent conditional puts through", async () => {
    // Given an intercepted client and an empty Bucket.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const key = `${faker.string.uuid()}.txt`;
    const bodies = [faker.lorem.sentence(), faker.lorem.sentence()];

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));

    // When two puts race to write the same key only if it is empty.
    const outcomes = await Promise.all(
      bodies.map(async (item) => {
        try {
          await client.send(
            new PutObjectCommand({
              Bucket: bucketName,
              Key: key,
              Body: item,
              IfNoneMatch: "*",
            }),
          );

          return { item, refusal: undefined };
        } catch (error) {
          return { item, refusal: (error as Error).name };
        }
      }),
    );

    // Then the first to finish wins and the other is refused.
    const refusals = outcomes.flatMap(({ refusal }) =>
      refusal === undefined ? [] : [refusal],
    );
    const [winner, ...others] = outcomes.flatMap(({ item, refusal }) =>
      refusal === undefined ? [item] : [],
    );
    assertArrayIdentical(refusals, ["PreconditionFailed"]);
    assertArrayEmpty(others);

    const stored = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertIdentical(await stored.Body?.transformToString(), winner);
  });
});
