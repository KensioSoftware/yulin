/**
 * A Role allowed to read a simulated SecureString but not to decrypt it.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateKeyCommand } from "@aws-sdk/client-kms";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

const key = await simAws
  .kms()
  .createKey(new CreateKeyCommand({ Description: "Parameter key" }));

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-password",
    Type: "SecureString",
    Value: "hunter2",
    KeyId: key.KeyMetadata?.Arn,
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ConfigReader",
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

// The parameter is allowed, the key is not.
await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ConfigReader",
    PolicyName: "ReadDbPassword",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: "*",
      },
    }),
  }),
);

const caller = { kind: "arn", arn: role.Role.Arn } as const;

try {
  await simAws.ssm().getParameter(
    new GetParameterCommand({
      Name: "/myapp/prod/db-password",
      WithDecryption: true,
    }),
    { caller },
  );
} catch (error) {
  console.log((error as Error).name); // "AccessDenied"
}
