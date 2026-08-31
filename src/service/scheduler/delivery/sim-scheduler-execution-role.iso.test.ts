import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateScheduleCommand,
  CreateScheduleGroupCommand,
} from "@aws-sdk/client-scheduler";
import { CreateQueueCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";

const startedAt = "2026-07-26T09:00:00.000Z";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

const queueArn = "arn:aws:sqs:us-east-1:888888888888:reports";

const queueUrl = "https://sqs.us-east-1.amazonaws.com/888888888888/reports";

const defaultGroupArn =
  "arn:aws:scheduler:us-east-1:888888888888:schedule-group/default";

/**
 * A simulation whose execution role trusts Scheduler under the condition given,
 * and which may send to one queue.
 *
 * The condition is the whole point of each test here, so it is what varies.
 * Everything else is the same arrangement the other delivery tests use.
 */
async function simulationWithTrustCondition(
  condition: object | undefined,
): Promise<SimAws> {
  const simAws = new SimAws({ clock: new SimFixedClock(new Date(startedAt)) });

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "SchedulerRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "scheduler.amazonaws.com" },
          Action: "sts:AssumeRole",
          ...(condition !== undefined && { Condition: condition }),
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "SchedulerRole",
      PolicyName: "Send",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "sqs:SendMessage",
          Resource: queueArn,
        },
      }),
    }),
  );

  await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: "reports" }));

  return simAws;
}

/**
 * The confused deputy condition AWS recommends, scoped to one group ARN.
 */
function sourceCondition(groupArn: string): object {
  return {
    StringEquals: {
      "aws:SourceAccount": "888888888888",
      "aws:SourceArn": groupArn,
    },
  };
}

/**
 * A one-time schedule an hour out, so one advance fires it exactly once.
 */
async function fireSchedule(simAws: SimAws, groupName?: string): Promise<void> {
  await simAws.scheduler().createSchedule(
    new CreateScheduleCommand({
      Name: "nightly-report",
      GroupName: groupName,
      ScheduleExpression: "at(2026-07-26T10:00:00)",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: { Arn: queueArn, RoleArn: roleArn, Input: "reports" },
    }),
  );

  await simAws.clock().advanceBy({ hours: 2 });
}

/**
 * What the queue received, as the message bodies on it.
 */
async function delivered(
  simAws: SimAws,
): Promise<readonly (string | undefined)[]> {
  const received = await simAws
    .sqs()
    .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

  return (received.Messages ?? []).map((message) => message.Body);
}

describe("Scheduler execution role source", () => {
  it("assumes a role scoped to the default group's ARN", async () => {
    // Given a role carrying the confused deputy condition AWS recommends, which
    // is what CDK writes into an execution role it generates.
    const simAws = await simulationWithTrustCondition(
      sourceCondition(defaultGroupArn),
    );

    // When a schedule in that group fires.
    await fireSchedule(simAws);

    // Then the target ran. The group ARN and the schedule's Account were
    // supplied, so the condition matched.
    const messages = await delivered(simAws);

    assertIdentical(messages[0], "reports");
    assertArrayEmpty(simAws.scheduler().deliveryFailures);
  });

  it("assumes a role scoped to a named group's ARN", async () => {
    // Given a group of its own, and a role scoped to that group rather than to
    // default.
    const simAws = await simulationWithTrustCondition(
      sourceCondition(
        "arn:aws:scheduler:us-east-1:888888888888:schedule-group/analytics",
      ),
    );

    await simAws
      .scheduler()
      .createScheduleGroup(
        new CreateScheduleGroupCommand({ Name: "analytics" }),
      );

    // When a schedule in that group fires.
    await fireSchedule(simAws, "analytics");

    // Then the target ran, so the group the schedule is actually in is the one
    // supplied rather than default.
    const messages = await delivered(simAws);

    assertIdentical(messages[0], "reports");
  });

  it("refuses a role scoped to a different group's ARN", async () => {
    // Given a role scoped to a group the schedule is not in.
    const simAws = await simulationWithTrustCondition(
      sourceCondition(
        "arn:aws:scheduler:us-east-1:888888888888:schedule-group/analytics",
      ),
    );

    // When a schedule in default fires.
    await fireSchedule(simAws);

    // Then nothing was delivered and the firing is a recorded failure, which is
    // the confused deputy guard doing its job rather than a simulator gap.
    assertArrayEmpty(await delivered(simAws));
    assertArrayLength(simAws.scheduler().deliveryFailures, 1);
    assertStringIncludes(
      String(simAws.scheduler().deliveryFailures[0]?.error),
      "does not allow scheduler.amazonaws.com to assume it",
    );
  });

  it("assumes a role whose trust policy carries no condition", async () => {
    // Given a role that trusts Scheduler unconditionally.
    const simAws = await simulationWithTrustCondition(undefined);

    // When a schedule fires.
    await fireSchedule(simAws);

    // Then the target ran. Supplying the keys does not require them to be used.
    const messages = await delivered(simAws);

    assertIdentical(messages[0], "reports");
  });
});
