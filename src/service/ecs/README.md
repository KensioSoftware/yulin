# Simulated ECS implementation

This directory contains the simulated ECS service implementation.

Nothing runs here. This is the state ECS holds: clusters, and task definitions with their container
definitions and revisions. Running a task reads from it and comes separately.

## The container model

Everything in simulated ECS rests on one decision, so it is stated here as well as in the usage
docs.

Yulin never looks inside a container image. It cannot: an image may hold a Go binary, nginx, Redis
or anything else, and the only thing Yulin can run is JavaScript or TypeScript in its own process.
An image URI is therefore only ever an identifier, used to match a container against an executable
binding, exactly as it is for a container image Lambda function.

That gives one rule, which running a task will follow when it arrives: a container with a binding
will run the bound handler, and a container without one will not run and will be recorded as not
simulated rather than failing anything. Nothing here runs anything yet. A realistic task definition
holds an application container plus a log router plus an observability agent, and only the first of
those is something Yulin could ever run.

Where this genuinely does not work is a sidecar the application depends on, such as a Redis or a
database in the same task. That is not simulated and should not be. The application's connection
details are ordinary environment variables, so a user who wants a real one points at their own.

The consequence for the code here is that nothing reads a container definition's meaning.
`SimEcsContainerDefinition` keeps the declaration as it was made and hands it back unchanged, and
the only two fields it looks at are `name`, which is how everything else refers to a container, and
`image`, which is the identifier a binding is matched on.

## Entry points

- `sim-ecs.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public ECS simulator API for `@kensio/yulin/ecs`.

A `SimEcs` instance owns a `SimEcsClusterStore` and a `SimEcsTaskDefinitionStore`. Both are scoped
to an account and region because ECS scopes them that way: a cluster ARN and a task definition ARN
both name their region, and a cluster name is unique within one account and region rather than
globally.

## Cluster model

Cluster state lives under `cluster/`.

`SimEcsCluster` is the stored resource. It reports zero for every count a described cluster carries,
because there is nothing here to count: a simulated task runs in this process rather than on an
instance. Deleting marks it `INACTIVE` rather than removing it, so something holding its ARN can
still find out what became of it, and creating a cluster of the same name again replaces it with a
new active one.

`SimEcsClusterArn` builds a cluster ARN and reads one back. Reading answers with nothing rather than
raising, because the two operations that read one report a cluster they cannot find differently:
`DescribeClusters` reports a failure entry and `DeleteCluster` raises.

## Task definition model

Task definition state lives under `task-definition/`.

`SimEcsTaskDefinitionStore` holds families rather than a flat list of revisions, because a family is
what a registration adds to and what a describe resolves against. `SimEcsTaskDefinitionFamily` owns
the revision numbering: revisions start at one and only ever go up, and deregistering does not free
a number, because the number is part of an ARN that other things hold.

`SimEcsTaskDefinitionId` is the part that turns the three forms a task definition can be named by
into a family and, where there is one, a revision. A family with no revision is what makes naming a
family alone mean its latest active revision.

`parseSimEcsArn` is ECS's own ARN reader, unlike every other service here, which uses the shared
`parseSimArn`. A task definition ARN carries a colon inside its resource part, in
`task-definition/family:revision`, and the shared reader stops at the sixth colon. That would cut
the revision off the end and leave every revision of a family looking like the same ARN.

`SimEcsTaskDefinitionSettings` holds what a registration declared besides its family and containers.
It keeps only what the request set, so a described revision reports what was declared rather than
whatever value real ECS would have defaulted it to. A setting this simulation does not model is
refused at the command rather than dropped, through `SimEcsUnsimulatedInput`: a registration is a
declaration, and a declaration silently missing from the revision it made is state a test could pass
against without it being what was asked for.

## Command handling

AWS SDK-style operations are implemented under `command/`, one directory per operation, so the
`SimEcs` facade stays a delegation. `command/sim-ecs-command-context.ts` holds what each kind of
handler is built with, split between the cluster operations and the task definition ones.

`SimEcsCommandHandler` is what each handler extends. Every operation starts the same way: it refuses
the inputs it does not hold, waits at the simulator's sequencing point, and authorizes the caller.
Keeping those three in one place is what stops nine handlers drifting apart on the order they happen
in, which is the order that decides whether a malformed request or an unauthorized one is reported
first.

As elsewhere, implementation code under `src/` does not import real AWS SDK packages. The structural
command types in `*.command.ts` match the SDK shapes closely enough for callers to pass real SDK
command instances.

## Authorization

`SimEcsAuthorizer` splits requests two ways, as real ECS does:

- `DescribeClusters` and `DeleteCluster` authorize against the cluster's ARN, so a policy can name
  one cluster;
- everything else authorizes against `*`, because real ECS gives the task definition operations no
  resource type at all, and gives `CreateCluster` and `ListClusters` none either. A policy naming a
  task definition ARN grants nothing, here as on AWS.

## Divergences worth knowing

- `ListClusters` leaves out a deleted cluster. It is still describable by name or ARN as `INACTIVE`.
- `DescribeClusters` refuses `include` values of `ATTACHMENTS` and `STATISTICS`. Both describe
  capacity a cluster has attached to it, and there is none here, so answering would mean reporting
  made-up numbers as though they had been counted.
- A described task definition reports neither `compatibilities` nor `requiresAttributes`. Real ECS
  works both out from what the definition declares, which would mean reading a container definition's
  meaning.
- `CreateCluster` refuses capacity providers and Service Connect defaults, and
  `RegisterTaskDefinition` refuses any setting it does not model.
- `ListTaskDefinitions` refuses a `status` of `DELETE_IN_PROGRESS`, which real ECS accepts, because
  nothing deletes a task definition here for one to describe.
- `SimEcsContainerDefinitionType` carries no index signature. One would stop a real SDK
  `RegisterTaskDefinitionCommand` input being assignable to it, which is the whole point of the
  structural types. A field it does not name is stored and reported back all the same.
- The full list is in [docs/services/ecs](../../../docs/services/ecs/).
