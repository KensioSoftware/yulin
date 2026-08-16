# Simulated CloudWatch Logs

Yulin includes a simulated Amazon CloudWatch Logs for tests and local development. It holds log
groups, the streams inside them and the events written to those streams, so a test can put log
events and read them back with `GetLogEvents` or search them with `FilterLogEvents` without an AWS
account.

That is what this service is for: making log data addressable. Code that writes to CloudWatch Logs
is code teams already have, and until now a test could only observe it by capturing process output.

CloudWatch Logs specific types are imported from the `@kensio/yulin/logs` subpath.

## Writing and searching log events

A log group holds streams, a stream holds events, and `FilterLogEvents` searches across every
stream in a group. That last part is what makes an assertion practical: the test names the group,
not the stream, so it does not need to know which execution environment wrote the line.

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

Neither the group nor the stream is created on the way. Real CloudWatch Logs refuses a write to
either one that is not there, which is what makes a missing `logs:CreateLogStream` permission show
up as a failure rather than as logs that quietly never appear.

## Filter patterns

The plain text filter pattern syntax is supported: terms are matched as case sensitive substrings,
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

The structured pattern syntaxes are refused rather than approximated. A JSON property pattern
(`{ $.level = "ERROR" }`), a space delimited field pattern (`[level=ERROR, message]`) and a regular
expression term (`%ERROR|WARN%`) each raise `SimLogsUnsupportedOperationException`. That is
deliberate: a pattern quietly treated as matching everything would turn an assertion about one log
line into an assertion about any log line at all, and the test would keep passing while testing
nothing.

## Reading one stream

`GetLogEvents` reads a single stream and pages in both directions. With no token it answers with
the newest events, as real CloudWatch Logs does; `startFromHead` starts at the oldest instead.
Following `nextForwardToken` walks towards newer events, and reaching the end gives the same token
back rather than nothing, so a caller polling a stream keeps it and asks again.

Both readers narrow to a half open time window: an event whose timestamp equals `startTime` is
included, and one whose timestamp equals `endTime` is not.

A token is an offset into the events the request selected, so keep `startTime` and `endTime` the
same across a walk. Changing the window part-way through means the offset is counted against a
different set of events, and the page you get back will not be the one you expected.

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

Retention is held as a property to assert on. Nothing expires here: a test would have to move the
clock by months to see an event go, and what teams get wrong about retention is the value they
deployed rather than the deletion that eventually follows from it. A log group with no retention
keeps its events forever, which is the AWS default.

The set of accepted values is fixed rather than a range, so a reasonable-looking
`retentionInDays: 10` is refused here exactly as it is by an account.

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

A zip-packaged Lambda function's output is recorded into `/aws/lambda/<function name>` as it runs,
so a test can assert on what a handler logged by searching its log group rather than by capturing
process output.

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
else, but a test tool that swallowed it would make a failing test harder to debug than it is with
none of this, so recording is a tee rather than a redirect.

Each invocation's `context.logGroupName` and `context.logStreamName` name the group and stream that
were actually written to. Stream names use the real `YYYY/MM/DD/[$LATEST]<hash>` format, and the
hash identifies the execution environment rather than the request, so a test should match the shape
rather than the value.

Nothing is authorized on this path. A real function needs `logs:CreateLogGroup` and
`logs:PutLogEvents` on its execution Role, and one without them produces no logs at all, in silence.
Simulating that would mean nearly every function in a test logged nothing with no failure to explain
why, so writing here is unconditional.

## Declaring a log group in a template

`AWS::Logs::LogGroup` is deployed by simulated CloudFormation, so a test can assert on the retention
a stack gave a group rather than reading it off the template.

```yaml
OrdersLogs:
  Type: AWS::Logs::LogGroup
  Properties:
    LogGroupName: /aws/lambda/orders
    RetentionInDays: 14
```

`Ref` resolves to the log group name and `Fn::GetAtt Arn` to the ARN with its trailing `:*`, which is
the form a policy has to name, so a template granting a function permission on its own log group
gets a resource that reaches the streams inside it.

`LogGroupName` and `RetentionInDays` are the two properties acted on. A `RetentionInDays` outside the
set AWS accepts fails the deploy, which is the point: it would otherwise only be found on a real one.
Everything else is recorded as an ignored property rather than refused, so a reader can see what a
deployed group is not doing without a whole stack failing over a property that changes nothing about
what the test asserts.

Two divergences are worth knowing about:

- **A group that already exists is taken over rather than refused.** Real CloudFormation fails a
  deploy that declares a log group already in the account. That is a genuine misconfiguration there
  and pure noise here, where a Lambda function that logged during test setup has already created
  `/aws/lambda/orders`.
- **An update replaces the group rather than changing it in place.** Simulated CloudFormation has no
  in-place update at all: any resource whose template entry changed is deleted and created again. The
  retention ends up correct, but the events the group held are gone, where a real update to
  `RetentionInDays` keeps them.

## Subscription filters

A subscription filter delivers the events matching its pattern to a Lambda function, so the code a
team wrote to forward log lines to an error tracker or a metrics sink can be tested against the
handler it forwards from.

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

The payload is the real one: an `awslogs.data` field holding the base64 of a gzipped JSON document
with `messageType`, `owner`, `logGroup`, `logStream`, `subscriptionFilters` and `logEvents`. A
handler written against a real subscription decodes it unchanged.

A few things are worth knowing:

- **Delivery is asynchronous.** `PutLogEvents` is answered before anything is delivered, so a test
  waits with `await simAws.backgroundTasksComplete()`. A destination that throws does not fail the
  write that triggered it.
- **A failed delivery is kept.** Real CloudWatch Logs tells nobody when a delivery fails; it becomes
  a metric nobody is watching. `simAws.logs().subscriptionFailures` holds them, so a test can find
  out that the subscription it set up never reached anything.
- **The destination is checked when the filter is put.** A function that has not granted
  `logs.<region>.amazonaws.com` permission to invoke it fails `PutSubscriptionFilter`, as it does in
  an account, rather than leaving a filter that silently drops every event. The resource policy is
  consulted again on every delivery, so a permission removed later stops delivery too.
- **What a Lambda function logged is delivered as well.** A subscription on `/aws/lambda/orders`
  picks up what that function wrote, so a forwarder can be tested against a real handler's output.
- **Lambda is the only destination.** Kinesis, Firehose and cross-account destinations are refused
  rather than accepted and never delivered to.
- **Two filters per log group**, which is the current AWS account default.

## Permissions

Every operation goes through simulated IAM. An operation on a named log group authorizes against
that group's ARN with the trailing `:*`, which is the form CloudWatch Logs policies are written in:
granting `logs:PutLogEvents` on a group grants it on the streams inside, and the wildcard is what
covers them. A policy naming `log-group:/aws/lambda/orders` without it reaches nothing here, exactly
as it reaches nothing on real AWS.

`DescribeLogGroups` names no particular group, so it authorizes against every log group in the
account and region. A policy scoped to one group cannot describe them all.

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
interception, with nothing to change in the code under test.

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

## What is not simulated

- **Nothing expires.** Retention is stored and reported, never acted on.
- **Metric filters.** Absent, so `metricFilterCount` is always zero.
- **Subscription filter destinations other than Lambda**, and `Distribution`, which is accepted and
  reported but changes nothing because there are no shards to spread across.
- **`AWS::Logs::SubscriptionFilter` and `AWS::Logs::MetricFilter`.** `AWS::Logs::LogGroup` is the
  only CloudFormation resource type here; the others are recorded as gaps.
- **Logs Insights, export tasks, tags, encryption and data protection policies.** Absent. Tags and
  `kmsKeyId` on `CreateLogGroup` are refused rather than dropped, so nothing looks set here and
  behaves differently in an account.
- **Per-stream `storedBytes`.** Always zero, which matches real CloudWatch Logs: it stopped
  reporting the figure per stream in 2019. `DescribeLogGroups` reports the bytes a group holds.
- **Log capture from anything but zip-packaged Lambda code.** A function backed by a handler
  function reference, including a container image binding, writes to the host console directly and
  is not recorded. See the Lambda docs for why.
