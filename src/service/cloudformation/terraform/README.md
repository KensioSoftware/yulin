# Terraform plan import (spike)

A spike for [#860](https://github.com/KensioSoftware/yulin/issues/860). It reads the JSON `terraform show -json` writes for a saved plan file, builds a CloudFormation template body from it, and hands that to `deployTemplate`. Everything below the template body is the machinery a CDK or SAM deployment already goes through.

This is throwaway. It is on the branch to make the measurement reproducible, and the recommendation at the end says what should actually be built.

## What was measured

Two plans, both produced by Terraform 1.15.8 against AWS provider 5.100.0. `test/terraform/app` is an application config written by hand for this spike. `test/terraform/modules` is built from published `terraform-aws-modules` modules, and it is the honest one.

The configurations are in the repository and the plans are not. `TestTerraformProject` runs `terraform plan` and `terraform show -json` when a test asks for one, the way `TestCdkProject` synthesizes a cloud assembly. A plan runs to thousands of generated lines and the configuration behind it runs to tens. Committing the configuration keeps a fixture reviewable, and keeps the next one cheap. Run `pnpm tf:init` once before the tests. Every provider and module version is pinned exactly, so a plan produced later is the plan the numbers below came from.

The three workflows running the suite install Terraform and cache the provider. What that costs is measured, on PR #863. The AWS provider is one 648MB binary, which caches at 126MB. A warm run restores it at 330 MB/s and spends about 9 seconds between `setup-terraform`, the cache and `pnpm tf:init`. A cold run spends 14, of which 11 is downloading the provider, and the cache key comes off the lock files so that happens only when a version moves. Generating the plans inside the suite costs about 12 seconds. The Test job varies by more than that between runs on the same code, and the first run with Terraform in it came in faster than two runs without. These numbers are from Blacksmith runners, whose cache served 126MB in a second and a half, and they would be worse on a stock GitHub runner. The hand-written config unconsciously favoured services Yulin models, and every one of its 33 resource types turned out to have a simulated equivalent.

|                   | resources | mapped | folded | skipped | reached |
| ----------------- | --------- | ------ | ------ | ------- | ------- |
| hand-written app  | 41        | 23     | 7      | 11      | 73%     |
| community modules | 25        | 12     | 6      | 7       | 72%     |

Reached means a simulated resource was created for it, either as a Resource of its own or as properties folded into one. The spike maps 16 Terraform resource types and folds 7 more.

Most of what it skipped is spike scope. Cross-referencing every resource type in both plans against the 61 CloudFormation types Yulin models puts the ceiling at 41 of 41 for the application plan, and 23 of 25 for the module plan. The two out of reach are `null_resource` and `local_file`. The Lambda module uses both to package a zip.

Between 72% measured and that ceiling sits one structural blocker, described below, worth 2 more resources on the module plan.

## What the plan gives

The premises the issue was filed on hold up.

`count` and `for_each` arrive expanded. `aws_s3_bucket.site` declared with `for_each` over two environments arrives as `aws_s3_bucket.site["staging"]` and `aws_s3_bucket.site["production"]`, each with its own resolved values.

`configuration.…expressions.…references` holds the reference graph, and it is the same edge set `parseSimCfnResourceRefDependencies` builds from a template's `Ref` and `Fn::GetAtt`. Terraform lists both the attribute form and the bare resource form of one reference. `aws_iam_role.processor.arn` and `aws_iam_role.processor` both appear, and the longer one carries the attribute being read.

A deploy binding matching on `functionName` reaches a Lambda function straight from `aws_lambda_function.function_name`, with no new binding kind needed.

## Where the plan runs out

Four things the issue did not anticipate, in the order they cost.

### A resolved value has lost its ordering edge

Terraform resolves what it can before writing the plan. A Lambda permission naming a function created by the same plan carries `"orders-processor"` as a plain string, where a CloudFormation template would carry `{"Ref": "Processor"}`. The value is correct. The edge CloudFormation orders from has gone with it, and the permission is created before the function exists.

The edge survives in `configuration`, which records the reference whether or not the value resolved. `dependsOn` in `sim-tf-template-graph.ts` walks every `references` array a resource declares and turns them back into `DependsOn`. That pass is what puts the Stack back in a deployable order.

### An unknown value takes its structure with it

An attribute unknown at plan time is absent from `planned_values` and marked `true` in `resource_changes[].change.after_unknown`. That much is workable, because the reference behind it survives.

What goes missing is everything the unknown value was inside. A Lambda `environment.variables` map holding one reference to a queue URL arrives as `"variables": true`, and the variable names go with it. `TABLE_NAME`, `QUEUE_URL` and `TOPIC_ARN` appear nowhere in the document.

The same happens to every `jsonencode` result. An `aws_iam_role_policy` built around an ARN of the same plan is unknown in its entirety. Its actions and resources are gone with it. Simulated IAM evaluates authorization, so a lost policy changes behaviour. It is what makes `aws_lambda_event_source_mapping` refuse the app plan. Simulated Lambda checks that the execution role may poll the queue.

An SQS `redrive_policy` loses its `maxReceiveCount` the same way.

### A reference can need an expression evaluator

Resolving a reference to a resource works. Resolving one through a module sometimes needs more.

The API module's integration URI reads `each.value.uri`. `each` iterates the module's `routes` variable. The module call sets that variable from `module.processor.lambda_function_arn`. The processor module's output reads it off `aws_lambda_function.this[0].arn`. Following that means evaluating Terraform expressions rather than reading references.

`sim-tf-module-outputs.ts` follows the module-output hop. That one is tractable and worth having. The `each.value` hop needs an evaluator, and it is why the module plan skips its integration and its route. Community modules are how most Terraform is written, and `for_each` over a routes map is a normal thing for one to do.

### A service refuses properties it cannot act on

Simulated SNS refuses `Tags`, because nothing it models reads a topic tag. It refuses `FifoTopic` even when false. Simulated Secrets Manager refuses a Secret carrying no value, and Terraform keeps the value in a separate `aws_secretsmanager_secret_version`. CloudWatch Logs refuses a retention of 0, which is how Terraform spells "never expire".

Each of these fails the whole Stack. A mapping therefore has to know what its target service accepts. That is per-type work on top of the rename.

Planning offline fails every `data` block that reaches AWS. Both community modules here read `aws_caller_identity`, so `terraform plan` reports an error and exits non-zero. It still writes a plan covering the managed resources. Those are what an import reads, so the test helper checks for the plan file rather than for the exit code.

Two smaller conventions cost a debugging round each. An optional string inside a nested block arrives as `""` where a top-level one arrives as `null`. Taken at face value, a secondary index with no range key declares a nameless RANGE element. A reference to a resource with no mapping produces an intrinsic naming a logical ID the template never declares. The property carrying it reaches the service factory as an object where a string was wanted.

## What one resource type costs

2145 lines of source across 26 files. 1339 of those read the format, resolve references and assemble the template, and that part is paid once. 806 cover 16 mapped types and 7 folds, which is roughly 35 lines each.

35 lines is the rename table plus the handful of properties that need more than a rename. Finding out what the target service refuses took longer than writing the mapping, and that time is on top.

FTA is a real constraint on this shape of code. The mapping files breached the threshold of 50 on the first pass and needed splitting to one service each. Collapsing repeated `attribute(context, "x")` calls into a rename table made the file shorter and its score worse. Density counts tokens against lines.

## Recommendation

Build it, in the shape this spike used, and give it a second source of values alongside the plan.

The import belongs where `samExpandedTemplate` sits. It produces a `CfnTemplateBodyRecord`, and the machinery below it reads one template shape. That worked without any change to the CloudFormation engine, the service factories or the binding machinery. This is the finding that makes the feature affordable.

Reference-to-DependsOn comes first. Everything else needs the Stack to deploy in a usable order. The registry of per-type mappings is the incremental part, and one type is a small enough unit to be one pull request.

How narrow the value problem is decides whether the feature is worth having. It is worth a measurement. 55% of the attributes in these plans are unknown at plan time, which sounds fatal. Count only the attributes a user configured, leaving out the computed outputs Yulin generates for itself, and it is 21% for the module plan and 23% for the application plan. Most of those 21% are bare references to another resource, and the import already turns every one of them into a `Ref` or an `Fn::GetAtt`.

What is left is the set where a reference sits inside a composite that Terraform therefore collapses whole:

- a `jsonencode` document naming a resource of the same plan, which covers IAM inline policies and the `policy` attribute on SQS, SNS, S3 and KMS
- a Lambda `environment.variables` map holding a reference
- a composite string such as `redrive_policy`

On the application plan that is 4 attributes out of 154. It is a list, rather than a property of the format.

Those three land on two Yulin features, and both have somewhere to go. Handler configuration already arrives through a deploy binding matched on function name, and environment variables can arrive the same way. A role whose policy was lost can be recorded and treated as permissive. The engine already records a Resource type no service models and carries on.

So stay on the plan and add value overrides beside the bindings. Reading `terraform show -json` over a state file would resolve all four, at the price of dragging in secrets in plaintext and a dependency on having applied to real AWS. That is a poor trade for four attributes.

## Follow-ups worth filing

- Reference-to-`DependsOn` reconstruction, and the plan reader under it. The prerequisite for everything else.
- Supplying values a plan could not resolve, alongside the existing deploy bindings. Environment variables and inline IAM policies are what this is for.
- Per-type mappings, a few services at a time.
- Terraform expression evaluation for `each.value` and module variables, or a decision to skip the resources that need it. Worth its own issue, because community modules make it common.
