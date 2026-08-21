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
`deployTemplate`, the same public method a caller with a template of their own would use, and
nothing under `src/service/cloudformation/` knows Terraform exists. A Stack deployed from a plan is
an ordinary Stack, and the report of what the plan held that the template does not is returned
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
it. `TABLE_NAME`, `QUEUE_URL` and `TOPIC_ARN` appear nowhere in the document. The map goes whole
even where some of its values are literals (measured on Terraform 1.15.8 against AWS provider
5.100.0), so there is no per-variable form of the unknown mark to read.

The same happens to every `jsonencode` result. An `aws_iam_role_policy` built around an ARN of the
same plan is unknown in its entirety, and its actions and resources are gone with it.

A deployment supplies both through `overrides`, matched on the name the plan carries the way a
binding is matched on a function name. `TerraformPlanOverrides` indexes what was supplied, and a
mapping asks it for the resource's own name. A name the plan itself could not resolve gets nothing
back. The plan is read first. A supplied value fills a gap and never replaces what Terraform
resolved, and environment variables merge one variable at a time (a map the plan resolved in part
keeps its own values and takes the supplied ones for the rest). What no override covered stays on
the report's `lost`.

A role whose policy no override supplies is created holding a policy that allows everything, and
`policy` is recorded as lost. Simulated IAM evaluates authorization, and a role created without the
policy would deny what the configuration allowed and fail the resources using it. Allowing
everything is what keeps a plan carrying a Lambda event source mapping deployable with no override
at all. It is the same answer sim CloudFormation gives a Resource type it cannot create. Carry on,
and say what was stepped over.

A supplied policy is evaluated as it stands. A document omitting `sqs:ReceiveMessage` fails the
event source mapping the way real Lambda fails it.

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

One case is still open. A property that arrives through a fold cannot be settled on, because folding
runs after the set is settled and a fold's parent has to be in the template before it has anywhere
to merge. A Secret whose `aws_secretsmanager_secret_version` is missing or unresolved is created
without a value, and simulated Secrets Manager refuses that. Closing it means settling the folds
along with the Resources they configure, which is the same fixed point run over a wider set.

### CloudFormation cannot always hold what Terraform holds

A bucket's event notification is a resource of its own in Terraform. The function's
`aws_lambda_permission` names the bucket whose events it admits, and the notification names the
function, so the three form a line. CloudFormation carries the notification on the `AWS::S3::Bucket`
itself, and the bucket and the permission then wait for each other.

CDK hits the same wall and answers it with `Custom::S3BucketNotifications`, a Resource that sits
between the two and applies the configuration with one
`PutBucketNotificationConfiguration` call. Simulated CloudFormation creates one, so
`aws_s3_bucket_notification` maps onto that Resource and keeps the ordering Terraform describes. An
uploaded object reaches the function the plan named.

## Adding a resource type

A mapping is a function from one `TerraformResource` to one CloudFormation Resource, registered by
Terraform type in `sim-tf-registry.ts`. The mappings live under `map/`, a file to a service. S3,
Cognito and the HTTP API run to more than one file each, because FTA scores density and a file of
mapping literals reaches the threshold of 50 at around 100 lines. Where that forced a split, the
line drawn was between the flat renames and the sections CloudFormation holds as lists of rules.

Most of a mapping is the rename table `renamed()` applies. What needs more than a rename is added to
what that returns. `attribute()` reads one attribute, answering with the value the plan resolved or
with the intrinsic that reads it off the Resource producing it. `requires` names the properties the
target service will refuse the Resource without, and `lost` names the attributes the mapping could
not carry.

Two attribute shapes `attribute()` cannot read have readers of their own in
`sim-tf-nested-attributes.ts`. A list whose entries name other resources arrives marked unknown as a
whole list, and `attributeList()` puts the intrinsics back (an alarm's `alarm_actions` holding one
topic ARN is the case it was written for). An attribute inside a repeating nested block has its own
position in a list mirroring the block, and `blockAttribute()` reads the mark and the reference
together from that position (a bucket notification's `lambda_function_arn` is that case).

A resource that configures another resource is a fold. It names the attribute holding its parent's
address and returns the properties to merge in. It is also handed the properties the parent already
carries, for the fold whose property is a list. An EventBridge rule's targets are one Terraform
resource each and one `Targets` list on the Resource, so the second target of a rule has to find the
first.

Measured over the two configurations below, a mapped type is about 35 lines. Finding out what the
target service refuses takes longer than writing the mapping.

Three questions are worth answering before the rename table.

What does the target service do with a property it does not model? Most record it against the
Resource and create it anyway, and a mapping can send those. Some refuse the Resource outright, and
a mapping has to leave those off and name them under `lost`. Simulated EventBridge refuses `Tags` on
a rule, simulated SNS refuses them on a topic, and simulated ECR and CloudWatch record them.

What does it require? Simulated DynamoDB refuses a `PROVISIONED` table carrying no
`ProvisionedThroughput`, and PutMetricAlarm requires seven properties before it will evaluate
anything. Naming them under `requires` is also what steps over the shapes this simulation does not
model, since an alarm built out of `metric_query` blocks carries no namespace, metric name or
statistic of its own.

Does the provider write an absent value or an empty one? An absent optional string inside a nested
block arrives as `""` and an absent top-level one arrives as `null`. Taking the empty string at face
value declares a secondary index with a nameless range key, a lifecycle rule whose prefix matches
every object, and a notification filter that filters nothing.

## Testing

Every mechanism has a fixture of its own. `test/terraform/plan/terraform-plan.factory.ts` builds the
JSON document Terraform writes, splitting one resource across the three sections a plan splits it
across. A test says each thing once, and the reader is still tested against the shape of a real
plan. Those tests are isolated tests and need no Terraform installed.

Two whole configurations are committed under `test/terraform/app` and `test/terraform/modules`, and
the three `.loc.test.ts` files beside the import plan them with `TestTerraformProject` and deploy
the result. They cover the one thing a fixture cannot say. The format being read is the format
Terraform writes. `sim-tf-plan-deploy.loc.test.ts` covers the deployment, `-services` covers what
each simulated service made of it, and `-report` asserts the fraction of each plan the import
reaches. Run `pnpm tf:init` once before them. It downloads the AWS provider (one 648MB binary) and
takes a few minutes the first time.

Planning takes the state lock, and a configuration planned by three test files at once would fail on
its own lock. These configurations have no state and are never applied, so `TestTerraformProject`
plans with `-lock=false`, and each test file plans a configuration once however many of its tests
deploy it.

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
| hand-written app  | 46        | 35     | 11     | 0       | 100%    |
| community modules | 25        | 12     | 9      | 4       | 84%     |

Reached means a simulated resource was created for it, either as a Resource of its own or as
properties folded into one. The import maps 24 Terraform resource types and folds 11 more.

The application plan is at its ceiling. Four resources of the module plan are left. `null_resource`
and `local_file` package a zip and belong to no AWS service. The integration and the route read
their values through the `each.value` hop described above, which is
[#867](https://github.com/KensioSoftware/yulin/issues/867) and worth 2 more resources.

Both figures are asserted in `sim-tf-plan-report.loc.test.ts`, by the resource types each plan
leaves unreached. A mapping that stops reaching a type fails there.

Planning offline fails every `data` block that reaches AWS. Both community modules read
`aws_caller_identity`, and `terraform plan` reports an error and exits non-zero for each. It still
writes a plan covering the managed resources, and those are what an import reads. The test helper
checks for the plan file and not for the exit code.
