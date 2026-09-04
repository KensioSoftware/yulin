# Simulated time

Each `SimAws` has its own clock. Yulin uses that clock for resource timestamps, expiry checks, and
scheduled work.

## Isolate tests that control time

A shared [test suite environment](https://yulinsim.dev/testing/) also has one shared clock. Most
tests should use that environment without calling `freeze()`, `setTo(...)`, `advanceBy(...)`, or
`resume()`.

Put tests that control simulated time in a separate test group. Give each of those tests its own
`SimAws` or `SimSdk`, along with the infrastructure it needs. A clock change then affects only that
test's environment. The rest of the suite can keep sharing one deployment and SDK interception.

## Start at a known time

A new simulation follows the system clock by default. Pass a `SimFixedClock` when a test needs an
exact starting time:

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

`simAws.now()` returns the current simulated time. Services use the same value when they create
timestamps such as an IAM user's `CreateDate`.

The controllable clock sits on top of the clock passed to `SimAws`. Calling `resume()` makes time
follow that underlying clock again. A `SimFixedClock` never moves, so resuming it still reports a
fixed time. Keep the default system clock when resumed time should move normally.

## Frozen and running

Call `freeze()` to stop the clock at its current time. Both `setTo(...)` and `advanceBy(...)` also
leave the clock frozen at the resulting time. This keeps timestamps stable while the test makes its
assertions.

Call `resume()` to let the underlying clock move time again. Any offset remains in place. For
example, a simulation advanced by one hour continues to run one hour ahead of the system clock.

Read `simAws.clock().isFrozen` to check the current mode.

## Advancing time

`advanceBy(...)` accepts days, hours, minutes, seconds, and milliseconds. The values are added
together. A number means milliseconds, so `advanceBy(3_600_000)` advances by one hour. Durations
must be zero or greater. Use `setTo(...)` to move to an earlier time.

Advancing the clock also runs scheduled work due within the interval. Yulin runs each task at its
due time and waits for the simulation to settle before returning. The test can assert on the result
immediately:

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

If scheduled work throws, `advanceBy(...)` throws the same failure. The clock stops at the failed
task's due time, and later work remains queued.

EventBridge and EventBridge Scheduler delivery failures are recorded instead. Read them from
`eventBridge().deliveryFailures` or `scheduler().deliveryFailures`. Step Functions also records a
failed state on the execution for `DescribeExecution` to return.

## Read simulated time in a Lambda handler

Inside a simulated Lambda invocation, `Date.now()` and `new Date()` read the simulation's clock:

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

Zip code runs in a VM with a `Date` constructor connected to the simulation. An in-process handler
uses the same simulated time during its invocation. Code outside the invocation continues to read
the system clock, including code running concurrently in another simulation.

Only calls that ask for the current time are changed. `new Date("2020-03-12")`, `Date.parse(...)`,
`Date.UTC(...)`, and `instanceof Date` keep their usual behaviour.

The global `setTimeout`, `clearTimeout`, `setInterval`, and `clearInterval` functions also use the
simulation's clock during an invocation. Start an invocation without awaiting it, advance the
clock past the timer delay, then await the invocation. Lambda's configured timeout and
`context.getRemainingTimeInMillis()` use the same clock.

### Where real AWS gets the time

Real Lambda has no current-time API. A production handler gets the current time from the machine
clock or from a timestamp in its event:

| Event source              | Field                                             |
| ------------------------- | ------------------------------------------------- |
| EventBridge               | `time`                                            |
| Function URL, API Gateway | `requestContext.timeEpoch`, `requestContext.time` |
| S3 notification           | `Records[].eventTime`                             |
| SNS                       | `Records[].Sns.Timestamp`                         |
| SQS                       | `Records[].attributes.SentTimestamp`              |

Yulin puts simulated time into the events it builds. Function URL events include
`requestContext.time` and `requestContext.timeEpoch`. SQS records include simulated
`SentTimestamp` and `ApproximateFirstReceiveTimestamp` values. The
[Lambda documentation](https://yulinsim.dev/services/lambda/#triggering-a-function-from-an-sqs-queue "Simulated Lambda event source mapping docs")
describes the event source mapping behaviour.

A handler can also accept a clock as a dependency. That approach works without Lambda-specific
clock handling.

## Time over HTTP

A simulation served through `serveSimAws` or `SimAwsHttp.fetch(...)` uses simulated time in each
response's `Date` header. Advancing the clock changes the header on later responses.

## Time and SDK interception

A `SimSdk` exposes its simulation as `simSdk.simAws`. Advance its clock with
`await simSdk.simAws.clock().advanceBy({ hours: 1 })`.

## Uses of simulated time

Yulin uses the clock for:

- Resource timestamps and expiry checks
- EventBridge rules and EventBridge Scheduler schedules
- DynamoDB time to live and scheduled Secrets Manager deletion
- Step Functions `Wait` states
- Lambda event source polling and event timestamps
- `Date`, global timers, and invocation deadlines inside a simulated Lambda invocation
- HTTP response `Date` headers

## Limitations

- Scheduled [EventBridge rules](https://yulinsim.dev/services/eventbridge/#rules-that-fire-on-a-schedule)
  and [EventBridge Scheduler schedules](https://yulinsim.dev/services/scheduler/#firing-a-schedule)
  run when `advanceBy(...)` or a forward `setTo(...)` reaches their due time. Elapsed system time
  does not run them.
- Time control is available through `SimAws`. A standalone service such as `new SimS3()` uses the
  system clock and has no clock controls.
- A `SimAws` created with a custom `background` scheduler cannot control time because the scheduler
  owns its clock. Calling `simAws.clock()` throws `SimAwsTimeNotControllable`.
- JavaScript's `Date` and global timer functions use simulated time only during a simulated Lambda
  invocation. Other application code continues to use system time.
- Lambda code imported from `node:timers` or `node:timers/promises` uses system time. The same is
  true of `util.promisify(setTimeout)`.
- A module-level `Date.now()` runs when the module is imported, before the Lambda invocation begins.
  It reads system time.
- Moving the clock does not recalculate state that has already been computed. For example, it does
  not restart validation for an ACM certificate that is already issued.
