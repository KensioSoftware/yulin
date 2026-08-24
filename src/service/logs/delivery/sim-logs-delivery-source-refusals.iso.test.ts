import {
  DeleteDeliverySourceCommand,
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
const sourceName = "site-access-logs";

function putSourceInput(
  overrides: Record<string, unknown> = {},
): ConstructorParameters<typeof PutDeliverySourceCommand>[0] {
  return {
    name: sourceName,
    resourceArn: distributionArn,
    logType: "ACCESS_LOGS",
    ...overrides,
  };
}

describe("simulated CloudWatch Logs delivery source refusals", () => {
  it("refuses a second delivery source over the same distribution", async () => {
    // Given a distribution that already has a delivery source.
    const simAws = new SimAws();

    await simAws
      .logs()
      .putDeliverySource(new PutDeliverySourceCommand(putSourceInput()));

    // When a second source is put over the same distribution.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .putDeliverySource(
          new PutDeliverySourceCommand(
            putSourceInput({ name: "second-access-logs" }),
          ),
        );
    });

    // Then it is refused the way an account refuses it, which is what anyone
    // adding a second logging construct to a distribution runs into.
    assertIdentical(error.name, "ConflictException");
    assertIdentical(
      error.message,
      "This ResourceId has already been used in another Delivery Source in " +
        "this account",
    );
  });

  it("refuses a CloudFront delivery source outside us-east-1", async () => {
    // Given a simulated account in the region the rest of a stack lives in.
    const simAws = new SimAws();

    // When a CloudFront delivery source is put from there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .account()
        .region("eu-west-2")
        .logs()
        .putDeliverySource(new PutDeliverySourceCommand(putSourceInput()));
    });

    // Then it is refused, rather than creating a source the distribution
    // would never deliver to.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "only be created in us-east-1");
    assertStringIncludes(error.message, "made in eu-west-2");
  });

  it("refuses a resourceArn that is not an ARN", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a delivery source names something that is not an ARN.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .putDeliverySource(
          new PutDeliverySourceCommand(putSourceInput({ resourceArn: "E1EX" })),
        );
    });

    // Then it is refused: the service being logged is read from the ARN, and
    // a source with no service delivers nothing.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "is not an ARN");
  });

  it("refuses tags rather than dropping them", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a delivery source is put with tags on it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .putDeliverySource(
          new PutDeliverySourceCommand(
            putSourceInput({ tags: { Environment: "test" } }),
          ),
        );
    });

    // Then it is refused, because nothing reads a tag back here.
    assertIdentical(error.name, "UnsupportedOperationException");
    assertStringIncludes(error.message, "PutDeliverySource");
  });

  it("refuses a delivery source with no name", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a delivery source is put without a name.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .putDeliverySource(
          new PutDeliverySourceCommand(putSourceInput({ name: undefined })),
        );
    });

    // Then it is refused as a validation error, which is how the delivery
    // operations report a missing field.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "Value at 'name'");
  });

  it("refuses deleting a delivery source that is not there", async () => {
    // Given a simulated account with no delivery sources.
    const simAws = new SimAws();

    // When one is deleted anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .deleteDeliverySource(
          new DeleteDeliverySourceCommand({ name: sourceName }),
        );
    });

    // Then it is reported as missing rather than passing silently.
    assertIdentical(error.name, "ResourceNotFoundException");
    assertStringIncludes(error.message, sourceName);
  });
});
