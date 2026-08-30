# Simulated CloudWatch Logs

Yulin includes a simulated Amazon CloudWatch Logs for tests and local development. It holds log
groups, the streams inside them and the events written to those streams. A test can put log events
and read them back with `GetLogEvents`, or search them with `FilterLogEvents`, without an AWS
account.

The point of it is to make log data addressable. Code that writes to CloudWatch Logs is code teams
already have, and the alternative for a test is capturing process output.

CloudWatch Logs specific types are imported from the `@kensio/yulin/logs` subpath.

## Writing and searching log events

A log group holds streams, a stream holds events, and `FilterLogEvents` searches across every
stream in a group. A test can therefore name the group and leave the stream out, without knowing
which execution environment wrote the line.

```typescript sim-logs-write-and-search
/**
 * Writing log events to a simulated log group and searching for one.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  FilterLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logs = simAws.logs();

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]0f7c1a";

await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await logs.createLogStream(
  new CreateLogStreamCommand({ logGroupName, logStreamName }),
);

await logs.putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [
      {
        timestamp: Date.parse("2026-08-16T09:00:00Z"),
        message: "INFO handling order-1",
      },
      {
        timestamp: Date.parse("2026-08-16T09:00:01Z"),
        message: "ERROR order has no items",
      },
    ],
  }),
);

const found = await logs.filterLogEvents(
  new FilterLogEventsCommand({ logGroupName, filterPattern: "ERROR" }),
);

// One event, from the stream that wrote it.
console.log(found.events?.length, found.events?.[0]?.logStreamName);
```

A write needs both the group and the stream to exist already. Real CloudWatch Logs refuses a write
to either one that is absent. A missing `logs:CreateLogStream` permission therefore shows up as a failure, where
otherwise the logs would quietly never appear.

## Filter patterns

The plain text filter pattern syntax is supported. Terms are matched as case sensitive substrings,
every unprefixed term must appear, a `-` prefix excludes a term, a `?` prefix makes a term one of a
set of alternatives, and a quoted phrase matches with its spaces intact.

| Pattern                | Matches                                          |
| ---------------------- | ------------------------------------------------ |
| `ERROR`                | messages containing `ERROR`                      |
| `ERROR orders`         | messages containing both terms                   |
| `?ERROR ?WARN`         | messages containing either term                  |
| `ERROR -Throttling`    | messages containing `ERROR` but not `Throttling` |
| `"order has no items"` | messages containing that exact phrase            |

An omitted or empty pattern matches everything.

The structured pattern syntaxes are refused. A JSON property pattern (`{ $.level = "ERROR" }`), a
space delimited field pattern (`[level=ERROR, message]`) and a regular expression term
(`%ERROR|WARN%`) each raise `SimLogsUnsupportedOperationException`. Approximating one would be
worse. A pattern quietly treated as matching everything would turn an assertion about one log line
into an assertion about any log line at all, and the test would keep passing while testing nothing.

## Reading one stream

`GetLogEvents` reads a single stream and pages in both directions. With no token it answers with
the newest events, as real CloudWatch Logs does. `startFromHead` starts at the oldest. Following
`nextForwardToken` walks towards newer events, and reaching the end gives the same token back. A
caller polling a stream keeps it and asks again.

Both readers narrow to a half open time window. An event whose timestamp equals `startTime` is
included, and one whose timestamp equals `endTime` is left out.

A token is an offset into the events the request selected, so keep `startTime` and `endTime` the
same across a walk. Changing the window part-way through counts the offset against a different set
of events, and the page comes back as a different page.

```typescript sim-logs-read-a-stream
/**
 * Paging through one simulated log stream from the oldest event.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  GetLogEventsCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logs = simAws.logs();

const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]0f7c1a";

await logs.createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await logs.createLogStream(
  new CreateLogStreamCommand({ logGroupName, logStreamName }),
);
await logs.putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [1, 2, 3, 4, 5].map((second) => ({
      timestamp: Date.parse("2026-08-16T09:00:00Z") + second * 1000,
      message: `line ${second}`,
    })),
  }),
);

let nextToken: string | undefined;
const read: string[] = [];

for (;;) {
  const page = await logs.getLogEvents(
    new GetLogEventsCommand({
      logGroupName,
      logStreamName,
      startFromHead: true,
      limit: 2,
      nextToken,
    }),
  );

  if (page.events === undefined || page.events.length === 0) break;

  read.push(...page.events.map((event) => event.message));
  nextToken = page.nextForwardToken;
}

console.log(read);
```

## Retention

Retention is held as a property to assert on. Events stay where they are, and seeing one go would
mean moving the clock by months. What teams get wrong about retention is the value they deployed,
ahead of the deletion that eventually follows from it. A log group with no retention keeps its
events forever, the AWS default.

The accepted values are a fixed set. A reasonable-looking `retentionInDays: 10` is refused here
exactly as it is by an account.

```typescript sim-logs-retention
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
```

## Lambda handler output

A Lambda function's output is recorded into `/aws/lambda/<function name>` as it runs, whether its
code is a zip archive or a real in-process handler. A test can then assert on what a handler logged
by searching its log group.

```typescript sim-logs-lambda-output
/**
 * Asserting on what a simulated Lambda handler logged.
 */

import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
    Handler: "index.handler",
    Code: {
      ZipFile: makeLambdaCodeZip({
        "index.js":
          "exports.handler = async () => {\n" +
          '  console.error("ERROR order has no items");\n' +
          "};\n",
      }),
    },
  }),
);

await simAws.backgroundTasksComplete();
await simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" }));

const found = await simAws.logs().filterLogEvents(
  new FilterLogEventsCommand({
    logGroupName: "/aws/lambda/orders",
    filterPattern: "ERROR",
  }),
);

console.log(found.events?.[0]?.message);
```

The output still reaches the terminal as well. Real Lambda sends it to CloudWatch Logs and nowhere
else, but a test tool that swallowed it would make a failing test harder to debug. Recording is a
tee.

An invocation that ends in an error nothing caught leaves an `ERROR Invoke Error` line in the group
after whatever it printed, carrying the error's type, its message and its stack. The
[simulated Lambda docs](https://yulinsim.dev/services/lambda/ "Simulated Lambda usage docs") show
one.

Each invocation's `context.logGroupName` and `context.logStreamName` name the group and stream that
were actually written to. Stream names use the real `YYYY/MM/DD/[$LATEST]<hash>` format. The hash
identifies the execution environment, and one environment serves more than one request. Match the
shape in a test, and leave the value alone.

Writing on this path is unconditional. A real function needs `logs:CreateLogGroup` and
`logs:PutLogEvents` on its execution Role, and one without them produces no logs at all, in silence.
Simulating that would leave nearly every function in a test logging nothing, with no failure to
explain why.

## Declaring a log group in a template

`AWS::Logs::LogGroup` is deployed by simulated CloudFormation. A test can then assert on the
retention a stack gave a group.

```yaml
OrdersLogs:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: /aws/lambda/orders
    RetentionInDays: 14
```

`Ref` resolves to the log group name, and `Fn::GetAtt Arn` to the ARN with its trailing `:*`. That is
the form a policy has to name. A template granting a function permission on its own log group gets a
resource that reaches the streams inside it.

`LogGroupName` and `RetentionInDays` are the two properties acted on. A `RetentionInDays` outside the
set AWS accepts fails the deploy, where otherwise it would only be found on a real one. Everything
else is recorded as an ignored property. A reader can see what a deployed group leaves out, and the
stack still deploys.

Two divergences to know about:

- **A group that already exists is taken over.** Real CloudFormation fails a deploy that declares a
  log group already in the account. That is a genuine misconfiguration there and pure noise here,
  where a Lambda function that logged during test setup has already created `/aws/lambda/orders`.
- **An update replaces the group.** Simulated CloudFormation has no in-place update at all. Any
  resource whose template entry changed is deleted and created again. The retention ends up correct,
  but the events the group held are gone, where a real update to `RetentionInDays` keeps them.

## Delivering logs from another service

CloudWatch Logs delivery carries the logs of another service somewhere. CloudFront standard logging
v2 is the clearest case. A distribution has no logging property of its own, and turning logging on
means three CloudWatch Logs resources.

A delivery source names what is being logged and which of its logs. A delivery destination names
where they land and in what form. A delivery joins one to the other.

```typescript sim-logs-delivery
/**
 * Setting up CloudFront standard logging v2 delivery into a bucket.
 */

import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  CreateDeliveryCommand,
  DescribeDeliveriesCommand,
  PutDeliveryDestinationCommand,
  PutDeliverySourceCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logs = simAws.logs();

const distribution = await simAws.cloudFront().createDistribution(
  new CreateDistributionCommand({
    DistributionConfig: {
      CallerReference: "site",
      Comment: "Static site distribution",
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "site-origin",
            DomainName: "origin.example.com",
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: "https-only",
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "site-origin",
        ViewerProtocolPolicy: "redirect-to-https",
      },
    },
  }),
);

await logs.putDeliverySource(
  new PutDeliverySourceCommand({
    name: "site-access-logs",
    resourceArn: `arn:aws:cloudfront::${simAws.defaultAccountId}:distribution/${distribution.Distribution?.Id}`,
    logType: "ACCESS_LOGS",
  }),
);

const destination = await logs.putDeliveryDestination(
  new PutDeliveryDestinationCommand({
    name: "site-access-logs",
    outputFormat: "json",
    deliveryDestinationConfiguration: {
      destinationResourceArn: "arn:aws:s3:::example-access-logs",
    },
  }),
);

await logs.createDelivery(
  new CreateDeliveryCommand({
    deliverySourceName: "site-access-logs",
    deliveryDestinationArn: destination.deliveryDestination?.arn,
    s3DeliveryConfiguration: {
      suffixPath: "{DistributionId}/{yyyy}/{MM}/{dd}/{HH}",
      enableHiveCompatiblePath: true,
    },
  }),
);

const deliveries = await logs.describeDeliveries(
  new DescribeDeliveriesCommand({}),
);

// S3, and the layout the bucket will be partitioned by.
console.log(
  deliveries.deliveries?.[0]?.deliveryDestinationType,
  deliveries.deliveries?.[0]?.s3DeliveryConfiguration?.suffixPath,
);
```

The delivery destination has an ARN of its own, and `CreateDelivery` names that one. The bucket
behind it keeps its own ARN, and the two are easy to mix up.

The service a delivery source is for is read off the resource ARN. A caller never states it. These
rules from real AWS are modelled here, each of them a deploy that looks fine until it runs:

- **The distribution has to be there.** A CloudFront delivery source over a distribution the
  simulated account never created fails with `ResourceNotFoundException`, and so does one whose ARN
  names another account. Pin a real distribution id in a template and the deploy fails here the way
  it would in an account. A `SimLogs` built on its own has no CloudFront to look in and keeps taking
  any ARN, so a test about delivery alone needs no distribution.
- **One delivery source per resource.** A second source over a distribution that already has one
  fails with `ConflictException`, carrying the message an account gives, "This ResourceId has
  already been used in another Delivery Source in this account".
- **A delivery holds both its ends.** Deleting the source or the destination while a delivery joins
  them fails with `ConflictException`. The delivery goes first, and CloudFormation orders that
  itself when a stack is deleted.
- **CloudFront delivers `ACCESS_LOGS` and nothing else.** Any other `logType` over a distribution is
  refused.
- **CloudFront delivery is set up from `us-east-1`**, whatever region the destination bucket is in.
  A CloudFront delivery source put from anywhere else is refused.
- **Hive compatible paths write the `key=` half themselves.** A suffix path naming the partition
  keys as well is refused. Delivery turns `{yyyy}` into `year=2026`, and `year={yyyy}` arrives
  doubled, which an account answers with "Provided suffixPath is invalid".
- **Output format is fixed once the destination exists.** A `PutDeliveryDestination` that would
  change it is refused. Changing a format means deleting the destination and making it again.
- **Parquet is written to S3 only.** A log group or Firehose destination asking for it is refused.

The suffix path decides the key each log file lands under. `{DistributionId}`, `{distributionid}`,
`{yyyy}`, `{MM}`, `{dd}`, `{HH}` and `{accountid}` are substituted, and a variable outside that set
is refused. Delivery would write the text out literally, and the bucket would look partitioned when
it was not. A path over the 256 characters CloudWatch Logs takes is refused too.

Under `enableHiveCompatiblePath`, delivery writes each segment as `key=value` and supplies the key
itself. `{yyyy}` lands as `year=2026` and `{distributionid}` as `distributionid=E1EXAMPLE1234`. A
suffix path naming those keys is refused, because the key would arrive twice. Leave the segments as
bare variables and let delivery name them.

### Declaring delivery in a template

The same three resources in a template, which is the whole of what a CDK construct for CloudFront
logging synthesises, alongside the distribution they are for. The source's `ResourceArn` is built
around a `Ref` to that distribution, the way CDK builds it. A pinned distribution id fails the
deploy (see [the rules above](#delivering-logs-from-another-service)).

```yaml
SiteDistribution:
  Type: AWS::CloudFront::Distribution
  Properties:
    DistributionConfig:
      Enabled: true
      Origins:
        Items:
          - Id: site-origin
            DomainName: origin.example.com
            CustomOriginConfig:
              OriginProtocolPolicy: https-only
      DefaultCacheBehavior:
        TargetOriginId: site-origin
        ViewerProtocolPolicy: redirect-to-https

AccessLogsSource:
  Type: AWS::Logs::DeliverySource
  Properties:
    Name: site-access-logs
    ResourceArn:
      !Join [
        "",
        [
          "arn:aws:cloudfront::",
          !Ref "AWS::AccountId",
          ":distribution/",
          !Ref SiteDistribution,
        ],
      ]
    LogType: ACCESS_LOGS

AccessLogsDestination:
  Type: AWS::Logs::DeliveryDestination
  Properties:
    Name: site-access-logs
    DestinationResourceArn: arn:aws:s3:::example-access-logs
    OutputFormat: json

AccessLogsDelivery:
  Type: AWS::Logs::Delivery
  Properties:
    DeliverySourceName: !Ref AccessLogsSource
    DeliveryDestinationArn: !GetAtt AccessLogsDestination.Arn
    S3SuffixPath: "{DistributionId}/{yyyy}/{MM}/{dd}/{HH}"
    S3EnableHiveCompatiblePath: true
```

The template carries the S3 layout as two flat properties, and the API takes them nested under
`s3DeliveryConfiguration`.

`Ref` resolves to the name on the source and the destination, and to the delivery ID on the
delivery. CloudWatch Logs issues that ID. A template cannot predict it.

`Fn::GetAtt` gives `Arn` on all three. The source also publishes `Service` and `ResourceArns`, and
the delivery publishes `DeliveryId` and `DeliveryDestinationType`. The destination publishes nothing
else, and `DeliveryDestinationType` is a property of it rather than an attribute, so read that one
off the delivery. Anything outside this set is refused here, as CloudFormation refuses it.

`Tags` and `DeliveryDestinationPolicy` are recorded as ignored properties, and the stack still
deploys.

## Subscription filters

A subscription filter delivers the events matching its pattern to a Lambda function. Code written to
forward log lines to an error tracker or a metrics sink can be tested against the handler it
forwards from.

```typescript sim-logs-subscription-filter
/**
 * Delivering matched log events to a simulated Lambda function.
 */

import { gunzipSync } from "node:zlib";

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]0f7c1a";
const received: string[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "error-tracker",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TrackerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: { awslogs: { data: string } }) => {
          const decoded = JSON.parse(
            gunzipSync(Buffer.from(event.awslogs.data, "base64")).toString(),
          ) as { logEvents: { message: string }[] };

          received.push(...decoded.logEvents.map((line) => line.message));

          return "recorded";
        },
      ),
    },
  }),
);

// CloudWatch Logs invokes as a regional service principal, so this is the
// grant a subscription filter needs on the function's side.
await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "error-tracker",
    StatementId: "logs",
    Action: "lambda:InvokeFunction",
    Principal: `logs.${simAws.defaultRegionName}.amazonaws.com`,
  }),
);
await simAws.backgroundTasksComplete();

await simAws.logs().createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));

await simAws.logs().putSubscriptionFilter(
  new PutSubscriptionFilterCommand({
    logGroupName,
    filterName: "errors-to-tracker",
    filterPattern: "ERROR",
    destinationArn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:error-tracker`,
  }),
);

await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [
      {
        timestamp: Date.parse("2026-08-16T09:00:00Z"),
        message: "INFO starting",
      },
      {
        timestamp: Date.parse("2026-08-16T09:00:01Z"),
        message: "ERROR order has no items",
      },
    ],
  }),
);

// Delivery happens after the write is answered, as it does in an account.
await simAws.backgroundTasksComplete();

console.log(received);
```

The payload is the real one. An `awslogs.data` field holds the base64 of a gzipped JSON document
with `messageType`, `owner`, `logGroup`, `logStream`, `subscriptionFilters` and `logEvents`. A
handler written against a real subscription decodes it unchanged.

The behaviour in detail:

- **Delivery is asynchronous.** `PutLogEvents` is answered before anything is delivered. A test
  waits with `await simAws.backgroundTasksComplete()`. A destination that throws leaves the write
  that triggered it alone.
- **A failed delivery is kept.** Real CloudWatch Logs tells nobody when a delivery fails, and it
  becomes a metric nobody is watching. `simAws.logs().subscriptionFailures` holds them. A test can
  find out that the subscription it set up never reached anything.
- **The destination is checked when the filter is put.** A function that has yet to grant
  `logs.<region>.amazonaws.com` permission to invoke it fails `PutSubscriptionFilter`, as it does in
  an account. The alternative would be a filter that silently drops every event. The resource policy
  is consulted again on every delivery, and a permission removed later stops delivery too.
- **What a Lambda function logged is delivered as well.** A subscription on `/aws/lambda/orders`
  picks up what that function wrote. A forwarder can be tested against a real handler's output.
- **Lambda is the only destination.** Kinesis, Firehose and cross-account destinations are refused
  outright.
- **A destination can name a version or an alias.** See
  [Subscribing a Lambda alias](#subscribing-a-lambda-alias).
- **Two filters per log group**, the current AWS account default.

### Subscribing a Lambda alias

A `destinationArn` can carry a version number or an alias name on the end, and matched events go to
the version that qualifier names. The grant is made on the same qualifier:

```typescript sim-logs-subscription-alias
/**
 * Delivering matched log events to a simulated Lambda alias.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/19/[$LATEST]0f7c1a";
const trackerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:error-tracker`;

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "error-tracker",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TrackerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        return "recorded";
      }),
    },
  }),
);
await simAws.backgroundTasksComplete();

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "error-tracker" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "error-tracker",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "error-tracker",
    Qualifier: "live",
    StatementId: "logs",
    Action: "lambda:InvokeFunction",
    Principal: `logs.${simAws.defaultRegionName}.amazonaws.com`,
  }),
);

await simAws.logs().createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));

await simAws.logs().putSubscriptionFilter(
  new PutSubscriptionFilterCommand({
    logGroupName,
    filterName: "errors-to-tracker",
    filterPattern: "ERROR",
    destinationArn: `${trackerArn}:live`,
  }),
);

await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [{ timestamp: 1000, message: "ERROR order has no items" }],
  }),
);

await simAws.backgroundTasksComplete();
```

A qualifier naming no version and no alias is refused where the filter is put, the way a missing
function is. `UpdateAlias` moves what the filter reaches, and the filter stays as it is.

## Metric filters

A metric filter turns matching log events into CloudWatch metric datapoints. It is how a log line becomes something an alarm can watch, with no handler publishing a metric of its own.

```typescript sim-logs-metric-filter
/**
 * Counting matching log lines into a CloudWatch metric.
 */

import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutMetricFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/30/[$LATEST]0f7c1a";
const startedAt = new Date("2026-08-30T09:00:00Z");

await simAws.clock().setTo(startedAt);
await simAws.logs().createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));

await simAws.logs().putMetricFilter(
  new PutMetricFilterCommand({
    logGroupName,
    filterName: "handler-errors",
    filterPattern: "ERROR",
    metricTransformations: [
      {
        metricNamespace: "Orders",
        metricName: "HandlerErrors",
        metricValue: "1",
        unit: "Count",
      },
    ],
  }),
);

await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [
      { timestamp: startedAt.getTime(), message: "INFO starting" },
      { timestamp: startedAt.getTime(), message: "ERROR order has no items" },
    ],
  }),
);

// Publication happens after the write is answered, as it does in an account.
await simAws.backgroundTasksComplete();

const statistics = new GetMetricStatisticsCommand({
  Namespace: "Orders",
  MetricName: "HandlerErrors",
  StartTime: startedAt,
  EndTime: new Date(startedAt.getTime() + 60_000),
  Period: 60,
  Statistics: ["Sum"],
});
const counted = await simAws.cloudWatch().getMetricStatistics(statistics);

// 1. The ERROR line counted and the INFO line did not.
console.log(counted.Datapoints?.[0]?.Sum);
```

Datapoints go in through the same `PutMetricData` an ordinary caller uses, into the CloudWatch of the log group's own Account and Region. A datapoint is stamped from the simulation's clock at the instant the event was written.

A transformation carrying a `defaultValue` publishes that value once for a minute that took log events and matched none of them. That is how real CloudWatch Logs keeps a metric reporting through a quiet stretch. A minute a match landed in publishes the match alone. A transformation with no default value publishes nothing for a minute it matched nothing in, and the metric is then left with no datapoint at all over that stretch.

A transformation carrying dimensions cannot also carry a `defaultValue`, and one carrying both is refused. Real CloudWatch Logs allows one or the other, because a default would have to be reported against every dimension value the filter has ever seen.

`DescribeLogGroups` reports how many filters a group has as `metricFilterCount`. `DescribeMetricFilters` takes an optional `logGroupName`. A request naming none, and giving a `metricNamespace` and `metricName`, finds every filter in the Region writing to that metric.

### Values a filter cannot read out of the event

A `metricValue` or a dimension value naming a field of the matched event (`$.bytes`, `$1`) raises `SimLogsUnsupportedOperationException` at `PutMetricFilter`. Reading one needs the pattern to have been parsed structurally, and the structured pattern syntaxes are absent. A literal value publishes.

A filter whose namespace begins `AWS/` is taken, because CloudWatch Logs takes one. The publication is then refused by `PutMetricData`, which reserves those namespaces exactly as real CloudWatch does. The refusal lands on `simAws.logs().metricPublicationFailures` rather than failing the write that produced it, so a filter writing nowhere is something a test can assert on.

### Declaring a metric filter in a template

`AWS::Logs::MetricFilter` deploys through the same `PutMetricFilter`, so a stack's own alarm reads a metric its own log group produced.

```typescript sim-cfn-logs-metric-filter
/**
 * Deploying a metric filter and an alarm over the metric it writes.
 */

import { DescribeAlarmsCommand } from "@aws-sdk/client-cloudwatch";
import {
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/30/[$LATEST]0f7c1a";

await simAws.clock().setTo(new Date("2026-08-30T09:00:00Z"));

await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      OrdersLogs: {
        Type: "AWS::Logs::LogGroup",
        Properties: { LogGroupName: logGroupName },
      },
      OrdersErrors: {
        Type: "AWS::Logs::MetricFilter",
        Properties: {
          LogGroupName: { Ref: "OrdersLogs" },
          FilterName: "handler-errors",
          FilterPattern: "ERROR",
          MetricTransformations: [
            {
              MetricNamespace: "Orders",
              MetricName: "HandlerErrors",
              MetricValue: "1",
              Dimensions: [{ Key: "service", Value: "orders" }],
            },
          ],
        },
      },
      OrdersFailing: {
        Type: "AWS::CloudWatch::Alarm",
        Properties: {
          AlarmName: "OrdersFailing",
          Namespace: "Orders",
          MetricName: "HandlerErrors",
          Dimensions: [{ Name: "service", Value: "orders" }],
          Statistic: "Sum",
          Period: 60,
          EvaluationPeriods: 3,
          DatapointsToAlarm: 1,
          Threshold: 0,
          ComparisonOperator: "GreaterThanThreshold",
          TreatMissingData: "notBreaching",
        },
      },
    },
  },
});

await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));
await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [
      {
        timestamp: simAws.clock().now().getTime(),
        message: "ERROR order has no items",
      },
    ],
  }),
);

await simAws.backgroundTasksComplete();
await simAws.clock().advanceBy({ minutes: 2 });

const { MetricAlarms } = await simAws
  .cloudWatch()
  .describeAlarms(new DescribeAlarmsCommand({ AlarmNames: ["OrdersFailing"] }));

// ALARM. One log line drove it, with nothing publishing a metric by hand.
console.log(MetricAlarms?.[0]?.StateValue);
```

`Ref` returns the filter name, and a filter with no `FilterName` is named after the stack and the logical ID. `Dimensions` is a list of `Key` and `Value` pairs in a template and a map through the SDK, and both reach the same filter. Deleting the stack takes the filter with the log group.

## Embedded Metric Format

A log event that is itself an Embedded Metric Format document publishes the metrics it declares. This is how AWS Lambda Powertools counts anything. Its `Metrics` writes an EMF document to the handler's stdout and calls no CloudWatch API at all, and a CDK `NodejsFunction` bundling Powertools does the same in a deployed account.

```typescript sim-logs-embedded-metric-format
/**
 * Reading a Powertools style metric out of what a handler printed.
 */

import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const logGroupName = "/aws/lambda/user";
const logStreamName = "2026/08/30/[$LATEST]0f7c1a";
const startedAt = new Date("2026-08-30T09:00:00Z");

await simAws.clock().setTo(startedAt);
await simAws.logs().createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));

// The document Powertools writes to stdout. The metadata names the namespace,
// the dimension set and the metric, and the body carries the values.
const document = JSON.stringify({
  _aws: {
    Timestamp: startedAt.getTime(),
    CloudWatchMetrics: [
      {
        Namespace: "ChineseBoost",
        Dimensions: [["service"]],
        Metrics: [{ Name: "UserRequestFailed", Unit: "Count" }],
      },
    ],
  },
  service: "user",
  UserRequestFailed: 1,
});

await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [{ timestamp: startedAt.getTime(), message: document }],
  }),
);

await simAws.backgroundTasksComplete();

const statistics = new GetMetricStatisticsCommand({
  Namespace: "ChineseBoost",
  MetricName: "UserRequestFailed",
  Dimensions: [{ Name: "service", Value: "user" }],
  StartTime: startedAt,
  EndTime: new Date(startedAt.getTime() + 300_000),
  Period: 300,
  Statistics: ["Sum"],
});
const counted = await simAws.cloudWatch().getMetricStatistics(statistics);

// 1. The metric came out of the log line, with nothing calling PutMetricData.
console.log(counted.Datapoints?.[0]?.Sum);
```

A bound Lambda handler needs none of this written by hand. Its output already reaches `/aws/lambda/<name>`. A handler bundling Powertools therefore counts through the same path a deployed one does, and invoking it can drive an alarm over the metric to a state change.

`_aws.CloudWatchMetrics[].Dimensions` is a list of dimension key lists, and each inner list is one whole dimension set. A document declaring two sets publishes each of its metrics once per set, which is what makes them separate identities in CloudWatch. A metric whose value is a list of numbers publishes one datapoint per value.

The timestamp comes from `_aws.Timestamp`, read as milliseconds, and from the instant CloudWatch Logs took the event where the document carries none. A handler running inside a simulated Lambda reads the simulation's clock. A Powertools document therefore stamps itself in simulated time without being told to.

### What is left alone, and what is recorded

A log event is read as a document only where it parses as JSON, comes out as an object, and carries usable `_aws` metadata. Anything else is stored and left alone. A log group is full of lines that were never metrics, and treating a parse failure as an error would make the common case the noisy one.

Three things go on `simAws.logs().metricPublicationFailures` rather than passing quietly. A metric the metadata declares and the document body carries no number under, a metric asking for `StorageResolution: 1`, which simulated CloudWatch has no period short enough for, and a directive that asked for dimensions and got no usable set of them.

A dimension set is taken whole or dropped whole. One naming a key the body lacks, and one carrying anything but strings, are both dropped, because publishing part of a set would put the datapoint under a narrower identity than the document declared. A directive left with no usable set publishes nothing at all. Falling back to no dimensions would land the datapoint on the undimensioned metric, and that is one an alarm may well be watching.

Each entry on the ledger names its `source`, which is `{ kind: "metricFilter", filterName }` or `{ kind: "embeddedMetricFormat" }`. The two are told apart by kind rather than by name, because a metric filter may be called anything.

## Permissions

Every operation goes through simulated IAM. An operation on a named log group authorizes against
that group's ARN with the trailing `:*`. That is the form CloudWatch Logs policies are written in.
Granting `logs:PutLogEvents` on a group grants it on the streams inside, and the wildcard is what
covers them. A policy naming `log-group:/aws/lambda/orders` without it reaches no stream here,
exactly as on real AWS.

`DescribeLogGroups` names no particular group. It authorizes against every log group in the account
and region, and a policy scoped to one group cannot describe them all.

A Stack deploying the three delivery Resource types authorizes the actions CloudFormation names.
Each handler reads its own resource back before it writes. `AWS::Logs::DeliverySource` therefore
needs `logs:GetDeliverySource` alongside `logs:PutDeliverySource`, and the destination and the
delivery need `logs:GetDeliveryDestination` and `logs:GetDelivery` the same way. The `Describe` actions cover
the three listing operations an SDK caller reaches, and a deployment goes near none of them. A
CloudFormation execution Role therefore carries the same policy here that a real deploy of the
template needs.

A delivery source over a CloudFront distribution takes one CloudFront permission on top of those.
CloudWatch Logs checks the caller for `cloudfront:AllowVendedLogDeliveryForResource` against the
distribution's ARN as the source is put, and a caller holding every `logs:` action and no CloudFront
permission is refused. A policy naming another distribution is refused the same way. A delivery
source over a resource of any other service asks for nothing outside `logs:`.

```typescript sim-logs-permissions
/**
 * A simulated IAM policy allowing a Role to write one function's logs.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;
const regionName = simAws.defaultRegionName;
const logGroupName = "/aws/lambda/orders";

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersFunctionRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersFunctionRole",
    PolicyName: "WriteOwnLogs",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        // The trailing wildcard covers the streams inside the group.
        Resource: `arn:aws:logs:${regionName}:${accountId}:log-group:${logGroupName}:*`,
      },
    }),
  }),
);

const asRole = { caller: { kind: "arn", arn: role.Role.Arn } } as const;

await simAws
  .logs()
  .createLogGroup(new CreateLogGroupCommand({ logGroupName }), asRole);
await simAws.logs().createLogStream(
  new CreateLogStreamCommand({
    logGroupName,
    logStreamName: "2026/08/16/[$LATEST]0f7c1a",
  }),
  asRole,
);

console.log(simAws.logs().findLogGroup(logGroupName)?.logGroupArn);
```

## Through an intercepted SDK client

Application code that constructs its own `CloudWatchLogsClient` reaches the simulator through SDK
interception, with the code under test unchanged.

```typescript sim-logs-sdk-interception
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
```

## Limitations

- **Events never expire.** Retention is stored and reported, never acted on.
- **A metric filter reading a field of the log event.** A `metricValue` or a dimension value
  beginning `$` is refused where the filter is put. Both need a structured filter pattern, and
  neither structured syntax is simulated.
- **How far back a `defaultValue` looks.** A filter remembers the most recent minute it matched
  something in. A later write into that same minute publishes no default over the top, and a write
  landing in an earlier minute a match was already seen in does publish one. Events
  arrive in time order in a simulation, so this shows up only where a test writes into the past.
- **Subscription filter destinations other than Lambda**, and `Distribution`. `Distribution` is
  accepted and reported, and with no shards to spread across it has no effect.
- **EMF arriving by any route other than a log event.** The document has to reach a log group to be
  read, which is how it reaches CloudWatch in an account.
- **`AWS::Logs::SubscriptionFilter`.** Recorded as a gap. The log group, the metric filter and the
  three delivery resource types are what simulated CloudFormation deploys here.
- **`ApplyOnTransformedLogs` and `EmitSystemFieldDimensions` on a metric filter.** Recorded and
  acted on by nothing. Log transformers are absent, so there is no transformed event to read.
- **Nothing is actually delivered.** A delivery records that a source was joined to a destination
  and how the records would be written. No access log file ever reaches the bucket.
- **`GetDeliverySource`, `GetDeliveryDestination` and `GetDelivery`.** Absent as SDK operations. The
  three `Describe` operations report the same resources. The three action names are authorized where
  CloudFormation reads a delivery Resource back.
- **Delivery resource tags and cross-account delivery.** `PutDeliverySource`,
  `PutDeliveryDestination` and `CreateDelivery` refuse tags outright. `DeliveryDestinationPolicy` in
  a template is recorded and acted on by nothing.
- **An `=` in a suffix path with Hive compatible paths off.** Taken. Whether real CloudWatch Logs
  takes one is unverified. A path hand-rolling its own partition keys without the option is left
  alone here, and refused with the option on.
- **Log types for services other than CloudFront.** Any `logType` is taken over a resource that is
  not a distribution, because the valid set varies by service and this simulation does not carry it.
- **Logs Insights, export tasks, tags, encryption and data protection policies.** Absent. Tags and
  `kmsKeyId` on `CreateLogGroup` are refused outright. A property cannot look set here and behave
  differently in an account.
- **Per-stream `storedBytes`.** Always zero, matching real CloudWatch Logs, which stopped reporting
  the figure per stream in 2019. `DescribeLogGroups` reports the bytes a group holds.
- **Log capture from a handler function reference.** Recorded through the process console and the
  process standard streams, both of which a test runner is free to replace. `console.trace` and
  `console.dir` reach the log group only where the host console passes them on to `process.stdout`.
  See the Lambda docs for the detail.
