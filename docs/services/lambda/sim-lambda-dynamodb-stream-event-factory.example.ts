/**
 * Making a DynamoDB stream event to call a handler with.
 */

import {
  lambdaDynamoDbStreamEventFactory,
  type SimLambdaDynamoDbStreamEvent,
} from "@kensio/yulin/lambda";

function shippedOrders(event: SimLambdaDynamoDbStreamEvent): readonly string[] {
  return event.Records.filter(
    (record) => record.dynamodb.NewImage?.["status"]?.S === "shipped",
  ).map((record) => record.dynamodb.Keys?.["orderId"]?.S ?? "");
}

const event = lambdaDynamoDbStreamEventFactory.make({
  Records: [
    {
      eventName: "MODIFY",
      dynamodb: {
        Keys: { orderId: { S: "YL-1" } },
        OldImage: { orderId: { S: "YL-1" }, status: { S: "placed" } },
        NewImage: { orderId: { S: "YL-1" }, status: { S: "shipped" } },
      },
    },
    { eventName: "INSERT" },
  ],
});

// [ 'YL-1' ]
console.log(shippedOrders(event));

// NEW_AND_OLD_IMAGES, because that is what this record carries
console.log(event.Records[0]?.dynamodb.StreamViewType);
