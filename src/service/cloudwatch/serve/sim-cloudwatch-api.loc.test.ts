import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  DisableAlarmActionsCommand,
  ListMetricsCommand,
  PutMetricAlarmCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";

interface AccessKey {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/**
 * Simulated CloudWatch reached over a port by a real `CloudWatchClient`.
 *
 * CloudWatch speaks the AWS JSON protocol under a service target of its own,
 * `GraniteServiceVersion20100801`, and signs as `monitoring`. These cover
 * whether a metric and an alarm written over the port come back out of the
 * simulation holding them.
 */
describe("Serving simulated CloudWatch on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let endpoint: string;
  let client: CloudWatchClient;

  beforeAll(async () => {
    await srv.listen();
    endpoint = `http://localhost:${srv.port}`;

    client = cloudWatchClient(
      await accessKeyFor("Widgets", {
        Effect: "Allow",
        Action: "cloudwatch:*",
        Resource: "*",
      }),
    );
  });

  afterAll(async () => {
    await srv.close();
  });

  it("publishes a metric a client reads back over the same endpoint", async () => {
    // Given a real CloudWatch client holding an endpoint URL and credentials

    // When it publishes an observation
    await client.send(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [
          {
            MetricName: "Failed",
            Value: 3,
            Unit: "Count",
            Dimensions: [{ Name: "Channel", Value: "web" }],
          },
        ],
      }),
    );

    // Then the metric it published is the one the endpoint lists
    const listed = await client.send(
      new ListMetricsCommand({ Namespace: "Orders" }),
    );
    const [metric] = listed.Metrics ?? [];
    assertNonNullable(metric);
    assertObjectMatches(metric, {
      Namespace: "Orders",
      MetricName: "Failed",
      Dimensions: [{ Name: "Channel", Value: "web" }],
    });
  });

  it("keeps an alarm a client wrote over the endpoint", async () => {
    // Given an alarm written over the endpoint
    await client.send(
      new PutMetricAlarmCommand({
        AlarmName: "FailedOrders",
        Namespace: "Orders",
        MetricName: "Failed",
        Statistic: "Sum",
        Period: 60,
        EvaluationPeriods: 1,
        Threshold: 5,
        ComparisonOperator: "GreaterThanThreshold",
      }),
    );

    // When the alarms are described
    const described = await client.send(
      new DescribeAlarmsCommand({ AlarmNames: ["FailedOrders"] }),
    );

    // Then the alarm comes back as it was written, waiting on its first
    // evaluation
    const [alarm] = described.MetricAlarms ?? [];
    assertNonNullable(alarm);
    assertObjectMatches(alarm, {
      AlarmName: "FailedOrders",
      Threshold: 5,
      ComparisonOperator: "GreaterThanThreshold",
      StateValue: "INSUFFICIENT_DATA",
    });
    assertIdentical(
      alarm.AlarmArn,
      `arn:aws:cloudwatch:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:alarm:FailedOrders`,
    );
  });

  it("runs the request as the principal whose credentials signed it", async () => {
    // Given a client signing as a User with no CloudWatch permission
    const unprivileged = cloudWatchClient(
      await accessKeyFor("Bystander", {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: "*",
      }),
    );

    // When it asks what metrics there are
    const error = await assertThrowsErrorAsync(
      async () => await unprivileged.send(new ListMetricsCommand({})),
    );

    // Then simulated IAM refuses it, naming the User the signature belongs to
    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "user/Bystander");
    assertStringIncludes(error.message, "cloudwatch:ListMetrics");
  });

  it("refuses a CloudWatch operation it does not serve", async () => {
    // When an operation simulated CloudWatch has no answer for is asked for
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new DisableAlarmActionsCommand({ AlarmNames: ["FailedOrders"] }),
        ),
    );

    // Then the SDK raises it by name, rather than leaving the client to read a
    // response it cannot parse
    assertStringIncludes(error.message, "DisableAlarmActionsCommand");
    assertStringIncludes(error.message, "Simulated CloudWatch");
  });

  function cloudWatchClient(credentials: AccessKey): CloudWatchClient {
    return new CloudWatchClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials,
    });
  }

  /**
   * An access key belonging to a new IAM User carrying one policy statement.
   * A served request reaches nothing without one of these to sign with.
   */
  async function accessKeyFor(
    username: string,
    statement: object,
  ): Promise<AccessKey> {
    const simIam = simAws.iam();

    await simIam.createUser(new CreateUserCommand({ UserName: username }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: username,
        PolicyName: "Monitoring",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: statement,
        }),
      }),
    );

    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: username }),
    );

    return {
      accessKeyId: created.AccessKey.AccessKeyId,
      secretAccessKey: created.AccessKey.SecretAccessKey,
    };
  }
});
