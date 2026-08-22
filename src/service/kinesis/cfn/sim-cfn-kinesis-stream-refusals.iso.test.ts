import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Deploy a stream declared with the given properties, giving back whatever the
 * deployment was refused with.
 */
async function refusalFrom(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersStream: {
            Type: "AWS::Kinesis::Stream",
            Properties: properties,
          },
        },
      },
    });
    await stack.waitForDeployComplete();
  });
}

describe("What a deployed AWS::Kinesis::Stream refuses", () => {
  it("refuses a shard count Kinesis would not accept", async () => {
    // When a template declares a stream with no shards.
    const error = await refusalFrom({ Name: "orders", ShardCount: 0 });

    // Then the deployment is refused in the words CreateStream refuses it in,
    // with the Resource named so the template can be found.
    assertStringIncludes(error.message, "OrdersStream");
    assertStringIncludes(error.message, "ShardCount 0");
  });

  it("refuses a stream name Kinesis would not accept", async () => {
    // When a template declares a stream with a slash in its name.
    const error = await refusalFrom({ Name: "orders/live" });

    // Then the deployment is refused rather than deploying a stream nothing
    // could reach by the name the template used.
    assertStringIncludes(error.message, "OrdersStream");
    assertStringIncludes(error.message, "letters, digits");
  });

  it("refuses a retention Kinesis would not accept", async () => {
    // When a template declares more retention than Kinesis keeps.
    const error = await refusalFrom({
      Name: "orders",
      RetentionPeriodHours: 8761,
    });

    // Then the deployment is refused.
    assertStringIncludes(error.message, "8760 hours Kinesis accepts");
  });

  it("refuses a shard count on an on-demand stream", async () => {
    // When a template declares both, which real Kinesis refuses together.
    const error = await refusalFrom({
      Name: "orders",
      ShardCount: 2,
      StreamModeDetails: { StreamMode: "ON_DEMAND" },
    });

    // Then the deployment is refused.
    assertStringIncludes(error.message, "ON_DEMAND");
  });

  it("refuses a property whose shape the template got wrong", async () => {
    // Given templates that put the wrong kind of value in each place.
    const wrongShapes: readonly (readonly [
      SimCfnTemplateValueRecord,
      string,
    ])[] = [
      [{ Name: { Ref: "Elsewhere" } }, "Name must be a string"],
      [{ Name: "orders", ShardCount: "two" }, "ShardCount must be a number"],
      [
        { Name: "orders", RetentionPeriodHours: "a week" },
        "RetentionPeriodHours must be a number",
      ],
      [
        { Name: "orders", StreamModeDetails: "ON_DEMAND" },
        "StreamModeDetails must be an object",
      ],
      [
        { Name: "orders", StreamModeDetails: { StreamMode: 1 } },
        "StreamModeDetails.StreamMode must be a string",
      ],
      [{ Name: "orders", Tags: { team: "orders" } }, "Tags must be a list"],
      [
        { Name: "orders", Tags: [{ Key: "team" }] },
        "Tags entries must each carry a string Key and Value",
      ],
    ];

    // When each is deployed.
    // Then each is refused saying which property is wrong, rather than
    // reaching CreateStream with something it cannot explain.
    for (const [properties, expected] of wrongShapes) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await refusalFrom(properties);
      assertStringIncludes(error.message, expected);
    }
  });
});
