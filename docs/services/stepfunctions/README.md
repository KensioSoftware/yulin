# Simulated Step Functions

Simulated Step Functions interprets Amazon States Language and runs a state machine in the same
process as the code under test. A workflow held in a template as data becomes something a test can
run and assert on.

Step Functions specific types are imported from the `@kensio/yulin/stepfunctions` subpath.

## What runs today

Three state types run. `Pass`, `Succeed` and `Fail`. A definition using any other is refused when the
state machine is created, naming the state and its type. `Task`, `Choice`, `Wait`, `Parallel` and
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

- **`StartExecution` settles before it answers.** Real Step Functions answers before the execution
  has run, and a caller there sees `RUNNING` first. An execution here has finished by the time the
  caller reads it back. That spares every test a wait for work that is already done.
- **An `EXPRESS` state machine runs the standard way.** The type is carried and read back, and
  `StartSyncExecution` is unsimulated.
- **An unnamed execution is named by a counter.** Real Step Functions uses a UUID. A counter means a
  simulation answers the same way twice.
- **A brace escape outside `States.Format` keeps its backslash.** A brace is a placeholder to
  `States.Format` alone, so `States.Format` is where `\{` is resolved. An escaped brace reaching
  another intrinsic arrives as it was written.
- **`GetExecutionHistory` is unsimulated.** The inspection accessor answers the same question.

## Still to come

- `Task`, `Choice`, `Wait`, `Parallel` and `Map` states.
- `Retry` and `Catch`.
- Service integrations, task tokens and activities.
- `AWS::StepFunctions::StateMachine` CloudFormation resources.
- JSONata as a query language, and the `Assign` variables that go with it.
- IAM authorization of what a state machine's role may do.
