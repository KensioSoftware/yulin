/**
 * Asserting on the retention a simulated log group was given.
 */

import {
  CreateLogGroupCommand,
  DescribeLogGroupsCommand,
  PutRetentionPolicyCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logs = simAws.logs();

const logGroupName = "/aws/lambda/orders";

await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await logs.putRetentionPolicy(
  new PutRetentionPolicyCommand({ logGroupName, retentionInDays: 14 }),
);

const described = await logs.describeLogGroups(
  new DescribeLogGroupsCommand({ logGroupNamePrefix: "/aws/lambda/" }),
);

// 14, and the ARN form a policy is written against.
console.log(
  described.logGroups?.[0]?.retentionInDays,
  described.logGroups?.[0]?.arn,
);
