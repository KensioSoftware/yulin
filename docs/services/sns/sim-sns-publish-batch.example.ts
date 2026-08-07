/**
 * A batch publish where one entry fails on its own.
 */

import { CreateTopicCommand, PublishBatchCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

const published = await sns.publishBatch(
  new PublishBatchCommand({
    TopicArn,
    PublishBatchRequestEntries: [
      { Id: "one", Message: "order-1" },
      {
        Id: "two",
        Message: "order-2",
        // "Map" is not an SNS message attribute data type.
        MessageAttributes: { tenant: { DataType: "Map", StringValue: "acme" } },
      },
    ],
  }),
);

console.log(published.Successful?.map((entry) => entry.Id)); // ["one"]
console.log(published.Failed?.[0]?.Code); // "InvalidParameterValueException"
