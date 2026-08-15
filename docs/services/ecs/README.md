# Simulated ECS

Yulin includes a simulated Amazon ECS for tests and local development. It holds clusters and task
definitions in memory, runs tasks from handlers you bind to their containers, and authorizes every
operation with simulated IAM.

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
The shape is settled, but nothing serves a container yet, so binding one is refused rather than
accepted and never called.

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
or simulated SSM Parameter Store according to the ARN each one names, and the values appear in the
container's environment alongside its declared `environment`. A handler reads them through
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

```
ResourceInitializationError: unable to pull secrets: DB_PASSWORD: User:
arn:aws:iam::111111111111:role/OrdersExecutionRole is not authorized to perform:
secretsmanager:GetSecretValue on resource: arn:aws:secretsmanager:...
```

The task stops with `TaskFailedToStart` and never reaches `RUNNING`, so the bound handler does not
run. A secret that does not exist, a task definition declaring secrets with no `executionRoleArn`,
and a JSON key the secret has not got each stop it the same way with their own reason.

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

## Authorization

Every operation is authorized by simulated IAM against the real ECS action.

Real ECS gives the task definition operations no resource type at all, and gives `CreateCluster`,
`ListClusters` and `ListTasks` none either, so all of those authorize against `*`. A policy naming a
task definition ARN grants none of them, here as on AWS. The operations that do take a resource are
`DescribeClusters` and `DeleteCluster`, which take the cluster's ARN, `RunTask`, which takes the
task definition revision it would run, and `DescribeTasks` and `StopTask`, which take the task's ARN.

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
- `bindContainer`, targeting a container by family and container name or by image repository
- Container environment variables and `RunTask` container overrides, through `process.env`
- Container AWS calls authorized as the task role, including a `RunTask` `taskRoleArn` override
- Container `secrets` resolved from simulated Secrets Manager and SSM Parameter Store as the
  execution role, including a JSON key selector and a `SecureString` parameter
- Container definitions stored and reported as declared, whatever their image
- Task definition tags, reported under `include: ["TAGS"]`
- Cluster settings, configuration and tags, reported under their matching `include` values
- Authorization of every operation by simulated IAM, against the real IAM action and resource
- Clusters, task definitions and tasks scoped by account and region
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
- `StartTask` and the whole of the service API (`CreateService`, `UpdateService`,
  `DescribeServices`) are not simulated.
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
- Deleting a cluster is immediate, and never fails for a cluster holding tasks or services, because
  there are none to hold.
- Task definition and cluster tags are stored and reported, but `TagResource`,
  `UntagResource` and `ListTagsForResource` are not simulated.
- There are no ECS CloudFormation resource types yet. `AWS::ECS::Cluster` and
  `AWS::ECS::TaskDefinition` are reported as unsupported and skipped rather than deployed.
- Cluster and family names are validated to the 255 letters, numbers, hyphens and underscores real
  ECS accepts, but error messages differ from the real ones.
- Account-wide limits do not exist, so no request fails for having registered too many task
  definitions or created too many clusters.
- ECS is not served as an HTTP API by `serveSimAws`.
