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
- `command/` contains AWS SDK-style command handlers such as `CreateStack` and `DescribeStacks`.
- `deploy/` contains convenience helpers for deploying already-parsed templates or synthesized
  template files.
- `template/` contains template body validation, template value parsing, intrinsic-function nodes,
  and value resolution.
- `parameters/` contains parameter input/default handling.
- `resource/` contains the runtime CloudFormation resource model, resource type parsing, dependency
  extraction, property resolution, and service factory resolution.
- `stack/` contains the runtime stack model and dependency-ordered deployment lifecycle.
- `cdk/` contains CDK-specific integration support, including synthesized output context and custom
  resource implementations.
- `bind/` contains executable resource binding types used by CDK/custom-resource simulation.
- `error/` contains CloudFormation-specific AWS-like errors.

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

5. **Stack deployment orchestration**

- `SimCfnStackDeploymentLifecycle`
- `SimCfnStackResourceCreator`
- `SimCfnStackPendingResources`
- `SimCfnStackResourceBatchCreator`
- Schedule deployment in the background and create resources in dependency-ready batches.

6. **Resource model**

- `SimCfnResource`
- `SimCfnResourceCreateOperation`
- `SimCfnResourceCreator`
- Track individual resource lifecycle state, dependencies, resolved properties, Ref/GetAtt values,
  and underlying simulated service resource.

7. **Service-specific resource factories**

- `SimCfnCfnResourceFactory`
- S3 and CloudFront factories exposed by those service simulators
- CDK/custom factories such as the bucket deployment custom resource
- Convert a CloudFormation resource into an actual simulated service object.

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

- `deployTemplate(...)`
- `deployTemplateFile(...)`

These are wrappers around the same stack creation machinery. They exist so tests can deploy a parsed
template object or a synthesized CDK template file without manually constructing a JSON
`TemplateBody`command.

The deployer is also where extra deployment context can enter the stack creation path:

- `SimCdkOutContext`, used by CDK-oriented resources that need access to synthesized output files.
- executable resource bindings, used by custom-resource simulation that needs to connect a template
  resource to local executable behaviour.

The important design point is that these helpers do not bypass stack/resource lifecycle. They feed
additional context into the normal CloudFormation creation pipeline.

## Template model

`SimCfnTemplate` wraps a parsed CloudFormation template object.

Yulin accepts parsed template objects in helper APIs and JSON strings for `CreateStackCommand`
`TemplateBody`. It does not implement a YAML parser in the CloudFormation service.

A valid simulated template must contain a usable `Resources` section. The template may also contain
`Parameters` and other CloudFormation sections, but only the implemented parts affect deployment.

Template responsibilities are limited:

- validate broad template body shape
- attach parameter definitions
- expose resource template entries
- resolve parameters and parameter-only intrinsic functions before resources are created

Resource-to-resource references are not fully resolved during initial template processing. Those
references depend on resources being created first, so they are resolved later at individual
resource creation time.

## Parameters

`SimCfnParameters` combines:

- template `Parameters` definitions
- parameter values supplied to `CreateStack`
- default values from the template

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

Resolution happens in two phases:

1. **Template/resource-template phase**

- Parameters and parameter-only expressions can be resolved.
- Resource references are preserved if the referenced resource does not exist yet.

2. **Resource creation phase**

- Resource properties are resolved again with access to the stack resource map.
- `Ref` and `Fn::GetAtt` can read values from resources whose dependencies have completed.

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

Skipped resources are also recorded on the stack in `skippedResources` for diagnostics.

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
complete/failed status after waiting for deployment or draining background tasks.

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
- selected CDK custom resources

The CloudFormation engine itself should not know the detailed schema or behaviour of
`AWS::S3::Bucket` or `AWS::CloudFront::Distribution`. It should parse the resource type, resolve
dependencies and properties, then delegate creation to the owning service simulator.

This delegation is the main extension point for adding more CloudFormation resource support.

## Error and failure model

The CloudFormation error model is lightweight.

Current behaviour includes:

- duplicate stack names throw an AWS-like `AlreadyExistsException`
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

- `template/*.iso.test.ts`
  - template body validation
  - parameter handling
  - resource section handling

- `template/node/**/*.iso.test.ts`
  - `Ref`
  - `Fn::GetAtt`
  - `Fn::Join`
  - `Fn::Sub`
  - literal/list/object node resolution

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
- add service-specific CloudFormation resource creation to the owning service simulator
- prefer resource value adapters for `Ref` and `Fn::GetAtt` behaviour
- do not import real AWS SDK packages from implementation code under `src/`
- define local structural command/template types that are compatible with SDK-shaped inputs
- use background scheduling consistently for asynchronous stack and resource lifecycle
- preserve helpful diagnostics that include stack names and resource logical IDs
- add focused isolated tests for new template/resource behaviour
- add local integration tests when the full served/CDK/filesystem path matters

The most important design rule is: CloudFormation orchestrates; services create. If a change
requires knowledge of a service's resource schema or runtime object model, it probably belongs in
that service's CloudFormation resource factory rather than in the generic CloudFormation engine.
