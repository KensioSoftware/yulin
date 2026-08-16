/**
 * Making the SQS event a batch of messages arrives in.
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

// One record, for a test about a single message.
const record = lambdaSqsEventRecordFactory.make({
  body: '{"orderId":"YL-1"}',
});

// [ 'YL-1' ]
console.log(ordersHandler({ Records: [record] }));

// A batch, saying only what each message carries. Everything else about each
// record — its message id, its receipt handle, the digest of its body — is
// filled in as a delivered record's is.
const event = lambdaSqsEventFactory.make({
  Records: [{ body: '{"orderId":"YL-1"}' }, { body: '{"orderId":"YL-2"}' }],
});

// [ 'YL-1', 'YL-2' ]
console.log(ordersHandler(event));
