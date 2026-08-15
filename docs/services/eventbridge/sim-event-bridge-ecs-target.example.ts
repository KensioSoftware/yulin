/**
 * A rule running an ECS task when an order event arrives.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();
const imported: string[] = [];

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

ecs.bindContainer({
  family: "order-import",
  containerName: "app",
  run: () => {
    imported.push(process.env["ORDER_ID"] ?? "");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "order-import",
    containerDefinitions: [{ name: "app", image: "order-import:1" }],
  }),
);

// The rule runs the task as this role, so the role trusts EventBridge and is
// allowed to run it.
await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "EventsRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "events.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "EventsRole",
    PolicyName: "RunImport",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "ecs:RunTask", Resource: "*" },
    }),
  }),
);

await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "orders",
    EventPattern: JSON.stringify({ source: ["orders.service"] }),
  }),
);

await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "orders",
    Targets: [
      {
        Id: "order-import",
        Arn: "arn:aws:ecs:us-east-1:888888888888:cluster/orders",
        RoleArn: "arn:aws:iam::888888888888:role/EventsRole",
        EcsParameters: { TaskDefinitionArn: "order-import", TaskCount: 1 },
        // An ECS target's Input is the task's overrides, since a task has
        // nowhere to receive a payload.
        Input: JSON.stringify({
          containerOverrides: [
            {
              name: "app",
              environment: [{ name: "ORDER_ID", value: "order-1" }],
            },
          ],
        }),
      },
    ],
  }),
);

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: JSON.stringify({ orderId: "order-1" }),
      },
    ],
  }),
);

// The task runs after PutEvents has answered, as it does on real AWS.
await simAws.backgroundTasksComplete();

console.log(imported); // ["order-1"]
