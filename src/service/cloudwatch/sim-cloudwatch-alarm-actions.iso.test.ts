import {
  PutMetricAlarmCommand,
  PutMetricDataCommand,
  SetAlarmStateCommand,
} from "@aws-sdk/client-cloudwatch";
import { CreateTopicCommand, SubscribeCommand } from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayIncludes,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";

/**
 * The parts of an alarm notification these tests read.
 */
interface AlarmMessage {
  readonly AlarmName: string;
  readonly NewStateValue: string;
  readonly OldStateValue: string;
  readonly NewStateReason: string;
  readonly StateChangeTime: string;
  readonly Trigger: unknown;
}

interface SnsEnvelope {
  readonly Subject: string;
  readonly Message: string;
}

const startedAt = new Date("2026-08-16T09:00:00.000Z");

/**
 * A simulation with a queue subscribed to a topic, so that what an alarm
 * publishes can be read back off the queue the way a real subscriber reads it.
 */
async function withSubscribedQueue(): Promise<{
  simAws: SimAws;
  topicArn: string;
  queueUrl: string;
}> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);

  const topic = await simAws
    .sns()
    .createTopic(new CreateTopicCommand({ Name: "orders-alerts" }));
  const queue = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: "alerts" }));

  assertNonNullable(topic.TopicArn);
  assertNonNullable(queue.QueueUrl);

  // The queue's own policy has to admit SNS, exactly as it does in an account:
  // a subscription alone does not give a topic the right to send.
  await simAws.sqs().setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl: queue.QueueUrl,
      Attributes: {
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "sns.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:alerts`,
              Condition: { ArnEquals: { "aws:SourceArn": topic.TopicArn } },
            },
          ],
        }),
      },
    }),
  );

  await simAws.sns().subscribe(
    new SubscribeCommand({
      TopicArn: topic.TopicArn,
      Protocol: "sqs",
      Endpoint: `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:alerts`,
    }),
  );

  return { simAws, topicArn: topic.TopicArn, queueUrl: queue.QueueUrl };
}

async function alertsOn(
  simAws: SimAws,
  queueUrl: string,
): Promise<readonly (string | undefined)[]> {
  const received = await simAws.sqs().receiveMessage(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
    }),
  );

  return (received.Messages ?? []).map((message) => message.Body);
}

/**
 * An alarm over `Orders`/`Failed` that fires on one breaching minute.
 */
function alarmNotifying(
  topicArn: string,
  overrides: Partial<PutMetricAlarmCommand["input"]> = {},
): PutMetricAlarmCommand {
  return new PutMetricAlarmCommand({
    AlarmName: "OrdersFailing",
    Namespace: "Orders",
    MetricName: "Failed",
    Statistic: "Sum",
    Period: 60,
    EvaluationPeriods: 1,
    Threshold: 5,
    ComparisonOperator: "GreaterThanThreshold",
    AlarmActions: [topicArn],
    ...overrides,
  });
}

describe("SimCloudWatch alarm actions", () => {
  it("notifies a subscribed queue when the alarm fires", async () => {
    // Given an alarm notifying a topic a queue is subscribed to.
    const { simAws, topicArn, queueUrl } = await withSubscribedQueue();

    await simAws.cloudWatch().putMetricAlarm(alarmNotifying(topicArn));

    // When a breaching minute passes.
    await simAws.cloudWatch().putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 10 }],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 1 });

    // Then the notification reached the queue, carrying what a subscriber
    // reads out of it.
    const bodies = await alertsOn(simAws, queueUrl);

    assertArrayLength(bodies, 1);

    const body = bodies.at(0);

    assertNonNullable(body);

    const notification = JSON.parse(body) as SnsEnvelope;
    const alarm = JSON.parse(notification.Message) as AlarmMessage;

    assertStringIncludes(notification.Subject, 'ALARM: "OrdersFailing"');
    assertIdentical(alarm.AlarmName, "OrdersFailing");
    assertIdentical(alarm.NewStateValue, "ALARM");
    assertIdentical(alarm.OldStateValue, "INSUFFICIENT_DATA");
    assertIdentical(alarm.StateChangeTime, "2026-08-16T09:01:00.000Z");
    assertNonNullable(alarm.NewStateReason);
    assertNonNullable(alarm.Trigger);
  });

  it("notifies once on the transition and not on every period after it", async () => {
    // Given an alarm that has fired.
    const { simAws, topicArn, queueUrl } = await withSubscribedQueue();

    await simAws.cloudWatch().putMetricAlarm(alarmNotifying(topicArn));
    await simAws.cloudWatch().putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [
          { MetricName: "Failed", Value: 10 },
          {
            MetricName: "Failed",
            Value: 10,
            Timestamp: new Date("2026-08-16T09:01:30.000Z"),
          },
          {
            MetricName: "Failed",
            Value: 10,
            Timestamp: new Date("2026-08-16T09:02:30.000Z"),
          },
        ],
      }),
    );

    // When it stays breaching for three minutes.
    await simAws.clock().advanceBy({ minutes: 3 });

    // Then it notified once, when it changed, rather than once a period.
    assertArrayLength(await alertsOn(simAws, queueUrl), 1);
  });

  it("notifies the OK actions when it recovers", async () => {
    // Given an alarm with both lists pointed at the same topic.
    const { simAws, topicArn, queueUrl } = await withSubscribedQueue();

    await simAws
      .cloudWatch()
      .putMetricAlarm(alarmNotifying(topicArn, { OKActions: [topicArn] }));

    // When it fires and then recovers.
    await simAws.cloudWatch().putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 10 }],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 1 });
    await simAws.cloudWatch().putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 1 }],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 1 });

    // Then both transitions were notified.
    const bodies = await alertsOn(simAws, queueUrl);
    const states = bodies.map((body) => {
      const notification = JSON.parse(String(body)) as SnsEnvelope;

      return (JSON.parse(notification.Message) as AlarmMessage).NewStateValue;
    });

    assertArrayLength(states, 2);
    assertArrayIncludes(states, "ALARM");
    assertArrayIncludes(states, "OK");
  });

  it("evaluates but publishes nothing when actions are disabled", async () => {
    // Given an alarm with its actions turned off.
    const { simAws, topicArn, queueUrl } = await withSubscribedQueue();

    await simAws
      .cloudWatch()
      .putMetricAlarm(alarmNotifying(topicArn, { ActionsEnabled: false }));

    // When a breaching minute passes.
    await simAws.cloudWatch().putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [{ MetricName: "Failed", Value: 10 }],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 1 });

    // Then it still evaluated and changed state, and told nobody.
    assertIdentical(simAws.cloudWatch().allAlarms().at(0)?.state, "ALARM");
    assertArrayEmpty(await alertsOn(simAws, queueUrl));
  });

  it("fires actions for a state forced with SetAlarmState", async () => {
    // Given an alarm that has published no metrics at all.
    const { simAws, topicArn, queueUrl } = await withSubscribedQueue();

    await simAws.cloudWatch().putMetricAlarm(alarmNotifying(topicArn));

    // When its state is forced.
    await simAws.cloudWatch().setAlarmState(
      new SetAlarmStateCommand({
        AlarmName: "OrdersFailing",
        StateValue: "ALARM",
        StateReason: "Testing the runbook",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the subscriber heard about it, which is how a test exercises one
    // without arranging a metric to breach.
    const bodies = await alertsOn(simAws, queueUrl);
    const body = bodies.at(0);

    assertArrayLength(bodies, 1);
    assertNonNullable(body);
    assertStringIncludes(body, "Testing the runbook");
  });

  it("records an action that reached nothing rather than passing quietly", async () => {
    // Given an alarm notifying a topic that does not exist.
    const simAws = new SimAws();

    await simAws.clock().setTo(startedAt);
    await simAws
      .cloudWatch()
      .putMetricAlarm(
        alarmNotifying(
          `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:gone`,
        ),
      );

    // When it fires.
    await simAws.cloudWatch().setAlarmState(
      new SetAlarmStateCommand({
        AlarmName: "OrdersFailing",
        StateValue: "ALARM",
        StateReason: "The topic this names is not there",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the alarm still changed state, and the failed notification is there
    // to be found rather than being silence a test has to guess at.
    const cloudWatch = simAws.cloudWatch();
    const failure = cloudWatch.alarmActionFailures.at(0);

    assertIdentical(cloudWatch.allAlarms().at(0)?.state, "ALARM");
    assertArrayLength(cloudWatch.alarmActionFailures, 1);
    assertNonNullable(failure);
    assertStringIncludes(failure.reason, "Topic does not exist");
  });

  it("notifies the insufficient-data actions, and carries the alarm's own detail", async () => {
    // Given an alarm with a description and a unit, notifying the same topic
    // whichever state it lands in.
    const { simAws, topicArn, queueUrl } = await withSubscribedQueue();

    await simAws.cloudWatch().putMetricAlarm(
      alarmNotifying(topicArn, {
        AlarmDescription: "Orders are failing",
        Unit: "Count",
        Dimensions: [{ Name: "Channel", Value: "web" }],
        InsufficientDataActions: [topicArn],
      }),
    );

    // When it fires on real data and then the metric stops being published,
    // so it falls back out of ALARM for want of anything to look at. Landing
    // in a state it is already in is no transition, so it has to leave
    // INSUFFICIENT_DATA before it can be notified about arriving there.
    await simAws.cloudWatch().putMetricData(
      new PutMetricDataCommand({
        Namespace: "Orders",
        MetricData: [
          {
            MetricName: "Failed",
            Value: 10,
            Unit: "Count",
            Dimensions: [{ Name: "Channel", Value: "web" }],
          },
        ],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 3 });

    // Then the insufficient-data list was notified, with the description and
    // unit the alarm was given.
    const bodies = await alertsOn(simAws, queueUrl);
    const notifications = bodies.map((body) => {
      const envelope = JSON.parse(String(body)) as SnsEnvelope;

      return {
        subject: envelope.Subject,
        alarm: JSON.parse(envelope.Message) as AlarmMessage & {
          AlarmDescription: string;
          Trigger: {
            Unit: string;
            Dimensions: readonly { name: string; value: string }[];
          };
        },
      };
    });
    const quiet = notifications.find((one) =>
      one.subject.startsWith("INSUFFICIENT_DATA"),
    );

    assertNonNullable(quiet);
    assertIdentical(quiet.alarm.AlarmDescription, "Orders are failing");
    assertIdentical(quiet.alarm.Trigger.Unit, "Count");
    assertArrayEquals(
      quiet.alarm.Trigger.Dimensions.map((dimension) => dimension.name),
      ["Channel"],
    );
  });
});
