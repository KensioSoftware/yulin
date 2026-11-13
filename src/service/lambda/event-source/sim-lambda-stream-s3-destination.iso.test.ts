import { GetObjectCommand } from "@aws-sdk/client-s3";
import { assertNonNullable } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  bucketKeys,
  failingMappingWithBucket,
  writeStreamRecord,
} from "../../../../test/lambda/stream-s3-destination-fixture.js";
import { simS3BodyToBuffer } from "../../s3/storage/s3-body-buffer.js";

describe("an S3 Bucket as a stream mapping's failure destination", () => {
  for (const source of ["dynamodb", "kinesis"] as const) {
    it(`writes a failed ${source} batch to the Bucket with its records`, async () => {
      // Given a failing mapping whose role may write to the Bucket.
      const { simAws, bucket, uuid, events } = await failingMappingWithBucket(
        source,
        ["s3:PutObject", "s3:ListBucket"],
      );

      // When a record exhausts its retries.
      await writeStreamRecord(simAws, source);
      await simAws.clock().advanceBy({ hours: 1 });

      // Then one object holds the failure record, keyed by mapping and shard,
      // with the event the function was handed as its payload.
      const keys = await bucketKeys(simAws, bucket);
      expect(keys).toHaveLength(1);
      const [key] = keys;
      assertNonNullable(key);
      const prefix = `aws/lambda/${uuid}/`;
      expect(key.startsWith(prefix)).toBe(true);
      expect(key.slice(prefix.length)).toMatch(
        /^shardId-[^/]+\/\d{4}\/\d{2}\/\d{2}\/\d{4}-\d{2}-\d{2}T\d{2}\.\d{2}\.\d{2}-[\da-f-]{36}$/u,
      );
      const object = await simAws
        .s3()
        .getObject(new GetObjectCommand({ Bucket: bucket, Key: key }));
      assertNonNullable(object.Body);
      const bytes = await simS3BodyToBuffer(object.Body);
      const body = JSON.parse(bytes.toString("utf8")) as {
        readonly payload: string;
      };
      expect(body).toMatchObject({
        version: "1.0",
        requestContext: { condition: "RetryAttemptsExhausted" },
      });
      expect(body.payload).toBe(
        JSON.stringify({ Records: events[0]?.Records }),
      );
    });

    it(`refuses a ${source} failure write when the role cannot list the Bucket`, async () => {
      // Given a failing mapping whose role may put objects but not list.
      const { simAws, bucket } = await failingMappingWithBucket(source, [
        "s3:PutObject",
      ]);

      // When a record exhausts its retries.
      await writeStreamRecord(simAws, source);

      // Then the write is refused, and nothing reaches the Bucket.
      await expect(simAws.clock().advanceBy({ seconds: 1 })).rejects.toThrow();
      expect(await bucketKeys(simAws, bucket)).toStrictEqual([]);
    });
  }
});
