import {
  CopyObjectCommand,
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
 * Conditional copies racing for one key.
 *
 * Real S3 lets the first conditional write to finish succeed and refuses the
 * rest with PreconditionFailed.
 */
describe("S3 CopyObjectCommand conditional writes racing for one key", () => {
  it("lets one of several concurrent conditional copies through", async () => {
    // Given two source Objects and a destination key nothing has written.
    using simSdk = new SimSdk();
    const client = new S3Client({ region: "us-east-1" });
    simSdk.intercept(client);

    const bucketName = `conditional-${faker.string.uuid()}`;
    const sources = [
      `${faker.string.uuid()}.txt`,
      `${faker.string.uuid()}.txt`,
    ];
    const destination = `${faker.string.uuid()}.txt`;

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await Promise.all(
      sources.map(async (source) =>
        client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: source,
            Body: source,
          }),
        ),
      ),
    );

    // When both are copied to the destination at once, each only if it is
    // empty.
    const outcomes = await Promise.all(
      sources.map(async (item) => {
        try {
          await client.send(
            new CopyObjectCommand({
              Bucket: bucketName,
              Key: destination,
              CopySource: `${bucketName}/${item}`,
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
      new GetObjectCommand({ Bucket: bucketName, Key: destination }),
    );
    assertIdentical(await stored.Body?.transformToString(), winner);
  });
});
