# Simulated EventBridge Scheduler implementation

This directory contains the simulated EventBridge Scheduler service implementation. Schedules, their
targets, the five commands that manage them, and firing a schedule as simulated time advances.

The guiding decision is that this is a separate service from simulated EventBridge rather than a
corner of it. The two look similar from a distance and differ in every detail that matters: a
separate SDK client, an ARN carrying a schedule group, `CreateSchedule` conflicting where `PutRule`
replaces, a listing shaped differently from a describe, and an execution model built on an IAM role
instead of a resource policy. Code sharing between them is therefore deliberate and narrow: the
schedule expression parser, and nothing else.

## Entry points

- `sim-scheduler.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public Scheduler simulator API for `@kensio/yulin/scheduler`.

## Schedule model

Schedule state lives under `schedule/`, and the target under `target/`.

`SimSchedulerSchedule` owns its target rather than holding it in a store beside it, which is the
opposite of what simulated EventBridge does with a rule's targets. That is not inconsistency: a rule
has between zero and five targets and is a perfectly good rule with none, so they are held apart
from it; a schedule has exactly one and cannot be created without it, so it is a field.

`schedulerScheduleArn` builds the one ARN shape,
`arn:aws:scheduler:<region>:<account>:schedule/<group>/<name>`. The group is always in it, even for
`default`, which is why `SimSchedulerScheduleStore` keys by group and name together and why an IAM
policy written without the group matches nothing.

`SimSchedulerScheduleName` validates a schedule name and a group name, which AWS constrains
identically. `requestedScheduleGroupName` is where the one-group decision lives: a request naming
any group but `default` is refused as unsimulated rather than quietly moved, because a schedule moved
into `default` would carry an ARN naming a group it is not in.

`SimSchedulerTarget` requires both `Arn` and `RoleArn`, as AWS does, and validates the role ARN when
the schedule is written rather than when it first falls due. A schedule that could never invoke
anything says so at the point it was created.

`SimSchedulerTargetArn` is deliberately not shared with EventBridge's `SimEventTargetArn`. They read
the same three services today and they are answering different questions: EventBridge refuses an ARN
its rules cannot deliver to, and this refuses one that Scheduler's much larger real target list does
not reach here. Sharing would tie two services' supported-target sets together, and those sets are
not the same on real AWS.

## Schedule expressions

`sim-scheduler-schedule-expression.ts` holds `schedulerScheduleDialect` and turns the shared parser's
refusals into this service's own errors.

The parser is in `src/util/schedule/`, shared with simulated EventBridge, and the dialect is what
keeps the two apart. Scheduler differs on two points: it has `at(...)` one-time schedules, which a
rule has no equivalent of, and it does not insist a rate's unit agrees with its value, so
`rate(1 hours)` is an hour here and a refusal there. Both differences are values on
`SimScheduleDialect` rather than branches in the parser.

An `at(...)` expression is what makes a one-time schedule one-time, and it needs no special handling
above the parser: `SimAtExpression.nextAfter` answers with its instant once and with nothing
afterwards, so whatever arms it stops arming it. An instant already in the past answers with nothing
too, because real Scheduler does not invoke a schedule created for a time that has already gone.

## Commands

Command handling follows the usual layout: `command/<area>/*.command.ts` for the local structural SDK
types, and a handler class beside it.

`SimSchedulerScheduleAccess` is how a request reaches the schedule it names, and it authorizes before
looking the schedule up, so a caller with no permission is refused whether or not the schedule
exists.

`SimSchedulerScheduleWriter` is shared by Create and Update, because `UpdateSchedule` replaces rather
than merges: both requests carry the whole of a schedule and mean the same thing by it. That is why
an update builds a new `SimSchedulerSchedule` and puts it in the store rather than mutating the
stored one, and why the creation date is threaded through the replacement while the modification
stamp moves.

`sim-scheduler-unsimulated-input.ts` holds the refusals, which is where most of the fidelity
decisions are. Every one of them refuses rather than drops, on the same reasoning used across the
simulator: a schedule that silently ignored its `ScheduleExpressionTimezone` would fire at the wrong
hour, and that is exactly the thing a test of a nightly job is checking.

## Firing

`SimSchedulerSchedules` arms a schedule for its next due instant through
`BackgroundScheduler.scheduleAt`, and a firing arms the next one before it returns. That is what
makes firing per due instant rather than per advance: `SimClockControl.advanceBy` walks the interval
taking whatever has fallen due, so a schedule rescheduling itself inside the interval is taken again
in the same walk.

Nothing cancels a timer. A firing checks that the schedule it holds is still the one its store has
under that name and stops if it is not, which covers deletion and an update replacement in one. That
is also what makes an update reschedule from the new expression: an update stores a newly built
schedule and arms it, and the previous one's next firing finds itself out of date.

`ActionAfterCompletion` needs a schedule that has _completed_, which is one that invoked its target
and has no next occurrence. A disabled schedule whose only instant goes past has not completed, so it
survives whatever the action says. Nothing else needs to know a schedule is one-time: `SimAtExpression`
answers with its instant once and with nothing afterwards, so arming simply stops.

## Delivery

`delivery/` is where Scheduler's execution model lives, and it is the part with no precedent
elsewhere in the simulator. Everything else that reaches across services — SNS to Lambda, S3 to SQS,
an EventBridge rule to anything — arrives as a service principal and is admitted by the target's
resource policy. A schedule arrives as an assumed role and is admitted by that role's identity
policies, with no resource policy involved.

`sim-scheduler-execution-role.ts` is that difference. It names the two refusals in Scheduler's own
words and hands the mechanism to `assumeSimServiceRole` under `src/service/sts/service-role/`, which
asks STS's own `AssumeRoleTrustPolicyAuthorizer` whether the role admits `scheduler.amazonaws.com`
and then builds a `SimResolvedCaller` whose principal is the session and whose
`identityPolicyPrincipal` is the role. That split is exactly what `SimResolvedCaller` exists for, and
it is why no STS session or temporary credential is created: nothing would read them, and
registering credentials nobody uses would be state the simulation has to keep straight for no
benefit. It is shared because an EventBridge rule assumes a role the same way for its one target type
that runs rather than receives.

The two failures are reported apart from each other, because they are fixed in different places: the
trust policy is on the role's `AssumeRolePolicyDocument`, and the permission is in a policy attached
to it. Telling a reader which one it was saves the whole diagnosis.

`SimAwsSchedulerDeliveryTargets` assumes the role in the role's own Account and reaches the target in
the target's, which need not be the same one. A `SimScheduler` built outside SimAws gets
`SimSchedulerNoDeliveryTargets`, which records every invocation as a failure saying why there was
nowhere to make it.

`SimSchedulerDeliveryTask` is the one target type that runs something rather than being invoked with
a payload. It runs the task through simulated ECS's own `RunTask` as the execution role, so the
role's permission to run it is ECS's answer rather than a second one kept here. Its `EcsParameters`
and its `Input`, which is the task's overrides, are read by `src/service/ecs/target/`, shared with
EventBridge because a rule target says the same things about a task in the same words.

## Authorization

`SimSchedulerAuthorizer` authorizes the caller against the schedule ARN. It is deliberately not
involved in whether a schedule's execution role may invoke its target: that is a different question,
asked about a different principal, at a different time, and it belongs with firing rather than with
the command that created the schedule.

## Divergences

Four, all deliberate.

Schedule groups are **refused rather than simulated**. A `GroupName` other than `default` fails, where
real AWS creates the schedule in whichever group is named. Accepting the name and using `default`
anyway would produce a schedule whose ARN named a group it was not in, and refusing is the smaller
lie.

`ClientToken` is **accepted and ignored**, on `CreateSchedule`, `UpdateSchedule` and
`DeleteSchedule`. It exists to make a retried request idempotent, nothing here retries, and refusing
it would break ordinary AWS code that passes one as a matter of course.

A schedule fires **exactly, and exactly once**. Real Scheduler invokes within a minute of the due
time and promises no more than that. Reproducing the imprecision would make a test of a schedule
assert on something that is not the schedule.

A target with no `Input` receives an **empty JSON object**. AWS documents that for a Lambda target
and says nothing about it for a queue or a topic, so the same answer is used for all three rather
than inventing a different one per service.
