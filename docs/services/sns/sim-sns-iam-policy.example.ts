/**
 * A Role allowed to publish to one simulated topic and nothing else.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateTopicCommand,
  ListTopicsCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrderPublisher",
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
    RoleName: "OrderPublisher",
    PolicyName: "PublishOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sns:Publish",
        // A topic ARN has no resource type: not "...:topic/orders".
        Resource: `arn:aws:sns:${regionName}:${accountId}:orders`,
      },
    }),
  }),
);

const caller = { kind: "arn", arn: role.Role.Arn } as const;

const published = await sns.publish(
  new PublishCommand({ TopicArn, Message: "order-1" }),
  { caller },
);

console.log(published.MessageId !== undefined); // true

// Listing is not covered by a policy naming one topic.
try {
  await sns.listTopics(new ListTopicsCommand({}), { caller });
} catch (error) {
  console.log((error as Error).name); // "AuthorizationErrorException"
}
