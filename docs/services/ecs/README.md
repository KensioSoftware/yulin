# Simulated ECS

Yulin includes a simulated Amazon ECS for tests and local development. It holds clusters, task
definitions and services in memory, runs tasks from handlers you bind to their containers, and
authorizes every operation with simulated IAM.

ECS-specific types are imported from the `@kensio/yulin/ecs` subpath.

## What Yulin does with a container image

Yulin never looks inside a container image. It cannot: an image may hold a Go binary, nginx, Redis or
anything else, and the only thing Yulin can run is JavaScript or TypeScript in its own process.

So an image URI is only ever an identifier. Nothing here reads it, pulls it, or runs anything from
it. It is stored as declared, and it is what a container is matched on when a task runs, in the same
way an image URI identifies a container image Lambda function. The rule that follows from it is that
a container matched to a handler runs that handler, and a container with no match is recorded as not
simulated rather than failing anything.

A realistic task definition holds an application container, a log router and an observability agent.
Only the first of those is something Yulin could ever run, and all three are stored and reported back
exactly as declared.

Where this does not work is a sidecar the application depends on, such as a Redis or a database in
the same task. Yulin does not simulate that. The connection details are ordinary environment
variables, so point them at a real one you run yourself. See
[non-AWS dependencies](../../non-aws-dependencies/README.md) for how that fits together.

## Registering a task definition

`RegisterTaskDefinition` stores a revision under its family. Revisions number from one and go up by
one with each registration.

```typescript sim-ecs-register-task-definition
/**
 * Registering a simulated task definition and reading it back.
 */

import {
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    cpu: "512",
    memory: "1024",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    containerDefinitions: [
      {
        name: "app",
        image: "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:1",
        essential: true,
        portMappings: [{ containerPort: 8080, protocol: "tcp" }],
        environment: [{ name: "LOG_LEVEL", value: "debug" }],
      },
    ],
  }),
);

const described = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
);

console.log(described.taskDefinition?.revision); // 1
console.log(described.taskDefinition?.status); // "ACTIVE"
console.log(described.taskDefinition?.containerDefinitions?.[0]?.image);
// "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:1"
```

Container definitions are stored as declared, whatever the image is and whether or not Yulin could
ever run it. That includes port mappings, environment variables and secrets: a `valueFrom` naming a
Secrets Manager secret is held as the identifier it is, since nothing resolves it.

A registration is refused rather than trimmed if it declares something this simulation does not hold.
That way a declaration cannot go missing from the revision it made.

## Revisions

Each registration of a family takes the next revision number. Naming the family alone means its
latest active revision, so it follows registrations as they are made.

```typescript sim-ecs-task-definition-revisions
/**
 * Registering a second revision of a simulated task definition family.
 */

import {
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

for (const tag of ["checkout:1", "checkout:2"]) {
  await ecs.registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: "checkout",
      containerDefinitions: [{ name: "app", image: tag }],
    }),
  );
}

const latest = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
);

console.log(latest.taskDefinition?.revision); // 2

const first = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
);

console.log(first.taskDefinition?.containerDefinitions?.[0]?.image);
// "checkout:1"
```

`DescribeTaskDefinition` takes all three forms ECS takes: a family, a `family:revision`, and a full
task definition ARN. The ARN of a revision is
`arn:aws:ecs:<region>:<account>:task-definition/<family>:<revision>`.

## Deregistering a revision

`DeregisterTaskDefinition` marks one revision `INACTIVE` without removing it. It stays describable by
`family:revision` and by ARN, because something already holding either of those still needs to find
out what it declared. What it stops being is the revision the family resolves to.

```typescript sim-ecs-deregister-task-definition
/**
 * Deregistering a simulated task definition revision.
 */

import {
  DeregisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

for (const tag of ["checkout:1", "checkout:2"]) {
  await ecs.registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: "checkout",
      containerDefinitions: [{ name: "app", image: tag }],
    }),
  );
}

await ecs.deregisterTaskDefinition(
  new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:2" }),
);

const deregistered = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout:2" }),
);

console.log(deregistered.taskDefinition?.status); // "INACTIVE"

const latest = await ecs.describeTaskDefinition(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
);

console.log(latest.taskDefinition?.revision); // 1
```

Deregistering must name one revision, as it must on real ECS. A family on its own is refused.

Revision numbers are never reused. Registering the family again after deregistering revision 2 gives
revision 3.

## Listing task definitions

`ListTaskDefinitions` reports revision ARNs and `ListTaskDefinitionFamilies` reports family names.
Both take a `familyPrefix`. A `ListTaskDefinitions` request saying nothing about status gets the
active revisions, while a `ListTaskDefinitionFamilies` request saying nothing gets both the active
and the inactive families, which is how real ECS defaults each of them.

```typescript sim-ecs-list-task-definitions
/**
 * Listing simulated task definition revisions and families.
 */

import {
  ListTaskDefinitionFamiliesCommand,
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

for (const family of ["checkout", "billing"]) {
  await ecs.registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family,
      containerDefinitions: [{ name: "app", image: `${family}:1` }],
    }),
  );
}

const revisions = await ecs.listTaskDefinitions(
  new ListTaskDefinitionsCommand({ familyPrefix: "check" }),
);

console.log(revisions.taskDefinitionArns?.length); // 1

const families = await ecs.listTaskDefinitionFamilies(
  new ListTaskDefinitionFamiliesCommand({}),
);

console.log(families.families); // ["checkout", "billing"]
```

A family counts as inactive once every one of its revisions has been deregistered.
`ListTaskDefinitionFamilies` takes `ACTIVE`, `INACTIVE` and `ALL`, and `ListTaskDefinitions` takes
`ACTIVE` and `INACTIVE` along with a `sort` of `ASC` or `DESC`.

## Clusters

A cluster is a named scope for the tasks and services that will run in it. `CreateCluster`,
`DescribeClusters`, `ListClusters` and `DeleteCluster` hold them.

```typescript sim-ecs-clusters
/**
 * Creating and describing a simulated ECS cluster.
 */

import {
  CreateClusterCommand,
  DescribeClustersCommand,
  ListClustersCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(
  new CreateClusterCommand({
    clusterName: "services",
    settings: [{ name: "containerInsights", value: "enabled" }],
    tags: [{ key: "team", value: "platform" }],
  }),
);

const described = await ecs.describeClusters(
  new DescribeClustersCommand({
    clusters: ["services"],
    include: ["SETTINGS", "TAGS"],
  }),
);

console.log(described.clusters?.[0]?.status); // "ACTIVE"
console.log(described.clusters?.[0]?.runningTasksCount); // 0
console.log(described.clusters?.[0]?.tags?.[0]?.key); // "team"

const listed = await ecs.listClusters(new ListClustersCommand({}));

console.log(listed.clusterArns?.[0]);
// "arn:aws:ecs:us-east-1:888888888888:cluster/services"
```

Settings, configuration and tags are reported only where the request asked for them by name, as they
are on real ECS. A request naming no cluster means the `default` cluster.

`DeleteCluster` marks a cluster `INACTIVE`. It stays describable and drops out of `ListClusters`, and
creating a cluster of the same name again makes a new active one, listed in the position it was
created in. Unlike the operations that read a cluster, `DeleteCluster` needs one to be named: a
request naming none is refused rather than taken as meaning the `default` cluster.

A cluster is named either by its short name or by its full ARN, and the two are interchangeable. An
ARN belonging to another account or region names a different cluster, so `DescribeClusters` reports
it as a `MISSING` failure and `DeleteCluster` refuses it.

A cluster has to exist before a task can run in it, including the `default` one. Yulin creates no
cluster on its own, so create the one the tasks run in.

## Running a task

`bindContainer` says what a container runs. `RunTask` then starts a task in a cluster, and the bound
handlers run in this process.

```typescript sim-ecs-run-task
/**
 * Running a simulated ECS task from a bound container handler.
 */

import {
  CreateClusterCommand,
  DescribeTasksCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

const processed: string[] = [];

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  run: async () => {
    await Promise.resolve();
    processed.push("outstanding orders");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    containerDefinitions: [
      { name: "app", image: "orders-worker:1" },
      { name: "log-router", image: "aws-for-fluent-bit:latest" },
    ],
  }),
);

const run = await ecs.runTask(
  new RunTaskCommand({ cluster: "orders", taskDefinition: "orders-worker" }),
);

console.log(run.tasks?.[0]?.lastStatus); // "PROVISIONING"

// The containers run in the background, as they do on real ECS.
await simAws.backgroundTasksComplete();

console.log(processed); // ["outstanding orders"]

const described = await ecs.describeTasks(
  new DescribeTasksCommand({
    cluster: "orders",
    tasks: [run.tasks?.[0]?.taskArn ?? ""],
  }),
);

console.log(described.tasks?.[0]?.lastStatus); // "STOPPED"
console.log(described.tasks?.[0]?.containers?.[0]?.exitCode); // 0
console.log(described.tasks?.[0]?.containers?.[1]?.reason);
// "Not simulated: no executable binding matches this container, ..."
```

`RunTask` answers before the containers have run, with the task in `PROVISIONING`, which is what real
ECS answers with. Waiting for the simulator's background work is what runs them.

The log router in that task definition has no binding, so it never starts and says why. That is the
ordinary shape of a real task definition: an application container Yulin can run, next to containers
it never could.

A handler that throws stops its container with an exit code of 1 and the error message as its
reason. The `RunTask` call itself does not fail, because nothing is watching one by the time a real
container fails either. A task definition where nothing at all is bound still creates the task, which
stops with a `stopCode` of `TaskFailedToStart` saying that nothing ran.

### Binding by image repository

A container built by CDK or by a pipeline has an image tag that changes with every build, so naming
the container by hand is the wrong way round. A binding can name the repository instead, and the tag
is ignored on both sides.

```typescript sim-ecs-bind-image-repository
/**
 * Binding a simulated ECS container by the repository its image comes from.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({}));

const started: string[] = [];

ecs.bindContainer({
  imageRepository: "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders",
  run: () => {
    started.push("app");
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    containerDefinitions: [
      {
        name: "app",
        image: "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders:8f2c1a9b",
      },
    ],
  }),
);

await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
await simAws.backgroundTasksComplete();

console.log(started); // ["app"]
```

The registry host is part of the repository, so a same-named repository in another account or region
does not match. A binding naming the family and the container name beats one naming a repository
where both would match, and binding the same container again replaces what it runs.

The other shape a binding can take is `http`, a fetch-style
`(request: Request) => Response | Promise<Response>` for a service container behind a load balancer.
It is called once for each request routed to the container, and is covered under
[serving requests behind a load balancer](#serving-requests-behind-a-load-balancer).

## What a container sees while it runs

The container definition's `environment` is visible through `process.env` for the length of the run,
along with any `RunTask` container override and the region variables a real task agent sets. This
works the same way it does for a sim Lambda function handler, through Node.js asynchronous context
tracking, so a container that declares nothing reads the host environment untouched.

```typescript sim-ecs-run-task-environment
/**
 * The environment variables a simulated ECS container runs with.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({}));

const batchSizes: (string | undefined)[] = [];

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  run: () => {
    batchSizes.push(process.env["BATCH_SIZE"]);
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    containerDefinitions: [
      {
        name: "app",
        image: "orders-worker:1",
        environment: [{ name: "BATCH_SIZE", value: "100" }],
      },
    ],
  }),
);

await ecs.runTask(
  new RunTaskCommand({
    taskDefinition: "orders-worker",
    overrides: {
      containerOverrides: [
        { name: "app", environment: [{ name: "BATCH_SIZE", value: "10" }] },
      ],
    },
  }),
);
await simAws.backgroundTasksComplete();

console.log(batchSizes); // ["10"]
```

A variable read at module scope, as in `const size = process.env.BATCH_SIZE` at the top of a file, is
read when the test imports that file rather than when the container runs, so it sees the host value.
Read inside the handler to get the container's own.

## The task role

While a container runs, its AWS calls are attributed to the task definition's `taskRoleArn`, in the
same way a sim Lambda function's are to its execution role. Calls made through an SDK client
intercepted by `SimSdk` pick this up without the code under test knowing.

```typescript sim-ecs-task-role
/**
 * Authorizing what a simulated ECS container does as the task Role.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
const { simAws } = simSdk;
const ecs = simAws.ecs();
const accountId = simAws.defaultAccountId;

const taskRole = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersTaskRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersTaskRole",
    PolicyName: "WriteLastRun",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ssm:PutParameter",
        Resource: `arn:aws:ssm:${simAws.defaultRegionName}:${accountId}:parameter/orders/last-run`,
      },
    }),
  }),
);

await ecs.createCluster(new CreateClusterCommand({}));

simSdk.intercept(SSMClient);

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  run: async () => {
    await new SSMClient({}).send(
      new PutParameterCommand({
        Name: "/orders/last-run",
        Value: "done",
        Type: "String",
      }),
    );
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    taskRoleArn: taskRole.Role.Arn,
    containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
  }),
);

await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
await simAws.backgroundTasksComplete();
```

Take the policy away and the same run stops the container with an exit code of 1, carrying the IAM
denial as its reason. That is the test worth writing: a task role missing a permission fails in the
test rather than in the deployment.

A `RunTask` request can override the role with `overrides.taskRoleArn`. A task definition declaring
no task role runs its containers as nobody, so their AWS calls are denied: a real task without one
has no credentials of its own, and taking the identity of whoever called `RunTask` would let a test
pass on permissions the deployed task has not got. The execution role is what a container's
`secrets` are resolved as, and nothing else: there is no image to pull and no log driver to write
to.

## Container secrets

A container definition's `secrets` are resolved when the task starts, from simulated Secrets Manager
or simulated SSM Parameter Store according to what each `valueFrom` names, and the values appear in
the container's environment alongside its declared `environment`. A handler reads them through
`process.env` like anything else.

They are read as the task definition's `executionRoleArn`, not its `taskRoleArn`, which is the
split real ECS makes: the execution role is what the task agent pulls secrets with before a
container starts, and the task role is what the running container's own AWS calls are attributed to.
A role allowed one is not thereby allowed the other.

```typescript sim-ecs-container-secrets
/**
 * Resolving a simulated ECS container's secrets as the execution Role.
 */

import {
  CreateClusterCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateSecretCommand } from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

const secret = await simAws.secretsManager().createSecret(
  new CreateSecretCommand({
    Name: "orders/db",
    SecretString: JSON.stringify({ username: "orders", password: "s3cr3t" }),
  }),
);

const executionRole = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersExecutionRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersExecutionRole",
    PolicyName: "ReadOrdersDbSecret",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "secretsmanager:GetSecretValue",
        Resource: secret.ARN,
      },
    }),
  }),
);

await ecs.createCluster(new CreateClusterCommand({}));

const passwords: (string | undefined)[] = [];

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  run: () => {
    passwords.push(process.env["DB_PASSWORD"]);
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    executionRoleArn: executionRole.Role.Arn,
    containerDefinitions: [
      {
        name: "app",
        image: "orders-worker:1",
        secrets: [
          {
            name: "DB_PASSWORD",
            valueFrom: `${String(secret.ARN)}:password::`,
          },
        ],
      },
    ],
  }),
);

await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
await simAws.backgroundTasksComplete();

console.log(passwords); // ["s3cr3t"]
```

A `valueFrom` may be a Secrets Manager ARN, an SSM parameter ARN, or a bare parameter name, which
real ECS accepts for a parameter in the task's own region. A Secrets Manager ARN may carry a JSON
key, a version stage and a version id after the secret id, in the form
`...:secret:orders/db-AbCdEf:password::` that a CDK construct given a field writes. The key selects
one field of a secret holding a JSON object. A `SecureString` parameter is decrypted, as it is for a
real task.

A secret that cannot be resolved stops the task before any container runs, with a
`ResourceInitializationError` reason naming the variable:

```text
ResourceInitializationError: unable to pull secrets: DB_PASSWORD: User:
arn:aws:iam::111111111111:role/OrdersExecutionRole is not authorized to perform:
secretsmanager:GetSecretValue on resource: arn:aws:secretsmanager:...
```

The task stops with `TaskFailedToStart` and never reaches `RUNNING`, so the bound handler does not
run. A secret that does not exist, a task definition declaring secrets with no `executionRoleArn`,
and a JSON key the secret has not got each stop it the same way with their own reason.

## Running a task from a rule or a schedule

A task does not have to be started by a `RunTask` call. A [simulated EventBridge](../eventbridge/)
rule target and a [simulated Scheduler](../scheduler/) schedule target can both name an ECS cluster,
and both then run a task here when the rule matches an event or the schedule falls due. That is the
usual shape of a nightly batch job or an import kicked off by something happening.

Both go through `RunTask`, so a task started that way is the same task as one started by a caller:
the same cluster and revision lookups, the same IAM decision against `ecs:RunTask`, and the same
task state afterwards. What a target may ask for is not the same, though. `EcsParameters` takes and
ignores the launch type, platform version, network configuration and capacity provider strategy that
`RunTask` refuses, since a target written for real AWS carries them and refusing one would make an
otherwise workable target unusable. The other difference is who runs it. A rule or a
schedule runs the task as the role on its target, so that role needs `ecs:RunTask` on the revision,
and the task role inside the task definition is still what the containers' own AWS calls are
attributed to.

The container model applies unchanged: only a bound container runs, and a target naming a task
definition with nothing bound records a task that never started rather than failing the rule or the
schedule. Writing one of these targets is documented where the target is written, in
[running an ECS task](../eventbridge/#running-an-ecs-task) for a rule and
[running an ECS task on a schedule](../scheduler/#running-an-ecs-task-on-a-schedule) for a schedule.

## Describing, listing and stopping tasks

`DescribeTasks` reports a task by its id or its full ARN, with its containers, which of them ran and
their exit codes. A task it cannot find is a `MISSING` failure entry rather than an error.

`ListTasks` filters on a desired status of `RUNNING` when a request says nothing, as real ECS does,
so a task that has finished is only listed by asking for the stopped ones with
`desiredStatus: "STOPPED"`. It also filters by `family`, `startedBy` and `launchType`.

`StopTask` sets the desired status to `STOPPED` and records the reason. A task whose containers have
not started yet runs none of them, and one stopped part way through runs no more, so a test can stop
a task between `RunTask` and the background work that runs it. A task that has already stopped is
reported as it stands, keeping the reason it stopped for.

## Services

A task runs and stops. A service keeps tasks running, which is what a deployed application usually
is: a named service in a cluster, running some number of tasks from a task definition.

`CreateService` creates one. Its tasks exist as soon as the request is answered and reach `RUNNING`
on the simulation's background work, as real ECS brings a new service up, so the service reports the
desired count it was given and a running count that catches up.

```typescript sim-ecs-create-service
/**
 * Creating a simulated ECS service that keeps three tasks running.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  DescribeServicesCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

ecs.bindContainer({
  family: "checkout",
  containerName: "app",
  run: async () => {
    await handleOneRequest();
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
  }),
);

const created = await ecs.createService(
  new CreateServiceCommand({
    cluster: "orders",
    serviceName: "checkout",
    taskDefinition: "checkout",
    desiredCount: 3,
  }),
);

console.log(created.service?.desiredCount); // 3
console.log(created.service?.runningCount); // 0, as real ECS answers one

// The tasks come up in the background, as they do on real ECS.
await simAws.backgroundTasksComplete();

const described = await ecs.describeServices(
  new DescribeServicesCommand({ cluster: "orders", services: ["checkout"] }),
);

console.log(described.services?.[0]?.runningCount); // 3

const listed = await ecs.listTasks(
  new ListTasksCommand({ cluster: "orders", serviceName: "checkout" }),
);

console.log(listed.taskArns?.length); // 3

async function handleOneRequest(): Promise<void> {
  await Promise.resolve();
}
```

Each of those tasks is a task like any other: `ListTasks` returns its ARN, `DescribeTasks` describes
it, and its containers report which of them Yulin is simulating.

### The desired count is state, not concurrency

A desired count of three does not mean three copies of your handler. Yulin runs in one Node.js
process and there are no containers to copy, so the count is simulated as state: three tasks exist
and are reported as running, while the handler bound to a container is called once per request or per
poll, whenever something reaches it.

That is a deliberate divergence. What it means in practice is that a service is worth asserting on
for its state — how many tasks it keeps, which revision they run — rather than for anything about
running three things at once. A test that needs concurrency is a test about your own code, not about
ECS.

A container of a service that has come up is treated as running from that point, and what calls it
is whatever reaches it: a queue it consumes, or a load balancer sending it a request. Both are
covered below.

### Consuming a queue

A worker container reads an SQS queue in a loop: receive a batch, handle it, delete it, go round
again. A binding cannot do that. An endless loop in a single Node.js process blocks everything and
never yields to the test running it, so nothing would ever get to assert on what the loop did.

So Yulin runs the loop and the binding supplies its body. A container declares `consumes` instead of
`run`, naming the queue and a handler for a batch of messages, and Yulin receives, hands the batch
over, and deletes it when the handler returns. The bound thing is the body of the loop rather than
the loop itself, which is the one divergence worth keeping in mind here.

```typescript sim-ecs-consume-queue
/**
 * A simulated ECS service whose container consumes an SQS queue.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();
const sqs = simAws.sqs();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

const queue = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);
const queueUrl = queue.QueueUrl ?? "";

const taskRole = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "OrdersWorkerTaskRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersWorkerTaskRole",
    PolicyName: "ConsumeOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ],
        Resource: queueArn,
      },
    }),
  }),
);

const handled: string[] = [];

ecs.bindContainer({
  family: "orders-worker",
  containerName: "app",
  consumes: {
    queueUrl,
    batchSize: 10,
    handler: (messages) => {
      handled.push(...messages.map((message) => message.Body));
    },
  },
});

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));
await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-worker",
    taskRoleArn: taskRole.Role.Arn,
    containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
  }),
);
await ecs.createService(
  new CreateServiceCommand({
    cluster: "orders",
    serviceName: "orders-worker",
    taskDefinition: "orders-worker",
    desiredCount: 1,
  }),
);

await sqs.sendMessage(
  new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
);
await simAws.backgroundTasksComplete();

console.log(handled); // ["order-1"]
```

The queue is named by the URL `CreateQueue` answered with, and it has to be in the same account and
region as the service, as a real task's own queue is. A `batchSize` is how many messages the handler
is given at once, up to the ten one SQS receive hands out; it defaults to ten. The handler may be
async, and is awaited. A container that declares `consumes` declares no `run` handler, and binding
one that declares both is refused.

The task role is not optional here, which is the part worth noticing before writing the first one.
Polling is done as the task role, so a task definition with no `taskRoleArn` polls as nobody and its
very first poll is denied. That is what a real worker container with no credentials would hit.

#### Polling runs on the simulated clock

Yulin never polls in the background of a test. A message that can be received now is delivered as
soon as the simulation settles, so `await simAws.backgroundTasksComplete()` is enough for an
ordinary send. Anything that has to wait — a message sent with `DelaySeconds`, or a batch coming back
after its visibility timeout — waits on the simulated clock, so freezing time holds it and advancing
time delivers it.

```typescript sim-ecs-consume-queue-clock
/**
 * Driving a simulated ECS container's polling with the simulated clock.
 */

import { SendMessageCommand } from "@aws-sdk/client-sqs";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const queueUrl: string;
declare const handled: string[];

simAws.clock().freeze();

await simAws.sqs().sendMessage(
  new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: "order-1",
    DelaySeconds: 60,
  }),
);
await simAws.backgroundTasksComplete();

console.log(handled.length); // 0, the message is not receivable yet

await simAws.clock().advanceBy({ seconds: 60 });

console.log(handled.length); // 1, the clock got there and the poll happened
```

#### What the handler returning and throwing mean

A handler that returns has handled the batch, so Yulin deletes it. A handler that throws has not, so
the whole batch is left on the queue: it stays hidden for the queue's visibility timeout and is
handed over again when that runs out, which is what a real worker crashing part way through a batch
does. A redrive policy therefore gives up on a message the handler keeps throwing on, exactly as it
would for the deployed container.

The error goes no further than the container. What the sender sees is the message coming back.

#### Polling is authorized as the task role

Receiving, deleting and reading the queue's visibility timeout are all made as the task definition's
`taskRoleArn`, and so is anything the handler itself does. A task role without `sqs:ReceiveMessage`,
`sqs:DeleteMessage` or `sqs:GetQueueAttributes` on the queue is refused, which surfaces from
`backgroundTasksComplete()` rather than being quietly allowed. That is the point of it: a policy that
would break the deployed worker breaks the test.

A task definition with no `taskRoleArn` polls anonymously and is denied at its very first poll, as a
real task with no credentials of its own would be.

#### Polling starts and stops with the service

Polling starts when the service's first task comes up and stops when the service is deleted, scaled
to zero, or its `SimAws` is closed. A stopped poller leaves nothing watching the queue and nothing
waiting on the clock, so a test that finishes with a consuming service leaves nothing behind it.

There is one poller per service and container, not one per task. A desired count of three is three
simulated tasks reported as running, and the handler is still called once per poll, which is the same
divergence the desired count already rests on. Three real containers would each run their own loop
and share the queue between them, which comes to the same messages being handled once.

A consuming container is the one kind a `RunTask` task cannot run. It has no handler that ends, and a
task has to end, so a task started from the same definition records the container as not simulated
with a reason saying to create a service instead.

### Serving requests behind a load balancer

A service container that answers HTTP requests declares `http` instead of `run` or `consumes`. The
handler is fetch-style: it is given a `Request` and answers with a `Response`, which is the same
shape a simulated load balancer already answers a served request with.

What reaches it is a request routed through simulated [Elastic Load Balancing](../elbv2/). A service
declares `loadBalancers` naming a target group, a container and a container port; creating the
service registers each of its tasks into that target group, and a request the load balancer forwards
there reaches the bound container's handler.

```typescript sim-ecs-serve-load-balancer
/**
 * A simulated ECS service answering requests behind a load balancer.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  CreateListenerCommand,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

import { SimAws } from "@kensio/yulin";
import { simElbV2Fetch } from "@kensio/yulin/elbv2";

const simAws = new SimAws();
const ecs = simAws.ecs();
const elbV2 = simAws.elbV2();

const targetGroup = await elbV2.createTargetGroup(
  new CreateTargetGroupCommand({
    Name: "orders-tg",
    TargetType: "ip",
    Protocol: "HTTP",
    Port: 8080,
  }),
);

const targetGroupArn = targetGroup.TargetGroups?.[0]?.TargetGroupArn;

const loadBalancer = await elbV2.createLoadBalancer(
  new CreateLoadBalancerCommand({ Name: "orders-alb" }),
);

await elbV2.createListener(
  new CreateListenerCommand({
    LoadBalancerArn: loadBalancer.LoadBalancers?.[0]?.LoadBalancerArn,
    Protocol: "HTTP",
    Port: 80,
    DefaultActions: [{ Type: "forward", TargetGroupArn: targetGroupArn }],
  }),
);

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));

ecs.bindContainer({
  family: "orders-api",
  containerName: "app",
  http: (request) => {
    const { pathname } = new URL(request.url);

    return Response.json({ path: pathname }, { status: 200 });
  },
});

await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "orders-api",
    containerDefinitions: [
      {
        name: "app",
        image: "orders-api:1",
        portMappings: [{ containerPort: 8080 }],
      },
    ],
  }),
);

await ecs.createService(
  new CreateServiceCommand({
    cluster: "orders",
    serviceName: "orders-api",
    taskDefinition: "orders-api",
    desiredCount: 2,
    loadBalancers: [
      { targetGroupArn, containerName: "app", containerPort: 8080 },
    ],
  }),
);

// The tasks come up in the background, as they do on real ECS, and each of
// them is registered in the target group as it starts.
await simAws.backgroundTasksComplete();

const dnsName = loadBalancer.LoadBalancers?.[0]?.DNSName;
const response = await simElbV2Fetch(simAws, `http://${dnsName}/orders/42`);

console.log(response.status); // 200
console.log(await response.json()); // { path: "/orders/42" }
```

The handler runs as the task role, with the container's environment applied, exactly as a container
consuming a queue or one run by `RunTask` does. So application code inside it builds an SDK client
from `process.env` and is authorized by simulated IAM against the role the task definition declared.

The container sees the request the client made, with the headers a load balancer writes in front of
a target: the `host` the client asked for, `x-forwarded-for`, `x-forwarded-proto`, `x-forwarded-port`
and `x-amzn-trace-id`. The URL is the AWS-facing one, so `new URL(request.url)` reads the name the
client asked for rather than a localhost one.

#### Which container of a task answers

Real ECS sends the request to the container the registration names, on the port it names. Yulin
diverges from that on purpose, and it is worth knowing why.

A great many deployed services put a proxy container, usually nginx, on the port the service
registers, with the application listening behind it. Yulin has nothing to run in place of that proxy:
there is no image to run and nothing a test could bind to it. Routing strictly by name and port would
therefore send every request to a container that does not exist here, and the service would answer
nothing however carefully it was set up.

So the request goes to a container that is bound:

- the container the registration names, when that container is bound;
- otherwise the bound container that declared the registration's `containerPort`, which is what
  chooses between two containers that both answer;
- otherwise the first bound container of the task.

```typescript
// A registration naming the proxy still reaches the application behind it.
loadBalancers: [{ targetGroupArn, containerName: "nginx", containerPort: 80 }];
```

A target group whose service has no bound container at all is answered with a 503 by the load
balancer, which is the honest answer: the tasks are registered and there is nothing behind them.

`RunTask` cannot run a serving container, for the same reason it cannot run a consuming one. It has
no handler that ends and no request to send it, so a task started from the same definition records
the container as not simulated with a reason saying to create a service instead.

### Updating and deleting a service

`UpdateService` changes the desired count, the task definition, or both. A new count starts or stops
tasks to reach it. A new revision moves the service onto it, which replaces every task the service is
running: real ECS replaces them a few at a time under a deployment configuration, and Yulin replaces
them at once because nothing here takes any time to start.

```typescript sim-ecs-update-service
/**
 * Scaling a simulated ECS service and moving it to a new revision.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));
await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
  }),
);
await ecs.createService(
  new CreateServiceCommand({
    cluster: "orders",
    serviceName: "checkout",
    taskDefinition: "checkout",
    desiredCount: 1,
  }),
);

const scaled = await ecs.updateService(
  new UpdateServiceCommand({
    cluster: "orders",
    service: "checkout",
    desiredCount: 4,
  }),
);

console.log(scaled.service?.desiredCount); // 4

const second = await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:2" }],
  }),
);

const deployed = await ecs.updateService(
  new UpdateServiceCommand({
    cluster: "orders",
    service: "checkout",
    taskDefinition: "checkout:2",
  }),
);

console.log(
  deployed.service?.taskDefinition === second.taskDefinition?.taskDefinitionArn,
); // true

await simAws.backgroundTasksComplete();

const listed = await ecs.listTasks(
  new ListTasksCommand({ cluster: "orders", serviceName: "checkout" }),
);

console.log(listed.taskArns?.length); // 4, all of them on the new revision
```

`DeleteService` stops the service and its tasks. A service still scaled above zero is refused unless
the request forces it, as real ECS refuses one, so scaling to zero first is the ordinary way round. A
deleted service is still describable as `INACTIVE`, and its name is free to create again.

```typescript sim-ecs-delete-service
/**
 * Deleting a simulated ECS service and the tasks it was keeping running.
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  DeleteServiceCommand,
  DescribeServicesCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const ecs = simAws.ecs();

await ecs.createCluster(new CreateClusterCommand({ clusterName: "orders" }));
await ecs.registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
  }),
);
await ecs.createService(
  new CreateServiceCommand({
    cluster: "orders",
    serviceName: "checkout",
    taskDefinition: "checkout",
    desiredCount: 2,
  }),
);
await simAws.backgroundTasksComplete();

const deleted = await ecs.deleteService(
  new DeleteServiceCommand({
    cluster: "orders",
    service: "checkout",
    force: true,
  }),
);

console.log(deleted.service?.status); // "INACTIVE"

const listed = await ecs.listTasks(
  new ListTasksCommand({ cluster: "orders", serviceName: "checkout" }),
);

console.log(listed.taskArns?.length); // 0

const described = await ecs.describeServices(
  new DescribeServicesCommand({ cluster: "orders", services: ["checkout"] }),
);

console.log(described.services?.[0]?.runningCount); // 0
```

Closing the simulated environment with `simAws.close()` stops the tasks of every service in it, and
nothing is left scheduled either way: a service is kept as state rather than by a timer, so a test
that finishes with a service running leaves nothing behind it.

## Deploying ECS from CloudFormation

`AWS::ECS::Cluster` creates a simulated cluster, `AWS::ECS::TaskDefinition` registers a simulated
task definition revision, and `AWS::ECS::Service` creates a simulated service running it, so a test
can start from the stack the application is actually defined in rather than from
`RegisterTaskDefinition` and `CreateService` calls written for the test.

`Ref` on a cluster returns the cluster name and `Fn::GetAtt` `Arn` returns its ARN. `Ref` on a task
definition returns the task definition ARN, revision and all, which is also what `Fn::GetAtt`
`TaskDefinitionArn` returns. Each deployment registers a new revision, as real CloudFormation does,
because a revision is immutable and a changed one is a new revision of the same family.

Containers are stored as declared, whatever their image, and what makes one of them run is an
executable binding supplied at deploy time, in the same `bindings` list a Lambda function handler is
supplied in. A container binding targets a container by family and container name, by the logical ID
of the task definition that declares it, or by the repository its image comes from.

```typescript sim-ecs-cloudformation-task-definition
/**
 * Deploying an ECS stack and binding a handler to one of its containers.
 */

import { RunTaskCommand } from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const processedOrders: string[] = [];

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      OrdersCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: { ClusterName: "orders" },
      },
      WorkerTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: "orders-worker",
          Cpu: "512",
          Memory: "1024",
          NetworkMode: "awsvpc",
          RequiresCompatibilities: ["FARGATE"],
          ContainerDefinitions: [
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1",
              Essential: true,
              Environment: [{ Name: "LOG_LEVEL", Value: "debug" }],
            },
          ],
        },
      },
    },
    Outputs: {
      TaskDefinition: { Value: { Ref: "WorkerTaskDefinition" } },
    },
  },
  bindings: [
    {
      family: "orders-worker",
      containerName: "app",
      run: async (): Promise<void> => {
        await Promise.resolve();
        processedOrders.push("outstanding orders");
      },
    },
  ],
});

await stack.waitForDeployComplete();

console.log(stack.outputs.get("TaskDefinition")?.value);
// "arn:aws:ecs:us-east-1:888888888888:task-definition/orders-worker:1"

// Running a task from the deployed task definition runs the bound handler.
await simAws
  .ecs()
  .runTask(
    new RunTaskCommand({ cluster: "orders", taskDefinition: "orders-worker" }),
  );

await simAws.backgroundTasksComplete();

console.log(processedOrders); // ["outstanding orders"]
```

A binding can name the task definition Resource instead, which is what a CDK stack gives a test to
name: the construct ID is accepted as well as the synthesized logical ID, and the container name can
be left out where the task definition declares one container. A binding naming an image repository
matches any container running an image from it, whichever family declares it, which covers a tag
that changes with every build.

```typescript sim-ecs-cloudformation-binding-targets
/**
 * Binding a container by the task definition Resource and by its repository.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      WorkerTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Metadata: { "aws:cdk:path": "OrdersStack/WorkerTask/Resource" },
        Properties: {
          Family: "orders-worker",
          ContainerDefinitions: [
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1",
            },
            {
              Name: "log-router",
              Image: "public.ecr.aws/aws-observability/aws-for-fluent-bit:1",
            },
          ],
        },
      },
      CheckoutTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: "orders-checkout",
          ContainerDefinitions: [
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/checkout:9f21c0",
            },
          ],
        },
      },
    },
  },
  bindings: [
    // The CDK construct ID, naming the container because this task definition
    // declares more than one.
    {
      logicalId: "WorkerTask",
      containerName: "app",
      run: (): void => {
        // Whatever the worker does.
      },
    },
    // Any container running an image from this repository, whatever its tag.
    {
      imageRepository: "example.dkr.ecr.eu-west-2.amazonaws.com/checkout",
      run: (): void => {
        // Whatever the checkout container does.
      },
    },
  ],
});

await stack.waitForDeployComplete();

console.log(simAws.ecs().taskDefinition("orders-worker").revision); // 1
```

A binding that resolves to no Resource in the stack fails the deployment naming the binding, since
the usual cause is a container renamed in the template and not in the test. A container with no
binding is a different thing: the stack deploys, the container is stored as declared, and it is
recorded as not simulated when a task runs, which is what lets a task definition holding a log
router and an observability agent alongside the application deploy and run.

A task definition's `TaskRoleArn` and `ExecutionRoleArn` resolve whether the template gives an ARN
or a `Ref` to an `AWS::IAM::Role` of the same stack, so a container's AWS calls are authorized as
the role the stack deploys.

### Deploying a service

`AWS::ECS::Service` creates a service in its cluster, keeping `DesiredCount` tasks of the task
definition it names running. `Cluster` takes a `Ref` to a cluster of the same stack or a cluster
ARN, and `TaskDefinition` takes a `Ref` to a task definition of the same stack, which pins the
revision the deployment registered, or an ARN, or a family. A container bound at deploy time is
running once the stack has deployed, because the service names the task definition and is created
after it.

`Ref` on a service returns the service ARN, which is also what `Fn::GetAtt` `ServiceArn` returns,
and `Fn::GetAtt` `Name` returns the service name. `simAws.ecs().service(name, cluster)` reads the
simulated service itself, by name in a cluster or by its full ARN.

```typescript sim-ecs-cloudformation-service
/**
 * Deploying an ECS service and reading what it is keeping running.
 */

import { ListTasksCommand } from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders",
  template: {
    Resources: {
      OrdersCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: { ClusterName: "orders" },
      },
      WorkerTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: "orders-worker",
          ContainerDefinitions: [
            {
              Name: "app",
              Image: "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1",
            },
          ],
        },
      },
      WorkerService: {
        Type: "AWS::ECS::Service",
        Properties: {
          ServiceName: "orders-worker",
          Cluster: { Ref: "OrdersCluster" },
          TaskDefinition: { Ref: "WorkerTaskDefinition" },
          DesiredCount: 2,
          LaunchType: "FARGATE",
        },
      },
    },
    Outputs: {
      Service: { Value: { Ref: "WorkerService" } },
      ServiceName: { Value: { "Fn::GetAtt": ["WorkerService", "Name"] } },
    },
  },
  bindings: [
    {
      logicalId: "WorkerTaskDefinition",
      run: (): void => {
        // Whatever the worker container does when something reaches it.
      },
    },
  ],
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

console.log(stack.outputs.get("Service")?.value);
// "arn:aws:ecs:us-east-1:888888888888:service/orders/orders-worker"
console.log(stack.outputs.get("ServiceName")?.value); // "orders-worker"

const service = simAws.ecs().service("orders-worker", "orders");

console.log(service.desiredCount); // 2

const listed = await simAws
  .ecs()
  .listTasks(
    new ListTasksCommand({ cluster: "orders", serviceName: "orders-worker" }),
  );

console.log(listed.taskArns?.length); // 2
```

A service the template does not name is named after the stack and the logical ID, as a cluster and a
family are, and a service declaring no `DesiredCount` keeps one task running, which is what real
CloudFormation gives a new service.

Updating the stack moves the service: a changed `DesiredCount` scales it, and a changed task
definition moves it onto the revision the update registered, replacing the tasks it was keeping.
Tearing the stack down deletes the service, stopping its tasks and leaving it `INACTIVE`, whatever
it was scaled to.

`LoadBalancers` registers the service's tasks into the target group it names, so a template that
declares a load balancer, a target group and a service deploys something that answers. The target
group has to exist and hold addresses, or the deployment fails naming it, and what the template
declared is readable on the simulated service:

```typescript
console.log(simAws.ecs().service("orders-worker", "orders").loadBalancers);
```

Everything else the three Resource types declare is stored as declared, or recorded as ignored where
this simulation has nothing to act on it with. `CapacityProviders`,
`DefaultCapacityProviderStrategy` and `ServiceConnectDefaults` on a cluster, `InferenceAccelerators`
and `EnableFaultInjection` on a task definition, and a service's `NetworkConfiguration`,
`CapacityProviderStrategy`, `DeploymentConfiguration` and `ServiceRegistries` among the rest, are
read and ignored rather than failing the stack, and each one is reported on the Resource:

```typescript
console.log(stack.resources.get("OrdersCluster")?.ignoredProperties);
```

## Authorization

Every operation is authorized by simulated IAM against the real ECS action.

Real ECS gives the task definition operations no resource type at all, and gives `CreateCluster`,
`ListClusters` and `ListTasks` none either, so all of those authorize against `*`. A policy naming a
task definition ARN grants none of them, here as on AWS. The operations that do take a resource are
`DescribeClusters` and `DeleteCluster`, which take the cluster's ARN, `RunTask`, which takes the
task definition revision it would run, `DescribeTasks` and `StopTask`, which take the task's ARN, and
the service operations, which take the service's ARN. `CreateService` authorizes against the ARN the
service is about to have, so a policy can name one service by name before it exists.

```typescript sim-ecs-iam-policy
/**
 * A simulated IAM policy allowing a Role to register task definitions.
 */

import { RegisterTaskDefinitionCommand } from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const accountId = simAws.defaultAccountId;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "Deployer",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: `arn:aws:iam::${accountId}:root` },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Deployer",
    PolicyName: "RegisterTaskDefinitions",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "ecs:RegisterTaskDefinition",
        // ECS gives this action no resource type, so only `*` grants it.
        Resource: "*",
      },
    }),
  }),
);

const registered = await simAws.ecs().registerTaskDefinition(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

console.log(registered.taskDefinition?.registeredBy); // the Role ARN
```

A registered revision records the caller that registered it as `registeredBy`, as real ECS does.

## Scoping by account and region

Clusters and task definitions belong to one account and region. A family registered in one region
has its own revision numbering and its own ARNs.

```typescript sim-ecs-scoping
/**
 * Simulated ECS state in two account and region scopes.
 */

import {
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const registered = await simAws
  .account("222222222222")
  .region("us-east-1")
  .ecs()
  .registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: "checkout",
      containerDefinitions: [{ name: "app", image: "checkout:1" }],
    }),
  );

console.log(registered.taskDefinition?.taskDefinitionArn);
// "arn:aws:ecs:us-east-1:222222222222:task-definition/checkout:1"

const elsewhere = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .ecs()
  .listTaskDefinitions(new ListTaskDefinitionsCommand({}));

console.log(elsewhere.taskDefinitionArns?.length); // 0
```

## Using it through an ECS SDK client

Ordinary SDK code reaches simulated ECS through `SimSdk`, without a Yulin type appearing in the code
under test.

```typescript sim-ecs-sdk-interception
/**
 * Reaching simulated ECS through an intercepted ECS SDK client.
 */

import {
  DescribeTaskDefinitionCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
simSdk.intercept(ECSClient);

const ecs = new ECSClient({ region: "eu-west-2" });

await ecs.send(
  new RegisterTaskDefinitionCommand({
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
  }),
);

const described = await ecs.send(
  new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
);

console.log(described.taskDefinition?.revision); // 1
```

## Available functionality

- `RegisterTaskDefinitionCommand`, with revisions numbered per family from one
- `DeregisterTaskDefinitionCommand`, marking one revision `INACTIVE`
- `DescribeTaskDefinitionCommand`, taking a family, a `family:revision` or a full ARN
- `ListTaskDefinitionsCommand` and `ListTaskDefinitionFamiliesCommand`, with prefix, status and
  paging
- `CreateClusterCommand`, `DescribeClustersCommand`, `ListClustersCommand` and `DeleteClusterCommand`
- `RunTaskCommand`, running the handlers bound to a task definition's containers, up to a `count` of
  ten tasks at a time
- `DescribeTasksCommand`, `ListTasksCommand` and `StopTaskCommand`
- Tasks run from an EventBridge rule target or a Scheduler schedule target, through that target's
  role
- `CreateServiceCommand`, keeping a desired count of tasks running from a task definition
- `UpdateServiceCommand`, changing the desired count, the task definition, or both
- `DescribeServicesCommand` and `DeleteServiceCommand`, with the `force` a scaled-up service needs
- `ListTasks` filtering by `serviceName`, so a service's tasks can be listed on their own
- `bindContainer`, targeting a container by family and container name or by image repository
- A container binding that `consumes` a simulated SQS queue, with Yulin driving the polling loop on
  the simulated clock while the service is running
- `AWS::ECS::Cluster`, answering `Ref` with the cluster name and `Fn::GetAtt` with `Arn`
- `AWS::ECS::TaskDefinition`, registering a revision and answering `Ref` with its ARN
- `AWS::ECS::Service`, running the task definition it names at the desired count it declares, and
  answering `Ref` with the service ARN and `Fn::GetAtt` with `Name` and `ServiceArn`
- A stack update that scales a service or moves it onto a new revision, and a teardown that deletes
  it
- A container binding that answers `http` requests, called once per request a load balancer routes
  to the container
- `loadBalancers` on a service, registering each of its tasks into the target group it names and
  deregistering them as they stop
- `LoadBalancers` on an `AWS::ECS::Service`, deploying into the same registration
- `simAws.ecs().service()`, reading a simulated service by name in a cluster or by its ARN
- Deploy-time container bindings, targeting a container by family and container name, by the task
  definition's logical ID or CDK construct ID, or by its image repository, and declaring `run` or
  `consumes` as a directly bound container does
- Task and execution roles resolved from a `Ref` to a same-stack role or from an ARN
- Container environment variables and `RunTask` container overrides, through `process.env`
- Container AWS calls authorized as the task role, including a `RunTask` `taskRoleArn` override
- Container `secrets` resolved from simulated Secrets Manager and SSM Parameter Store as the
  execution role, including a JSON key selector and a `SecureString` parameter
- Container definitions stored and reported as declared, whatever their image
- Task definition tags, reported under `include: ["TAGS"]`
- Cluster settings, configuration and tags, reported under their matching `include` values
- Authorization of every operation by simulated IAM, against the real IAM action and resource
- Clusters, task definitions, tasks and services scoped by account and region
- ECS SDK clients intercepted by `SimSdk`

## Limitations

Current documented limitations:

- Image contents are never read. An image URI is an identifier and nothing else, so no image is
  pulled, inspected or run, and a tag that does not exist on any registry is stored without
  complaint.
- A container definition field the `SimEcsContainerDefinitionType` shape does not name, such as
  `hostname` or `links`, is still stored and reported back. The shape names the fields the docs
  describe rather than every field ECS has, and it deliberately carries no index signature, since
  one would stop a real SDK command input being passed straight in.
- `ListTaskDefinitions` refuses a `status` of `DELETE_IN_PROGRESS`, which real ECS accepts. Nothing
  deletes a task definition here, so the answer would always be an empty listing, and refusing says
  so rather than looking like a result.
- Yulin creates no cluster on its own, including the `default` one, so a `RunTask` request naming no
  cluster needs one to have been created. An AWS account often has a `default` cluster already,
  created the first time ECS was used from the console.
- A container of a task definition with no `taskRoleArn` is denied every AWS call, rather than
  running with whatever credentials a container instance role might have supplied.
- Only a bound container runs. A container with no binding never starts and is reported with a reason
  saying so, and a task where nothing is bound stops with `TaskFailedToStart`.
- Containers run one after another in the order the task definition declares them, rather than
  alongside each other. `dependsOn`, `essential`, health checks and `startTimeout` are stored and
  ignored.
- `RunTask` refuses `networkConfiguration`, `capacityProviderStrategy`, `platformVersion`, `tags`,
  `placementConstraints`, `placementStrategy` and the rest of what it takes. There is no network and
  no capacity here for any of them to apply to.
- A `RunTask` override may name `taskRoleArn` and a container's `environment`. A `command`, `cpu` or
  `memory` override is refused, since Yulin never runs an image and nothing here has capacity.
- The execution role resolves container `secrets` and does nothing else. There is no image to pull
  and no log driver to write to.
- A container secret can only come from simulated Secrets Manager or simulated SSM Parameter Store.
  A `valueFrom` naming anything else stops the task rather than being ignored. Secret rotation is
  not simulated, so a task always reads the version that is current when it starts.
- A JSON key selector resolves only where the key holds a string. A key holding a number, a boolean
  or a nested object is refused, because an environment variable is text and real ECS does not
  document which text it would become.
- A secret holding a binary value is refused. Real ECS cannot put one in an environment variable
  either, but it reports the problem differently.
- `secretOptions` on a `logConfiguration` are stored and never resolved. There is no log driver here
  for them to configure.
- A task definition declaring `secrets` and no `executionRoleArn` fails when a task is run rather
  than when the revision is registered. Real ECS refuses the registration.
- An EventBridge or Scheduler target's `EcsParameters` takes `TaskDefinitionArn` and `TaskCount`
  only, taking and ignoring the launch type, platform version, network configuration and capacity
  provider strategy for the same reason `RunTask` refuses them: there is no placement and no network
  here. A `TaskCount` above one runs that many simulated tasks, and a bound container handler runs
  once for each of them, in this process and one after another.
- A rule or schedule target's `Input` is read as the task's overrides rather than as a payload,
  since a task has nowhere to receive one, so container environment variables are set with a
  `containerOverrides` list naming the container.
- A service's desired count is simulated as state rather than as concurrency. Three tasks exist and
  are reported as running, and the handler bound to a container is called once per request or per
  poll rather than once per task. Yulin runs in one Node.js process, so there is nothing to copy.
- A bound container of a service is treated as running and stays available until the service is
  deleted or its `SimAws` is closed. What calls its handler is whatever reaches it: a queue it
  consumes, or a request a load balancer routes to it.
- A consuming container's loop is Yulin's rather than the container's. A binding supplies what
  happens to a batch, and nothing tries to run a polling loop written inside your own container code,
  because an endless loop in a single Node.js process never yields to the test running it.
- A container can only consume a simulated SQS queue, in the same account and region as the service.
  Nothing else is a source, and a queue URL naming another scope reaches no queue.
- Yulin polls once per service and container rather than once per task, so a desired count above one
  does not hand a batch over more than once. It also polls in response to something rather than
  continuously: a message arriving, a batch coming back, or a full batch suggesting there is more
  waiting.
- Long polling is not simulated. A `WaitTimeSeconds` has nothing to mean when the queue says when
  there is something to poll for, so there is nothing to set.
- A consuming container handles a batch all or nothing. There is no partial batch response, which is
  a Lambda event source feature rather than something a worker container has.
- A consuming or serving container of a task started by `RunTask` records the same not-simulated
  reason an unbound container does. Neither has a handler that ends, and a run task has to end.
- A service's tasks come up all at once and are replaced all at once. There are no deployments,
  deployment controllers, circuit breakers or rolling replacement, so `DescribeServices` reports no
  `deployments` and no `events`, and `UpdateService` refuses `forceNewDeployment`.
- A service whose tasks fail to start does not start replacements for them. Real ECS keeps trying,
  which would be an endless retry in a test rather than a result to assert on, so the service
  reports the running count it actually has.
- A `loadBalancers` entry needs a `targetGroupArn`, a `containerName` and a `containerPort`, and the
  target group has to be an `ip` one in the service's own account and region. A `loadBalancerName`,
  which is the Classic Load Balancer form, is refused, and so is a target group that is not there.
- Which container of a task a request reaches diverges from real ECS on purpose. Real ECS routes to
  the container the registration names, on the port it names; here the request goes to a container
  that is bound, which is the one the registration names where it is bound, otherwise the bound
  container declaring the registration's port, otherwise the first bound one. The common real task
  puts an unsimulated proxy on the registered port, and routing strictly would reach a container
  that does not exist here.
- A service registered into a target group with no bound container is answered with a 503 by the
  load balancer. The tasks are registered and there is nothing behind them.
- A task is registered as a target as soon as the service starts it and deregistered as soon as it
  stops. There are no health checks, no target health states, no deregistration delay and no
  connection draining, and the address a task is registered under is counted rather than taken from
  a network interface that does not exist.
- Requests are not shared between a service's tasks. The desired count is state rather than
  concurrency, so a target group holding three targets calls one handler.
- `CreateService` refuses `serviceRegistries`, `networkConfiguration`, `deploymentConfiguration`,
  `capacityProviderStrategy` and the rest of what it takes. There is no network or capacity here for
  any of them to apply to.
- `UpdateService` changes the desired count and the task definition and nothing else, so a service's
  load balancer registration stays as it was created. Its tasks are registered and deregistered as
  the count changes.
- `CreateService` refuses a `schedulingStrategy` of `DAEMON`, which places one task on each container
  instance. There are no container instances here to place one on each of.
- `CreateService` needs a `desiredCount`, as a replica service does on real ECS, and it can be zero.
- A service's tasks are `startedBy` `ecs-svc/` and the service name. Real ECS uses `ecs-svc/` and a
  number, which would name nothing here.
- Service autoscaling and service discovery are not simulated, and neither is `ListServices`.
- `StartTask` is not simulated.
- Closing a `SimAws` stops the tasks of every service in it. The services stay describable with the
  desired count they had, and their tasks are not brought back.
- `DescribeTasks` refuses `include`, and a task carries no tags, so `RunTask` refuses `tags` too.
- `ListTasks` refuses a `desiredStatus` of `PENDING`, which real ECS accepts. A simulated task is
  wanted either running or stopped, so the answer would always be an empty listing.
- A stopped task is kept for as long as the simulation lasts. Real ECS stops reporting one about an
  hour after it stops.
- A task reports no `cpu`, `memory`, `connectivity`, `attachments` or `availabilityZone`. There is no
  capacity and no network here to report.
- A described task definition reports neither `compatibilities` nor `requiresAttributes`. Real ECS
  works both out from what the definition declares, which would mean reading a container
  definition's meaning.
- `RegisterTaskDefinition` refuses a setting this simulation does not hold, rather than dropping it.
  `inferenceAccelerators` and `enableFaultInjection` are refused for that reason.
- Nothing is defaulted. A revision registered without `networkMode` describes without one, rather
  than reporting the `bridge` real ECS would have chosen, because that value would be made up here.
- `CreateCluster` refuses `capacityProviders`, `defaultCapacityProviderStrategy` and
  `serviceConnectDefaults`. There is no capacity and no service discovery here to attach them to.
- `DescribeClusters` refuses `include` values of `ATTACHMENTS` and `STATISTICS`, and always reports
  zero for every count, tasks in the cluster included. `ListTasks` is what reports the tasks a
  cluster holds.
- `ListClusters` leaves out a deleted cluster, which is still describable by name or ARN as
  `INACTIVE`.
- `CreateCluster` with a name an active cluster already has hands that cluster back rather than
  raising, as real ECS does. The settings, configuration and tags on the second request are ignored.
- Deleting a cluster is immediate, and never fails for a cluster still holding running tasks or
  active services, which real ECS refuses. The services in it go on reporting what they are keeping.
- `DescribeClusters` reports zero services and zero tasks whatever the cluster holds.
  `DescribeServices` and `ListTasks` are what report those.
- Task definition and cluster tags are stored and reported, but `TagResource`,
  `UntagResource` and `ListTagsForResource` are not simulated.
- A cluster, task definition or service the template does not name gets a name composed from the
  stack name and the logical ID, without the random part real CloudFormation adds, so a test can
  predict it. A stack deployed twice under different names therefore gets two different families.
- A service that declares no `DesiredCount` keeps one task running, which is the default real
  CloudFormation documents for a new service. A `DesiredCount` written as the text of a number is
  taken as that number, since a String Parameter resolves to text, and anything else is refused
  naming the Resource and the property, a fraction of a task included.
- An update replaces a task definition Resource rather than updating it in place, so it registers a
  new revision and deregisters the one it replaced. The family accumulates revisions with only the
  newest one `ACTIVE`, where real CloudFormation leaves the earlier revisions active.
- An update replaces a service Resource as well, so a scaled or redeployed service is deleted and
  created again rather than updated. Its tasks stop and new ones start, and its ARN is unchanged as
  long as its name is, since a service ARN is its cluster and its name.
- A stack teardown deletes its cluster, leaving it `INACTIVE`, deregisters the revision it
  registered, leaving that `INACTIVE`, and deletes its service, leaving that `INACTIVE` too. None of
  them is removed, and revision numbers are not freed. The service is deleted with force, because
  real CloudFormation scales one to zero on its way out and nothing here needs the time that takes.
- CloudFormation property names are translated to the API's by lowering the first letter of each of
  them, all the way down, apart from `EFSVolumeConfiguration`,
  `FSxWindowsFileServerVolumeConfiguration` and `ProxyConfigurationProperties`, which the API spells
  differently. `DockerLabels`, `Options`, `DriverOpts` and `Labels` hold keys the template wrote, so
  those are left alone. A name outside all of that is stored under the name lowering gives it.
- `CapacityProviders`, `DefaultCapacityProviderStrategy` and `ServiceConnectDefaults` on a cluster,
  `InferenceAccelerators` and `EnableFaultInjection` on a task definition, and everything a service
  declares beyond its cluster, task definition, count, launch type, scheduling strategy and load
  balancers, are read and recorded as ignored rather than refused, where the equivalent SDK request
  is refused. A stack that will not deploy is worth less to a test than a Resource without a
  property nothing here acts on.
- A deploy-time binding is checked against the template as the stack is built, so a family, a
  container name or an image repository built from another Resource's attribute rather than written
  as a string resolves to nothing and fails the deployment.
- A `TaskRoleArn` or `ExecutionRoleArn` given as a `Ref` to a role resolves to the role name, which
  is turned into the ARN that name would have at the default path. A role declaring a `Path` of its
  own therefore resolves to an ARN without it. This is what an `AWS::Lambda::Function` `Role` already
  does, so the two agree, and naming the role by `Fn::GetAtt` `Arn` gets the real ARN either way.
- Cluster and family names are validated to the 255 letters, numbers, hyphens and underscores real
  ECS accepts, but error messages differ from the real ones.
- Account-wide limits do not exist, so no request fails for having registered too many task
  definitions or created too many clusters.
- ECS is not served as an HTTP API by `serveSimAws`.
