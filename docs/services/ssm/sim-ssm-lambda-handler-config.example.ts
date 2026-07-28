/**
 * A simulated Lambda handler reading its configuration from Parameter Store.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { PutParameterCommand } from "@aws-sdk/client-ssm";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;

await simAws.ssm().putParameter(
  new PutParameterCommand({
    Name: "/myapp/prod/db-host",
    Type: "String",
    Value: "db.internal",
  }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ConfigReaderRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ConfigReaderRole",
    PolicyName: "ReadConfig",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: `arn:aws:ssm:${regionName}:${accountId}:parameter/myapp/prod/*`,
      },
    }),
  }),
);

const handlerCode = [
  'const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");',
  "exports.handler = async () => {",
  "  const client = new SSMClient({});",
  '  const command = new GetParameterCommand({ Name: "/myapp/prod/db-host" });',
  "  const out = await client.send(command);",
  "  return out.Parameter.Value;",
  "};",
].join("\n");

const zipFile = makeLambdaCodeZip({ "index.js": handlerCode });

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "config-reader",
    Role: role.Role.Arn,
    Handler: "index.handler",
    Code: { ZipFile: zipFile },
  }),
);

await simAws.backgroundTasksComplete();

const invoked = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "config-reader" }));

console.log(Buffer.from(invoked.Payload ?? []).toString("utf8")); // "db.internal"
