import {
  type OutputFormat,
  PutDeliveryDestinationCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const bucketArn = "arn:aws:s3:::example-access-logs";
const logGroupArn = "arn:aws:logs:us-east-1:123456789012:log-group:/site";
const destinationName = "site-access-logs";

async function putDestination(
  simAws: SimAws,
  destinationResourceArn: string,
  outputFormat?: OutputFormat,
): Promise<void> {
  await simAws.logs().putDeliveryDestination(
    new PutDeliveryDestinationCommand({
      name: destinationName,
      outputFormat,
      deliveryDestinationConfiguration: { destinationResourceArn },
    }),
  );
}

describe("simulated CloudWatch Logs delivery destination refusals", () => {
  it("refuses an output format change on an existing destination", async () => {
    // Given a delivery destination written in plain text.
    const simAws = new SimAws();

    await putDestination(simAws, bucketArn, "plain");

    // When the same destination is put again asking for JSON.
    const error = await assertThrowsErrorAsync(async () => {
      await putDestination(simAws, bucketArn, "json");
    });

    // Then it is refused: the format is fixed once the destination exists, so
    // changing it means deleting and making it again.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "cannot be changed");
    assertIdentical(
      simAws.logs().findDeliveryDestination(destinationName)?.outputFormat,
      "plain",
    );
  });

  it("refuses parquet anywhere but S3", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a log group destination asks for parquet.
    const error = await assertThrowsErrorAsync(async () => {
      await putDestination(simAws, logGroupArn, "parquet");
    });

    // Then it is refused, since a log group has no columnar form to hold it.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "only written to an S3 destination");
  });

  it("refuses an output format CloudWatch Logs has no name for", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a destination asks for a format written the way a template author
    // would guess at it.
    const error = await assertThrowsErrorAsync(async () => {
      await putDestination(simAws, bucketArn, "JSON" as OutputFormat);
    });

    // Then it is refused, listing what the API takes.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "json, plain, w3c, raw, parquet");
  });

  it("refuses a destination ARN naming nothing logs can be written to", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a destination names a queue.
    const error = await assertThrowsErrorAsync(async () => {
      await putDestination(simAws, "arn:aws:sqs:us-east-1:123456789012:orders");
    });

    // Then it is refused rather than accepting a destination that would drop
    // everything sent to it.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "names no delivery destination");
  });

  it("refuses a destination with no resource ARN", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a destination is put with an empty configuration.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .putDeliveryDestination(
          new PutDeliveryDestinationCommand({ name: destinationName }),
        );
    });

    // Then it names the field that was missing.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "destinationResourceArn");
  });

  it("refuses an ARN whose service is right and resource is not", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a destination names another delivery destination, which is a logs
    // resource and not a log group.
    const error = await assertThrowsErrorAsync(async () => {
      await putDestination(
        simAws,
        "arn:aws:logs:us-east-1:123456789012:delivery-destination:other",
      );
    });

    // Then it is refused. Reading the service alone would have taken it and
    // built a destination that drops everything sent to it.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "names no delivery destination");
  });
});
