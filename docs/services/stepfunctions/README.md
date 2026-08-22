# Simulated Step Functions

Simulated Step Functions interprets Amazon States Language and runs a state machine in the same
process as the code under test. A workflow held in a template as data becomes something a test can
run and assert on.

Types for simulated Step Functions are imported from the `@kensio/yulin/stepfunctions` subpath.

## What runs today

Five state types run. `Pass`, `Succeed`, `Fail`, `Choice` and `Wait`. A definition using any other
is refused when the state machine is created, naming the state and its type. `Task`, `Parallel` and
`Map` are on the way.

The data-flow fields run in full. `InputPath`, `Parameters`, `ResultSelector`, `ResultPath` and
`OutputPath` apply in that order, reading Reference Paths and the intrinsic functions.

## Running a state machine

```typescript sim-step-functions-run
/**
 * Creating a state machine and running an execution against it.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Record",
      States: {
        Record: {
          Type: "Pass",
          Result: { enrolled: true },
          ResultPath: "$.outcome",
          Next: "Done",
        },
        Done: { Type: "Succeed" },
      },
    }),
  },
});

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: created.stateMachineArn,
    input: JSON.stringify({ student: "Wei" }),
  },
});

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.status); // SUCCEEDED
console.log(described.output); // {"student":"Wei","outcome":{"enrolled":true}}
```

## Asserting on the states an execution visited

`DescribeExecution` says how an execution ended. The route it took is read from the simulator's own
inspection accessor:

```typescript sim-step-functions-visited-states
/**
 * Reading back which states an execution went through.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Check",
      States: {
        Check: { Type: "Pass", Next: "Decline" },
        Decline: { Type: "Fail", Error: "NotEligible", Cause: "No place left" },
      },
    }),
  },
});

const started = await simAws
  .stepFunctions()
  .startExecution({ input: { stateMachineArn: created.stateMachineArn } });

console.log(
  simAws.stepFunctions().inspection().visitedStates(started.executionArn),
); // [ 'Check', 'Decline' ]

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.status); // FAILED
console.log(described.error); // NotEligible
```

A failing execution is recorded on the execution, and the call returns as it would for one that
succeeded. Simulated EventBridge treats an undeliverable event the same way. An execution failing is
as often the thing under test as it is a fault, and raising it would fail an unrelated `advanceBy`
elsewhere in the same test.

## Branching on the input

A `Choice` state takes the first rule its input matches, and its `Default` where none of them do.

```typescript sim-step-functions-choice
/**
 * Branching on an execution's data with a Choice state.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Eligible",
      States: {
        Eligible: {
          Type: "Choice",
          Choices: [
            {
              And: [
                { Variable: "$.term", IsPresent: true },
                { Variable: "$.term", NumericGreaterThanEquals: 2 },
              ],
              Next: "Enrol",
            },
          ],
          Default: "Decline",
        },
        Enrol: { Type: "Pass", Result: { enrolled: true }, End: true },
        Decline: { Type: "Fail", Error: "NotEligible" },
      },
    }),
  },
});

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: created.stateMachineArn,
    input: JSON.stringify({ student: "Wei", term: 3 }),
  },
});

console.log(
  simAws.stepFunctions().inspection().visitedStates(started.executionArn),
); // [ 'Eligible', 'Enrol' ]

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.output); // {"enrolled":true}
```

The comparators are the ones Amazon States Language defines. Strings compare with `StringEquals`,
`StringLessThan`, `StringGreaterThan`, `StringLessThanEquals`, `StringGreaterThanEquals` and
`StringMatches`. The same five orderings appear under `Numeric` and under `Timestamp`, and a boolean
compares with `BooleanEquals`. Each of those has a `Path` twin, such as `NumericGreaterThanPath`,
which takes a Reference Path and reads its operand from the state's own input. The data tests are
`IsPresent`, `IsNull`, `IsBoolean`, `IsNumeric`, `IsString` and `IsTimestamp`. Rules combine with
`And`, `Or` and `Not`.

`StringMatches` takes `*` as a wildcard spanning any run of characters. A backslash escapes the
character after it, so `Star\*` matches the literal name `Star*`. Amazon States Language gives
`StringMatches` no `Path` twin, and `StringMatchesPath` is refused here as a comparator it does not
define.

Two things fail an execution at a `Choice` state, both the way real Step Functions fails one:

- A state matching no rule with no `Default` to fall back on fails with `States.NoChoiceMatched`.
- A comparator whose `Variable` selects nothing fails with `States.Runtime`. Guard a field that may
  be absent with `IsPresent` at the front of an `And`, as the example above does. The rules under an
  `And` are tested in the order they were written and stop at the first one that fails. The data
  tests answer for an absent field on their own.

A comparison of two different types answers false. A `StringEquals` rule tested against a number
falls through to the next rule. Timestamps are read as RFC3339 (`2026-07-26T09:00:00Z`), so a date
on its own counts as a string.

## Waiting on the clock

A `Wait` state holds the execution until an instant on the simulation's clock. Where that instant is
still ahead, `StartExecution` answers with the execution `RUNNING`, and moving simulated time past it
runs the rest of the execution.

```typescript sim-step-functions-wait
/**
 * Holding an execution at a Wait state, then moving time past it.
 */

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Settle",
      States: {
        Settle: { Type: "Wait", Seconds: 300, Next: "Confirm" },
        Confirm: { Type: "Pass", Result: { confirmed: true }, End: true },
      },
    }),
  },
});

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: created.stateMachineArn,
    input: JSON.stringify({ student: "Wei" }),
  },
});

const waiting = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(waiting.status); // RUNNING

await simAws.clock().advanceBy({ minutes: 6 });

const settled = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(settled.status); // SUCCEEDED
console.log(settled.stopDate); // 2026-07-26T09:05:00.000Z
```

Under a frozen clock the execution stays `RUNNING` for as long as the test leaves it there.
Simulated time moves only when the test moves it, and a slow test holds the state it set up.

A `Wait` state carries exactly one of `Seconds`, `SecondsPath`, `Timestamp` and `TimestampPath`. A
wait runs from 0 to 99,999,999 seconds, which is the range Step Functions takes, and a `Timestamp` is
held to RFC3339 (so `2026-02-30T00:00:00Z` is refused rather than read as the second of March). The
two paths are read out of the state's input as it runs, and a path holding a value outside either
range fails the execution with `States.Runtime`. An instant already behind the clock lets the
execution carry straight on.

The execution stops at the instant it was waiting for, and `DescribeExecution` reports that as its
`stopDate`. A failure after a wait is recorded on the execution, and `advanceBy` returns as it would
for one that succeeded. [Simulated time](../../time/ "Simulated time docs") covers what else
advancing the clock runs.

## Through an intercepted SDK client

An `SFNClient` handed to `SimSdk` reaches the same simulated service:

```typescript sim-step-functions-sdk
/**
 * Running a state machine through an intercepted SFNClient.
 */

import {
  CreateStateMachineCommand,
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";

import { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

const simAws = new SimAws();
const client = new SFNClient({ region: simAws.defaultRegionName });

using _intercepted = new SimSdk({ simAws }).intercept(client);

const created = await client.send(
  new CreateStateMachineCommand({
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Done",
      States: { Done: { Type: "Succeed" } },
    }),
  }),
);

const started = await client.send(
  new StartExecutionCommand({ stateMachineArn: created.stateMachineArn }),
);

console.log(started.executionArn);
```

## Reference Paths

The path subset read here is the one Amazon States Language itself uses. A document root, a child by
dot or by bracketed name, and an array element by index. `$.abc.['def ghi']` works, which is how the
Amazon States Language docs write a field name holding a space.

The wider JSONPath grammar is refused by name. Wildcards, filters, slices and recursive descent all
raise. A path that would have selected the wrong node fails, and no state is answered with plausible
data. A dotted field name is held to the JsonPath `member-name-shorthand` rule. `$.a-b` is refused,
and `$['a-b']` is the way to write it.

`$$`, the context object, arrives with the `Task` state.

## Intrinsic functions

`States.Format`, `States.Array`, `States.ArrayLength`, `States.StringToJson` and
`States.JsonToString` all run, including calls nested inside one another.

`States.UUID` and `States.MathRandom` are left out on purpose. Both answer differently on every call.
A test asserting on the output of a state machine that used one could only assert on its shape.

## Where this differs from real Step Functions

- **`StartExecution` runs the execution as far as it goes before it answers.** Real Step Functions
  answers before the execution has run, and a caller there sees `RUNNING` first. An execution here
  with nothing to wait for has finished by the time the caller reads it back, and one held at a
  `Wait` state reads as `RUNNING`. That spares every test a wait for work that is already done.
- **An `EXPRESS` state machine runs the standard way.** The type is carried and read back, and
  `StartSyncExecution` is unsimulated.
- **An unnamed execution is named by a counter.** Real Step Functions uses a UUID. A counter means a
  simulation answers the same way twice. The counter steps over any name a caller has already used.
- **A name is taken for good.** Real Step Functions frees an execution name 90 days after the
  execution closes. A name here stays taken for the life of the simulation, which no test runs long
  enough to notice. `StartExecution` is idempotent while an execution is still running, as it is on
  AWS. A repeat carrying the same name and input answers with the execution already there, and one
  carrying different input raises `ExecutionAlreadyExists`.
- **A brace escape outside `States.Format` keeps its backslash.** A brace is a placeholder to
  `States.Format` alone, so `States.Format` is where `\{` is resolved. An escaped brace reaching
  another intrinsic arrives as it was written.
- **`GetExecutionHistory` is unsimulated.** The inspection accessor answers the same question.
- **A cycle in the states fails the execution** after 25,000 transitions, with `States.Runtime`. Real
  Step Functions stops one when it runs out of execution history events.

`CreateStateMachine` is idempotent, as it is on AWS. A second request carrying the same name,
definition and type answers with the state machine already there, and one carrying a different
definition raises `StateMachineAlreadyExists`. A differing `roleArn` is ignored. The AWS API
reference contradicts itself here, listing a differing role ARN under `StateMachineAlreadyExists`
while the operation's own note says the difference is ignored. The note is the more specific of the
two and is what this follows.

## Still to come

- `Task`, `Parallel` and `Map` states.
- `Retry` and `Catch`.
- Service integrations, task tokens and activities.
- `AWS::StepFunctions::StateMachine` CloudFormation resources.
- JSONata as a query language, and the `Assign` variables that go with it.
- IAM authorization of what a state machine's role may do.
