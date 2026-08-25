import {
  DeleteDeliverySourceCommand,
  DescribeDeliverySourcesCommand,
  PutDeliverySourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { assertThrowsErrorAsync } from "@kensio/smartass";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimLogs } from "../sim-logs.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";
import { simLogsDeliveryDistributionArn } from "../../../../test/logs/delivery-distribution-fixture.js";

const sourceName = "site-access-logs";

/**
 * Put a delivery source over a distribution of its own, and report the ARN it
 * was put over.
 */
async function putSource(simAws: SimAws, name = sourceName): Promise<string> {
  const resourceArn = await simLogsDeliveryDistributionArn(simAws, name);

  await simAws.logs().putDeliverySource(
    new PutDeliverySourceCommand({
      name,
      resourceArn,
      logType: "ACCESS_LOGS",
    }),
  );

  return resourceArn;
}

describe("simulated CloudWatch Logs delivery sources", () => {
  it("puts a delivery source over a distribution", async () => {
    // Given a distribution in the simulated account.
    const simAws = new SimAws();
    const distributionArn = await simLogsDeliveryDistributionArn(simAws);

    // When a delivery source is put over it.
    const put = await simAws.logs().putDeliverySource(
      new PutDeliverySourceCommand({
        name: sourceName,
        resourceArn: distributionArn,
        logType: "ACCESS_LOGS",
      }),
    );

    // Then it comes back with the service CloudWatch Logs read off the ARN,
    // which the caller never states.
    const source = put.deliverySource;

    assertNonNullable(source);
    assertIdentical(source.name, sourceName);
    assertIdentical(source.service, "cloudfront");
    assertIdentical(source.logType, "ACCESS_LOGS");
    assertArrayEquals(source.resourceArns, [distributionArn]);
    assertStringIncludes(source.arn, ":us-east-1:");
    assertStringIncludes(source.arn, `:delivery-source:${sourceName}`);
  });

  it("describes the delivery sources in the account", async () => {
    // Given two delivery sources over different distributions.
    const simAws = new SimAws();

    await putSource(simAws);
    await putSource(simAws, "other-access-logs");

    // When the delivery sources are described.
    const described = await simAws
      .logs()
      .describeDeliverySources(new DescribeDeliverySourcesCommand({}));

    // Then both are reported, in the order they were put.
    assertArrayEquals(
      (described.deliverySources ?? []).map((source) => source.name),
      [sourceName, "other-access-logs"],
    );
    assertUndefined(described.nextToken);
  });

  it("pages the delivery sources it describes", async () => {
    // Given two delivery sources.
    const simAws = new SimAws();

    await putSource(simAws);
    await putSource(simAws, "other-access-logs");

    // When one is asked for at a time.
    const first = await simAws
      .logs()
      .describeDeliverySources(
        new DescribeDeliverySourcesCommand({ limit: 1 }),
      );
    const second = await simAws.logs().describeDeliverySources(
      new DescribeDeliverySourcesCommand({
        limit: 1,
        nextToken: first.nextToken,
      }),
    );

    // Then the token reaches the second, and the listing ends there.
    assertArrayLength(first.deliverySources ?? [], 1);
    assertNonNullable(first.nextToken);
    assertArrayEquals(
      (second.deliverySources ?? []).map((source) => source.name),
      ["other-access-logs"],
    );
    assertUndefined(second.nextToken);
  });

  it("updates a delivery source put again under the same name", async () => {
    // Given a delivery source over a distribution.
    const simAws = new SimAws();
    const distributionArn = await putSource(simAws);

    // When the same name is put again for the same distribution.
    await simAws.logs().putDeliverySource(
      new PutDeliverySourceCommand({
        name: sourceName,
        resourceArn: distributionArn,
        logType: "ACCESS_LOGS",
      }),
    );

    // Then there is still only the one source, as there is on real AWS.
    assertArrayLength(simAws.logs().allDeliverySources(), 1);
  });

  it("takes a delivery source for a service outside us-east-1", async () => {
    // Given a simulated account in another region.
    const simAws = new SimAws();
    const logs = simAws.account().region("eu-west-2").logs();

    // When a delivery source is put over a resource in that region.
    await logs.putDeliverySource(
      new PutDeliverySourceCommand({
        name: "model-invocation-logs",
        resourceArn: "arn:aws:bedrock:eu-west-2:123456789012:model-invocation",
        logType: "INVOCATION_LOGS",
      }),
    );

    // Then it is created: only CloudFront delivery is pinned to one region.
    assertNonNullable(logs.findDeliverySource("model-invocation-logs"));
  });

  it("takes a delivery source in a simulation with no CloudFront", async () => {
    // Given simulated CloudWatch Logs on its own, which has no CloudFront to
    // find a distribution in.
    const logs = new SimLogs({
      accountRegionScope: simAwsAccountRegionScopeFactory.make({
        regionName: "us-east-1",
      }),
    });

    // When a delivery source is put over a distribution ARN.
    await logs.putDeliverySource({
      input: {
        name: sourceName,
        resourceArn: "arn:aws:cloudfront::888888888888:distribution/E1EX",
        logType: "ACCESS_LOGS",
      },
    });

    // Then it is created. The account segment goes unread along with the
    // distribution id, and a test about delivery alone needs neither.
    assertNonNullable(logs.findDeliverySource(sourceName));
  });

  it("deletes a delivery source", async () => {
    // Given a delivery source.
    const simAws = new SimAws();

    await putSource(simAws);

    // When it is deleted.
    await simAws
      .logs()
      .deleteDeliverySource(
        new DeleteDeliverySourceCommand({ name: sourceName }),
      );

    // Then the distribution has no delivery source left.
    assertUndefined(simAws.logs().findDeliverySource(sourceName));
  });

  it("takes a page of 50 and refuses one of 51", async () => {
    // Given a delivery source.
    const simAws = new SimAws();

    await putSource(simAws);

    // When the largest page CloudWatch Logs offers is asked for, and then one
    // over it.
    const largest = await simAws
      .logs()
      .describeDeliverySources(
        new DescribeDeliverySourcesCommand({ limit: 50 }),
      );
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .logs()
        .describeDeliverySources(
          new DescribeDeliverySourcesCommand({ limit: 51 }),
        );
    });

    // Then 50 is served and 51 is refused, as an account refuses it.
    assertArrayLength(largest.deliverySources ?? [], 1);
    assertStringIncludes(error.message, "limit");
  });
});
