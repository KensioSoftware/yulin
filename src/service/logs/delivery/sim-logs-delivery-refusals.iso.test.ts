import {
  CreateDeliveryCommand,
  PutDeliveryDestinationCommand,
  PutDeliverySourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const distributionArn = "arn:aws:cloudfront::123456789012:distribution/E1EX";
const bucketArn = "arn:aws:s3:::example-access-logs";
const logGroupArn = "arn:aws:logs:us-east-1:123456789012:log-group:/site";
const sourceName = "site-access-logs";

async function givenSource(simAws: SimAws): Promise<void> {
  await simAws.logs().putDeliverySource(
    new PutDeliverySourceCommand({
      name: sourceName,
      resourceArn: distributionArn,
      logType: "ACCESS_LOGS",
    }),
  );
}

async function givenDestination(
  simAws: SimAws,
  name: string,
  destinationResourceArn: string,
): Promise<string> {
  const put = await simAws.logs().putDeliveryDestination(
    new PutDeliveryDestinationCommand({
      name,
      deliveryDestinationConfiguration: { destinationResourceArn },
    }),
  );

  return put.deliveryDestination?.arn ?? "";
}

describe("simulated CloudWatch Logs delivery refusals", () => {
  it("refuses a delivery from a source that is not there", async () => {
    // Given a destination and no delivery source.
    const simAws = new SimAws();
    const deliveryDestinationArn = await givenDestination(
      simAws,
      "site-access-logs",
      bucketArn,
    );

    // When a delivery names a source that was never put.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.logs().createDelivery(
        new CreateDeliveryCommand({
          deliverySourceName: sourceName,
          deliveryDestinationArn,
        }),
      );
    });

    // Then it is reported as missing rather than left pointing at nothing.
    assertIdentical(error.name, "ResourceNotFoundException");
    assertStringIncludes(error.message, sourceName);
  });

  it("refuses a delivery to a destination that is not there", async () => {
    // Given a delivery source and no destination.
    const simAws = new SimAws();

    await givenSource(simAws);

    // When a delivery names a destination ARN nothing was created under.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.logs().createDelivery(
        new CreateDeliveryCommand({
          deliverySourceName: sourceName,
          deliveryDestinationArn:
            "arn:aws:logs:us-east-1:123456789012:delivery-destination:gone",
        }),
      );
    });

    // Then it is reported as missing.
    assertIdentical(error.name, "ResourceNotFoundException");
    assertStringIncludes(error.message, "delivery-destination:gone");
  });

  it("refuses a second delivery joining the same pair", async () => {
    // Given a source and destination already joined.
    const simAws = new SimAws();

    await givenSource(simAws);

    const deliveryDestinationArn = await givenDestination(
      simAws,
      "site-access-logs",
      bucketArn,
    );

    await simAws.logs().createDelivery(
      new CreateDeliveryCommand({
        deliverySourceName: sourceName,
        deliveryDestinationArn,
      }),
    );

    // When the same pair is joined again.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.logs().createDelivery(
        new CreateDeliveryCommand({
          deliverySourceName: sourceName,
          deliveryDestinationArn,
        }),
      );
    });

    // Then it is refused rather than left duplicating the first.
    assertIdentical(error.name, "ConflictException");
    assertStringIncludes(error.message, "already delivers to");
  });

  it("refuses a suffix path naming a variable nothing substitutes", async () => {
    // Given a source and an S3 destination.
    const simAws = new SimAws();

    await givenSource(simAws);

    const deliveryDestinationArn = await givenDestination(
      simAws,
      "site-access-logs",
      bucketArn,
    );

    // When a delivery asks for a partition variable spelled the wrong way.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.logs().createDelivery(
        new CreateDeliveryCommand({
          deliverySourceName: sourceName,
          deliveryDestinationArn,
          s3DeliveryConfiguration: { suffixPath: "{DistributionID}/{yyyy}" },
        }),
      );
    });

    // Then it is refused, because delivery would write the text out literally
    // and the bucket would look partitioned when it was not.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "{DistributionID}");
  });

  it("refuses an S3 layout on a destination that is not S3", async () => {
    // Given a source and a log group destination.
    const simAws = new SimAws();

    await givenSource(simAws);

    const deliveryDestinationArn = await givenDestination(
      simAws,
      "to-log-group",
      logGroupArn,
    );

    // When a delivery to it asks for an S3 layout.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.logs().createDelivery(
        new CreateDeliveryCommand({
          deliverySourceName: sourceName,
          deliveryDestinationArn,
          s3DeliveryConfiguration: { enableHiveCompatiblePath: true },
        }),
      );
    });

    // Then it is refused: a log group has no keys to lay anything out under.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "only applies to an S3");
  });
});
