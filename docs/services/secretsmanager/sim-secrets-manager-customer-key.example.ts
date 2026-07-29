/**
 * A Role allowed to read a simulated secret but not to decrypt it.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand } from "@aws-sdk/client-kms";
import {
  CreateSecretCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

const key = await simAws
  .kms()
  .createKey(new CreateKeyCommand({ Description: "Secret key" }));

await simAws.secretsManager().createSecret(
  new CreateSecretCommand({
    Name: "db-credentials",
    SecretString: "hunter2",
    KmsKeyId: key.KeyMetadata?.Arn,
  }),
);

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

// The secret is allowed, the key is not.
await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "SecretReader",
    PolicyName: "ReadDbCredentials",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "secretsmanager:GetSecretValue",
        Resource: "*",
      },
    }),
  }),
);

const caller = { kind: "arn", arn: role.Role.Arn } as const;

try {
  await simAws
    .secretsManager()
    .getSecretValue(new GetSecretValueCommand({ SecretId: "db-credentials" }), {
      caller,
    });
} catch (error) {
  console.log((error as Error).name); // "AccessDenied"
}
