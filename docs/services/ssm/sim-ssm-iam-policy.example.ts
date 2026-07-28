/**
 * A simulated IAM policy allowing a Role to read one parameter.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;

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

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ConfigReader",
    PolicyName: "ReadDbHost",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        // One slash after `parameter`, not two, whatever the name looks like.
        Resource: `arn:aws:ssm:${regionName}:${accountId}:parameter/myapp/prod/db-host`,
      },
    }),
  }),
);

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);

const read = await simAws
  .ssm()
  .getParameter(new GetParameterCommand({ Name: "/myapp/prod/db-host" }), {
    caller: { kind: "arn", arn: role.Role.Arn },
  });

console.log(read.Parameter?.Value); // "db.internal"
