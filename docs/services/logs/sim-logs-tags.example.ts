/**
 * Tagging a log group and deciding a request on its tags.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  ListTagsForResourceCommand,
  TagResourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({
  defaultAccountId: "123456789012",
  defaultRegionName: "eu-west-2",
});
const resourceArn = "arn:aws:logs:eu-west-2:123456789012:log-group:/orders/app";

await simAws.logs().createLogGroup(
  new CreateLogGroupCommand({
    logGroupName: "/orders/app",
    tags: { team: "orders" },
  }),
);

await simAws
  .logs()
  .tagResource(
    new TagResourceCommand({ resourceArn, tags: { stage: "test" } }),
  );

const listed = await simAws
  .logs()
  .listTagsForResource(new ListTagsForResourceCommand({ resourceArn }));

console.log(listed.tags); // { team: 'orders', stage: 'test' }

await simAws.iam().createRole({
  input: {
    RoleName: "OrdersLogger",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  },
});

await simAws.iam().putRolePolicy({
  input: {
    RoleName: "OrdersLogger",
    PolicyName: "LogToOwnTeam",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "logs:CreateLogStream",
        Resource: "*",
        Condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
    }),
  },
});

await simAws.logs().createLogStream(
  new CreateLogStreamCommand({
    logGroupName: "/orders/app",
    logStreamName: "one",
  }),
  {
    caller: {
      kind: "arn",
      arn: "arn:aws:iam::123456789012:role/OrdersLogger",
    },
  },
);

console.log(simAws.logs().findLogGroup("/orders/app")?.streams.length); // 1
