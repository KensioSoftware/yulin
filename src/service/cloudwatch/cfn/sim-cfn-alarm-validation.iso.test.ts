import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * An alarm that fires on one breaching minute, for a refusal to be added to.
 */
const failingOrders: SimCfnTemplateValueRecord = {
  AlarmName: "OrdersFailing",
  Namespace: "Orders",
  MetricName: "Failed",
  Statistic: "Sum",
  Period: 60,
  EvaluationPeriods: 1,
  Threshold: 5,
  ComparisonOperator: "GreaterThanThreshold",
};

/**
 * Deploy one AWS::CloudWatch::Alarm and hand back whatever the deployment
 * failed with.
 *
 * A refusal has to fail the Resource rather than skip it. Sim CloudFormation
 * steps over a Resource whose error reads as unsupported, and stepping over an
 * alarm leaves a stack that looks deployed with nothing watching anything.
 */
async function refusalFor(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await new SimAws().cloudFormation().deployTemplate({
      stackName: "orders",
      template: {
        Resources: {
          OrdersAlarm: {
            Type: "AWS::CloudWatch::Alarm",
            Properties: { ...failingOrders, ...properties },
          },
        },
      },
    });
  });
}

describe("AWS::CloudWatch::Alarm validation", () => {
  it("refuses the alarm forms it does not evaluate", async () => {
    // Given templates asking for metric math, an anomaly band, a percentile
    // and the sample-count rule that only a percentile alarm has.
    const metrics = await refusalFor({
      Metrics: [{ Id: "e1", Expression: "m1/m2" }],
    });
    const anomaly = await refusalFor({ ThresholdMetricId: "ad1" });
    const percentile = await refusalFor({ ExtendedStatistic: "p99" });
    const sampleCount = await refusalFor({
      EvaluateLowSampleCountPercentile: "ignore",
    });

    // Then each is refused in the words PutMetricAlarm refuses it with, rather
    // than deploying an alarm that watches something else entirely.
    assertStringIncludes(
      metrics.message,
      "The parameter Metrics is not simulated",
    );
    assertStringIncludes(
      anomaly.message,
      "The parameter ThresholdMetricId is not simulated",
    );
    assertStringIncludes(
      percentile.message,
      "The parameter ExtendedStatistic is not simulated",
    );
    assertStringIncludes(
      sampleCount.message,
      "The parameter EvaluateLowSampleCountPercentile is not simulated",
    );
  });

  it("refuses an action target that is not an SNS topic", async () => {
    // Given a template asking the alarm to scale a group, as a real one can.
    const error = await refusalFor({
      AlarmActions: [
        "arn:aws:autoscaling:eu-west-2:111111111111:scalingPolicy",
      ],
    });

    // Then the deploy fails rather than leaving a test asserting its alarm
    // fired while the thing the alarm exists to do never happened.
    assertStringIncludes(error.message, "is not simulated: an alarm here");
  });

  it("refuses a period real CloudWatch would refuse", async () => {
    // Given a template asking for a period shorter than a minute.
    const error = await refusalFor({ Period: 30 });

    // Then the deploy fails here rather than on a real one later.
    assertStringIncludes(error.message, "The parameter Period must be");
  });

  it("refuses properties whose types the template got wrong", async () => {
    // Given templates giving properties values of the wrong shape.
    const name = await refusalFor({ AlarmName: { Ref: "Nothing" } });
    const period = await refusalFor({ Period: "often" });
    const enabled = await refusalFor({ ActionsEnabled: "sometimes" });
    const actions = await refusalFor({ AlarmActions: "one-topic" });
    const action = await refusalFor({ AlarmActions: [{ Ref: "Nothing" }] });

    // Then each says which property was wrong, naming the Resource it is on,
    // rather than deploying an alarm configured as something else.
    assertStringIncludes(name.message, "Resource OrdersAlarm");
    assertStringIncludes(name.message, "AlarmName must be a string");
    assertStringIncludes(period.message, "Period must be a number");
    assertStringIncludes(enabled.message, "ActionsEnabled must be a boolean");
    assertStringIncludes(actions.message, "AlarmActions must be a list");
    assertStringIncludes(action.message, "AlarmActions.0 must be a string");
  });

  it("refuses a dimension the template got wrong", async () => {
    // Given templates misspelling half of a dimension, leaving one out, and
    // writing a dimension as something other than an object.
    const misspelled = await refusalFor({
      Dimensions: [{ Name: "Service", Vaule: "checkout" }],
    });
    const missing = await refusalFor({ Dimensions: [{ Name: "Service" }] });
    const shape = await refusalFor({ Dimensions: ["Service=checkout"] });

    // Then each is refused rather than dropped, which would leave the alarm
    // watching a different metric from the one the template named.
    assertStringIncludes(
      misspelled.message,
      "Vaule is not a Dimension property this simulation reads",
    );
    assertStringIncludes(missing.message, "Dimension.Value must be present");
    assertStringIncludes(shape.message, "Dimensions.0 must be an object");
  });
});
