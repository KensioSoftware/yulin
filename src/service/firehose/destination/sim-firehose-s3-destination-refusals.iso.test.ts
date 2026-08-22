import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCreateDeliveryStreamCommandInput } from "../command/stream/stream.command.js";
import type { SimFirehoseS3DestinationInput } from "./sim-firehose-s3-destination.js";

const bucketArn = "arn:aws:s3:::order-archive";

const roleArn = "arn:aws:iam::888888888888:role/OrderArchiveRole";

const validDestination = { BucketARN: bucketArn, RoleARN: roleArn };

/**
 * Try to create a delivery stream, and hand back the message that refused it.
 *
 * Every refusal here is an `InvalidArgumentException`, and what a test cares
 * about is which field it named.
 */
async function refusalOf(
  input: SimCreateDeliveryStreamCommandInput,
): Promise<string> {
  const simAws = new SimAws();

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

  const error = await assertThrowsErrorAsync(async () => {
    await simAws.firehose().createDeliveryStream({ input });
  });

  assertIdentical(error.name, "InvalidArgumentException");
  assertUndefined(simAws.firehose().findDeliveryStream("order-events"));

  return error.message;
}

/**
 * Try to create a delivery stream against a destination, under a valid name.
 */
async function destinationRefusal(
  destination: SimFirehoseS3DestinationInput,
): Promise<string> {
  return await refusalOf({
    DeliveryStreamName: "order-events",
    ExtendedS3DestinationConfiguration: destination,
  });
}

describe("What a simulated Firehose S3 destination refuses", () => {
  it("refuses a BucketARN that names no Bucket", async () => {
    // Given an Object ARN, which carries a key after the Bucket name.
    assertStringIncludes(
      await destinationRefusal({
        BucketARN: `${bucketArn}/orders`,
        RoleARN: roleArn,
      }),
      "does not name a Bucket",
    );

    // And a bare Bucket name, which is no ARN at all.
    assertStringIncludes(
      await destinationRefusal({
        BucketARN: "order-archive",
        RoleARN: roleArn,
      }),
      "does not name a Bucket",
    );
  });

  it("refuses a destination missing its Role", async () => {
    // Given a destination with no RoleARN, and one with an empty string.
    assertStringIncludes(
      await destinationRefusal({ BucketARN: bucketArn }),
      "RoleARN",
    );
    assertStringIncludes(
      await destinationRefusal({ BucketARN: bucketArn, RoleARN: "" }),
      "RoleARN",
    );
  });

  it("refuses a destination missing its Bucket", async () => {
    // Given a destination with no BucketARN, and one with an empty string.
    assertStringIncludes(
      await destinationRefusal({ RoleARN: roleArn }),
      "BucketARN",
    );
    assertStringIncludes(
      await destinationRefusal({ BucketARN: "", RoleARN: roleArn }),
      "BucketARN",
    );
  });

  it("refuses buffering outside the bounds Firehose allows", async () => {
    // Given buffering hints asking for more than the largest buffer, and for
    // longer than the longest Firehose waits.
    assertStringIncludes(
      await destinationRefusal({
        ...validDestination,
        BufferingHints: { SizeInMBs: 129 },
      }),
      "SizeInMBs",
    );
    assertStringIncludes(
      await destinationRefusal({
        ...validDestination,
        BufferingHints: { IntervalInSeconds: 901 },
      }),
      "IntervalInSeconds",
    );
  });

  it("refuses a delivery stream name Firehose would not take", async () => {
    // Given a name carrying a character Firehose will not accept, one longer
    // than it allows, and a request naming none at all.
    assertStringIncludes(
      await refusalOf({
        DeliveryStreamName: "order events",
        ExtendedS3DestinationConfiguration: validDestination,
      }),
      "letters, digits",
    );
    assertStringIncludes(
      await refusalOf({
        DeliveryStreamName: "a".repeat(65),
        ExtendedS3DestinationConfiguration: validDestination,
      }),
      "64",
    );
    assertStringIncludes(
      await refusalOf({
        ExtendedS3DestinationConfiguration: validDestination,
      }),
      "DeliveryStreamName is required",
    );
  });
});
