import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { DeleteStackCommand } from "@aws-sdk/client-cloudformation";
import {
  CreateLogStreamCommand,
  DescribeMetricFiltersCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/30/[$LATEST]abc";
const startedAt = new Date("2026-08-30T09:00:00.000Z");

/** The transformation most of these cases deploy. */
const countErrors: SimCfnTemplateValueRecord = {
  MetricNamespace: "Orders",
  MetricName: "HandlerErrors",
  MetricValue: "1",
};

/**
 * Deploy a stack declaring a log group and a metric filter over it.
 */
async function deployMetricFilter(
  properties: SimCfnTemplateValueRecord,
): Promise<{ readonly simAws: SimAws; readonly stack: SimCfnDeployedStack }> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);

  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        OrdersLogs: {
          Type: "AWS::Logs::LogGroup",
          Properties: { LogGroupName: logGroupName },
        },
        OrdersErrors: {
          Type: "AWS::Logs::MetricFilter",
          Properties: { LogGroupName: { Ref: "OrdersLogs" }, ...properties },
        },
      },
      Outputs: { FilterName: { Value: { Ref: "OrdersErrors" } } },
    },
  });

  return { simAws, stack };
}

describe("AWS::Logs::MetricFilter", () => {
  it("deploys a filter that counts what the log group is written", async () => {
    // Given a deployed stack declaring a log group and a filter over it.
    const { simAws } = await deployMetricFilter({
      FilterName: "handler-errors",
      FilterPattern: "ERROR",
      MetricTransformations: [countErrors],
    });

    // When a matching line is written to the group.
    await simAws
      .logs()
      .createLogStream(
        new CreateLogStreamCommand({ logGroupName, logStreamName }),
      );
    await simAws.logs().putLogEvents(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [
          { message: "ERROR order failed", timestamp: startedAt.getTime() },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the deployed filter counted it, so a stack's own alarm has a
    // datapoint to read.
    const endTime = new Date(startedAt.getTime() + 60_000);
    const statistics = new GetMetricStatisticsCommand({
      Namespace: "Orders",
      MetricName: "HandlerErrors",
      StartTime: startedAt,
      EndTime: endTime,
      Period: 60,
      Statistics: ["Sum"],
    });
    const { Datapoints } = await simAws
      .cloudWatch()
      .getMetricStatistics(statistics);

    assertIdentical(Datapoints?.at(0)?.Sum, 1);
  });

  it("resolves Ref to the filter name", async () => {
    // Given a deployed stack whose output Refs the filter.
    const { stack } = await deployMetricFilter({
      FilterName: "handler-errors",
      FilterPattern: "ERROR",
      MetricTransformations: [countErrors],
    });

    // Then Ref is the name, as real CloudFormation returns it.
    assertIdentical(stack.output("FilterName"), "handler-errors");
  });

  it("names an unnamed filter after the stack and the logical ID", async () => {
    // Given a deployed stack whose filter carries no FilterName, which is what
    // the CDK MetricFilter construct emits unless one is given.
    const { simAws, stack } = await deployMetricFilter({
      FilterPattern: "ERROR",
      MetricTransformations: [countErrors],
    });

    // Then it was named for the stack and the logical ID, and that is the name
    // the group holds it under.
    const generated = stack.output("FilterName");

    assertStringIncludes(generated, "orders");
    assertStringIncludes(generated, "OrdersErrors");

    const { metricFilters } = await simAws
      .logs()
      .describeMetricFilters(
        new DescribeMetricFiltersCommand({ logGroupName }),
      );

    assertIdentical(metricFilters?.at(0)?.filterName, generated);
  });

  it("reads a transformation's dimensions from the template's list shape", async () => {
    // Given a filter whose transformation carries Dimensions, which the
    // template holds as Key and Value pairs rather than as a map.
    const { simAws } = await deployMetricFilter({
      FilterName: "handler-errors",
      FilterPattern: "ERROR",
      MetricTransformations: [
        {
          ...countErrors,
          Unit: "Count",
          DefaultValue: 0,
          Dimensions: [{ Key: "service", Value: "orders" }],
        },
      ],
    });

    // Then the deployed filter carries them the way the API reports them.
    const { metricFilters } = await simAws
      .logs()
      .describeMetricFilters(
        new DescribeMetricFiltersCommand({ logGroupName }),
      );
    const transformation = metricFilters?.at(0)?.metricTransformations.at(0);

    assertNonNullable(transformation);
    assertIdentical(transformation.dimensions?.["service"], "orders");
    assertIdentical(transformation.unit, "Count");
    assertIdentical(transformation.defaultValue, 0);
  });

  it("takes the filter down with the stack", async () => {
    // Given a deployed stack with a filter on a log group.
    const { simAws } = await deployMetricFilter({
      FilterName: "handler-errors",
      FilterPattern: "ERROR",
      MetricTransformations: [countErrors],
    });

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "orders" }));
    await simAws.backgroundTasksComplete();

    // Then the group and the filter on it went with it, as in an account.
    assertArrayLength(simAws.logs().allLogGroups(), 0);
  });

  it("records the properties it does not act on", async () => {
    // Given a filter declaring a property this simulation leaves alone.
    const { stack } = await deployMetricFilter({
      FilterName: "handler-errors",
      FilterPattern: "ERROR",
      ApplyOnTransformedLogs: true,
      MetricTransformations: [countErrors],
    });

    // Then it deployed, and the property it stepped over is recorded so a
    // reader can see what the filter is not doing.
    const resource = stack.resources.find(
      (deployed) => deployed.logicalId === "OrdersErrors",
    );

    assertNonNullable(resource);
    assertArrayLength(resource.ignoredProperties, 1);
    assertStringIncludes(
      resource.ignoredProperties.at(0)?.reason ?? "",
      "log transformers are absent",
    );
  });

  it("fails the Resource where a transformation cannot be read", async () => {
    // When a template declares a transformation that is not a list.
    const error = await assertThrowsErrorAsync(
      async () =>
        await deployMetricFilter({
          FilterName: "handler-errors",
          FilterPattern: "ERROR",
          MetricTransformations: countErrors,
        }),
    );

    // Then the Resource fails rather than deploying a filter that counts
    // nothing, and the message names the Resource and what was wrong.
    assertStringIncludes(error.message, "OrdersErrors");
    assertStringIncludes(error.message, "MetricTransformations must be a list");
  });
});
