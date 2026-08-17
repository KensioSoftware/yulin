# Simulated time

Every timestamp a simulated AWS service produces comes from that simulation's own clock, and that
clock can be moved. Time can be frozen, set to an instant, or advanced by a duration. Behaviour that
depends on time passing, such as a temporary session expiring, can be tested without waiting for it.

Time belongs to a `SimAws` instance. Moving it affects that instance only. The host clock, another
simulation running in the same test file, and any other code in the process all carry on unchanged.

## Reading the time

`simAws.now()` is what the simulation means by "now". The host clock may say something different. It
also stamps simulated resources, such as an IAM User's `CreateDate` and an `AssumeRole` session's
`Expiration`.

By default a new `SimAws` runs in step with the real system clock.

## Starting at a known instant

Pass a clock to start somewhere specific. `SimFixedClock` is the usual choice, since it reports one
instant and stays there:

```typescript sim-clock-freeze-and-advance
/**
 * Starting a simulation at a known instant, then moving its clock on.
 */

import { CreateUserCommand } from "@aws-sdk/client-iam";
import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const output = await simAws
  .iam()
  .createUser(new CreateUserCommand({ UserName: "Clockwatcher" }));

console.log(output.User.CreateDate); // 2026-07-26T09:00:00.000Z

await simAws.clock().advanceBy({ hours: 2, minutes: 30 });

console.log(simAws.now()); // 2026-07-26T11:30:00.000Z

// Still two and a half hours ahead of the clock it was given. That clock is a
// fixed one, so simulated time stays at 11:30 rather than running on.
simAws.clock().resume();
```

Simulated time is layered over whatever clock is supplied. A simulation started at a fixed instant
is still free to move from there, and it stays measured against that clock. Resuming a simulation
built on a `SimFixedClock` puts it back in running mode, and its time then moves whenever the clock
underneath moves. A fixed clock stays where it is. Leave the default real clock in place for a
simulation whose time should pass by itself.

## Frozen and running

There are two modes:

- **Frozen**: simulated time only moves when something moves it. A frozen clock reports the same
  instant however long the host takes, and a slow test holds the state it set up. This is what a
  deterministic assertion wants.
- **Running**: simulated time tracks the clock underneath, offset from it. On the default real clock
  time passes by itself. Use it to jump forward an hour and carry on.

Moving time deliberately freezes it. `setTo(...)` and `advanceBy(...)` both leave the clock stopped
where they put it. A test that asked for a specific instant then asserts on that instant, however
long the assertion takes. `resume()` is the way back to running, and it carries on from where the
clock stopped.

`simAws.clock().isFrozen` reports which mode the clock is in.

## Advancing time

`advanceBy(...)` takes a duration written as any combination of `days`, `hours`, `minutes`,
`seconds` and `milliseconds`, which add together. Durations are never negative, since time passing
only runs forwards. `setTo(...)` is the explicit way to move a clock back.

Advancing moves the clock, and it runs whatever the passage of time should have caused. Work
scheduled for an instant inside the interval is dispatched in due order, each task running with the
clock reading its own due time. Further work it schedules settles before `advanceBy` returns where
that work is itself due by the new time, and stays queued where it falls later. So a test can
advance and then assert, with no additional waiting:

```typescript sim-clock-session-expiry
/**
 * Advancing simulated time past a temporary session's expiry.
 */

import { CreateRoleCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simIam = simAws.iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "ReportingRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

// A fifteen minute session.
const assumeRoleOutput = await simAws.sts().assumeRole(
  new AssumeRoleCommand({
    RoleArn: `arn:aws:iam::${simAws.defaultAccountId}:role/ReportingRole`,
    RoleSessionName: "reporting-session",
    DurationSeconds: 900,
  }),
);

const issued = assumeRoleOutput.Credentials!;
const credentials = {
  accessKeyId: issued.AccessKeyId!,
  secretAccessKey: issued.SecretAccessKey!,
  sessionToken: issued.SessionToken!,
};

// The session authenticates while it is current.
console.log(simIam.credentials.resolveCredentials(credentials).principal);

await simAws.clock().advanceBy({ minutes: 20 });

try {
  simIam.credentials.resolveCredentials(credentials);
} catch (error) {
  // Rejected as an expired session, twenty simulated minutes later.
  console.log((error as Error).message);
}
```

Work triggered by advancing that fails throws from `advanceBy(...)`, where the caller can see it.
The clock is left at the point it failed, and anything still queued stays queued.

Delivery to a target is the exception, and deliberately so. An EventBridge rule or a Scheduler
schedule that cannot reach its target records the failure instead of throwing. Real AWS reports a
failed delivery to nobody, and one rejected delivery would otherwise fail an unrelated
`advanceBy(...)` elsewhere in the same test. Read the failures from `eventBridge().deliveryFailures`
and `scheduler().deliveryFailures`.

Several parts of the simulator schedule work on the clock. Advancing time does more than change what
timestamps and expiry checks see. A scheduled EventBridge rule fires, an EventBridge Scheduler
schedule invokes its target, a DynamoDB item passes its time to live, a Secrets Manager deletion
falls due, and a Lambda event source mapping polls again. Each of those runs at its own due instant
inside the interval, in the order they fall due.

## Time inside a simulated Lambda handler

A simulated Lambda function runs on its simulation's clock, and that reaches the JavaScript clock
the function code itself reads. `Date.now()` and `new Date()` inside a handler report simulated
time. Code stamping an expiry or building a date-partitioned key can be tested against a clock the
test controls:

```typescript sim-clock-lambda-handler
/**
 * A simulated Lambda handler reading the simulation's clock.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws, SimFixedClock } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "stamper",
    Role: "arn:aws:iam::111111111111:role/StamperRole",
    Code: {
      // The handler asks JavaScript for the time, not the simulator.
      ZipFile: makeLambdaZipFileInput(() => ({ at: new Date().toISOString() })),
    },
  }),
);

const first = await lambda.invoke(
  new InvokeCommand({ FunctionName: "stamper" }),
);
console.log(Buffer.from(first.Payload!).toString()); // {"at":"2026-07-26T09:00:00.000Z"}

await simAws.clock().advanceBy({ hours: 2 });

const second = await lambda.invoke(
  new InvokeCommand({ FunctionName: "stamper" }),
);
console.log(Buffer.from(second.Payload!).toString()); // {"at":"2026-07-26T11:00:00.000Z"}
```

How that is arranged depends on where the function code runs. One of the two touches a process
global:

- **Zip code** runs in a vm sandbox owning its own globals, and is handed a `Date` bound to the
  simulation's clock. The globals outside the sandbox are left alone.
- **A real in-process handler function** is a closure over the module scope it was written in, and
  reads the global `Date` like everything else in the test run. So the global is substituted for one
  reporting the invocation's clock while an invocation is running, and the host clock otherwise,
  tracked with `AsyncLocalStorage` so concurrent invocations of different simulations stay apart. It
  is installed on the first in-process invocation and never removed, and with no invocation running
  it behaves exactly as the host's own `Date` does.

Only the current time comes from the clock. `new Date("2020-03-12")`, `Date.parse(...)`,
`Date.UTC(...)` and `instanceof Date` all behave as they always did.

Under a frozen clock `Date.now()` returns the same number for the whole invocation, and handler code
that waits for it to change never finishes. Call `resume()` before invoking if the code under test
polls the clock.

### Where real AWS gets the time

Real Lambda has no current-time API. The context object carries no timestamp, only
`getRemainingTimeInMillis()`, and no environment variable holds one. Handler code reading `new
Date()` is reading the machine clock. AWS does provide the time on the event:

| Event source              | Field                                             |
| ------------------------- | ------------------------------------------------- |
| EventBridge               | `time`                                            |
| Function URL, API Gateway | `requestContext.timeEpoch`, `requestContext.time` |
| S3 notification           | `Records[].eventTime`                             |
| SNS                       | `Records[].Sns.Timestamp`                         |
| SQS                       | `Records[].attributes.SentTimestamp`              |

For a scheduled invocation AWS advises reading the event's `time` in preference to the system clock,
because a retry or a delayed delivery runs later than the time the work was for. Simulated Lambda
follows the same rule where it builds events. A Function URL request carries simulated time in
`requestContext.time` and `requestContext.timeEpoch`.

An SQS event source mapping does the same. The `SentTimestamp` and
`ApproximateFirstReceiveTimestamp` attributes on a delivered record are simulated time, and a
handler reading the event's time reads the clock the test controls. See
[simulated Lambda](../services/lambda/#triggering-a-function-from-an-sqs-queue "Simulated Lambda event source mapping docs").

Handler code that takes a clock as a dependency stays the most testable option, on real AWS and
here, and needs none of the machinery above.

## Time over HTTP

A simulation served over HTTP, through `serveSimAws` or `SimAwsHttp.fetch(...)`, stamps every
response with simulated time in its `Date` header, as real AWS stamps every API response with server
time. Advancing the clock changes what that header reports. A client talking to the simulation sees
the same "now" the simulation does, with no need to know it is talking to a simulator.

## Time and SDK interception

A `SimSdk` owns a simulated AWS environment, available as `simSdk.simAws`. Intercepted SDK code runs
on a clock a test can control with `await simSdk.simAws.clock().advanceBy({ hours: 1 })`.

## Limitations

- Advancing the clock is the only thing that fires a scheduled
  [EventBridge rule](../services/eventbridge/#rules-that-fire-on-a-schedule). Nothing runs on the
  host's clock. A simulation left alone in real time fires nothing however long it is left.
- Advancing the clock is also the only thing that fires an
  [EventBridge Scheduler schedule](../services/scheduler/#firing-a-schedule), including a one-time
  `at(...)` one.
- Only `SimAws` exposes time control. Services constructed standalone, such as `new SimS3()`, get
  their own real clock and no way to move it.
- A `SimAws` constructed with a `background` scheduler of its own cannot control time, because that
  scheduler brings its own clock. `simAws.clock()` throws a diagnostic error saying so.
- Simulated time reaches JavaScript's own clock inside a simulated Lambda invocation, and nowhere
  else. `Date.now()` and `new Date()` in code under test that is not running as a simulated Lambda
  function still report real time.
- Timers are not simulated. `setTimeout` inside a handler is a host timer. A sleeping handler waits
  in real time, and advancing the clock leaves it asleep.
- A time already read cannot be reached. A handler module doing `const startedAt = Date.now()` at
  module scope read it when the test file imported the module, long before any invocation.
- Advancing time does not re-evaluate simulated state that was already computed, such as an ACM
  certificate that has finished validating. It changes what is read from the clock next.
