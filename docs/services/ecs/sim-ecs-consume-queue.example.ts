/**
 * A simulated ECS service whose container consumes an SQS queue.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();
const sqs = simAws.sqs();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

const queue = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);
const queueUrl = queue.QueueUrl ?? "";

const taskRole = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersWorkerTaskRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersWorkerTaskRole",
    PolicyName: "ConsumeOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: queueArn,
      },
    }),
  }),
);

const handled: string[] = [];

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  consumes: {
    queueUrl,
    batchSize: 10,
    handler: (messages) => {
      handled.push(...messages.map((message) => message.Body));
    },
  },
});

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));
await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    taskRoleArn: taskRole.Role.Arn,
    containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
  }),
);
await ecs.createService(
  new CreateServiceCommand({
    cluster: "orders",
    serviceName: "orders-worker",
    taskDefinition: "orders-worker",
    desiredCount: 1,
  }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
);
await simAws.backgroundTasksComplete();

console.log(handled); // ["order-1"]
