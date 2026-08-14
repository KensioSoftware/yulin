/**
 * A simulated IAM policy allowing a Role to register task definitions.
 */

import { RegisterTaskDefinitionCommand } from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "Deployer",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${accountId}:root` },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Deployer",
    PolicyName: "RegisterTaskDefinitions",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ecs:RegisterTaskDefinition",
        // ECS gives this action no resource type, so only `*` grants it.
        Resource: "*",
      },
    }),
  }),
);

const registered = await simAws.ecs().registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

console.log(registered.taskDefinition?.registeredBy); // the Role ARN
