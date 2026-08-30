import { build } from "esbuild";
import {
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaCodeZip } from "../../../lambda/function/code/make-lambda-code-zip.js";

const functionName = "user";
const alarmName = "UserRequestsFailing";
const startedAt = new Date("2026-08-30T09:00:00.000Z");

/**
 * A handler using AWS Lambda Powertools the way a deployed one does. The
 * metrics are constructed at module scope so a warm container reuses them, and
 * Powertools is bundled into the deployment package rather than provided by
 * the runtime.
 *
 * Nothing here calls PutMetricData. Powertools counts by writing an Embedded
 * Metric Format document to stdout, and CloudWatch reads the metric out of the
 * log group, which is what this is here to exercise.
 */
const handlerSource = `
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";

const metrics = new Metrics({ namespace: "ChineseBoost", serviceName: "user" });

export const handler = async () => {
  metrics.addMetric("UserRequestFailed", MetricUnit.Count, 1);
  metrics.publishStoredMetrics();

  return { handled: false };
};
`;

describe("an alarm over a metric a Powertools handler writes as EMF", () => {
  it("fires on what the handler counted, with nothing publishing by hand", async () => {
    // Given a function bundling Powertools, and an alarm over the metric the
    // handler counts.
    const simAws = new SimAws();

    await simAws.clock().setTo(startedAt);
    const zipFile = makeLambdaCodeZip(await bundleHandler());

    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/UserRole`,
        Handler: "index.handler",
        Code: { ZipFile: zipFile },
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.cloudWatch().putMetricAlarm(
      new PutMetricAlarmCommand({
        AlarmName: alarmName,
        Namespace: "ChineseBoost",
        MetricName: "UserRequestFailed",
        Dimensions: [{ Name: "service", Value: "user" }],
        Statistic: "Sum",
        Period: 300,
        EvaluationPeriods: 3,
        DatapointsToAlarm: 1,
        Threshold: 0,
        ComparisonOperator: "GreaterThanThreshold",
        TreatMissingData: "notBreaching",
      }),
    );

    // When the handler runs and counts a failure.
    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: functionName }));
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 6 });

    // Then the alarm fired on the datapoint the EMF document carried, which
    // reached CloudWatch through the handler's own log group.
    const { MetricAlarms } = await simAws
      .cloudWatch()
      .describeAlarms(new DescribeAlarmsCommand({ AlarmNames: [alarmName] }));

    assertIdentical(MetricAlarms?.at(0)?.StateValue, "ALARM");
    assertArrayLength(simAws.logs().metricPublicationFailures, 0);
    assertArrayLength(simAws.cloudWatch().alarmActionFailures, 0);
  });
});

/**
 * Bundle the handler into one CommonJS module, as a deployment package build
 * does, so the archive carries Powertools rather than the runtime providing it.
 */
async function bundleHandler(): Promise<string> {
  const bundled = await build({
    stdin: {
      contents: handlerSource,
      loader: "ts",
      resolveDir: import.meta.dirname,
      sourcefile: "index.ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    target: "node24",
    format: "cjs",
  });

  const output = bundled.outputFiles[0];

  assertNonNullable(output);

  return output.text;
}
