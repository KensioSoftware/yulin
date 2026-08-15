/**
 * Resolving a simulated ECS container's secrets as the execution Role.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateSecretCommand } from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

const secret = await simAws.secretsManager().createSecret(
  new CreateSecretCommand({
    Name: "orders/db",
    SecretString: JSON.stringify({ username: "orders", password: "s3cr3t" }),
  }),
);

const executionRole = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersExecutionRole",
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
    RoleName: "OrdersExecutionRole",
    PolicyName: "ReadOrdersDbSecret",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "secretsmanager:GetSecretValue",
        Resource: secret.ARN,
      },
    }),
  }),
);

await ecs.createCluster(new CreateClusterCommand({}));

const passwords: (string | undefined)[] = [];

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  run: () => {
    passwords.push(process.env["DB_PASSWORD"]);
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    executionRoleArn: executionRole.Role.Arn,
    containerDefinitions: [
      {
        name: "app",
        image: "orders-worker:1",
        secrets: [
          {
            name: "DB_PASSWORD",
            valueFrom: `${String(secret.ARN)}:password::`,
          },
        ],
      },
    ],
  }),
);

await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
await simAws.backgroundTasksComplete();

console.log(passwords); // ["s3cr3t"]
