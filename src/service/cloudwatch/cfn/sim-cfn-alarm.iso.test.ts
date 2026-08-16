import { DeleteStackCommand } from "@aws-sdk/client-cloudformation";
import {
  DescribeAlarmsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { BackgroundTasks } from "../../../util/background/background.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const startedAt = new Date("2026-08-16T09:00:00.000Z");

/**
 * The properties of an alarm that fires on one breaching minute.
 */
const unnamedFailingOrders: SimCfnTemplateValueRecord = {
  Namespace: "Orders",
  MetricName: "Failed",
  Statistic: "Sum",
  Period: 60,
  EvaluationPeriods: 1,
  Threshold: 5,
  ComparisonOperator: "GreaterThanThreshold",
};

/** The same alarm, named, which is how most of these declare it. */
const failingOrders: SimCfnTemplateValueRecord = {
  ...unnamedFailingOrders,
  AlarmName: "OrdersFailing",
};

async function deployAlarm(
  properties: SimCfnTemplateValueRecord,
  simAws: SimAws = new SimAws(),
): Promise<{ readonly simAws: SimAws; readonly stack: SimCfnStack }> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        OrdersAlarm: { Type: "AWS::CloudWatch::Alarm", Properties: properties },
      },
      Outputs: {
        AlarmName: { Value: { Ref: "OrdersAlarm" } },
        AlarmArn: { Value: { "Fn::GetAtt": ["OrdersAlarm", "Arn"] } },
      },
    },
  });

  return { simAws, stack };
}

/**
 * Whether the deployed alarm would publish anything on a state change.
 */
function actionsEnabledOn(simAws: SimAws): boolean | undefined {
  return simAws.cloudWatch().findAlarm("OrdersFailing")?.definition
    .actionsEnabled;
}

/**
 * Publish a breaching minute into `Orders`/`Failed`, then let the alarm
 * evaluate the period it landed in.
 */
async function breachFor(simAws: SimAws): Promise<void> {
  await simAws.cloudWatch().putMetricData(
    new PutMetricDataCommand({
      Namespace: "Orders",
      MetricData: [{ MetricName: "Failed", Value: 10 }],
    }),
  );
  await simAws.clock().advanceBy({ minutes: 1 });
}

describe("AWS::CloudWatch::Alarm", () => {
  it("creates an alarm a template declares", async () => {
    // Given a template declaring an alarm.
    const { simAws } = await deployAlarm({
      ...failingOrders,
      AlarmDescription: "Orders are failing",
      DatapointsToAlarm: 1,
      TreatMissingData: "notBreaching",
      Dimensions: [{ Name: "Service", Value: "checkout" }],
    });

    // When the alarms are described.
    const described = await simAws
      .cloudWatch()
      .describeAlarms(new DescribeAlarmsCommand({}));
    const alarm = described.MetricAlarms?.at(0);

    // Then it is there, watching what the template said it watches.
    assertNonNullable(alarm);
    assertIdentical(alarm.AlarmName, "OrdersFailing");
    assertIdentical(alarm.AlarmDescription, "Orders are failing");
    assertIdentical(alarm.Threshold, 5);
    assertIdentical(alarm.TreatMissingData, "notBreaching");
    assertArrayEquals(
      alarm.Dimensions.map(
        (dimension) => `${String(dimension.Name)}=${String(dimension.Value)}`,
      ),
      ["Service=checkout"],
    );
  });

  it("evaluates a declared alarm on the clock as any other alarm", async () => {
    // Given a deployed alarm over a metric nothing has published into.
    const { simAws } = await deployAlarm(failingOrders);

    // When a breaching minute passes.
    await breachFor(simAws);

    // Then it fired, which is the whole point of deploying one rather than
    // recreating it by hand in test setup.
    assertIdentical(
      simAws.cloudWatch().findAlarm("OrdersFailing")?.state,
      "ALARM",
    );
  });

  it("names an unnamed alarm after the stack and logical ID", async () => {
    // Given a template that declares an alarm without naming it.
    const { simAws } = await deployAlarm(unnamedFailingOrders);

    // Then CloudFormation named it, as real CloudFormation does, so a test
    // still has a name to describe it by.
    const alarms = simAws.cloudWatch().allAlarms();

    assertArrayLength(alarms, 1);
    assertIdentical(alarms.at(0)?.name, "orders-OrdersAlarm");
  });

  it("resolves Ref to the name and Fn::GetAtt Arn to the alarm ARN", async () => {
    // Given a template whose outputs name the alarm both ways.
    const { simAws, stack } = await deployAlarm(failingOrders);

    // Then Ref is the name and the attribute is the ARN a policy names.
    const alarmArn = stack.outputs.get("AlarmArn")?.value;

    assertIdentical(stack.outputs.get("AlarmName")?.value, "OrdersFailing");
    assertTypeString(alarmArn);
    assertIdentical(
      alarmArn,
      `arn:aws:cloudwatch:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:alarm:OrdersFailing`,
    );
  });

  it("publishes to a topic the same stack declares", async () => {
    // Given a stack holding an alarm, the topic it notifies, and a queue
    // subscribed to that topic, with the alarm naming the topic by Ref.
    const simAws = new SimAws();

    await simAws.clock().setTo(startedAt);
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders",
      template: {
        Resources: {
          Alerts: {
            Type: "AWS::SNS::Topic",
            Properties: {
              TopicName: "orders-alerts",
              Subscription: [
                {
                  Protocol: "sqs",
                  Endpoint: { "Fn::GetAtt": ["AlertQueue", "Arn"] },
                },
              ],
            },
          },
          AlertQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "alerts" },
          },
          // A subscription alone does not let a topic send to a queue, here or
          // in an account: the queue's own policy has to admit SNS.
          AlertQueuePolicy: {
            Type: "AWS::SQS::QueuePolicy",
            Properties: {
              Queues: [{ Ref: "AlertQueue" }],
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Principal: { Service: "sns.amazonaws.com" },
                    Action: "sqs:SendMessage",
                    Resource: { "Fn::GetAtt": ["AlertQueue", "Arn"] },
                  },
                ],
              },
            },
          },
          OrdersAlarm: {
            Type: "AWS::CloudWatch::Alarm",
            Properties: {
              ...failingOrders,
              AlarmActions: [{ Ref: "Alerts" }],
            },
          },
        },
      },
    });

    // When a breaching minute passes.
    await breachFor(simAws);

    // Then the notification reached the queue, so the template's wiring is
    // what the test proved rather than what it assumed.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: `https://sqs.${simAws.defaultRegionName}.amazonaws.com/${simAws.defaultAccountId}/alerts`,
      }),
    );

    assertArrayLength(received.Messages ?? [], 1);
    assertStringIncludes(received.Messages?.at(0)?.Body ?? "", "OrdersFailing");
  });

  it("reads a boolean in either form a template carries one", async () => {
    // Given templates turning the alarm's actions off as a literal and as the
    // string a CloudFormation Parameter value arrives as.
    const literal = await deployAlarm({
      ...failingOrders,
      ActionsEnabled: false,
    });
    const carried = await deployAlarm({
      ...failingOrders,
      ActionsEnabled: "false",
    });

    // Then both alarms evaluate and record state while publishing nothing.
    assertFalse(actionsEnabledOn(literal.simAws));
    assertFalse(actionsEnabledOn(carried.simAws));
  });

  it("reads a number a template carried as a string", async () => {
    // Given a template whose numbers arrived as strings, as a CloudFormation
    // Parameter value does.
    const { simAws } = await deployAlarm({
      ...failingOrders,
      Period: "60",
      EvaluationPeriods: "2",
      Threshold: "5",
    });

    // Then they are read as the numbers they hold rather than refused.
    const definition = simAws
      .cloudWatch()
      .findAlarm("OrdersFailing")?.definition;

    assertNonNullable(definition);
    assertIdentical(definition.period, 60);
    assertIdentical(definition.evaluationPeriods, 2);
    assertIdentical(definition.threshold, 5);
  });

  it("records the properties it does not act on", async () => {
    // Given a template setting a real property this simulation has nothing to
    // do with, and one CloudWatch has never had.
    const { stack } = await deployAlarm({
      ...failingOrders,
      Tags: [{ Key: "team", Value: "platform" }],
      Nonsense: true,
    });

    // Then both are recorded, told apart, so a reader can see what a deployed
    // alarm is not doing without a stack failing over a tag it carries because
    // every Resource in it does.
    const ignored = stack.getResource("OrdersAlarm")?.ignoredProperties ?? [];

    assertArrayEquals(
      ignored
        .map((property) => property.path)
        .toSorted((left, right) => left.localeCompare(right)),
      ["Nonsense", "Tags"],
    );
    assertStringIncludes(
      ignored.find((property) => property.path === "Tags")?.reason ?? "",
      "does not act on",
    );
    assertStringIncludes(
      ignored.find((property) => property.path === "Nonsense")?.reason ?? "",
      "not a property simulated",
    );
  });

  it("refuses an alarm attribute CloudFormation does not have", async () => {
    // Given a template reading an attribute the Resource does not publish.
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "orders",
        template: {
          Resources: {
            OrdersAlarm: {
              Type: "AWS::CloudWatch::Alarm",
              Properties: failingOrders,
            },
          },
          Outputs: {
            State: { Value: { "Fn::GetAtt": ["OrdersAlarm", "StateValue"] } },
          },
        },
      });
    });

    // Then it says which attribute, rather than leaving an Output that quietly
    // says undefined.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::CloudWatch::Alarm attribute StateValue",
    );
  });

  it("reports a CloudWatch Resource type it does not simulate", async () => {
    // Given the CloudWatch Resource factory.
    const factory = new SimAws().cloudWatch().cfnResourceFactory();

    // When a Resource type this simulation has none for is created or deleted.
    const created = await assertThrowsErrorAsync(async () =>
      factory.create("Dashboard", {} as never, {} as never),
    );
    const deleted = await assertThrowsErrorAsync(async () =>
      factory.delete("Dashboard", {} as never),
    );

    // Then both are reported as unsupported, which the Stack records as a skip
    // rather than a failure.
    assertIdentical(
      created.message,
      "Unsupported sim CloudWatch CloudFormation Resource Dashboard",
    );
    assertIdentical(
      deleted.message,
      "Unsupported sim CloudWatch CloudFormation Resource Dashboard deletion",
    );
  });

  it("takes the alarm down with the stack and stops evaluating it", async () => {
    // Given a deployed alarm that would fire on every period.
    const background = new BackgroundTasks();
    const { simAws } = await deployAlarm(
      { ...failingOrders, TreatMissingData: "breaching" },
      new SimAws({ background }),
    );

    // When the stack is torn down.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "orders" }));
    await simAws.backgroundTasksComplete();

    // Then the alarm went with it and nothing is left waiting on the clock,
    // which is what lets the simulation settle rather than keeping an alarm
    // waking up to read a metric nothing watches.
    assertArrayLength(simAws.cloudWatch().allAlarms(), 0);
    assertIdentical(background.dueTaskCount, 0);
  });
});
