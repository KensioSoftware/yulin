/**
 * Reaching simulated CloudWatch Logs through an intercepted SDK client.
 */

import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DescribeLogGroupsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(CloudWatchLogsClient);

const client = new CloudWatchLogsClient({ region: "eu-west-2" });

await client.send(
  new CreateLogGroupCommand({ logGroupName: "/aws/lambda/orders" }),
);

const described = await client.send(new DescribeLogGroupsCommand({}));

// The ARN names the Region the client was configured for.
console.log(described.logGroups?.[0]?.logGroupArn);
