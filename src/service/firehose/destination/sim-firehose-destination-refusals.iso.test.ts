import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCreateDeliveryStreamCommandInput } from "../command/stream/stream.command.js";
import {
  SimFirehoseInvalidArgumentException,
  SimFirehoseUnsimulatedDestination,
} from "../error/sim-firehose.error.js";

/**
 * Try to create a delivery stream, and hand back what refused it.
 */
async function refusalOf(
  input: SimCreateDeliveryStreamCommandInput,
): Promise<Error> {
  const simAws = new SimAws();

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));

  const error = await assertThrowsErrorAsync(async () => {
    await simAws.firehose().createDeliveryStream({ input });
  });

  assertUndefined(simAws.firehose().findDeliveryStream("order-events"));

  return error;
}

describe("What a simulated Firehose delivery stream refuses to be", () => {
  it("refuses a destination other than S3, by name", async () => {
    // Given a delivery stream declared against Redshift.
    // When it is created.
    const error = await refusalOf({
      DeliveryStreamName: "order-events",
      RedshiftDestinationConfiguration: {
        RoleARN: "arn:aws:iam::888888888888:role/OrderArchiveRole",
      },
    });

    // Then the refusal names the destination, so a test knows what Yulin will
    // not do rather than watching an empty Bucket.
    assertInstanceOf(error, SimFirehoseUnsimulatedDestination);
    assertStringIncludes(error.message, "RedshiftDestinationConfiguration");
    assertStringIncludes(error.message, "S3 only");
  });

  it("refuses an OpenSearch destination the same way", async () => {
    const error = await refusalOf({
      DeliveryStreamName: "order-events",
      AmazonopensearchserviceDestinationConfiguration: { IndexName: "orders" },
    });

    assertInstanceOf(error, SimFirehoseUnsimulatedDestination);
    assertStringIncludes(
      error.message,
      "AmazonopensearchserviceDestinationConfiguration",
    );
  });

  it("refuses a delivery stream declaring no destination", async () => {
    const error = await refusalOf({ DeliveryStreamName: "order-events" });

    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "no destination");
  });

  it("refuses a delivery stream declaring both S3 destinations", async () => {
    // Given a delivery stream declaring the same destination twice, in the
    // extended form and the plain one.
    const error = await refusalOf({
      DeliveryStreamName: "order-events",
      ExtendedS3DestinationConfiguration: validS3Destination,
      S3DestinationConfiguration: validS3Destination,
    });

    // Then it is refused, as real Firehose refuses a request naming more than
    // one destination.
    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "one destination");
  });
});
