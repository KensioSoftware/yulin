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

The consequence for the code here is that almost nothing reads a container definition's meaning.
`SimEcsContainerDefinition` keeps the declaration as it was made and hands it back unchanged. It
looks at `name`, which is how everything else refers to a container, and `image`, which is the
identifier a binding is matched on. The one addition is `portMappings`, read for a single question:
which container of a task a load balancer's declared container port means, where more than one of
them is bound.

## Entry points

- `sim-ecs.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public ECS simulator API for `@kensio/yulin/ecs`.

A `SimEcs` instance owns a `SimEcsClusterStore`, a `SimEcsTaskDefinitionStore`, a `SimEcsTaskStore`,
a `SimEcsServiceStore` and the `SimEcsContainerBindings` for its scope, all of them through
`SimEcsCommands`. All of them are scoped to an account and region
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
container name or by image repository, and carries one of three things: a `run` handler, a `consumes`
declaration, or an `http` handler. The HTTP shape is fetch-style, matching what
`SimAwsServiceController` already answers a served request with, so a container and a Lambda function
behind the same listener answer in the same terms.

`SimEcsBoundContainerWork` is what the binding says the container does, read once as it is made.
`SimEcsBoundQueueConsumer` is the `consumes` half: the queue URL turned into the ARN everything else
names a queue by, a batch size SQS would actually hand out, and the handler. All three are settled at
binding time because binding is what a test does while setting up, and a consuming container that
could never poll would otherwise poll for the whole test and deliver nothing.

Neither a consuming nor a serving binding has a `run` handler, which is why
`SimEcsBoundContainer.runHandler` refuses rather than answering with nothing: what one supplies is
the body of a loop and the other an answer to a request, and a run task has neither a loop nor a
request.

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
secrets, any `RunTask` override and the Region variables, lays them over the host process
environment, and applies the result through `simProcessEnvironment`, the shared `process.env` patch
under `util/process/`. It is shared with simulated Lambda because it patches a process global: two
of them would each install a getter, and the second would capture whatever the first was reporting
as its host environment.

The host variables are read for each run. A variable the test process sets between two runs reaches
the second of them. Every container gets the Region variables, whatever its definition
declares. Without them an SDK client the container builds resolves its Region from the machine the
test happens to run on, and its calls land in a Region the simulated task knows nothing about.

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

## Service model

Service state lives under `service/`, and what keeps a service's tasks running lives under
`service/run/`.

A service is the first ECS thing here that keeps running rather than running and finishing, and one
decision settles what that means. A desired count of three cannot be three copies of one in-process
handler, because Yulin runs in a single Node.js process and there are no containers to copy. The
count is therefore kept as state: `SimEcsServiceTasks` starts that many simulated tasks, they are
reported as running, and the handler bound to a container is called once per request or per poll
rather than once per task. That divergence is stated in the usage docs as well as here, because a
test could otherwise read a running count of three as three things happening at once.

`SimEcsService` splits into `SimEcsServiceIdentity`, which is what the service is, and what the
service is being kept at, which is the only part that changes. The tasks it is keeping are held in a
`SimEcsServiceTaskSet` of its own, because the running and pending counts are read from them and
because a task it has stopped leaves the set while staying in the task store. Nothing in the service
schedules anything: whatever starts and stops tasks takes them from the set to stop them.

`SimEcsServiceTasks` is that whatever. It reconciles a service to its desired count, replaces every
task when the service moves to another revision, and stops the lot when the service is deleted or the
simulated environment is closed. Starting goes through `SimEcsServiceTaskStarter`, which puts a task
in the store straight away and schedules it to reach `RUNNING` on the simulator's background
scheduler, so a task is listed as soon as the request is answered and a service deleted in between
brings nothing up. Stopping is immediate, because there is nothing here to drain.

`SimEcsServiceContainers` brings one task's containers up, which is where a service container differs
from a task container: no handler is run to completion. A bound container is marked running and left
available for whatever reaches it, and an unbound one records the same not-simulated reason a run
task's container does, from the shared `sim-ecs-container-reason.ts` rather than a second copy of the
wording. `SimEcsServiceConsumption` and `SimEcsServiceServing` are what a bound container is then
handed to, the first starting the polling behind a `consumes` binding and the second taking on an
`http` one as a container that answers. Both run here because this is where the task's secrets have
just been resolved, so either handler reads the same environment a run task's container would.

## Consuming a queue

What a container bound to consume a queue does lives under `service/consume/`.

The loop itself is not here. `SimSqsQueuePoller`, in sim SQS, is the receive-hand-over-delete loop
every simulated consumer of a queue uses, and the same one a Lambda event source mapping polls
through; the divergence it exists for is stated in the usage docs. A real worker image writes that
loop itself, and a bound handler cannot: an endless loop in a single Node.js process never yields to
the test running it. So Yulin drives the loop and the binding supplies its body.

`SimEcsContainerConsumer` is that body. It answers each poll with the caller to make it as, which is
the task Role, the batch size the binding declared, and what to do with a batch: run the handler
under the task Role and the container's environment, delete the batch when it returns, and leave the
whole batch on the queue when it throws. Receiving and deleting carry the task Role explicitly rather
than relying on the ambient caller, so a task Role without `sqs:DeleteMessage` behaves the way the
deployed container would.

`SimEcsServiceConsumers` holds one poller per service and container, not per task. That follows the
decision the desired count already rests on: three tasks are state rather than three copies of a
handler, so a handler is called once per poll however many tasks are reported running. Three real
containers would each run their own loop and share the queue between them, which comes to the same
messages being handled once.

Polling starts when a service's first task comes up and stops when the service is deleted, scaled to
nothing, or the simulated environment is closed, all of which reach `SimEcsServiceTasks`. A stopped
poller leaves nothing watching the queue and no turn waiting on the clock, so a test finishing with a
consuming service leaves nothing behind it.

`SimEcsUnreachableConsumerQueues` is what a simulated ECS built on its own gets, so a consuming
container there says what is missing rather than polling nothing.

`SimEcsServiceStore` keys services by cluster and name together, because a service name is unique
within a cluster on real ECS rather than across an Account.

## Answering a request

What a service container answers a request with lives under `service/serve/`.

`SimEcsContainerServer` is one container of a running service, holding what it needs to answer:
the handler, the environment the task's secrets resolved to, and the task Role. It answers as that
Role, through `simAwsRunAsContext`, exactly as a run task's container and a consuming container do,
so a served request's AWS calls are authorized the way the deployed container's would be.

`SimEcsServiceServers` holds one per service and container rather than one per task, for the same
reason `SimEcsServiceConsumers` does: the desired count is state rather than concurrency, so a
handler is called once per request however many tasks are reported running. They are held here
rather than on the service because a service is state a request can read and a server is the running
thing behind it, which is what gives deleting or scaling in a service somewhere to take them away.

`SimEcsTargetGroupContainers` is the hop a load balancer makes, from a target group ARN to the
container that answers for it. Which service that is comes from reading the services back rather
than from a record kept on the target group, for the same reason simulated ELBv2 reads back which
load balancers forward to a group: a record the service could change without the group hearing about
it would go stale.

Which container of that service answers is the deliberate divergence this part exists for. Real ECS
routes to the container the registration names, on the port it names, and the common real task puts
a proxy such as nginx on that port with the application behind it. Yulin has nothing to run in place
of the proxy, so routing strictly by name and port would send every request to a container that does
not exist here. The request goes to a bound container instead: the one the registration names where
it is bound, otherwise the one that declared the registration's port, otherwise the first one the
task definition declares. A service with no bound container at all is nothing, which the load balancer answers 503 for.

## Registering a service's tasks

What puts a service's tasks in a target group lives under `service/load-balancer/`.

`SimEcsServiceRegistration` is one `loadBalancers` entry read once, as the request is read and
before anything is looked up. It requires the three things real ECS requires, refuses the Classic
Load Balancer form, and refuses a target group outside the service's own Account and Region. That
last one is what makes the registration reachable from both ends: the tasks go into that scope's
target group, and a request routed to that group finds this service in the same place.

`SimEcsServiceTargets` registers a task as the service starts it and takes it out again as it stops,
which is what leaves a scaled-in or deleted service's target group with nothing in it. The address a
task is registered under is held here rather than on the task, because it is the load balancer's way
of naming a task rather than anything ECS reports about one, and `SimEcsTaskAddresses` counts them
out of the private range as simulated ELBv2 counts its ARN ids.

`SimEcsTargetGroups` is the seam to ELBv2, and it is a lookup rather than an operation:
`SimAwsEcsTargetGroups` writes the targets to the target group itself rather than sending
`RegisterTargets`. There is no caller to send one as. Real ECS registers a task through the
service-linked role, which is not something a test creates or could take away, so there would be
nothing for simulated IAM to decide. `SimEcsUnreachableTargetGroups` is what a simulated ECS built on
its own gets, so a service declaring a load balancer there says what is missing rather than being
created with a registration that could never carry a request.

## Command handling

AWS SDK-style operations are implemented under `command/`, one directory per operation, so the
`SimEcs` facade stays a delegation. `SimEcsCommands` builds the state and the handlers, which leaves
the facade with one method per operation and nothing else; it is also what `SimEcs.close()` reaches
to stop what the services are running. `command/sim-ecs-command-context.ts` holds what each kind of
handler is built with, split between the cluster, task definition, task and service operations.

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
- the service operations authorize against the service's ARN, `CreateService` against the ARN the
  service is about to have, and `DescribeServices` authorizes each service it was given separately;
- everything else authorizes against `*`, because real ECS gives the task definition operations no
  resource type at all, and gives `CreateCluster`, `ListClusters` and `ListTasks` none either. A
  policy naming a task definition ARN grants none of those, here as on AWS.

## CloudFormation

`cfn/` holds what deploys `AWS::ECS::Cluster`, `AWS::ECS::TaskDefinition` and `AWS::ECS::Service`,
under the rule the CloudFormation engine works by: CloudFormation orchestrates and the service
creates. All three go through the ordinary `CreateCluster`, `RegisterTaskDefinition` and
`CreateService` commands rather than constructing state directly, so a Resource a template deployed
is the same thing an SDK caller would have got, refusals included.

`property/sim-cfn-ecs-api-shape.ts` is the piece with the most in it. CloudFormation writes an ECS
declaration in the API's own shape with the first letter of every name upper cased, so translating
one is mechanical, and doing it in one place is what lets a container definition, a cluster
configuration and a task definition's volumes all be stored as declared without anything reading what
they mean. What it cannot be mechanical about is named there: the handful of names the API spells
differently, and the maps whose keys the user wrote.

`SimCfnEcsDeclaredTaskDefinition` reads a task definition Resource before anything has been created
from it. A Stack checks its bindings as it is built, so a binding naming a family or an image
repository has to be matched against the template rather than against simulated ECS, and the family a
template does not name is worked out the same way there as it is at creation.

`SimCfnEcsContainerBindings` applies the bindings a deployment supplied. A binding naming a family or
a repository already says everything simulated ECS needs and is handed over unchanged; a binding
naming the task definition Resource is turned into the family the registration made, since a logical
ID means nothing to ECS. Only bindings that target this Resource are applied, so a stack declaring
several task definitions does not bind one handler to all of them.

`service/` deploys `AWS::ECS::Service`. A service is mostly the two things it names, and both arrive
already resolved: a `Ref` to a cluster is its name and a `Ref` to a task definition is the ARN of the
revision the deployment registered, which is why the service pins that revision rather than following
the family. `LoadBalancers` goes through as the `CreateService` input it is, so a template's
registration is the same registration an SDK caller would have made, refusals included, and the rest
of what a real service declares is recorded as ignored rather than failing the stack.

The three Resource types' `Ref` and `Fn::GetAtt` answers live with the other services' value
adapters, under `cloudformation/resource/cfn/ecs/`, as the CloudFormation engine's own design has
them.

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
- A service's desired count is state rather than concurrency. A consuming container is polled for
  once per service rather than once per task, and a serving container answers once per request
  however many tasks are running.
- A request reaching a target group goes to a container that is bound, rather than strictly to the
  one the registration names. The declared port chooses between several bound containers and is
  otherwise not required to match, because the container it usually names is an unsimulated proxy.
- A consuming container's loop is Yulin's rather than the container's, so the binding supplies what
  happens to a batch and nothing tries to run a loop written inside the user's own code. A container
  can consume only a simulated SQS queue, in its own Account and Region.
- A consuming or serving container of a `RunTask` task records a not-simulated reason rather than
  running. Neither has a handler that ends, and a run task has to end.
- `CreateService` refuses a name an active service of the cluster already has, which is the opposite
  of what `CreateCluster` does with a name already taken. Real ECS refuses each of them that way.
- `DeleteService` refuses a service still scaled above zero unless the request forces it, as real ECS
  does. Deleting a cluster still holding services does not refuse, which real ECS would.
- A service's tasks are `startedBy` `ecs-svc/` and the service name, where real ECS uses a number.
- `SimEcsContainerDefinitionType` carries no index signature. One would stop a real SDK
  `RegisterTaskDefinitionCommand` input being assignable to it, which is the whole point of the
  structural types. A field it does not name is stored and reported back all the same.
- A cluster or task definition a template does not name gets a name composed from the stack name and
  the logical ID, without the random part real CloudFormation adds, so a test can predict it.
- A cluster property or task definition property `CreateCluster` or `RegisterTaskDefinition` would
  refuse is recorded as ignored rather than refused, so the stack deploys. A declaration nothing acts
  on is worth less than a stack that will not come up.
- The full list is in [docs/services/ecs](../../../docs/services/ecs/).
