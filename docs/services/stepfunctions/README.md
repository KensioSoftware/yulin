# Simulated Step Functions

Simulated Step Functions interprets Amazon States Language and runs a state machine in the same
process as the code under test. A workflow held in a template as data becomes something a test can
run and assert on.

Types for simulated Step Functions are imported from the `@kensio/yulin/stepfunctions` subpath.

## What runs today

Six state types run. `Pass`, `Task`, `Succeed`, `Fail`, `Choice` and `Wait`. A definition using
`Parallel` or `Map` is refused when the state machine is created, naming the state and its type.

The data-flow fields run in full. `InputPath`, `Parameters`, `ResultSelector`, `ResultPath` and
`OutputPath` apply in that order, reading Reference Paths and the intrinsic functions.

A `Task` state invokes a simulated Lambda function. Every other `Resource` is refused when the state
machine is created, naming what the definition asked for.

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

## Invoking a Lambda function

A `Task` state invokes a simulated Lambda function, through either of the two `Resource` forms CDK's
`LambdaInvoke` emits.

`arn:aws:states:::lambda:invoke` is the integration Step Functions optimises. The state is talking to
the Lambda API, so its `Parameters` are an `Invoke` request (`FunctionName` names the function and
`Payload` carries what it is sent) and its result is an `Invoke` response, with the handler's answer
under `Payload`.

A function ARN sends the state's own input to the handler and answers with what the handler
returned. CDK writes this form for `payloadResponseOnly`.

```typescript sim-step-functions-task
/**
 * A workflow whose Task states invoke simulated Lambda functions.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "check-enrolment",
    Role: "arn:aws:iam::123456789012:role/FunctionRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { term: number }) => ({
        eligible: event.term > 1,
      })),
    },
  }),
);

const enrol = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "enrol-student",
    Role: "arn:aws:iam::123456789012:role/FunctionRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { student: string }) => ({
        enrolled: event.student,
      })),
    },
  }),
);

// The execution assumes this role, and invokes both functions as it.
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "WorkflowRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "states.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "WorkflowRole",
    PolicyName: "InvokeEnrolmentFunctions",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "lambda:InvokeFunction",
        Resource: "*",
      },
    }),
  }),
);

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: role.Role.Arn,
    definition: JSON.stringify({
      StartAt: "Check",
      States: {
        Check: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "check-enrolment", "Payload.$": "$" },
          ResultSelector: { "eligible.$": "$.Payload.eligible" },
          ResultPath: "$.outcome",
          Next: "Eligible",
        },
        Eligible: {
          Type: "Choice",
          Choices: [
            {
              Variable: "$.outcome.eligible",
              BooleanEquals: true,
              Next: "Enrol",
            },
          ],
          Default: "Decline",
        },
        Enrol: { Type: "Task", Resource: enrol.FunctionArn, End: true },
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

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.output); // {"enrolled":"Wei"}
```

The five data-flow fields apply around a task the way they apply around a `Pass` state.
`InputPath` and `Parameters` build what the task is sent, and `ResultSelector`, `ResultPath` and
`OutputPath` shape what comes back. `ResultPath` reads the state's raw input. `Check` above keeps
the student it was given, alongside the one field its `ResultSelector` picked out of the response.

A handler runs on the simulation's clock. A timestamp a handler stamps and a `TimestampPath` a later
`Wait` state reads agree.

`FunctionName` takes a function name or a function ARN, as the Lambda API does. A name alone is a
function in the state machine's own Account and Region, and an ARN can name one in another. A
qualified ARN invokes the version an alias points at.

### The execution role

The execution assumes the state machine's `RoleArn` and invokes the function as that role. The role
needs two things. Its trust policy admits `states.amazonaws.com`, and one of its policies allows
`lambda:InvokeFunction` on the function. A role missing either fails the task with
`States.TaskFailed`, saying which of the two it was.

The function's own resource policy is not consulted. A task arrives as an assumed role, and a role
in the same Account needs only its own identity policy. An EventBridge rule works the other way
round, arriving as a service principal that the function's resource policy admits.

### When a task fails

A handler that raises fails the task, and the Amazon States Language error name follows the
`Resource` form that invoked it:

- Through `arn:aws:states:::lambda:invoke` the failure is `States.TaskFailed`.
- Through a function ARN it is the handler's own error type. An error named `NotEligible` fails the
  task as `NotEligible`.

`Retry` and `Catch` match on that name. Neither runs here yet. A task that fails ends the execution,
and `DescribeExecution` carries the error name and the handler's message.

Anything else that stops a task from running fails it with `States.TaskFailed`. A function that is
not there, a role that cannot be assumed, and a role that may not invoke are the three of them, and
the cause says which one it was.

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

## Tagging a state machine

`CreateStateMachine` takes tags, and `TagResource`, `UntagResource` and `ListTagsForResource` read
and write them afterwards. A tag is a `key` and a `value`, both lower case, as the Step Functions
API writes them.

```typescript sim-step-functions-tags
/**
 * Tagging a state machine and reading its tags back.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Done",
      States: { Done: { Type: "Succeed" } },
    }),
    tags: [{ key: "team", value: "enrolment" }],
  },
});

await simAws.stepFunctions().tagResource({
  input: {
    resourceArn: created.stateMachineArn,
    tags: [{ key: "term", value: "autumn" }],
  },
});

await simAws.stepFunctions().untagResource({
  input: { resourceArn: created.stateMachineArn, tagKeys: ["team"] },
});

const listed = await simAws
  .stepFunctions()
  .listTagsForResource({ input: { resourceArn: created.stateMachineArn } });

console.log(listed.tags); // [ { key: 'term', value: 'autumn' } ]
```

A key is held once. `TagResource` adds a new key, and replaces the value of a key already held.
`UntagResource` takes off the keys it names, and passes over a key that was never there.

A key runs to 128 characters and a value to 256, and one resource holds 50 tags. A value may be
empty, where a key may not. Letters, digits, whitespace and `+ - = . _ : / @` are what a tag is
written with. A key or a value beginning `aws:` is refused, since AWS assigns tags of its own under
that prefix. A request outside any of those limits leaves the tags exactly as they were.

`TagResource` requires `tags` and `UntagResource` requires `tagKeys`, as the API does. Either list
may be empty. A request that omits one is refused before the state machine is looked up, along with
a request carrying a tag Step Functions will not take.

## Deploying one from CloudFormation

A template declaring `AWS::StepFunctions::StateMachine` creates a state machine. It goes through the
ordinary `CreateStateMachine` command, and a template and an SDK caller reach the same state machine.
A definition Amazon States Language itself refuses fails the Resource, in the words
`CreateStateMachine` refuses it in. A definition this simulator has no implementation for takes the
skip described at the end of this section.

CDK synthesizes the Resource from `stepfunctions.StateMachine`. Deploy the synthesized assembly and
the workflow is there to start an execution against.

```typescript sim-step-functions-cloudformation
/**
 * Running an execution against a state machine a CDK app deployed.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

// The CDK app holds `new sfn.StateMachine(stack, "Workflow", {
//   stateMachineName: "Enrolment",
//   definitionBody: sfn.DefinitionBody.fromChainable(record.next(done)),
// })`.
await simAws.cloudFormation().deployCdkOut(path.join(process.cwd(), "cdk.out"));

const workflow = simAws.stepFunctions().findStateMachine("Enrolment");

if (workflow === undefined) throw new Error("No Enrolment state machine");

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: workflow.arn,
    input: JSON.stringify({ student: "Wei" }),
  },
});

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.status); // SUCCEEDED
```

The definition is read once the template intrinsics have resolved. CDK writes `DefinitionString` as
an `Fn::Join` over the ARNs of the resources the workflow reaches, and the joined string is the
Amazon States Language the interpreter reads. A template can write the same document as template
data under `Definition`. `DefinitionSubstitutions` replaces every `${Key}` in the definition before
it is read.

`DefinitionS3Location` names an object holding the definition. CDK writes that form for
`DefinitionBody.fromFile`, and for a definition past the template size limit. The object is fetched
from simulated S3, where the CDK assets publisher put the staged file before any Resource was
created. A location this simulation holds no object for drops that one state machine and records
where it looked.

`StateMachineName`, `RoleArn`, `StateMachineType` and `Tags` are carried across. A state machine the
template does not name is named after the stack and the logical ID (`enrolment-Workflow`), the way
CloudFormation names one. `Ref` answers with the ARN and `Fn::GetAtt` answers `Arn` and `Name`. Real
CloudFormation publishes this one that way round too. Deleting the stack deletes the state machine.

A definition holding a state type this simulator does not run drops that one state machine. The
reason lands on `stack.skippedResources` and the rest of the stack deploys. The whole state machine
goes. A state machine missing one state runs wrong, and a test watching it run wrong is worse off
than a test watching it be absent.

CDK's `LambdaInvoke` gives its task a `Retry` over the Lambda service errors. `Retry` is
unsimulated, and a state machine carrying one takes that same skip. Pass
`retryOnServiceExceptions: false` to the task for a workflow that deploys here.

## Reference Paths

The path subset read here is the one Amazon States Language itself uses. A document root, a child by
dot or by bracketed name, and an array element by index. `$.abc.['def ghi']` works, which is how the
Amazon States Language docs write a field name holding a space.

The wider JSONPath grammar is refused by name. Wildcards, filters, slices and recursive descent all
raise. A path that would have selected the wrong node fails, and no state is answered with plausible
data. A dotted field name is held to the JsonPath `member-name-shorthand` rule. `$.a-b` is refused,
and `$['a-b']` is the way to write it.

`$$`, the context object, is unsimulated. A path reading it fails the state with
`States.QueryEvaluationError`, saying that only paths rooted at `$` are read.

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
- **A task's `Invoke` response carries three fields.** `ExecutedVersion`, `Payload` and
  `StatusCode`. Real Step Functions adds `SdkHttpMetadata` and `SdkResponseMetadata`, which describe
  a call over a network there was none of here.
- **A failed task's `Cause` is the handler's message.** Real Step Functions writes the JSON error
  document Lambda answered with, holding `errorMessage`, `errorType` and a stack trace.
- **A cycle in the states fails the execution** after 25,000 transitions, with `States.Runtime`. Real
  Step Functions stops one when it runs out of execution history events.

- **A state machine is the only resource that holds tags.** An activity and an execution both take
  tags on real Step Functions, and both are unsimulated here. A tag request naming one is refused
  as an ARN this holds nothing under.
- **A `Version` on `DefinitionS3Location` is read past.** Simulated S3 holds one body per key, and a
  template naming a version gets that body.
- **`LoggingConfiguration`, `TracingConfiguration` and `EncryptionConfiguration` are recorded on
  `stack.ignoredProperties`.** An execution writes no log events, X-Ray is unsimulated, and a
  definition is held as it was written, with a key asked for nowhere.
- **`AWS::StepFunctions::StateMachineVersion` and `AWS::StepFunctions::StateMachineAlias` are
  unsupported.** Every execution runs the definition the state machine currently holds, so there is
  nothing for a published version or an alias to point at.

`CreateStateMachine` is idempotent, as it is on AWS. A second request carrying the same name,
definition and type answers with the state machine already there, and one carrying a different
definition raises `StateMachineAlreadyExists`. A differing `roleArn` is ignored. The AWS API
reference contradicts itself here, listing a differing role ARN under `StateMachineAlreadyExists`
while the operation's own note says the difference is ignored. The note is the more specific of the
two and is what this follows.

## Still to come

- `Parallel` and `Map` states.
- `Retry` and `Catch`, and the `TimeoutSeconds` and `HeartbeatSeconds` a `Task` state takes. A
  definition carrying one of them is refused, naming the field.
- Service integrations beyond Lambda, task tokens and activities.
- The context object, `$$`.
- JSONata as a query language, and the `Assign` variables that go with it.
