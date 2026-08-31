# Simulated EventBridge Scheduler implementation

This directory contains the simulated EventBridge Scheduler service implementation. Schedules, the
groups they go in, their targets, the commands that manage them, and firing a schedule as simulated
time advances.

The guiding decision is that this is a separate service from simulated EventBridge rather than a
corner of it. The two look similar from a distance and differ in every detail that matters: a
separate SDK client, an ARN carrying a schedule group, `CreateSchedule` conflicting where `PutRule`
replaces, a listing shaped differently from a describe, and an execution model built on an IAM role
instead of a resource policy. Code sharing between them is therefore deliberate and narrow: the
schedule expression parser, assuming a service role, and reading what a target says about an ECS
task. The last two arrived with ECS targets, which both services reach the same way because ECS is
the same service on the other side of them.

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
identically. `requestedScheduleGroupName` reads the group a schedule request names and defaults it
to `default`. Whether that group exists is asked separately, by `SimSchedulerScheduleAccess`, after
the caller has been authorized. A caller with no permission therefore learns nothing about which
groups an account has.

`SimSchedulerTarget` requires both `Arn` and `RoleArn`, as AWS does, and validates the role ARN when
the schedule is written rather than when it first falls due. A schedule that could never invoke
anything says so at the point it was created.

`SimSchedulerTargetArn` is deliberately not shared with EventBridge's `SimEventTargetArn`. They read
the same three services today and they are answering different questions: EventBridge refuses an ARN
its rules cannot deliver to, and this refuses one that Scheduler's much larger real target list does
not reach here. Sharing would tie two services' supported-target sets together, and those sets are
not the same on real AWS.

## Schedule groups

`group/` holds the group model. `SimSchedulerScheduleGroup` is a name, an ARN and two timestamps, and
`schedulerScheduleGroupArn` builds the `schedule-group/<name>` path, which is a different resource
from a schedule's `schedule/<group>/<name>`. An IAM policy naming one does not match the other.

`SimSchedulerScheduleGroupStore` builds its own groups rather than taking them from a writer, which
is the opposite of how schedules are handled. A schedule is read out of a request carrying a dozen
properties, and reading it in one place is what keeps Create and Update agreeing. A group is a name
and two timestamps. The store also seeds `default` when it is constructed, because every Account has
that group without anyone creating one.

Deleting a group deletes its schedules, as AWS does. `SimSchedulerScheduleStore.removeGroup` is where
that happens, since how the schedules of a group are found is the store's own business.
`SimSchedulerGroupAccess.requireDeletable` refuses `default`. AWS does not document what it answers
for that request, and a simulation that let the group go would have no way of getting it back.

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

`SimSchedulerDeliveryFunction` asks Lambda for an asynchronous Event invocation after those checks.
Scheduler has completed its delivery once Lambda accepts the event. Lambda then owns handler errors,
event invoke retries, destinations and the function's dead-letter queue.

`SimSchedulerDeliveryAttempt` owns failures before a target accepts the request. An explicit retry
policy schedules another attempt on `BackgroundScheduler` after one second, then two, four and so
on. It stops at the configured retry limit or event age. A missing target or an IAM refusal is
permanent and skips retries because the same request cannot change that answer.

`SimSchedulerDeadLetterQueue` sends an abandoned target's original input to the configured standard
SQS queue. It assumes the same execution role and requires `sqs:SendMessage` on the queue. The SQS
message attributes carry Scheduler's error and invocation details. A missing queue or failed
authorization is kept in `deliveryFailures`, while a successful send leaves no inspection failure.

`SimAwsSchedulerDeliveryTargets` assumes the role in the role's own Account and reaches the target in
the target's, which need not be the same one. A `SimScheduler` built outside SimAws gets
`SimSchedulerNoDeliveryTargets`, which records every invocation as a failure saying why there was
nowhere to make it.

`SimSchedulerDeliveryTask` is the one target type that runs something rather than being invoked with
a payload. It runs the task through simulated ECS's own `RunTask` as the execution role, so the
role's permission to run it is ECS's answer rather than a second one kept here. Its `EcsParameters`
and its `Input`, which is the task's overrides, are read by `src/service/ecs/target/`, shared with
EventBridge because a rule target says the same things about a task in the same words.

## CloudFormation

`cfn/` creates `AWS::Scheduler::Schedule` and `AWS::Scheduler::ScheduleGroup`, one creator class
each, dispatched by `SimSchedulerCfnResourceFactory`. Both go through the ordinary Scheduler
commands, so what a template may ask for is decided once by the service rather than again here.
`simCfnSchedulerResourceError` is what keeps a refusal from reading as an unsupported Resource. Sim
CloudFormation steps over one of those, and a schedule stepped over would leave a Stack looking
deployed while nothing ever fired.

`simCfnSchedulerResourceDeletion` swallows a not-found on the way down. A group takes its schedules
with it, so a schedule whose template named its group as a string rather than by `Ref` declares no
dependency on it and may find itself already deleted when its own turn comes. Real CloudFormation
treats a Resource that has already gone as deleted.

## Authorization

`SimSchedulerAuthorizer` authorizes the caller against the schedule ARN. It is deliberately not
involved in whether a schedule's execution role may invoke its target: that is a different question,
asked about a different principal, at a different time, and it belongs with firing rather than with
the command that created the schedule.

It is involved in a third question about that same execution role. Writing a schedule hands Scheduler
the `Target.RoleArn` it will fire as, so Create and Update both authorize `iam:PassRole` against it
through the shared `SimIamPassRoleAuthorizer`. The refusal is Scheduler's own
`AccessDeniedException`, built from `simIamPassRoleDenialMessage`, so a caller catching this
service's error type catches this refusal with the rest.

## Divergences

Six, all deliberate.

A schedule group is **`ACTIVE` or gone**. Real Scheduler holds a group in `DELETING` while the
schedules in it are removed, and reaching that state needs a deletion that takes time. Deleting a
group here removes its schedules in the same call, so nothing is ever seen in `DELETING`.

Group **tags are refused** by `CreateScheduleGroup` and **recorded as ignored** by CloudFormation.
The two answers differ because the requests do. An SDK caller asking for a tag meant to ask for it.
The CDK puts a Stack's tags on every taggable Resource in it, and failing a Stack over a tag nothing
reads would refuse a template nobody wrote that way.

`ClientToken` is **accepted and ignored**, on `CreateSchedule`, `UpdateSchedule` and
`DeleteSchedule`. It exists to make a retried request idempotent, nothing here retries, and refusing
it would break ordinary AWS code that passes one as a matter of course.

A schedule fires **exactly, and exactly once**. Real Scheduler invokes within a minute of the due
time and promises no more than that. Reproducing the imprecision would make a test of a schedule
assert on something that is not the schedule.

A target with no `Input` receives an **empty JSON object**. AWS documents that for a Lambda target
and says nothing about it for a queue or a topic, so the same answer is used for all three rather
than inventing a different one per service.

Retry backoff is a **deterministic power-of-two sequence**, beginning at one second. Real Scheduler
documents exponential backoff without publishing the delays. A fixed sequence lets a test move the
simulated clock to the next attempt exactly.
