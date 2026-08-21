# Simulated CloudFormation implementation

This directory contains the simulated CloudFormation service implementation.

Simulated CloudFormation is the orchestration layer that turns a CloudFormation template into
concrete simulated AWS resources. It is more complex than most simulated services because it has to
coordinate multiple concerns at once:

- AWS SDK-style stack commands
- template parsing and validation
- parameter and intrinsic-function resolution
- resource dependency ordering
- asynchronous stack and resource lifecycle state
- service-specific CloudFormation resource factories
- CDK-oriented convenience deployment paths and custom resources

The goal is not full CloudFormation compatibility. The goal is to model enough CloudFormation
behaviour to let tests and local development create realistic simulated infrastructure using
familiar CloudFormation/CDK outputs.

## Entry points

- `sim-cloudformation.ts` is the main service object for one account/region scope.
- `index.ts` exports the public CloudFormation simulator API.
- `command/` contains AWS SDK-style command handlers such as `CreateStack`, `DescribeStacks`,
  `UpdateStack` and `DeleteStack`.
- `deploy/` contains convenience helpers for deploying already-parsed templates or synthesized
  template files.
- `template/` contains template body validation, template value parsing, intrinsic-function nodes,
  condition evaluation, and value resolution.
- `export/` contains the export names published in one Account and Region. An `Fn::ImportValue`
  reads them.
- `parameters/` contains parameter input/default handling.
- `resource/` contains the runtime CloudFormation resource model, resource type parsing, dependency
  extraction, property resolution, and service factory resolution.
- `stack/` contains the runtime stack model, the dependency-ordered deployment lifecycle, the
  reverse-ordered teardown under `teardown/`, and the template difference an update applies under
  `update/`.
- `cdk/` contains CDK-specific integration support, including synthesized output context and custom
  resource implementations.
- `sam/` contains the SAM transform expansion a template naming `AWS::Serverless-2016-10-31` goes
  through before anything else reads it.
- `bind/` contains the binding types a deployment supplies real in-process handlers through, and
  what checks each one against the Stack it was given for.
- `error/` contains CloudFormation-specific AWS-like errors.

`src/terraform/` is not part of this service. It builds a template body out of a Terraform plan and
deploys it through `deployTemplate`, so it is a caller of this code rather than a part of it, and
nothing here knows Terraform exists.

A `SimCloudFormation` instance owns a map of stacks for one account/region scope.

When used through `SimAws`, CloudFormation is scoped like other regional services. A stack created
in a given account/region creates supported resources through that same account/region scope unless
the service-specific simulator has different scoping rules internally.

## High-level architecture

The implementation is split into several layers:

1. **Service facade**

- `SimCloudFormation`
- Owns stack storage and delegates commands/deployment helpers.

2. **Command handlers**

- `CreateStackCommandHandler`
- `DescribeStacksCommandHandler`
- `UpdateStackCommandHandler`
- `DeleteStackCommandHandler`
- Translate SDK-shaped commands into stack operations and AWS-like outputs.

3. **Template model**

- `SimCfnTemplate`
- `SimCfnParameters`
- `SimCfnTemplateValueResolver`
- Validate template shape and resolve parameter-only expressions before resources are
  instantiated.

4. **Stack model**

- `SimCfnStack`
- Owns stack identity, visible template body, resource map, lifecycle, skipped resources, and wait
  behaviour.

5. **Stack operation orchestration**

- `SimCfnStackDeploymentLifecycle`
- `SimCfnStackResourceOperations`
- `SimCfnStackResourceCreator`
- `SimCfnStackPendingResources`
- `SimCfnStackResourceBatchCreator`
- Schedule deployment in the background and create resources in dependency-ready batches.
- `SimCfnStackResourceDeleter`, `SimCfnStackPendingDeletions` and
  `SimCfnStackResourceBatchDeleter` do the same in reverse for a teardown.
- `SimCfnStackUpdateLifecycle`, `SimCfnStackUpdater` and `SimCfnStackUpdatePlan` do some of each
  against a changed template.

6. **Resource model**

- `SimCfnResource` and `SimCfnResourceRecord`
- `SimCfnResourceCreateOperation` and `SimCfnResourceDeleteOperation`
- `SimCfnResourceCreator` and `SimCfnResourceDeleter`
- Track individual resource lifecycle state, dependencies, resolved properties, Ref/GetAtt values,
  and underlying simulated service resource. What a resource is belongs to the record; what has
  happened to it belongs to the lifecycle half.

7. **Service-specific resource factories**

- `SimCfnCfnResourceFactory`
- S3 and CloudFront factories exposed by those service simulators
- CDK/custom factories such as the bucket deployment custom resource
- Convert a CloudFormation resource into an actual simulated service object, and remove it again.

This separation is important. CloudFormation owns orchestration and lifecycle; individual services
own how their own resources are created and represented.

## Stack creation flow

There are two main ways to create a stack:

- SDK-style `createStack(...)`
- convenience `deployTemplate(...)` / `deployTemplateFile(...)`

Both paths eventually create a `SimCfnStack` and call `stack.deploy()`.

The `CreateStackCommandHandler` flow is:

1. Require `StackName`.
2. Require `TemplateBody`.
3. Sequence background work.
4. Reject duplicate stack names with `AlreadyExistsException`.
5. Parse the JSON `TemplateBody` into a `SimCfnTemplate` instance.
6. Build `SimCfnParameters` from command input and template definitions.
7. Construct a `SimCfnStack`.
8. Store the stack in the service stack map immediately.
9. Start stack deployment.
10. Return an AWS-like output containing `StackId`.

A key detail is that `createStack()` starts deployment but does not wait for all resources to finish
creating. The stack lifecycle schedules actual resource deployment in the background. Callers that
need the final stack result should use:

```typescript
await simAws.cloudFormation().waitForStackDeployComplete("stack-name");
```

or drain broader simulator background tasks when appropriate.

## Convenience template deployment

`SimCloudFormation` also exposes helper methods for tests and local tooling:

- `deployTemplate(...)`, for a parsed template object
- `deployTemplateFile(...)`, for a template file, synthesized or written by hand
- `updateTemplateFile(...)`, for applying such a file to the stack it was deployed as

The first two are wrappers around the same stack creation machinery, and the third around the same
update machinery. They exist so tests and local tooling can work in templates without manually
constructing a JSON `TemplateBody` command.

The deployer is also where extra deployment context can enter the stack creation path:

- `SimCdkOutContext`, used by CDK-oriented resources that need access to synthesized output files.
- executable resource bindings, used by custom-resource simulation that needs to connect a template
  resource to local executable behaviour.

`SimCfnBinding` is what one entry of that list may be, and there are two kinds because there are two
kinds of thing a Stack declares that Yulin can run. An executable Resource, which is a Lambda
function or a CloudFront Function, is one handler and carries it as `handler`. An ECS task definition
declares containers, so its binding names a container and carries what that container does. They are
one list because a Stack is deployed once and a realistic Stack holds both, and the handler is what
tells them apart, since the two kinds share some of their target names.

A binding is data the consumer writes. `SimCfnBinding` is exported from `./cloudformation` along
with `SimCfnExecutableResourceBinding`, `SimCfnExecutableTargets`, `SimCfnExecutableResource` and
`SimCfnEcsContainerBinding`. The five ways an executable binding names its Resource are the keys of
`SimCfnExecutableTargets`, and `ExactlyOne` in `util/` turns those five keys into the union that
gives one of them and refuses the rest. A sixth way to name a Resource is a sixth key on that
interface.

`validateSimCfnExecutableResourceBindings` checks every binding resolves to a Resource of the Stack
before anything is created, sending each kind to its own matcher. The container matcher lives with
simulated ECS, because deciding whether a binding names a container a task definition declares means
reading an `AWS::ECS::TaskDefinition`, and no service's schema belongs in the engine.

The important design point is that these helpers do not bypass stack/resource lifecycle. They feed
additional context into the normal CloudFormation creation pipeline.

`SimCfnTemplateFileLoader` reads the file, and `parseTemplateFileBody` parses it in the format the
file name gives it. A `.yaml` or `.yml` file goes to `parseSimCfnTemplateYaml` in `template/yaml/`,
which parses the document under a tag schema covering CloudFormation's short-form intrinsics.
`!GetAtt Bucket.Arn` becomes `{ "Fn::GetAtt": "Bucket.Arn" }` before anything downstream sees it.
The node parser and the rest of the template model read one template shape, whichever format the
file was written in. A tag outside that schema, such as `!Base64`, fails the parse by name, the way
the long form of an intrinsic the simulator has no parser for fails the template. Any other file
name is read as JSON, which is what CDK synthesizes. The Stack name a path is taken from drops
`.template.json`, `.yaml` and `.yml` alike.

`SimCfnTemplateFileUpdater` is the update half of the same idea. It reads the file with the same
`SimCfnTemplateFileLoader` a deployment reads it with, and submits an `UpdateStackCommand`, so an
update from a file resolves the same way the deployment did. The sibling CDK assets manifest is read
again with it and handed to the stack, because a synthesis rewrites both together and the manifest
the stack was deployed with describes the assembly the previous template came from.

## Watching a template file

`src/service/cloudformation/watch/` keeps a deployed template file being read, so a re-synthesis
updates the stack rather than needing the process restarted:

- `SimCfnTemplateFileWatches` holds one watch per deployment, keyed by file and stack, and is what
  `stopWatchingTemplateFiles()`, and `close()` behind it, lets go of. It is also where a deployment's `watch` property is
  turned into what to do. Keying by deployment is what lets one file deployed as two stacks update
  both, while deploying the same stack again replaces its own watch.
- `SimCfnTemplateFileWatch` watches the directory the template is in, filtered to the template's own
  name, because a synthesis renames a temporary file over the template and a watch on the file
  itself would be left holding the file that was replaced. Changes are settled through
  `SimWatchSettle`, the same debounce `yulin watch` uses, and applied one after another.
- `SimWatchFilePoll` reads the template on a timer behind those events, because macOS gives a
  process one FSEvents stream for all of its watches and libuv rebuilds that stream whenever any
  watch in the process starts or stops. A save landing during a rebuild is delivered nowhere, so a
  process that also mounts a directory into a bucket, deploys a second stack, or serves with live
  reload can lose one outright. Reading the file reports the same change without depending on the
  stream, and a read finding a change the events already reported stays quiet about it, so one save
  stays one update.
- `SimCfnTemplateWatchUpdate` decides what a save came to: an update, a file written without being
  changed, or a failure. Nothing thrown gets past it, since the watch applies changes in a queue
  that a rejection would stop. An update is where the `reload` target is told, after the `onUpdated`
  callback and never for a failure.

The `reload` target is named by its shape, as `SimCfnWatchReloadTarget`, so watching a template file
does not drag the serving side of Yulin into the service. A target that can say it could never
reload, which a local server serving without live reload does, is asked as the watch is added rather
than on the first change.

The watch also names the file to a `yulin watch` supervisor as one this process is answering itself,
through `simWatch.reportHeldPath(...)`, so the supervisor takes it off its own list. Restarting for
it would throw away the simulated state that updating in place exists to keep.

## Template model

`SimCfnTemplate` wraps a parsed CloudFormation template object.

Yulin accepts parsed template objects in helper APIs, and JSON or YAML template files through
`deployTemplateFile(...)`. `CreateStackCommand` and `UpdateStackCommand` take a JSON `TemplateBody`
only.

A valid simulated template must contain a usable `Resources` section. The template may also contain
`Parameters` and other CloudFormation sections, but only the implemented parts affect deployment.

Template responsibilities are limited:

- validate broad template body shape
- attach parameter definitions
- evaluate the `Conditions` section
- expose resource template entries, leaving out those a false `Condition` excludes
- resolve parameters and parameter-only intrinsic functions before resources are created

Resource-to-resource references are not fully resolved during initial template processing. Those
references depend on resources being created first, so they are resolved later at individual
resource creation time.

## Parameters

`SimCfnParameters` combines:

- template `Parameters` definitions
- parameter values supplied to `CreateStack`
- default values from the template
- values read from simulated Parameter Store for the `AWS::SSM::Parameter::Value<...>` types

A Parameter Store value type is given a parameter name by whichever of the supplied value and the
default it takes. `store/` reads that name through the `SimCfnParameterStoreReader` a simulated
service implements, and records a name the store cannot answer as an ignored property of the
Parameter. A `SimCfnParameters` built with no store, as a template resolved outside a simulation is,
leaves such a Parameter holding the name it was given.

Parameter resolution happens before runtime `SimCfnResource` objects are created. This means
resource templates in the stack resource map already have parameter-derived values substituted where
supported.

The simulator supports only the parameter behaviour needed by current tests and service
integrations. Unsupported parameter schema features should be added only when they are needed for
meaningful simulated behaviour.

## Template values and intrinsic functions

Template values are represented by the `SimCfnTemplateValue` family of structural types. The
resolver parses values into node objects under `template/node/` and resolves them with a
`SimCfnResolveContext`.

Supported intrinsic-function areas currently include:

- `Ref`
- `Fn::GetAtt`
- `Fn::Join`
- `Fn::Sub`
- `Fn::FindInMap`
- `Fn::If`
- `Fn::Split`
- `Fn::Select`
- `Fn::ImportValue`

Resolution happens in two phases:

1. **Template/resource-template phase**

- Parameters and parameter-only expressions can be resolved.
- The template `Mappings` section is available here, so `Fn::FindInMap` lookups resolve.
- The evaluated `Conditions` are available here, so `Fn::If` picks its branch.
- Resource references are preserved if the referenced resource does not exist yet.

2. **Resource creation phase**

- Resource properties are resolved again with access to the stack resource map.
- `Ref` and `Fn::GetAtt` can read values from resources whose dependencies have completed.
- `Mappings` are not in this context, so a `Fn::FindInMap` left unresolved by the first phase fails
  here.
- `Conditions` are not in this context either. The first phase always resolves `Fn::If` away, so
  nothing reaching this phase needs them.

A function whose arguments have not all resolved re-emits itself in template form rather than
failing, so the second phase parses it again and finishes it. `Fn::Split` over an `Fn::GetAtt` is
the common case: the first phase leaves `{ "Fn::Split": ["/", { "Fn::GetAtt": [...] }] }` in the
resource template, which also keeps the logical ID visible to implicit dependency discovery.

Most intrinsic functions resolve to a string. `Fn::Split` resolves to a list, and `Fn::Select`
resolves to whatever the list entry it picks holds, which may be a list or an object.

### Exports and Fn::ImportValue

A `SimCloudFormation` holds one `SimCfnExports`. Exports are therefore scoped per Account and
Region, the way CloudFormation scopes them.

A Stack publishes to that registry once its Outputs have resolved, which happens after its
Resources have been created. An `Fn::ImportValue` reads what is published there.

Deployment order is the constraint a caller works with. Stacks go in one at a time, with a
producer finishing before a consumer that imports from it starts. An import naming an export no
Stack has published is refused with `No export named <name> found`. A Stack exporting a name
another Stack already holds fails to deploy.

A Stack releases its export names when it is torn down. The name is then free for the next Stack
that wants it.

### Naming the value that failed

A resolution failure says what was wrong with the expression but not where it sat.
`template/value/sim-cfn-value-path.ts` fills that in: `SimCfnObject` and `SimCfnList` catch what a
child throws and add their own key or list position to a path held beside the error, and
`SimCfnTemplateValueResolver.resolveRecordFor` adds the resource or output name at the top. The
error object itself is kept, so its type and stack survive, and only its message changes:

```
Sim CloudFormation Resource LogsBucket value at Properties.BucketName: Sim CloudFormation Fn::Select
index 9 is out of range for a list of 4 values
```

Only resolution goes through this. A value that does not parse is left alone, because its message
already quotes the expression at fault.

## Conditions

`SimCfnConditionEvaluator` turns the template `Conditions` section into a `SimCfnConditions` map of
plain booleans, held under `template/condition/`.

A condition can only read parameters and pseudo parameters, so the whole section is evaluated once
per deployment, before any resource is created. `SimCfnTemplate` memoizes the result and passes it
into every resolve context it builds, the same way it passes `Mappings`.

Conditions are not written in dependency order, so each name is evaluated on demand and remembered,
carrying the chain of names being evaluated to catch a condition that refers back to itself. A
comparison that would need a created resource fails rather than reading as false, because a
condition that reads false when it should read true silently deploys the wrong stack.

`SimCfnResourceConditions` applies the resource-level `Condition` attribute. A conditioned-out
resource is dropped before the resource map is built, so it never becomes a `SimCfnResource`. This
is deliberately not the skipped-resource path used for unsupported resource types: a skipped
resource stays in `stack.resources` and answers `Ref` and `Fn::GetAtt` with stand-in values, where a
conditioned-out resource does not exist at all.

Naming a conditioned-out resource from another resource fails the deployment. The names that count
are those left in the resolved resource template, plus `DependsOn`. Because `Fn::If` has already
picked its branch by then, a name carried only by the branch that was not selected does not count.

This two-phase design is one of the most important simulated CloudFormation implementation details.
It allows the stack to build a complete runtime resource graph before any service resources exist,
while still resolving resource references accurately when each resource is ready to create.

## Resource map creation

When a `SimCfnStack` is constructed, it immediately converts the template's `Resources` section into
a runtime map of `SimCfnResource` objects.

Each `SimCfnResource` stores:

- logical ID
- original or pre-resolved resource template
- account/region scope
- background scheduler
- creation lifecycle state
- the service-specific simulated resource after creation
- access to parameter/property resolution support
- the set of all resource logical IDs for dependency detection

The resource map is stable for the lifetime of the stack. Resource objects change state as
deployment runs, but the set of resources is decided from the template at stack construction time.

## Resource dependencies

Resource creation order is derived from each `SimCfnResource`.

A resource's dependencies include:

- explicit `DependsOn`
- implicit dependencies from `Ref` expressions that point at other resources

The dependency extraction is CloudFormation-facing, not service-facing. Service factories do not
decide dependency order; they are called only after the stack deployment loop has determined that a
resource can be created.

A resource can create when all dependencies have reached `CREATE_COMPLETE`.

Missing, failed, or cyclic dependencies prevent progress. If a deployment loop iteration still has
pending resources but none are creatable, stack deployment fails with a dependency-resolution error.

## Stack deployment lifecycle

`SimCfnStackDeploymentLifecycle` owns externally visible stack deployment state.

A new stack starts as `REVIEW_IN_PROGRESS`. Calling `deploy()` moves it synchronously to
`CREATE_IN_PROGRESS`.

Then the actual resource deployment is scheduled in the shared background task system. When the
scheduled deployment finishes:

- success changes the stack to `CREATE_COMPLETE`
- failure changes the stack to `CREATE_FAILED` and captures the error

This mirrors the important practical behaviour of CloudFormation: stack creation begins quickly, but
resource creation finishes asynchronously.

`waitForDeployComplete()` waits for the scheduled deployment task. If deployment failed, it rethrows
the captured error so tests can observe deployment failures directly.

`SimCfnStackOperationScheduler` is the piece every stack operation shares. It wraps the work in
background scheduling and reports the outcome back, without knowing which operation it is running.

`SimCfnStackResourceOperations` is the other shared piece. It holds the simulated AWS scope a stack
creates and deletes resources in, because deploying, updating and tearing down all need the same
one, and it publishes the CDK cloud assembly assets before any creation.

## Stack deletion lifecycle

`SimCfnStackDeletionLifecycle` owns stack deletion state, and mirrors the deployment lifecycle.

Calling `delete()` moves the stack to `DELETE_IN_PROGRESS` synchronously and schedules the teardown.
When it finishes:

- success changes the stack to `DELETE_COMPLETE` and calls the `onDeleteComplete` callback, which is
  how `DeleteStackCommandHandler` releases the stack name
- failure changes the stack to `DELETE_FAILED` and captures the error, leaving the stack where it is

The lifecycles are separate objects rather than one status field, for the reason
`SimCfnResourceDeletionState` is separate from `SimCfnResourceCreationState`: a stack that was never
asked to delete has no deletion status at all. `SimCfnStackOperationStatus` reads the deletion
status first, then the update status, then the deployment status, so `SimCfnStack.status` says the
last thing CloudFormation did to the stack. `SimCfnStack.error` follows the same order, so a
deployment failure is never reported as the reason for a later operation.

Asking twice does nothing the second time, as a repeated `DeleteStack` does in CloudFormation. A
stack left in `DELETE_FAILED` can be asked again, because whatever refused may have been dealt with
since, and the teardown loop starts from every resource again.

Releasing the name belongs to whoever holds the stack map. The lifecycle only says when the name is
free, so a failed deletion keeps the name in use and the stack describable.

## Stack update lifecycle

`SimCfnStackUpdateLifecycle` owns stack update state, and is scheduled the way the other two are.
Calling `update()` moves the stack to `UPDATE_IN_PROGRESS` and schedules the work, which leaves the
stack `UPDATE_COMPLETE` or `UPDATE_FAILED` with the error on it. There is no rollback to the
template the stack was deployed from, so a failed update leaves the stack holding whatever it
managed.

The work itself is passed in per update rather than held on the lifecycle, because each update
applies a different template.

`SimCfnStackUpdater` works out and applies the difference:

- `SimCfnStackUpdatePlan` compares the deployed resources with the ones the new template describes,
  and says which to delete, which to create, and what the stack holds afterwards.
- `simCfnStackReplacedLogicalIds` decides what changed, by comparing each resource's resolved
  template entry through `simCfnTemplateSignature`. Comparing resolved entries rather than template
  text is what makes a changed parameter value a changed resource, and a reordered template no
  change at all.
- `simCfnStackOutputsChanged` answers the same question for the `Outputs` section, because an update
  that only changes an output is still an update. A template that changes nothing raises the
  `ValidationError` CloudFormation raises.

Applying the plan is a teardown and a deployment over subsets of the stack: the dropped and replaced
resources are deleted in reverse dependency order, the resource map is moved on to the new template,
and the added and replaced resources are created in dependency order. This is why
`SimCfnStackResourceCreator` and `SimCfnStackResourceDeleter` each take the resources to work on
alongside the whole stack: dependencies are read across every resource, while only some of them are
being changed.

Sim CloudFormation has no in-place resource update, so a changed resource is deleted and created
again. That diverges from CloudFormation, which updates most properties in place and keeps what the
resource holds, and it is recorded in the usage docs rather than hidden. Two things follow from it:

- A resource naming a replaced resource is replaced too, all the way up the chain, so nothing is
  left pointing at a resource that has gone. Real CloudFormation hands the dependent the new
  physical name instead.
- `UpdateReplacePolicy` is not read. Retaining the old resource would leave it holding the name its
  replacement needs, and CDK marks buckets and tables `Retain` as a matter of course, so honouring
  it would fail every such update.

## Resource deployment loop

`SimCfnStackResourceCreator` owns the dependency-ordered resource creation loop.

The loop works in batches:

1. Start with all resources pending.
2. Ask `SimCfnStackPendingResources` for resources whose dependencies are satisfied.
3. If no resources are creatable, fail because deployment cannot make progress.
4. Create the ready batch.
5. Remove resources that reached `CREATE_COMPLETE`.
6. Repeat until no resources remain pending.

Creation inside a batch can run in parallel because all resources in that batch already have their
dependencies satisfied. Later batches wait because completed resources may provide `Ref` or
`Fn::GetAtt` values needed by dependent resources.

This batch model keeps dependency handling deterministic while still allowing independent resources
to behave like concurrent CloudFormation work.

## Resource creation lifecycle

`SimCfnResourceCreateOperation` owns the asynchronous lifecycle for one resource.

A resource starts as `CREATE_PENDING`. When creation starts, it becomes `CREATE_IN_PROGRESS`.

The actual work is scheduled through the background scheduler. During that work:

1. background sequencing runs
2. `SimCfnResourceCreator` creates the underlying simulated service resource
3. the resource is marked `CREATE_COMPLETE` with the created simulated object

If creation throws:

- supported "unsupported resource" diagnostics are treated specially and may mark the resource
  skipped
- other failures mark the resource `CREATE_FAILED` and reject the creation promise

Skipped resources are treated as create-complete for dependency progress. This is a pragmatic
simulator choice: a stack with unsupported resources can still create the supported resources needed
for a test.

Skipped resources are read off the resources as `stack.skippedResources`, the same way retained and
ignored ones are, by `SimCfnStackResourceReport`. Nothing is collected while the stack runs, so a
stack an update changed reports the resources it holds now.

### Inert resources

A refusal only means no factory would create the resource. Whether that is worth reporting is a
separate question, and `simCfnInertResourceReason` answers it, in the same place the skip would
otherwise be recorded. A resource nothing the simulator models could tell apart from one it had
created is marked inert instead, and read back as `stack.inertResources`.

The order matters: the question is asked _after_ the factory has refused, never before. So this
decides only how a resource is reported, never whether it is created. A template function bound to a
real in-process handler is deployed and invocable even when it is CDK's own custom resource provider,
because sim Lambda creates it and the refusal never happens.

Two things can make a resource inert:

- `simCfnInertResourceTypes` is the types no simulated service reads, whatever stack they turn up in.
  `AWS::Lambda::LayerVersion` and `AWS::CDK::Metadata` are there.
- `SimCdkProviderScaffolding` reads the stack around the resource. The Lambda function a
  `Custom::` resource names in its `ServiceToken`, where the custom resource type is one
  `simCdkCustomResourceFactories` creates directly, has nothing left to do by the time anything would
  have invoked it, and neither has the log group naming that function.

The association is deliberate. CDK generates the provider's logical ID from a construct path and a
hash, so matching on the name would be matching on something that is not an interface. `ServiceToken`
is the link CloudFormation itself uses. It also reaches things a name never would: every
`BucketDeployment` construct synthesizes its own AWS CLI Layer but only the first is named by the
shared provider's `Layers`, which is why a Layer is recognised on being a Layer instead.

Keeping the two lists apart is the whole point. `stack.skippedResources` is what a test would find
missing; running the deliberate omissions in with the gaps is how the gaps stop being findable.

## Resource teardown loop

`SimCfnStackResourceDeleter` owns the reverse-dependency-ordered deletion loop, and mirrors
`SimCfnStackResourceCreator` batch for batch:

1. Start with all resources pending.
2. Ask `SimCfnStackPendingDeletions` for resources nothing still standing depends on.
3. If no resources are deletable, fail because the teardown cannot make progress.
4. Delete the ready batch.
5. Remove resources that reached a terminal delete status.
6. Repeat until no resources remain pending.

The graph is the one creation already reads, turned round. `simCfnResourceDependents` inverts the
`dependencies()` each resource reports, so a resource waits for the resources naming it rather than
for the resources it names.

This ordering is what makes the individual service deleters workable. A bucket policy is taken off
before its bucket goes, a role's policies before the role, and a route before the integration it
targets. It also means every `Ref` a resource carries still resolves while that resource is being
deleted, so deletion can resolve properties the same way creation does rather than remembering what
creation resolved.

`SimCfnStack.teardown()` is the entry point for the resource half on its own. `SimCfnStack.delete()`
is the whole operation: the stack-level delete status and the stack name release sit on top of the
same teardown.

## Resource deletion lifecycle

`SimCfnResourceDeleteOperation` owns the asynchronous lifecycle for deleting one resource, and is
the mirror image of the creation operation.

A resource whose `DeletionPolicy` is `Retain` never reaches the operation at all. `SimCfnResource`
answers the deletion itself by marking the resource `DELETE_SKIPPED`, which is the status
CloudFormation reports for a resource it stepped over, and the stack reads them back as
`stack.retainedResources`. `RetainExceptOnCreate` is treated the same way, because the two differ
only in what a rolled back creation does and sim CloudFormation does not roll a deployment back.
`Snapshot` is treated as `Delete`, because no simulated service takes snapshots.

Otherwise a resource keeps its creation status until deletion starts, at which point it becomes
`DELETE_IN_PROGRESS`. The work is scheduled through the background scheduler, and then:

1. background sequencing runs
2. `SimCfnResourceDeleter` removes the underlying simulated service resource
3. the resource is marked `DELETE_COMPLETE`

If deletion throws:

- an "unsupported resource" diagnostic marks the deletion skipped, which is `DELETE_COMPLETE` with a
  reason, exactly as an unsupported resource type is `CREATE_COMPLETE` with one
- other failures mark the resource `DELETE_FAILED` and reject

A resource that never reached simulated AWS is not passed to its service at all. That covers a
resource whose type was skipped, and one a failed deployment never got as far as, so a partly
deployed stack can still be torn down.

Skipped deletions are read off the resources as `stack.skippedResourceDeletions`, the same way
ignored properties are, so the stack and its resources cannot disagree.

Deletion statuses live on `SimCfnResourceDeletionState`, separate from `SimCfnResourceCreationState`
rather than sharing one field, because the two answer different questions: what the resource became,
and what happened when the stack asked for it back.

## Service-specific resource deletion

`SimCfnServiceResourceFactory` has a `delete` alongside `create`, and the engine calls it the same
way: parse the resource type, resolve the owning service's factory, resolve properties, delegate.
CloudFormation orchestrates; services delete.

Which command removes a resource type, and what has to be true first, belongs to the service. Real
CloudFormation does that extra step itself, and so do these deleters:

- a CloudFront distribution is disabled with `UpdateDistribution` before `DeleteDistribution`, which
  refuses an enabled one
- an IAM role has its attached and inline policies taken off before `DeleteRole`, which refuses a
  role that still has any
- an SQS queue policy is removed by setting the `Policy` attribute to an empty string, because SQS
  has no `DeleteQueuePolicy`
- a Route53 record set is removed by a `DELETE` change, because Route53 only takes changes

Two of them stop short on purpose, because AWS does:

- an S3 bucket holding objects fails the teardown with `BucketNotEmpty` rather than being emptied
  first. That refusal is the reason CDK ships an `autoDeleteObjects` custom resource, and hiding it
  would hide the difference between a stack that can be deleted and one that cannot.
- a KMS key is scheduled for deletion and left in `PendingDeletion`, because `ScheduleKeyDeletion` is
  the only deletion KMS has.

A resource type a service can create but cannot delete throws the same unsupported-resource error an
unknown type does, so the teardown records it and carries on.

## Service-specific resource creation

`SimCfnResourceCreator` bridges CloudFormation resources to simulated service resources.

For each resource it:

1. Reads the CloudFormation `Type`.
2. Parses it into provider, service, and resource type parts.
3. Resolves the correct service-specific CloudFormation resource factory.
4. Resolves resource properties with access to completed resources.
5. Calls the factory with the resource type name, resource object, and creation context.

The resolver currently supports factories for:

- `AWS::CloudFormation::*`
- `AWS::S3::*`
- `AWS::CloudFront::*`
- `AWS::ECS::*`
- `AWS::ElasticLoadBalancingV2::*`
- selected `Custom::*` CDK-oriented resources

Unsupported providers, services, custom resources, or resource types are skipped to improve
versatility.

Service-specific factories live with the service they create. For example, S3 CloudFormation support
lives under the S3 simulator, and CloudFront CloudFormation support lives under the CloudFront
simulator. This keeps service-specific interpretation out of the generic CloudFormation engine.

## CloudFormation's own resource factory

The CloudFormation service includes a small factory for CloudFormation-native resources.

The main implemented resource is:

- `AWS::CloudFormation::WaitConditionHandle`

This resource is useful in tests because it gives the CloudFormation engine a lightweight resource
type that does not require involving another simulated AWS service. Tests use it to exercise
dependency, reference, and property-resolution behaviour.

## Ref and Fn::GetAtt value model

A `SimCfnResource` exposes:

- `refValue`
- `attributeValue(attributeName)`

Resource-specific behaviour is delegated to a CloudFormation value adapter rather than implemented
directly in service objects.

This is important because real CloudFormation `Ref` and `Fn::GetAtt` behaviour is resource-type
specific. For example:

- an S3 bucket `Ref` returns the bucket name
- a CloudFront distribution `Ref` returns the distribution ID
- a CloudFront distribution `Fn::GetAtt DomainName` returns its distribution domain name

Adapters allow simulated service objects to stay focused on service behaviour while CloudFormation
controls how those objects appear inside template expressions.

If no specialized adapter exists, the default adapter provides fallback behaviour suitable for
generic tests and diagnostics.

## Property resolution during creation

Resource properties are resolved immediately before the service-specific factory is invoked.

This timing matters because dependent resources may need values from resources that were just
created in an earlier batch. For example, a resource property can use:

```json
{ "Ref": "OtherResource" }
```

```json
{ "Fn::GetAtt": ["OtherResource", "Arn"] }
```

By waiting until resource creation time, the resolver can access `OtherResource.refValue` or
`OtherResource.attributeValue(...)` after `OtherResource` has completed.

The resolved properties are passed in the creation context as `resolvedProperties`. Service-specific
factories should prefer these resolved properties over the raw template properties.

## DescribeStacks behaviour

`DescribeStacksCommandHandler` reads from the CloudFormation service's stack map and returns
AWS-like stack descriptions.

The externally visible stack status comes from the stack lifecycle, not from the command handler.
This means callers may observe in-progress status before background deployment completes, and
complete/failed status after waiting for deployment or draining background tasks. The same applies to
deletion, so a stack can be observed as `DELETE_IN_PROGRESS`.

`SimCfnDescribedStacks` decides which stacks a request is about. A request naming a stack the service
does not hold is refused with a `ValidationError`, as CloudFormation refuses it, while a request
naming none over an empty stack map is an empty list. A deleted stack name reaches the refusal too:
CloudFormation describes a deleted stack only by its unique stack ID, and the simulator identifies a
stack by its name alone.

The describe path is read-only. It should not trigger deployment or mutate resources.

## Background scheduling

CloudFormation uses the shared background task infrastructure.

There are several scheduling levels:

- command handlers may call `background.sequence()` before reading or mutating top-level service
  state
- stack lifecycle schedules the whole deployment operation
- resource creation operations schedule individual resource creation work
- service-specific factories may call into simulated services that schedule their own background
  work

This layering lets sim CloudFormation model asynchronous stack/resource creation while still
integrating with the broader simulator's deterministic test controls.

Tests that need final state should use one of the explicit wait/drain helpers, for example:

```typescript
await simAws.cloudFormation().waitForStackDeployComplete("stack-name");
```

```typescript
await simAws.backgroundTasksComplete();
```

Use the stack-specific wait when the important thing is CloudFormation deployment completion. Use
the broader background drain when a test also depends on service-level asynchronous work scheduled
by the created resources.

## CDK integration

The CloudFormation simulator includes CDK-oriented support because many realistic tests start from
synthesized CDK output rather than hand-written templates.

The CDK support is not a separate deployment engine. Instead, CDK helpers feed synthesized template
data and extra context into the normal CloudFormation stack path.

Important concepts:

- `SimCdkOutContext` carries information about synthesized output locations and assets.
- `deployTemplateFile(...)` loads a synthesized template file and deploys it through the normal
  stack-creation path.
- executable resource bindings let tests connect selected custom resources to local behaviour.
- CDK bucket deployment support is implemented as a supported custom resource factory.

A bucket deployment also says what it published, as well as setting it. `SimCdkBucketDeployMetadata`
records the deployment's `SystemMetadata` on the destination Bucket, against the keys it copied and
the prefix and filters it copied them by, and the S3 simulator reads that back when a mounted
directory replaces those Objects. The Objects themselves carry their headers, so nothing reads the
declaration until the storage under them is one that cannot hold metadata. See
[metadata declared about a Bucket](../s3/README.md#metadata-declared-about-a-bucket-rather-than-an-object).

CloudFront/CDK tests demonstrate this by deploying synthesized templates that create S3 buckets,
CloudFront distributions, CloudFront Functions, and CDK-style custom resources.

## Custom resources

Custom resources are resolved separately from `AWS::*` resource types.

Currently, generic `Custom::*` resources are rejected unless they match a supported simulated custom
resource path such as the CDK bucket deployment resource.

This keeps unsupported custom resources from silently doing the wrong thing. If a custom resource is
needed for a realistic test, add a focused simulator implementation for that custom resource rather
than making all custom resources no-op by default.

## Supported service integrations

CloudFormation currently integrates with a small set of service simulators:

- CloudFormation-native test resources such as `WaitConditionHandle`
- S3 resources implemented by the S3 simulator
- CloudFront resources implemented by the CloudFront simulator
- ELBv2 resources implemented by the ELBv2 simulator
- selected CDK custom resources

The CloudFormation engine itself should not know the detailed schema or behaviour of
`AWS::S3::Bucket` or `AWS::CloudFront::Distribution`. It should parse the resource type, resolve
dependencies and properties, then delegate creation to the owning service simulator.

This delegation is the main extension point for adding more CloudFormation resource support.

## Error and failure model

The CloudFormation error model is lightweight.

Current behaviour includes:

- duplicate stack names throw an AWS-like `AlreadyExistsException`
- describing or updating a stack name the service does not hold throws an AWS-like `ValidationError`
- an update with no differences throws the same `ValidationError`
- invalid JSON template body throws a diagnostic template error
- missing required command input throws assertion-style errors
- unsupported providers/services/resource types throw diagnostic errors
- resource creation failures are wrapped with the logical ID for easier debugging
- stack deployment captures background errors and rethrows them from `waitForDeployComplete()`

When a resource fails during background deployment, the immediate stack creation call may already
have returned. Tests that assert deployment failures should wait for stack completion.

Example:

```typescript
const stack = await simAws
  .cloudFormation()
  .deployTemplate({ stackName: "example", template });
await assertThrowsErrorAsync(async () => {
  await stack.waitForDeployComplete();
});
```

Or use the service wrapper:

```typescript
await assertThrowsErrorAsync(async () => {
  await simAws.cloudFormation().waitForStackDeployComplete("example");
});
```

## Tests as implementation guides

The colocated tests are the best guide for expected behaviour.

Useful areas:

- `command/create-stack/*.iso.test.ts`
  - stack creation command behaviour
  - duplicate stack handling
  - asynchronous deployment expectations

- `command/describe-stacks/*.iso.test.ts`
  - stack status reporting
  - stack lookup and listing behaviour
  - the refusal of a stack name the service does not hold

- `command/delete-stack/*.iso.test.ts`
  - stack deletion and stack name release
  - `DeletionPolicy` handling
  - failed teardowns and the statuses they leave behind

- `command/update-stack/*.iso.test.ts`
  - applying a changed template, and what an update leaves alone
  - the refusal of an update with nothing to do
  - failed updates and the statuses they leave behind

- `template/*.iso.test.ts`
  - template body validation
  - parameter handling
  - resource section handling

- `template/node/**/*.iso.test.ts`
  - `Ref`
  - `Fn::GetAtt`
  - `Fn::Join`
  - `Fn::Sub`
  - `Fn::FindInMap`
  - `Fn::If`
  - `Fn::Split`
  - `Fn::Select`
  - `Fn::ImportValue`
  - literal/list/object node resolution

- `template/condition/*.iso.test.ts`
  - condition evaluation and the condition functions it refuses
  - the resource `Condition` attribute

- `parameters/*.iso.test.ts`
  - parameter input/default behaviour

- `resource/parser/*.iso.test.ts`
  - CloudFormation resource type parsing

- `resource/dependency/*.iso.test.ts`
  - explicit and implicit dependency extraction

- `resource/resolve/**/*.iso.test.ts`
  - property and service factory resolution

- `resource/ref/*.iso.test.ts`
  - resource `Ref` value behaviour

- `resource/factory/*.iso.test.ts`
  - CloudFormation-native resource factory behaviour

- `stack/*.iso.test.ts`
  - stack resource map and lifecycle behaviour

- `stack/deploy/*.iso.test.ts`
  - dependency-ordered resource creation and deployment failure behaviour

- `stack/teardown/*.iso.test.ts`
  - reverse-dependency-ordered resource deletion and teardown failure behaviour

- `stack/update/*.iso.test.ts`
  - what counts as a changed resource, and what an update replaces

- `cdk/**/*.loc.test.ts`
  - higher-level CDK synthesized template scenarios
  - local integration of CloudFormation, S3, CloudFront, assets, and custom resources

The `.iso.test.ts` suffix is for isolated tests that do not perform real network I/O. They may still
exercise multiple simulator classes together in memory.

The `.loc.test.ts` suffix is for local integration tests that may perform real localhost networking
or filesystem/CDK-style integration while still running the simulator and test in the same process.

## Implementation conventions

When extending simulated CloudFormation:

- keep `SimCloudFormation` as a thin service facade
- put AWS SDK-style operation behaviour in command handlers under `command/`
- keep template parsing/resolution generic and service-agnostic
- resolve parameters before runtime resource creation
- resolve resource references only when dependencies are complete
- keep dependency ordering in the stack/resource orchestration layer
- add service-specific CloudFormation resource creation and deletion to the owning service
  simulator
- prefer resource value adapters for `Ref` and `Fn::GetAtt` behaviour
- do not import real AWS SDK packages from implementation code under `src/`
- define local structural command/template types that are compatible with SDK-shaped inputs
- use background scheduling consistently for asynchronous stack and resource lifecycle
- preserve helpful diagnostics that include stack names and resource logical IDs
- add focused isolated tests for new template/resource behaviour
- add local integration tests when the full served/CDK/filesystem path matters

The most important design rule is: CloudFormation orchestrates; services create, and services
delete. If a change
requires knowledge of a service's resource schema or runtime object model, it probably belongs in
that service's CloudFormation resource factory rather than in the generic CloudFormation engine.
