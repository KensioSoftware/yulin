# Terraform plan import

Reads the JSON `terraform show -json` writes for a saved plan file, builds a CloudFormation template
body from it, and deploys that as a Stack. Everything below the template body is the machinery a CDK
or SAM deployment already goes through.

`TerraformAdapter` is the entry point, and `@kensio/yulin/terraform` is where a user reaches it.

```typescript
const { stack, report } = await new TerraformAdapter(simAws).deployPlan({
  planPath: "plan.json",
  bindings: [{ functionName: "orders-processor", handler: ordersHandler }],
});
```

This is not part of simulated CloudFormation and does not sit on its API. The adapter calls
`deployTemplate`, which is the same public method a caller with a template of their own would use,
and nothing under `src/service/cloudformation/` knows Terraform exists. A Stack deployed from a plan
is an ordinary Stack, and the report of what the plan held that the template does not is returned
beside it rather than hung off it.

## The three passes

`cfnTemplateFromTerraformPlan` reads a plan in three passes over the resources
`terraformPlanResources` collects.

**Settling** decides which resources the template will declare. Whether a resource can be built
depends on what its references resolve to, and what a reference resolves to depends on which
resources are being built. The two are settled together before anything is built. Each round drops
the resources whose required properties that round's resolver cannot fill, and a resource dropped is
one the next round's references no longer reach. The set only ever shrinks, and the rounds therefore
end.

**Declaring** builds one CloudFormation Resource per settled resource. Every reference resolves
against a set that has stopped changing. This pass runs once and produces nothing it has to take
back. No Resource is built and then removed, and no property is left naming a logical ID the
template does not declare.

**Folding** merges in the resources that configure another resource. The AWS provider splits one
CloudFormation Resource across several Terraform resources. Six `aws_s3_bucket_*` resources
configure one bucket, and CloudFormation carries all six as properties of one `AWS::S3::Bucket`.

A resource none of the three has a use for is recorded on the report with the reason, in the same
spirit as the Resources a Stack already skips for a CloudFormation type no simulated service models.

## Logical IDs

A CloudFormation logical ID is alphanumeric. The module path, the resource type, the name and any
`count` or `for_each` key are folded into one camel-run. `module.uploads.aws_s3_bucket.this` becomes
`ModuleUploadsAwsS3BucketThis`.

Folding loses the separators, and two addresses can arrive at the same run. `aws_s3_bucket.foo_bar`
and `aws_s3_bucket.fooBar` both give `AwsS3BucketFooBar`, and so do the `for_each` keys `a-b` and
`a_b`. `TerraformLogicalIds` names the addresses of a plan together, and numbers the second of a
colliding pair. Addresses are sorted by code unit before they are named. That keeps the numbering
the same on any machine.

## What the plan gives

`count` and `for_each` arrive expanded. `aws_s3_bucket.site` declared with `for_each` over two
environments arrives as `aws_s3_bucket.site["staging"]` and `aws_s3_bucket.site["production"]`, each
with its own resolved values, and each becomes a Resource.

`configuration.…expressions.…references` holds the reference graph, and it is the same edge set
`parseSimCfnResourceRefDependencies` builds from a template's `Ref` and `Fn::GetAtt`. Terraform
lists both the attribute form and the bare resource form of one reference.
`aws_iam_role.processor.arn` and `aws_iam_role.processor` both appear, and the longer one carries
the attribute being read.

A deploy binding matching on `functionName` reaches a Lambda function straight from
`aws_lambda_function.function_name`, with no new binding kind needed.

## Where the plan runs out

Four things a plan withholds, in the order they cost.

### A resolved value has lost its ordering edge

Terraform resolves what it can before writing the plan. A Lambda permission naming a function
created by the same plan carries `"orders-processor"` as a plain string, where a CloudFormation
template would carry `{"Ref": "Processor"}`. The value is correct and the edge CloudFormation orders
from has gone with it.

The edge survives in `configuration`, which records the reference whether or not the value resolved.
`terraformDependsOn` in `sim-tf-declare.ts` walks every `references` array a resource declares and
turns them back into `DependsOn`. That pass is what puts the Stack in a deployable order.

### An unknown value takes its structure with it

An attribute unknown at plan time is absent from `planned_values` and marked `true` in
`resource_changes[].change.after_unknown`. That much is workable, because the reference behind it
survives and becomes a `Ref` or an `Fn::GetAtt`.

What goes missing is everything the unknown value was inside. A Lambda `environment.variables` map
holding one reference to a queue URL arrives as `"variables": true`, and the variable names go with
it. `TABLE_NAME`, `QUEUE_URL` and `TOPIC_ARN` appear nowhere in the document.

The same happens to every `jsonencode` result. An `aws_iam_role_policy` built around an ARN of the
same plan is unknown in its entirety, and its actions and resources are gone with it. Simulated IAM
evaluates authorization. A role created without the policy would deny what the configuration allowed
and fail the resources using it. The role is created holding a policy that allows everything, and
the attribute is recorded as lost. That is what keeps a plan carrying a Lambda event source mapping
deployable. Supplying the real values is [#865](https://github.com/KensioSoftware/yulin/issues/865).

An SQS `redrive_policy` loses its `maxReceiveCount` the same way. That one is dropped. A policy
carrying a made-up limit would give the queue different retry behaviour from the one the plan
describes.

### A reference can need an expression evaluator

Resolving a reference to a resource works. Resolving one through a module sometimes needs more.

The API module's integration URI reads `each.value.uri`. `each` iterates the module's `routes`
variable, the module call sets that variable from `module.processor.lambda_function_arn`, and the
processor module's output reads it off `aws_lambda_function.this[0].arn`. Following that means
evaluating Terraform expressions, which is a step past reading references.

`sim-tf-module-outputs.ts` follows the module-output hop. That one is tractable and worth having.
The `each.value` hop needs an evaluator, and it is why the module plan skips its integration and its
route. Community modules are how most Terraform is written, and `for_each` over a routes map is a
normal thing for one to do. That is [#867](https://github.com/KensioSoftware/yulin/issues/867).

### A service refuses properties it cannot act on

Simulated SNS refuses `Tags`, because nothing it models reads a topic tag. It refuses `FifoTopic`
even when false. Simulated Secrets Manager refuses a Secret carrying no value, and Terraform keeps
the value in a separate `aws_secretsmanager_secret_version`. CloudWatch Logs refuses a retention of
0 (Terraform's spelling of "never expire").

Each of these would fail the whole Stack. A mapping therefore has to know what its target service
accepts, and that is per-type work on top of the rename. Where the service requires a property the
plan could not resolve, the mapping names it under `requires`, and settling leaves the resource out.

## Adding a resource type

A mapping is a function from one `TerraformResource` to one CloudFormation Resource, registered by
Terraform type in `sim-tf-registry.ts`. The mappings live under `map/`, a file to a service. S3 and
the HTTP API run to more than one file each, because FTA scores density and a file of mapping
literals reaches the threshold of 50 at around 100 lines. Where that forced a split, the line drawn
was between the flat renames and the sections CloudFormation holds as lists of rules.

Most of a mapping is the rename table `renamed()` applies. What needs more than a rename is added to
what that returns. `attribute()` reads one attribute, answering with the value the plan resolved or
with the intrinsic that reads it off the Resource producing it. `requires` names the properties the
target service will refuse the Resource without, and `lost` names the attributes the mapping could
not carry.

A resource that configures another resource is a fold. It names the attribute holding its parent's
address and returns the properties to merge in.

Measured over the two configurations below, a mapped type is about 35 lines. Finding out what the
target service refuses takes longer than writing the mapping.

## Testing

Every mechanism has a fixture of its own. `test/terraform/plan/terraform-plan.factory.ts` builds the
JSON document Terraform writes, splitting one resource across the three sections a plan splits it
across. A test says each thing once, and the reader is still tested against the shape of a real
plan. Those tests are isolated tests and need no Terraform installed.

Two whole configurations are committed under `test/terraform/app` and `test/terraform/modules`, and
`sim-tf-plan-deploy.loc.test.ts` plans them with `TestTerraformProject` and deploys the result. They
cover the one thing a fixture cannot say. The format being read is the format Terraform writes. Run
`pnpm tf:init` once before them. It downloads the AWS provider (one 648MB binary) and takes a few
minutes the first time.

`test/terraform/app` is an application config written by hand. `test/terraform/modules` is built
from published `terraform-aws-modules` modules, and it is the honest one. Every provider and module
version is pinned exactly. A plan produced later is the plan the numbers below came from.

The three workflows running the suite install Terraform and cache the provider. The cache holds the
provider at 126MB, and the key comes off the lock files. A cold download happens only when a version
moves. A warm run spends about 9 seconds between `setup-terraform`, the cache and `pnpm tf:init`,
and generating the plans inside the suite costs about 12 seconds.

## What it reaches

Two plans, both produced by Terraform 1.15.8 against AWS provider 5.100.0.

|                   | resources | mapped | folded | skipped | reached |
| ----------------- | --------- | ------ | ------ | ------- | ------- |
| hand-written app  | 41        | 23     | 7      | 11      | 73%     |
| community modules | 25        | 12     | 6      | 7       | 72%     |

Reached means a simulated resource was created for it, either as a Resource of its own or as
properties folded into one. The import maps 16 Terraform resource types and folds 7 more.

Most of what it skips is the size of the mapped set, which grows in
[#866](https://github.com/KensioSoftware/yulin/issues/866). Cross-referencing every resource type in
both plans against the 61 CloudFormation types Yulin models puts the ceiling at 41 of 41 for the
application plan and 23 of 25 for the module plan. The two out of reach are `null_resource` and
`local_file`, which the Lambda module uses to package a zip. Between 72% measured and that ceiling
sits the `each.value` hop described above, worth 2 more resources on the module plan.

Planning offline fails every `data` block that reaches AWS. Both community modules read
`aws_caller_identity`, and `terraform plan` reports an error and exits non-zero for each. It still
writes a plan covering the managed resources, and those are what an import reads. The test helper
checks for the plan file and not for the exit code.
