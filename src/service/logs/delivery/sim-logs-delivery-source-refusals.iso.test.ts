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
import {
  simLogsDeliveryDistributionArn,
  simLogsDistributionArn,
} from "../../../../test/logs/delivery-distribution-fixture.js";

const distributionArn = "arn:aws:cloudfront::888888888888:distribution/E1EX";
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
    const resourceArn = await simLogsDeliveryDistributionArn(simAws);

    await simAws
      .logs()
      .putDeliverySource(
        new PutDeliverySourceCommand(putSourceInput({ resourceArn })),
      );

    // When a second source is put over the same distribution.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.logs().putDeliverySource(
        new PutDeliverySourceCommand(
          putSourceInput({
            name: "second-access-logs",
            resourceArn,
          }),
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

  it("refuses a delivery source over a distribution that is not there", async () => {
    // Given a simulated account holding no distributions.
    const simAws = new SimAws();

    // When a delivery source names one anyway, as a template pinning the
    // distribution id of a real account does.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .putDeliverySource(new PutDeliverySourceCommand(putSourceInput()));
    });

    // Then it is refused. An account does the same with a source over a
    // resource it has never held.
    assertIdentical(error.name, "ResourceNotFoundException");
    assertStringIncludes(error.message, "names no CloudFront distribution");
    assertStringIncludes(error.message, "888888888888");
  });

  it("refuses a delivery source over another account's distribution", async () => {
    // Given a distribution in the simulated account, named by an ARN that
    // says it belongs to another one.
    const simAws = new SimAws();
    const held = await simLogsDeliveryDistributionArn(simAws);
    const distributionId = held.split("/").at(-1) ?? "";

    // When a delivery source is put over that ARN.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.logs().putDeliverySource(
        new PutDeliverySourceCommand(
          putSourceInput({
            resourceArn: `arn:aws:cloudfront::207763040965:distribution/${distributionId}`,
          }),
        ),
      );
    });

    // Then the account segment is read. An id that happens to match one this
    // account holds carries a foreign ARN through without it.
    assertIdentical(error.name, "ResourceNotFoundException");
    assertStringIncludes(error.message, "names account 207763040965");
    assertIdentical(simLogsDistributionArn(simAws, distributionId), held);
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

  it("refuses a resourceArn that is not the ARN of a resource", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a delivery source names something that is not an ARN, then a
    // string naming a service and no resource, then one whose resource is
    // only the separators between empty segments.
    const bare = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .putDeliverySource(
          new PutDeliverySourceCommand(putSourceInput({ resourceArn: "E1EX" })),
        );
    });
    const serviceOnly = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .putDeliverySource(
          new PutDeliverySourceCommand(
            putSourceInput({ resourceArn: "arn:aws:cloudfront" }),
          ),
        );
    });
    const separators = await assertThrowsErrorAsync(async () => {
      await simAws.logs().putDeliverySource(
        new PutDeliverySourceCommand(
          putSourceInput({
            resourceArn: "arn:aws:cloudfront::123456789012::",
          }),
        ),
      );
    });

    // Then both are refused. The service being logged is read from the ARN,
    // and a source over a service with no resource delivers nothing.
    assertIdentical(bare.name, "ValidationException");
    assertStringIncludes(bare.message, "is not the ARN of a resource");
    assertIdentical(serviceOnly.name, "ValidationException");
    assertStringIncludes(serviceOnly.message, "is not the ARN of a resource");
    assertIdentical(separators.name, "ValidationException");
    assertStringIncludes(separators.message, "is not the ARN of a resource");
  });

  it("refuses a log type CloudFront does not deliver", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a delivery source over a distribution asks for another log type.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .putDeliverySource(
          new PutDeliverySourceCommand(putSourceInput({ logType: "OTHER" })),
        );
    });

    // Then it is refused. Standard logging v2 carries access logs and nothing
    // else.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "ACCESS_LOGS is the only one it has");
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
