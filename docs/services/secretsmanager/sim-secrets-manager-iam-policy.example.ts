/**
 * A simulated IAM policy allowing for the random suffix on a secret ARN.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "SecretReader",
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
    RoleName: "SecretReader",
    PolicyName: "ReadDbCreds",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "secretsmanager:GetSecretValue",
        // Without the six wildcard characters this policy would match nothing.
        Resource: `arn:aws:secretsmanager:${regionName}:${accountId}:secret:db-creds-??????`,
      },
    }),
  }),
);

await simAws
  .secretsManager()
  .createSecret(
    new CreateSecretCommand({ Name: "db-creds", SecretString: "hunter2" }),
  );

const read = await simAws
  .secretsManager()
  .getSecretValue(new GetSecretValueCommand({ SecretId: "db-creds" }), {
    caller: { kind: "arn", arn: role.Role.Arn },
  });

console.log(read.SecretString); // "hunter2"
