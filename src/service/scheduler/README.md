# Simulated EventBridge Scheduler implementation

This directory contains the simulated EventBridge Scheduler service implementation. Schedules, their
targets, and the five commands that manage them. Firing a schedule as simulated time advances, and
invoking its target through an execution role, come next.

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

## Authorization

`SimSchedulerAuthorizer` authorizes the caller against the schedule ARN. It is deliberately not
involved in whether a schedule's execution role may invoke its target: that is a different question,
asked about a different principal, at a different time, and it belongs with firing rather than with
the command that created the schedule.

## Divergences

Two so far, both deliberate.

Schedule groups are **refused rather than simulated**. A `GroupName` other than `default` fails, where
real AWS creates the schedule in whichever group is named. Accepting the name and using `default`
anyway would produce a schedule whose ARN named a group it was not in, and refusing is the smaller
lie.

`ClientToken` is **accepted and ignored**, on `CreateSchedule`, `UpdateSchedule` and
`DeleteSchedule`. It exists to make a retried request idempotent, nothing here retries, and refusing
it would break ordinary AWS code that passes one as a matter of course.
