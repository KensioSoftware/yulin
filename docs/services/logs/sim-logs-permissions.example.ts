/**
 * A simulated IAM policy allowing a Role to write one function's logs.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;
const logGroupName = "/aws/lambda/orders";

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersFunctionRole",
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
    RoleName: "OrdersFunctionRole",
    PolicyName: "WriteOwnLogs",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        // The trailing wildcard covers the streams inside the group.
        Resource: `arn:aws:logs:${regionName}:${accountId}:log-group:${logGroupName}:*`,
      },
    }),
  }),
);

const asRole = { caller: { kind: "arn", arn: role.Role.Arn } } as const;

await simAws
  .logs()
  .createLogGroup(new CreateLogGroupCommand({ logGroupName }), asRole);
await simAws.logs().createLogStream(
  new CreateLogStreamCommand({
    logGroupName,
    logStreamName: "2026/08/16/[$LATEST]0f7c1a",
  }),
  asRole,
);

console.log(simAws.logs().findLogGroup(logGroupName)?.logGroupArn);
