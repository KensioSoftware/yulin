# Simulated ECS

Yulin includes a simulated Amazon ECS for tests and local development. It holds clusters and task
definitions in memory, and every operation is authorized by simulated IAM.

Nothing runs yet. Registering a task definition and describing it back is what this covers.

ECS-specific types are imported from the `@kensio/yulin/ecs` subpath.

## What Yulin does with a container image

Yulin never looks inside a container image. It cannot: an image may hold a Go binary, nginx, Redis or
anything else, and the only thing Yulin can run is JavaScript or TypeScript in its own process.

So an image URI is only ever an identifier. It is what a container will be matched on when a task is
run, in the same way an image URI identifies a container image Lambda function. A container matched
to a handler runs it. A container with no match does not run, and is recorded as not simulated rather
than failing anything.

A realistic task definition holds an application container, a log router and an observability agent.
Only the first of those is something Yulin could ever run, and the other two are stored and reported
back exactly as declared.

Where this does not work is a sidecar the application depends on, such as a Redis or a database in
the same task. Yulin does not simulate that. The connection details are ordinary environment
variables, so point them at a real one you run yourself.

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
Both list what is active unless the request asks otherwise, and both take a `familyPrefix`.

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
creating a cluster of the same name again makes a new active one.

A cluster is named either by its short name or by its full ARN, and the two are interchangeable. An
ARN belonging to another account or region names a different cluster, so `DescribeClusters` reports
it as a `MISSING` failure and `DeleteCluster` refuses it.

## Authorization

Every operation is authorized by simulated IAM against the real ECS action.

Real ECS gives the task definition operations no resource type at all, and gives `CreateCluster` and
`ListClusters` none either, so all of those authorize against `*`. A policy naming a task definition
ARN grants nothing, here as on AWS. `DescribeClusters` and `DeleteCluster` are the two that do take
a resource, which is the cluster's ARN.

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
- Container definitions stored and reported as declared, whatever their image
- Task definition tags, reported under `include: ["TAGS"]`
- Cluster settings, configuration and tags, reported under their matching `include` values
- Authorization of every operation by simulated IAM, against the real IAM action and resource
- Clusters and task definitions scoped by account and region
- ECS SDK clients intercepted by `SimSdk`

## Limitations

Current documented limitations:

- Image contents are never read. An image URI is an identifier and nothing else, so no image is
  pulled, inspected or run, and a tag that does not exist on any registry is stored without
  complaint.
- Nothing runs. `RunTask`, `StartTask`, `StopTask`, `DescribeTasks`, `ListTasks` and the whole of the
  service API (`CreateService`, `UpdateService`, `DescribeServices`) are not simulated.
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
  zero for every count. A simulated task runs in this process rather than on an instance, so there
  is nothing to count.
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
