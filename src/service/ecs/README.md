# Simulated ECS implementation

This directory contains the simulated ECS service implementation.

It holds the state ECS holds, which is clusters and task definitions with their container
definitions and revisions, and it runs tasks from the handlers bound to those containers.

## The container model

Everything in simulated ECS rests on one decision, so it is stated here as well as in the usage
docs.

Yulin never looks inside a container image. It cannot: an image may hold a Go binary, nginx, Redis
or anything else, and the only thing Yulin can run is JavaScript or TypeScript in its own process.
An image URI is therefore only ever an identifier, used to match a container against an executable
binding, exactly as it is for a container image Lambda function.

That gives one rule, which running a task follows: a container with a binding runs the bound
handler, and a container without one does not run and is recorded as not simulated rather than
failing anything. A realistic task definition holds an application container plus a log router plus
an observability agent, and only the first of those is something Yulin could ever run.

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

A `SimEcs` instance owns a `SimEcsClusterStore`, a `SimEcsTaskDefinitionStore`, a `SimEcsTaskStore`
and the `SimEcsContainerBindings` for its scope. All of them are scoped to an account and region
because ECS scopes them that way: a cluster ARN, a task definition ARN and a task ARN all name their
region, and a cluster name is unique within one account and region rather than globally. Bindings
follow the task definitions they target, so a binding made in one scope reaches no container in
another.

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

## Binding model

Executable bindings live under `bind/`.

`SimEcsContainerBinding` is the shape a user writes. It targets a container either by family and
container name or by image repository, and carries either a `run` handler or an `http` one. The HTTP
shape is settled here even though nothing serves a container yet, so that a service container behind
a load balancer does not have to renegotiate it: it is fetch-style, matching what
`SimAwsServiceController` already answers a served request with. Binding one is refused rather than
held, since a binding that is never called is worse than one that says so.

`SimEcsBoundContainer` reads a binding once, as it is made, and refuses one that could never match.
Binding is something a test does while setting up, so the mistake is worth reporting there rather
than at the end of a task run that quietly did nothing. Image repository matching reuses
`SimCfnImageRepositoryTarget` rather than repeating it, so a repository means the same thing to a
container as it does to a container image Lambda function.

`SimEcsContainerBindings` owns the order two matching bindings are resolved in: a binding naming the
container beats one naming a repository, and the most recent of equally specific bindings wins, so
binding the same container again replaces what it runs.

## Task model

Task state lives under `task/`, and what runs one lives under `task/run/`.

`SimEcsTask` splits into `SimEcsTaskIdentity` and `SimEcsTaskLifecycle`, because only the second of
them ever changes: a task is named by its cluster and the revision it came from, and what moves is
where it has got to. The lifecycle records a stop once, so a task that `StopTask` asked to stop keeps
that reason rather than having the run's reason written over it.

`SimEcsTaskContainer` is a task's record of one declared container. A container that ran carries an
exit code and one that did not carries a reason instead, which is the difference between a container
that exited zero and one Yulin left alone.

`SimEcsTaskRunner` schedules a task's containers on the simulator's background scheduler, so
`RunTask` answers with a task that has not started, as real ECS does. Containers run one after
another in declaration order. Real ones run alongside each other and `dependsOn` is what orders them
there, but nothing in this process gains from overlapping in-process handlers, and running them in
order keeps what a test sees deterministic. The runner checks the task's desired status before each
container, which is what makes `StopTask` stop a run part way through.

`SimEcsContainerRunner` runs one container: it finds the binding, applies the environment, and runs
the handler as the task Role. The task Role is applied through `simAwsRunAsContext`, exactly as a sim
Lambda function applies its execution Role, so a container's AWS calls are authorized the way the
deployed one's would be. A definition with no task Role runs its containers anonymously, which is
the one thing the ambient caller must not be left alone for: the background work that runs the
containers keeps the `RunTask` caller's context, so leaving it would attribute a container's calls
to whoever started the task.

`SimEcsContainerEnvironment` merges the container definition's `environment` with its resolved
secrets, any `RunTask` override and the Region variables, and applies them through
`simProcessEnvironment`, the shared `process.env` patch under `util/process/`. It is shared with
simulated Lambda because it patches a process global: two of them would each install a getter, and
the second would capture whatever the first was reporting as its host environment.

## Container secrets

What resolves a container's `secrets` lives under `task/run/secret/`.

The whole task is resolved before any container runs, which is what makes an unreadable secret a
`TaskFailedToStart` rather than a container that failed. Real ECS pulls a task's secrets while it is
still provisioning, so resolving one container at a time would let an earlier container run on a
task that was never going to work.

`SimEcsTaskSecrets` is the resolver and `SimEcsResolvedSecrets` is what it answers with, holding
either every container's variables or the reason the task cannot start. It is a result object rather
than a thrown error because the runner has to record the reason on the task and stop it, and there
is nowhere above it for an error to go: `RunTask` answered long before this happens.

`SimEcsContainerSecrets` resolves one container's entries as the task definition's
`executionRoleArn`. Reading goes through simulated Secrets Manager's and simulated SSM's ordinary
commands with that caller, rather than their state, so simulated IAM decides it exactly as it
decides a call an application makes. A definition declaring secrets and no execution Role says so
rather than reading anonymously and being denied, since forgetting it is the ordinary way to get
here and the denial would name nobody.

`parseSimEcsSecretReference` reads a `valueFrom`. It cannot use the shared `parseSimArn`, for the
same reason ECS's own ARNs cannot: a Secrets Manager `valueFrom` carries a JSON key, a version stage
and a version id after the secret id, all separated by colons. `sim-ecs-secret-arn.ts` holds the
part positions and the small readers the two forms share.

`SimEcsSecretStores` is the seam between ECS and the two stores. `SimAwsEcsSecretStores` is the
implementation a SimAws instance supplies, resolving each reference in the Account and Region its
ARN names, and `SimEcsUnreachableSecretStores` is what simulated ECS built on its own gets, so a
container declaring a secret there says what is missing rather than running without the variable.

## Event and schedule targets

`target/` holds what an EventBridge rule target or a Scheduler schedule target says about the task it
runs. It lives here rather than in either of those services because both say the same things in the
same words: `EcsParameters` names the task definition and how many tasks, and the target's `Input` is
the task's overrides, since a task has nowhere to receive a payload. Two copies of that would be two
answers to what a target may ask ECS for.

`SimEcsTargetParameters` refuses a parameter it does not model rather than dropping it, and takes the
four that describe placement and networking without doing anything with them: a target written for
real AWS carries them, and refusing one would make an otherwise workable target unusable, where
dropping a `Group` or a `PropagateTags` would leave a target looking configured and behaving as
though it is not.

`SimEcsTargetRun` runs the task through the `RunTask` command rather than through the task runner
behind it, so a task a rule started is the same task as one a caller started: the same lookups, the
same refusals, and the same IAM decision against `ecs:RunTask` for the role the target carries. What
neither service holds is a second answer to whether that role may run the task.

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

`SimEcsAuthorizer` splits requests by the resource type each action takes, as real ECS does:

- `DescribeClusters` and `DeleteCluster` authorize against the cluster's ARN, so a policy can name
  one cluster;
- `RunTask` authorizes against the task definition revision it would run, which is why the revision
  is resolved before the caller is authorized: a family named on its own does not say which revision
  that is;
- `DescribeTasks` and `StopTask` authorize against the task's ARN, and `DescribeTasks` authorizes
  each task it was given separately, so a policy can name one task;
- everything else authorizes against `*`, because real ECS gives the task definition operations no
  resource type at all, and gives `CreateCluster`, `ListClusters` and `ListTasks` none either. A
  policy naming a task definition ARN grants none of those, here as on AWS.

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
  nothing deletes a task definition here for one to describe. `ListTasks` refuses a `desiredStatus`
  of `PENDING` for the same reason: a simulated task is wanted either running or stopped.
- `RunTask` refuses everything about networking, capacity and placement, and refuses an override
  naming a container the task definition does not declare. The last one is the refusal worth having:
  the usual cause is a container renamed in the definition and not in the test.
- A container secret's JSON key selector resolves only where the key holds a string, and a binary
  secret is refused outright. An environment variable is text, and real ECS does not document what
  text a number or a nested object would become, so choosing one here would be inventing behaviour.
- A task with no bound container stops with `TaskFailedToStart` rather than
  `EssentialContainerExited`. Nothing started, and saying so is what makes a binding that matches
  nothing visible.
- `SimEcsContainerDefinitionType` carries no index signature. One would stop a real SDK
  `RegisterTaskDefinitionCommand` input being assignable to it, which is the whole point of the
  structural types. A field it does not name is stored and reported back all the same.
- The full list is in [docs/services/ecs](../../../docs/services/ecs/).
