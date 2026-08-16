/**
 * Making an SQS event to call a handler with.
 */

import {
  lambdaSqsEventFactory,
  lambdaSqsEventRecordFactory,
  type SimLambdaSqsEvent,
} from "@kensio/yulin/lambda";

function ordersHandler(event: SimLambdaSqsEvent): readonly string[] {
  return event.Records.map(
    (record) => (JSON.parse(record.body) as { orderId: string }).orderId,
  );
}

const batch = lambdaSqsEventFactory.make({
  Records: [{ body: '{"orderId":"YL-1"}' }, { body: '{"orderId":"YL-2"}' }],
});

// [ 'YL-1', 'YL-2' ]
console.log(ordersHandler(batch));

// The record factory makes one on its own, for a test about a single message.
const record = lambdaSqsEventRecordFactory.make({
  body: '{"orderId":"YL-9"}',
  eventSourceARN: "arn:aws:sqs:eu-west-2:888888888888:orders",
});

// eu-west-2
console.log(record.awsRegion);
