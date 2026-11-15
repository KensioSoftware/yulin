/**
 * Tagging an event bus and deciding PutEvents on its tags.
 */

import {
  CreateEventBusCommand,
  ListTagsForResourceCommand,
  PutEventsCommand,
  TagResourceCommand,
} from "@aws-sdk/client-eventbridge";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const created = await simAws.eventBridge().createEventBus(
  new CreateEventBusCommand({
    Name: "orders",
    Tags: [{ Key: "team", Value: "orders" }],
  }),
);

await simAws.eventBridge().tagResource(
  new TagResourceCommand({
    ResourceARN: created.EventBusArn,
    Tags: [{ Key: "stage", Value: "test" }],
  }),
);

const listed = await simAws
  .eventBridge()
  .listTagsForResource(
    new ListTagsForResourceCommand({ ResourceARN: created.EventBusArn }),
  );

console.log(listed.Tags);
// [ { Key: 'team', Value: 'orders' }, { Key: 'stage', Value: 'test' } ]

await simAws.iam().createRole({
  input: {
    RoleName: "OrdersPublisher",
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
    RoleName: "OrdersPublisher",
    PolicyName: "PublishToOwnTeam",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "events:PutEvents",
        Resource: "*",
        Condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
    }),
  },
});

const put = await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      {
        EventBusName: "orders",
        Source: "orders.service",
        DetailType: "OrderPlaced",
        Detail: "{}",
      },
    ],
  }),
  {
    caller: {
      kind: "arn",
      arn: "arn:aws:iam::123456789012:role/OrdersPublisher",
    },
  },
);

console.log(put.FailedEntryCount); // 0
