# Event factories

Yulin's event factories create complete AWS event objects for tests that call a handler directly.
They use [`@kensio/part-factory`](https://partfactory.dev/) and do not need a `SimAws` instance.

## Make a record or an event

Pass the fields that matter to the test. The factory supplies the remaining fields:

```typescript factories-records-and-events
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
```

Factories whose names end in `RecordFactory` create one record. Their matching event factories
create the object that contains a `Records` array. The event factory makes one record by default and
completes every partial record passed in `Records`.

## Reuse a named event shape

Every exported event factory implements `ItemFactory`. Wrap one in a `VariantFactory` to keep a
common event shape in one place:

```typescript factories-variants
/**
 * Naming the variations of an event an application receives.
 */

import { VariantFactory } from "@kensio/part-factory";

import { httpApiProxyEventFactory } from "@kensio/yulin/apigatewayv2";
import { s3NotificationEventFactory } from "@kensio/yulin/s3";

const signedInRequestFactory = new VariantFactory(httpApiProxyEventFactory, {
  requestContext: {
    authorizer: { jwt: { claims: { sub: "YL-1" }, scopes: null } },
  },
});

const request = signedInRequestFactory.make({ rawPath: "/account" });

// GET /account YL-1
console.log(
  request.routeKey,
  request.requestContext.authorizer?.jwt?.claims["sub"],
);

const objectRemovedFactory = new VariantFactory(s3NotificationEventFactory, {
  Records: [{ eventName: "ObjectRemoved:Delete" }],
});

const removal = objectRemovedFactory.make();

// ObjectRemoved:Delete undefined
console.log(
  removal.Records[0]?.eventName,
  // A removal reports no size, because the Object is gone.
  removal.Records[0]?.s3.object.size,
);
```

## Keep related fields consistent

AWS events often repeat the same value in several fields. The factories calculate those fields from
the overrides. For example, an SQS record's `md5OfBody` follows its `body`, and an S3 notification's
bucket ARN follows its bucket name.

The factories keep these groups consistent:

- Function URL and HTTP API request paths, route keys, query strings, endpoint details, caller
  details, and invocation times
- SQS message bodies, body digests, queue ARNs, and regions
- DynamoDB stream images, event names, view types, stream ARNs, and regions
- S3 bucket names, bucket ARNs, event names, and object metadata

You can still override both copies with different values. The factory preserves explicit overrides,
even when AWS would not produce that combination.

## Available factories

| Factory                                                                       | Import                       | Event                               |
| ----------------------------------------------------------------------------- | ---------------------------- | ----------------------------------- |
| `lambdaFunctionUrlEventFactory`                                               | `@kensio/yulin/lambda`       | A Lambda Function URL invocation    |
| `lambdaSqsEventFactory`, `lambdaSqsEventRecordFactory`                        | `@kensio/yulin/lambda`       | An SQS event source mapping's batch |
| `lambdaDynamoDbStreamEventFactory`, `lambdaDynamoDbStreamEventRecordFactory`  | `@kensio/yulin/lambda`       | A DynamoDB stream mapping's batch   |
| `httpApiProxyEventFactory`                                                    | `@kensio/yulin/apigatewayv2` | An HTTP API `AWS_PROXY` invocation  |
| `s3NotificationEventFactory`, `s3NotificationEventRecordFactory`              | `@kensio/yulin/s3`           | An S3 event notification            |
| `cloudFrontViewerRequestEventFactory`, `cloudFrontViewerResponseEventFactory` | `@kensio/yulin/cloudfront`   | A CloudFront Functions event        |

Each service page describes the fields and defaults for its own factories.

## Limitations

- Event factories create data only. They do not invoke a Lambda function, apply IAM permissions, or
  run another simulated service.
- A factory accepts explicit overrides that disagree with each other. It does not validate that the
  final event could have come from AWS.
