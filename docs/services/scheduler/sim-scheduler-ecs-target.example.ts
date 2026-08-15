/**
 * A schedule running an ECS task every night.
 */

import {
  CreateClusterCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});
const ecs = simAws.ecs();
const imported: string[] = [];

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

ecs.bindContainer({
  family: "nightly-import",
  containerName: "app",
  run: () => {
    imported.push(process.env["IMPORT_MODE"] ?? "");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "nightly-import",
    containerDefinitions: [{ name: "app", image: "nightly-import:1" }],
  }),
);

// The schedule runs the task as this role, so the role trusts Scheduler and is
// allowed to run it.
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
    PolicyName: "RunImport",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "ecs:RunTask", Resource: "*" },
    }),
  }),
);

await simAws.scheduler().createSchedule(
  new CreateScheduleCommand({
    Name: "nightly-import",
    ScheduleExpression: "cron(0 2 * * ? *)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "arn:aws:ecs:us-east-1:888888888888:cluster/orders",
      RoleArn: "arn:aws:iam::888888888888:role/SchedulerRole",
      EcsParameters: {
        TaskDefinitionArn: "nightly-import",
        TaskCount: 1,
      },
      // An ECS target's Input is the task's overrides, since a task has
      // nowhere to receive a payload.
      Input: JSON.stringify({
        containerOverrides: [
          {
            name: "app",
            environment: [{ name: "IMPORT_MODE", value: "full" }],
          },
        ],
      }),
    },
  }),
);

// Advancing past 02:00 fires the schedule and runs the task.
await simAws.clock().advanceBy({ hours: 24 });

console.log(imported); // ["full"]

const tasks = await ecs.listTasks(
  new ListTasksCommand({ cluster: "orders", desiredStatus: "STOPPED" }),
);

console.log(tasks.taskArns?.length); // 1
