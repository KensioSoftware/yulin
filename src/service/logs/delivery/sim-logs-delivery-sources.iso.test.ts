import {
  DeleteDeliverySourceCommand,
  DescribeDeliverySourcesCommand,
  PutDeliverySourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";
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

const distributionArn = "arn:aws:cloudfront::123456789012:distribution/E1EX";
const sourceName = "site-access-logs";

async function putSource(
  simAws: SimAws,
  name = sourceName,
  resourceArn = distributionArn,
): Promise<void> {
  await simAws.logs().putDeliverySource(
    new PutDeliverySourceCommand({
      name,
      resourceArn,
      logType: "ACCESS_LOGS",
    }),
  );
}

describe("simulated CloudWatch Logs delivery sources", () => {
  it("puts a delivery source over a distribution", async () => {
    // Given a simulated account.
    const simAws = new SimAws();

    // When a delivery source is put over a distribution.
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
    await putSource(simAws, "other-access-logs", `${distributionArn}2`);

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
    await putSource(simAws, "other-access-logs", `${distributionArn}2`);

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

    await putSource(simAws);

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
});
