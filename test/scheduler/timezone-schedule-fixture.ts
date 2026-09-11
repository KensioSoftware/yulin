/**
 * The parts a Scheduler timezone test needs before it can say anything about
 * when a schedule falls due: a clock starting where the test says, a function
 * to invoke, and a role allowed to invoke it.
 *
 * These live under `test/` for the same reason as the other service fixtures.
 * eslint rejects a test file exporting helpers alongside its own `describe`
 * calls.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import type { CreateScheduleCommandInput } from "@aws-sdk/client-scheduler";

import { SimFixedClock } from "../../src/util/clock/sim-clock.js";
import { SimAws } from "../../src/service/aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/index.js";

export const functionArn =
  "arn:aws:lambda:us-east-1:888888888888:function:reconcile";

export const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

export interface SimSchedulerZoneSimulation {
  readonly simAws: SimAws;

  /** One entry per invocation the schedule made. */
  readonly invocations: unknown[];
}

/**
 * A simulation whose clock starts where a test says, with a function to invoke
 * and a role allowed to invoke it.
 */
export async function aSimulationFrom(
  startedAt: string,
): Promise<SimSchedulerZoneSimulation> {
  const simAws = new SimAws({ clock: new SimFixedClock(new Date(startedAt)) });
  const invocations: unknown[] = [];

  await simAws.lambda().createFunction({
    input: {
      FunctionName: "reconcile",
      Role: "arn:aws:iam::888888888888:role/ReconcileRole",
      Code: {
        ZipFile: makeLambdaZipFileInput((event: unknown) => {
          invocations.push(event);

          return { ok: true };
        }),
      },
    },
  });

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "SchedulerRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "scheduler.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "SchedulerRole",
      PolicyName: "InvokeReconcile",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "lambda:InvokeFunction",
          Resource: functionArn,
        },
      }),
    }),
  );

  return { simAws, invocations };
}

/**
 * A nightly schedule in a named zone.
 */
export function nightlyIn(
  timeZone: string,
  expression: string,
): CreateScheduleCommandInput {
  return {
    Name: "reconciliation",
    ScheduleExpression: expression,
    ScheduleExpressionTimezone: timeZone,
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: { Arn: functionArn, RoleArn: roleArn },
  };
}

/**
 * The instants a created schedule falls due at, from an instant, as ISO text.
 */
export function dueInstants(
  simAws: SimAws,
  from: string,
  count: number,
): readonly string[] {
  const schedule = simAws.scheduler().findSchedule("reconciliation");
  const due: string[] = [];
  let at = new Date(from);

  for (let taken = 0; taken < count; taken += 1) {
    const next = schedule?.schedule.nextAfter(at);

    if (next === undefined) {
      break;
    }

    due.push(next.toISOString());
    at = next;
  }

  return due;
}
