# Use non-AWS dependencies

Yulin leaves databases, caches, and other non-AWS dependencies under your control.

## Pass connection details through environment variables

A simulated Lambda function or ECS container runs in the same Node.js process as your test. AWS
SDK calls can stay inside Yulin through [SDK interception](https://yulinsim.dev/sdk/). Calls to
other libraries work normally.

Configure those libraries through the same environment variables that you use in production. For
example, a deployed function could receive an ElastiCache URL while a test receives a localhost
URL:

```typescript non-aws-dependency-lambda
/**
 * Giving a simulated Lambda function the address of an external dependency.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "rates",
    Role: "arn:aws:iam::111111111111:role/RatesRole",
    Environment: {
      Variables: {
        TABLE_NAME: "rates",
        CACHE_URL: "redis://127.0.0.1:6379",
      },
    },
    Code: {
      ZipFile: makeLambdaZipFileInput(() => ({
        tableName: process.env["TABLE_NAME"],
        cacheUrl: process.env["CACHE_URL"],
      })),
    },
  }),
);

const output = await lambda.invoke(
  new InvokeCommand({ FunctionName: "rates" }),
);

if (output.Payload === undefined) throw new Error("No invoke payload");

console.log(Buffer.from(output.Payload).toString());
// {"tableName":"rates","cacheUrl":"redis://127.0.0.1:6379"}
```

`TABLE_NAME` identifies a simulated AWS resource. `CACHE_URL` points to a dependency supplied by
the test. That dependency could be a local process, a test container, or an in-process
implementation of the interface your application uses.

## Configure an ECS container in the same way

An ECS container binding reads the container definition's `environment` entries through
`process.env` while its handler runs:

```typescript non-aws-dependency-ecs
/**
 * Passing a cache URL to a simulated ECS container.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();
const connections: string[] = [];

await ecs.createCluster(new CreateClusterCommand({}));

ecs.bindContainer({
  family: "rates-worker",
  containerName: "app",
  run: () => {
    connections.push(process.env["CACHE_URL"] ?? "");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "rates-worker",
    containerDefinitions: [
      {
        name: "app",
        image: "rates-worker:1",
        environment: [{ name: "CACHE_URL", value: "redis://127.0.0.1:6379" }],
      },
    ],
  }),
);

await ecs.runTask(new RunTaskCommand({ taskDefinition: "rates-worker" }));
await simAws.backgroundTasksComplete();

console.log(connections); // ["redis://127.0.0.1:6379"]
```

The host environment remains available unless the container overrides a variable. ECS task
overrides and simulated Secrets Manager or SSM values are also applied before the handler runs.
See the [ECS guide](https://yulinsim.dev/services/ecs/) for the full precedence rules.

## Run the dependency yourself

Your test or development script starts and stops the server named by a connection string.

This also applies to ECS sidecars. Yulin stores every container definition, but it only runs a
container that has a JavaScript or TypeScript binding. It cannot run a Redis or database image. An
unbound sidecar is recorded as unsimulated when the task runs.

Point the application container at a dependency that is available to the host process. A localhost
address often works because the simulated container runs in that process, without a separate
container network.

## Read environment variables while the handler runs

Referenced Lambda handlers and ECS bindings come from modules already imported by the test. A
module-level read happens during that import:

```typescript
const cacheUrl = process.env["CACHE_URL"];
```

That value comes from the host environment. Read the variable inside the handler when it must come
from the simulated function or container configuration:

```typescript
async function handler(): Promise<void> {
  const cacheUrl = process.env["CACHE_URL"];
  // Build or call the dependency here.
}
```

Simulated Lambda prints a warning when a declared value conflicts with a value that module-level
code could have read. Lambda code loaded from a zip archive is imported during its first invocation
and sees the function environment at module scope.

## Available functionality

- Lambda `Environment.Variables` are applied during an invocation.
- ECS container `environment`, `secrets`, and task overrides are applied during a container run.
- Host environment variables remain available for names left out of the workload configuration.
- AWS SDK interception continues to work from code that also uses external dependencies.

## Limitations

- Yulin does not create, start, reset, or stop non-AWS dependencies.
- Unbound ECS sidecar images are stored but never run.
- Referenced handlers and container bindings read the host value when they access `process.env` at
  module scope.
- Yulin has no interception API for non-AWS clients. Configure the client through your application's
  existing environment variables or dependency injection point.
