# Event factories

A handler is invoked with an event, and a test of a handler has to produce one. The events AWS
delivers are large, most of each one is fields the handler never reads, and the two or three the
test is about are buried in them. Written out by hand, that literal is copied between files and
drifts.

Yulin exports [`@kensio/part-factory`](https://partfactory.dev/) factories for those event shapes. A
test made with one says what the request or the message was and leaves the rest of the event alone.
They are ordinary factories, made in-process, and they need no `SimAws` instance and no simulated
service running. A handler test that runs without a simulator is who they are for. A test that does want
one (a Function URL served over HTTP, a queue with a real event source mapping) gets its events from
the simulator, and these factories make the same shapes that simulator delivers.

## What is exported

| Factory                                                                       | Import                       | Event                               |
| ----------------------------------------------------------------------------- | ---------------------------- | ----------------------------------- |
| `lambdaFunctionUrlEventFactory`                                               | `@kensio/yulin/lambda`       | A Lambda Function URL invocation    |
| `lambdaSqsEventFactory`, `lambdaSqsEventRecordFactory`                        | `@kensio/yulin/lambda`       | An SQS event source mapping's batch |
| `lambdaDynamoDbStreamEventFactory`, `lambdaDynamoDbStreamEventRecordFactory`  | `@kensio/yulin/lambda`       | A DynamoDB stream mapping's batch   |
| `httpApiProxyEventFactory`                                                    | `@kensio/yulin/apigatewayv2` | An HTTP API `AWS_PROXY` invocation  |
| `s3NotificationEventFactory`, `s3NotificationEventRecordFactory`              | `@kensio/yulin/s3`           | An S3 event notification            |
| `cloudFrontViewerRequestEventFactory`, `cloudFrontViewerResponseEventFactory` | `@kensio/yulin/cloudfront`   | A CloudFront Functions event        |

Each service's own documentation covers what its events mean. This page is about how the factories
are shaped and what they have in common.

## One factory per shape, and one per record

An event that carries a list of records has two factories, one for a record and one for the event
around it. The record factory makes one record, and the event factory completes as many records as
the test asks for.

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

The event factory exists so a test can pass partial records like that. A `DynamicFactory` whose
defaults hold one record would not manage it. Overrides are merged onto defaults, and merging
replaces a list whole rather than element by element. A partial record passed that way would reach
the handler as the only thing in those records, typed as a complete one and missing every field the
handler reads.

## Named variations

Every factory here is an `ItemFactory`. A variation with a name is a `VariantFactory` around it, the
same as for any other `part-factory` factory. That is usually the tidiest way to describe the kind
of request or message one application receives:

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

## Events that agree with themselves

A real AWS event says the same thing in more than one field, and those copies are where a
hand-written literal goes wrong. It asks for `/user/status` and leaves the request context saying
`/`, or gives an SQS record the digest of some other body, or reports a DynamoDB insert on a record
that carries an old image.

Each factory's defaults are computed from the overrides, so supplying either copy settles the other.
What that covers is listed in each factory's own documentation, and in outline it is:

- **Function URL and HTTP API events** — the path, the query, the route key, the endpoint's id,
  hostname and `host` header, the caller's user agent and address, and the invocation time
- **SQS records** — the digest of the body, and the Region of the queue ARN
- **DynamoDB stream records** — the images the reported change would carry, the view type naming
  the images that are there, and the Region of the stream ARN
- **S3 notification records** — the ARN of the Bucket named, and whether the Object still exists to
  have a size and an eTag

Overriding both copies of one of those with different values is still allowed. A test that wants an
event no real invocation would produce is entitled to one. It just has to ask for it twice.
