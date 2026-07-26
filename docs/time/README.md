# Simulated time

Every timestamp a simulated AWS service produces comes from that simulation's own clock, and that
clock can be moved. Time can be frozen, set to an instant, or advanced by a duration, so behaviour
that only becomes interesting once time passes — a temporary session expiring, for one — can be
tested without waiting for it.

Nothing here replaces the clock for the whole process. Time belongs to a `SimAws` instance, so
moving it never disturbs another simulation running in the same test file, or the real clock, or
any other code in the process.

## Available functionality

- `simAws.now()` reads what the simulation currently calls the time.
- `new SimAws({ clock })` starts a simulation at a given instant.
- `simAws.clock()` returns the control: `freeze()`, `resume()`, `setTo(instant)`, `advanceBy(duration)`.
- Advancing runs whatever falls due during the interval and returns once the simulation has
  settled, so the next line can assert.
- Served HTTP responses report simulated time in their `Date` header.

## Reading the time

`simAws.now()` is what the simulation means by "now", which is not necessarily what the host clock
means by it. It is also what stamps simulated resources: an IAM User's `CreateDate`, an
`AssumeRole` session's `Expiration`, and so on.

By default a new `SimAws` runs in step with the real system clock.

## Starting at a known instant

Pass a clock to start somewhere specific. `SimFixedClock` is the usual choice — it reports one
instant and does not move on its own:

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

// Time passes by itself again from here, still two and a half hours ahead.
simAws.clock().resume();
```

Simulated time is layered over whatever clock is supplied, so a simulation started at a fixed
instant is still free to move from there.

## Frozen and running

There are two modes, and they answer different questions:

- **Frozen** — simulated time only moves when something moves it. A frozen clock reports the same
  instant however long the host takes, so a slow test cannot drift past the state it set up. This
  is what a deterministic assertion wants.
- **Running** — simulated time passes by itself, offset from the clock underneath. This is what
  "jump forward an hour and carry on" wants.

Moving time deliberately freezes it: `setTo(...)` and `advanceBy(...)` both leave the clock
stopped where they put it. Having asked for a specific instant, a test should get to assert on that
instant rather than on that instant plus however long the assertion took. `resume()` is the way
back to time passing by itself, and it carries on from where the clock stopped rather than snapping
back to real time.

`simAws.clock().isFrozen` reports which mode the clock is in.

## Advancing time

`advanceBy(...)` takes a duration written as any combination of `days`, `hours`, `minutes`,
`seconds` and `milliseconds`, which add together. Durations are never negative — time passing only
runs forwards, and `setTo(...)` is the explicit way to move a clock back.

Advancing does two things: it moves the clock, and it runs whatever the passage of time should have
caused. Work scheduled for an instant inside the interval is dispatched in due order, each task
running with the clock reading its own due time, and any further work it schedules settles before
`advanceBy` returns. So a test can advance and then assert, with no additional waiting:

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

Nothing in the simulator schedules work on the clock yet, so today advancing mostly changes what
timestamps and expiry checks see. The mechanism is there for scheduled behaviour to hook into as
it arrives.

## Time over HTTP

A simulation served over HTTP, through `serveSimAws` or `SimAwsHttp.fetch(...)`, stamps every
response with simulated time in its `Date` header, as real AWS stamps every API response with
server time. Advancing the clock changes what that header reports, so a client talking to the
simulation sees the same "now" the simulation does without needing to know it is talking to a
simulator.

## Time and SDK interception

A `SimSdk` owns a simulated AWS environment, available as `simSdk.simAws`, so intercepted SDK code
runs on a clock a test can control: `await simSdk.simAws.clock().advanceBy({ hours: 1 })`.

## Limitations

- Nothing schedules work on the clock yet. There are no scheduled event sources such as EventBridge
  rules, so advancing time currently affects timestamps and expiry rather than triggering anything.
- Only `SimAws` exposes time control. Services constructed standalone, such as `new SimS3()`, get
  their own real clock and no way to move it.
- A `SimAws` constructed with a `background` scheduler of its own cannot control time, because that
  scheduler brings its own clock. `simAws.clock()` throws a diagnostic error rather than silently
  controlling nothing.
- Simulated time does not affect JavaScript's own clock: `Date.now()` and `new Date()` inside code
  under test — including inside a simulated Lambda handler — still report real time.
- Advancing time does not re-evaluate simulated state that was already computed, such as an ACM
  certificate that has finished validating. It changes what is read from the clock next.
