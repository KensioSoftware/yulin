# Simulated Step Functions

Simulated Step Functions interprets Amazon States Language and runs a state machine in the same
process as the code under test. A workflow held in a template as data becomes something a test can
run and assert on.

Types for simulated Step Functions are imported from the `@kensio/yulin/stepfunctions` subpath.

## What runs today

Every state type Amazon States Language defines runs. `Pass`, `Task`, `Succeed`, `Fail`, `Choice`,
`Wait`, `Parallel` and `Map`.

The data-flow fields run in full. `InputPath`, `Parameters`, `ResultSelector`, `ResultPath` and
`OutputPath` apply in that order, reading Reference Paths and the intrinsic functions.

A `Task` state invokes a simulated Lambda function, calls an operation on any other simulated
service, or starts another state machine. A `Resource` this simulator has no answer for is refused
when the state machine is created, naming what the definition asked for.

A `Task` state's `Retry` and `Catch` both run, on the simulation's clock, along with the
`TimeoutSeconds` and `HeartbeatSeconds` it takes. A `Parallel` state and a `Map` state take the same
`Retry` and `Catch`.

The context object runs, so `$$.Execution`, `$$.StateMachine`, `$$.State` and `$$.Map` are all
readable.

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

`Retry` and `Catch` match on that name, and the next section covers both. A task that carries
neither ends the execution, and `DescribeExecution` carries the error name and the handler's
message.

Anything else that stops a task from running fails it with `States.TaskFailed`. A function that is
not there, a role that cannot be assumed, and a role that may not invoke are the three of them, and
the cause says which one it was.

## Retrying and catching a failure

A `Task` state's `Retry` runs a failing task again on the simulation's clock. Its `Catch` sends a
failure that survived the retries to another state. Both match on the Amazon States Language error
name, and both are read when the state machine is created.

Each attempt is scheduled at its own instant, and the execution reads as `RUNNING` in between. One
`advanceBy` covering the whole backoff runs every attempt in it, because an attempt the advance
schedules is itself due by the time the advance gets there. A test advances once and then asserts.

```typescript sim-step-functions-retry
/**
 * Retrying a failing task on the clock, and catching what the retries leave.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand } from "@aws-sdk/client-lambda";

import { SimAws, SimFixedClock } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
});

// The enrolment service is down for the whole of this run.
await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "check-enrolment",
    Role: "arn:aws:iam::123456789012:role/FunctionRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        throw new Error("the enrolment service is down");
      }),
    },
  }),
);

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
          Retry: [
            {
              ErrorEquals: ["States.TaskFailed"],
              IntervalSeconds: 2,
              MaxAttempts: 2,
            },
          ],
          Catch: [
            {
              ErrorEquals: ["States.ALL"],
              Next: "Compensate",
              ResultPath: "$.error",
            },
          ],
          Next: "Enrol",
        },
        Enrol: { Type: "Pass", Result: { enrolled: true }, End: true },
        Compensate: { Type: "Pass", End: true },
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

// The attempts fall at 0, 2 and 6 seconds. One advance covers all three.
await simAws.clock().advanceBy({ seconds: 10 });

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.status); // SUCCEEDED
console.log(described.stopDate); // 2026-07-26T09:00:06.000Z

// {"student":"Wei","error":{"Error":"States.TaskFailed","Cause":"The function
//  the Task state Check invoked raised Error: the enrolment service is down"}}
console.log(described.output);

// [ { stateName: 'Check', error: 'States.TaskFailed' },
//   { stateName: 'Check', error: 'States.TaskFailed' },
//   { stateName: 'Check', error: 'States.TaskFailed' },
//   { stateName: 'Compensate' } ]
console.log(simAws.stepFunctions().inspection().attempts(started.executionArn));
```

### Matching an error

`ErrorEquals` names the errors an entry handles. The retriers are tried first and the catchers after
them, each in the order it was written, and the first entry naming the error takes it. `States.ALL`
matches anything. Amazon States Language holds that one to an entry of its own written last, and a
definition breaking either rule is refused when the state machine is created.

Which name a task fails under follows the `Resource` that invoked it, as the section above
describes. A handler raising through `arn:aws:states:::lambda:invoke` is `States.TaskFailed`, and
through a function ARN it is the handler's own error type.

`States.Runtime` is left alone by both. Real Step Functions ends an execution on that one whatever a
`Retry` or a `Catch` names, and a catcher on `States.ALL` passes over it.

### How long a retry waits

The wait starts at `IntervalSeconds` (1 second by default) and is multiplied by `BackoffRate` (2.0)
for every retry already taken. `MaxDelaySeconds` caps it. `MaxAttempts` (3) counts retries. A
retrier left on all four defaults runs a task four times, at 0, 1, 3 and 7 seconds.

Each retrier keeps its own count, the way Amazon States Language keeps it. A task failing one way
and then another spends one attempt from each of the two retriers that name them. A retrier with no
attempts left hands the failure to the catchers, and a failure no catcher names ends the execution.

`JitterStrategy` is refused when the state machine is created. Jitter varies the wait between
attempts, and a test advancing a clock over that wait needs it fixed.

### Where the error lands

A catcher's `Next` names the state a caught failure goes to. Its `ResultPath` says where the error
output sits in that state's input, and the error output holds `Error` and `Cause` (the two the
example above prints). `ResultPath` reads the raw input of the state that failed. Writing it to
`$.error` keeps the data the task was given and puts the error beside it. A catcher carrying no
`ResultPath` passes the error output on by itself, and one carrying `null` passes the input on
untouched.

### How long a task waits

`TimeoutSeconds` and `HeartbeatSeconds` say how long a `Task` state waits for its work. A task still
going when simulated time reaches either one fails with `States.Timeout`, and the shorter of the two
fires. The failure goes to the state's `Catch` like any other. The deadline covers the state with
its retries in it, and a task that reaches the deadline gives up where it stands.

### Counting the attempts

`visitedStates` says which states an execution reached. `attempts` says how many runs each of those
states took, and what each run failed with. A test asserting that a task ran three times counts the
rows.

## Calling a simulated service

A `Task` state can call an operation on any service this simulation holds, through both of the forms
Amazon States Language gives a service integration.

`arn:aws:states:::aws-sdk:<service>:<operation>` is the SDK integration. The state's `Parameters` are
the request and the operation's response is its result. The service is named the way the AWS SDK
names it, in lower case with nothing between the words (`dynamodb`, `sqs`, `eventbridge`, `sfn`,
`secretsmanager`, `cloudwatchlogs`). Every simulated service answers one, and a service this
simulation has no simulation of is refused when the state machine is created.

Seven integrations are the ones Step Functions optimises, and each carries the request shape that
integration defines.

| `Resource`                               | Calls                           |
| ---------------------------------------- | ------------------------------- |
| `arn:aws:states:::dynamodb:putItem`      | DynamoDB `PutItem`              |
| `arn:aws:states:::dynamodb:getItem`      | DynamoDB `GetItem`              |
| `arn:aws:states:::dynamodb:updateItem`   | DynamoDB `UpdateItem`           |
| `arn:aws:states:::dynamodb:deleteItem`   | DynamoDB `DeleteItem`           |
| `arn:aws:states:::sns:publish`           | SNS `Publish`                   |
| `arn:aws:states:::sqs:sendMessage`       | SQS `SendMessage`               |
| `arn:aws:states:::events:putEvents`      | EventBridge `PutEvents`         |
| `arn:aws:states:::states:startExecution` | Step Functions `StartExecution` |

Four of them carry a message, and an optimized integration lets that message be written as JSON.
`Message` on `sns:publish`, `MessageBody` on `sqs:sendMessage`, the `Detail` of each
`events:putEvents` entry and `Input` on `states:startExecution` are all serialised on the way out.
`Parameters` build a message the way they build anything else.

```typescript sim-step-functions-service-task
/**
 * A workflow that records an enrolment in DynamoDB and announces it on SNS.
 */

import { CreateTableCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateTopicCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.dynamoDb().createTable(
  new CreateTableCommand({
    TableName: "enrolments",
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);

const topic = await simAws
  .sns()
  .createTopic(new CreateTopicCommand({ Name: "enrolments" }));

// The execution assumes this role, and every call it makes is authorized as it.
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
    PolicyName: "RecordEnrolments",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: ["dynamodb:PutItem", "sns:Publish"],
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
      StartAt: "Record",
      States: {
        Record: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:putItem",
          Parameters: {
            TableName: "enrolments",
            Item: { id: { "S.$": "$.student" }, term: { S: "2026-autumn" } },
          },
          // PutItem answers with nothing, and the announcement needs the input.
          ResultPath: null,
          Next: "Announce",
        },
        Announce: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: topic.TopicArn,
            Message: { "student.$": "$.student", enrolled: true },
          },
          End: true,
        },
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

const recorded = await simAws.dynamoDb().getItem(
  new GetItemCommand({
    TableName: "enrolments",
    Key: { id: { S: "Wei" } },
  }),
);

console.log(recorded.Item?.["term"]); // { S: '2026-autumn' }
```

The five data-flow fields apply around one of these calls the way they apply around any other state.
`Parameters` build the request, and `ResultSelector`, `ResultPath` and `OutputPath` shape the
response. A `Parameters` field written with `.$` reads a Reference Path or an intrinsic. The `Item`
above takes its key out of the execution's input that way.

The call is made in the state machine's own Account and Region. A resource in another one is reached
by naming it in the request, where the operation takes an ARN.

### What the execution role has to allow

Each call carries the role the execution assumed, and simulated IAM answers it against that role's
policies and the resource the request names. The action is the one AWS documents for the operation,
so `dynamodb:PutItem` for a `putItem` and `sns:Publish` for a `publish`. A role that has not been
granted it fails the task with an access denied error, naming the action and the resource.

`states:startExecution` is the exception. Simulated Step Functions authorizes none of its own
operations yet. A task starting another state machine runs whatever the role allows.

### When a service refuses a call

The task fails under the name Amazon States Language gives a service error. That name is the service
and the error joined by a dot. A conditional write that did not hold is
`DynamoDb.ConditionalCheckFailedException`, and a request the service would not accept is
`DynamoDb.ValidationException`. `Retry` and `Catch` match on that name.

The error is the service's own name for what it refused, and simulated IAM calls a refusal
`AccessDenied`. A task an execution role may not make is `DynamoDb.AccessDenied` here, where real
Step Functions writes `DynamoDb.AccessDeniedException`.

Anything that stopped the call from reaching the service fails the task with `States.TaskFailed`. An
operation this simulator has no implementation for is one of these, and the cause names the operation
and lists what that simulated service does run. That refusal comes when the task runs, because the
operations a service runs belong to the simulated service and there is none to ask while a state
machine is being created.

### What a Resource is refused for

`.sync` and `.waitForTaskToken` are refused when the state machine is created, naming the pattern. A
task here calls and answers, and both of those hold a state open until something else happens. An
integration for a service this simulation has no simulation of is refused the same way, naming the
service and the operation the definition asked for.

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

## Running branches at once

A `Parallel` state runs each of its `Branches`, and answers with an array of what they produced. The
array is in the order the branches were written, whatever order they finished in.

```typescript sim-step-functions-parallel
/**
 * Running two branches at once with a Parallel state.
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
      StartAt: "Enrol",
      States: {
        Enrol: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "Settle",
              States: {
                Settle: { Type: "Wait", Seconds: 300, Next: "Register" },
                Register: {
                  Type: "Pass",
                  Result: { registered: true },
                  End: true,
                },
              },
            },
            {
              StartAt: "Bill",
              States: {
                Bill: { Type: "Pass", Result: { billed: true }, End: true },
              },
            },
          ],
          Next: "Confirm",
        },
        Confirm: { Type: "Pass", End: true },
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

console.log(settled.output); // [{"registered":true},{"billed":true}]

console.log(
  simAws
    .stepFunctions()
    .inspection()
    .branches(started.executionArn)
    .map((branch) => branch.visitedStates),
); // [ [ 'Settle', 'Register' ], [ 'Bill' ] ]
```

Every branch is given the state's effective input. `InputPath` and `Parameters` apply once for the
state, and not once per branch. `ResultSelector`, `ResultPath` and `OutputPath` then apply to the
array of branch outputs.

A branch is a state machine of its own, with its own `StartAt` and its own `States`. A `Next` inside
a branch reaches only the states in that branch, and two branches are free to use the same state
name. The states inside a branch are read when the state machine is created. A definition using something
this simulator has no implementation for inside a branch is refused there, naming the branch it was
written in.

A branch that reaches a `Wait` state waits on the same clock as everything else, and its siblings
carry on while it waits. The execution reads as `RUNNING` until the last branch has finished.

### When a branch fails

A branch that fails takes the `Parallel` state with it. The state fails with `States.BranchFailed`,
and the `Cause` names the branch and what it failed with:

```text
Branch 2 of the Parallel state Enrol failed with NotEligible: no place left on the course
```

The branches still going are given up on, along with the branches those were running themselves.
Whatever they had scheduled on the clock finds a branch that has stopped, so a later `advanceBy`
runs none of it.

`Retry` and `Catch` on the `Parallel` state itself work the way they do on a `Task` state, and are
written the same way. A retry runs every branch again from its own `StartAt`, on the interval and
backoff the retrier gives. A catcher matching `States.BranchFailed` (or `States.ALL`) sends the
execution to the state it names.

### Reading the branches back

The inspection accessor reports branches separately from the states around them:

```typescript
const branches = simAws.stepFunctions().inspection().branches(executionArn);
```

Each branch says which `Parallel` state it belongs to, where among its siblings it sits (counting
from zero), the states it entered and how it ended. A branch given up on because a sibling failed
reads as `ABANDONED`. A `Parallel` state inside a branch reports its own branches here too, however
deep they go. `visitedStates` on the execution holds the states outside the branches, while
`attempts` covers every run of every state, branches included.

## Running a state per item

A `Map` state runs its `ItemProcessor` once per item, and answers with an array of what the
iterations produced. The array is in the order the items were in, whatever order the iterations
finished in.

```typescript sim-step-functions-map
/**
 * Running a state per item with a Map state.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const created = await simAws.stepFunctions().createStateMachine({
  input: {
    name: "Enrolment",
    roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
    definition: JSON.stringify({
      StartAt: "Enrol",
      States: {
        Enrol: {
          Type: "Map",
          ItemsPath: "$.students",
          MaxConcurrency: 2,
          ItemSelector: {
            "id.$": "$$.Map.Item.Value.id",
            "at.$": "$$.Map.Item.Index",
            "term.$": "$.term",
          },
          ItemProcessor: {
            StartAt: "Register",
            States: { Register: { Type: "Pass", End: true } },
          },
          End: true,
        },
      },
    }),
  },
});

const started = await simAws.stepFunctions().startExecution({
  input: {
    stateMachineArn: created.stateMachineArn,
    input: JSON.stringify({
      term: 3,
      students: [{ id: "wei" }, { id: "mei" }],
    }),
  },
});

const described = await simAws
  .stepFunctions()
  .describeExecution({ input: { executionArn: started.executionArn } });

console.log(described.output);
// [{"id":"wei","at":0,"term":3},{"id":"mei","at":1,"term":3}]

console.log(
  simAws.stepFunctions().inspection().iterations(started.executionArn).length,
); // 2
```

`ItemsPath` says where the items are, and a `Map` state carrying none runs over its whole effective
input. What it selects has to be an array. Anything else fails the state with `States.Runtime`,
which is the failure real Step Functions gives it, and no `Catch` takes that one.

`ItemSelector` builds what each iteration is given. It reads the `Map` state's own input through `$`
and the item it is building for through `$$.Map.Item`, which holds `Value` and `Index`. The states
inside the iteration read `$$.Map.Item` as well. A `Map` state carrying no `ItemSelector` gives each
iteration the item itself.

`MaxConcurrency` bounds how many iterations run at once. A bound of 0, and a `Map` state carrying no
bound at all, runs every iteration together. An iteration reaching a `Wait` state is still one of
the iterations running, so a bound of 1 holds the next item back until the wait is over.

`Parameters` and `Iterator` are the older spellings of `ItemSelector` and `ItemProcessor`, and both
are read. CDK still writes them for a `Map` built with its deprecated `parameters` property or its
`iterator()` call. A state carrying both spellings of either is refused.

An iteration that fails fails the `Map` state, the way a branch failing fails a `Parallel` state.
The state fails with `States.BranchFailed`, the iterations still going are abandoned, and the items
that had not started are left alone. `Retry` and `Catch` on the `Map` state work as they do on a
`Task` state, and a retry runs every iteration again.

Reading the iterations back is the same accessor the branches use:

```typescript
const iterations = simAws.stepFunctions().inspection().iterations(executionArn);
```

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

A path rooted at `$$` reads the context object rather than the state's data. See below.

## The context object

`$$` reads what the execution knows about itself. It is read in `InputPath`, `OutputPath`,
`ItemsPath`, the Payload Template fields (`Parameters`, `ResultSelector` and `ItemSelector`) and an
intrinsic function's arguments.

```json
{
  "Execution": {
    "Id": "arn:aws:states:eu-west-2:123456789012:execution:Enrolment:execution-1",
    "Input": { "student": "Wei" },
    "Name": "execution-1",
    "RoleArn": "arn:aws:iam::123456789012:role/WorkflowRole",
    "StartTime": "2026-07-26T09:00:00.000Z"
  },
  "StateMachine": {
    "Id": "arn:aws:states:eu-west-2:123456789012:stateMachine:Enrolment",
    "Name": "Enrolment"
  },
  "State": {
    "EnteredTime": "2026-07-26T09:00:00.000Z",
    "Name": "Check",
    "RetryCount": 0
  },
  "Map": { "Item": { "Index": 0, "Value": { "id": "wei" } } }
}
```

`State` is the state now running, and `RetryCount` counts the retries this entry to it has taken.
`Map` is there inside a `Map` state's `ItemSelector` and inside the iteration it built.

`$$.Task.Token` is unsimulated, along with the task tokens it belongs to. A path reading it selects
nothing and fails the state that read it. A field that writes, such as `ResultPath`, takes a path
rooted at `$`, since the context object is read rather than written.

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
- **A service call an execution role may not make fails as `AccessDenied`.** Simulated IAM names a
  refusal that way, and the task error is the service and that name joined by a dot. Real Step
  Functions writes the service's own `AccessDeniedException`.
- **An operation a simulated service has no implementation for is refused when the task runs.** The
  operations a service runs belong to the simulated service, and there is none to ask while the
  state machine is being created. The service itself is refused there.
- **A failed task's `Cause` is the handler's message.** Real Step Functions writes the JSON error
  document Lambda answered with, holding `errorMessage`, `errorType` and a stack trace.
- **A task's timeout covers the whole state.** Real Step Functions gives every attempt its own
  `TimeoutSeconds`. An attempt here takes no simulated time by itself, and a per-attempt deadline
  would never be reached. The deadline runs from the instant the execution entered the state, and a
  task that reaches it goes to its `Catch` without another attempt.
- **Nothing sends a heartbeat.** `HeartbeatSeconds` behaves as a second, shorter `TimeoutSeconds`.
  Activities and task tokens are unsimulated, and there is no worker to send one from.
- **`TimeoutSecondsPath` and `HeartbeatSecondsPath` are unsimulated.** The two literal fields say
  the same thing in the definition. A `Task` state carrying either path is refused when the state
  machine is created.
- **A cycle in the states fails the execution** after 25,000 transitions, with `States.Runtime`. Real
  Step Functions stops one when it runs out of execution history events.
- **A branch that failed on the data it was given keeps `States.Runtime`.** Every other branch
  failure becomes `States.BranchFailed` on the `Parallel` state. `States.Runtime` is the one error
  nothing catches, and a state around a branch is no more able to carry on than the branch was.
- **A branch's own states are reported apart from the execution's.** Real Step Functions writes
  them into one execution history, under events naming the branch. The inspection accessor answers
  `branches` and `iterations` instead, since a test asserting on a branch is asking about that
  branch.
- **A Distributed Map is refused.** `ItemReader`, `ResultWriter`, `ItemBatcher`, the two
  `ToleratedFailure` fields and a `ProcessorConfig` asking for `DISTRIBUTED` are all refused when
  the state machine is created. A Distributed Map reads its items from S3 and runs a child
  execution per batch, which is a second execution model rather than a field or two on this one.
- **A `Map` state's iterations that had not started are left alone when one fails.** The ones
  running are abandoned, and `inspection().iterations()` reports only the iterations that ran. Real
  Step Functions stops the same work, and its execution history says as much.

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

- Distributed Map, with `ItemReader`, `ResultWriter` and the `ToleratedFailure` fields.
- The `.sync` pattern, task tokens and activities.
- JSONata as a query language, and the `Assign` variables that go with it.
