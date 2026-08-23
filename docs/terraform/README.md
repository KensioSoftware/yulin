# Terraform

A team whose infrastructure is written in Terraform can deploy it into simulated AWS without
hand-writing a second CloudFormation template describing the same infrastructure. `TerraformAdapter`
reads the JSON `terraform show -json` writes for a saved plan file and creates the resources the
plan declares.

```bash
npm i -D @kensio/yulin
```

## Deploying a plan

Write the JSON first. `terraform plan` produces the saved plan in Terraform's own binary format, and
`terraform show -json` turns that into the document the adapter reads.

```bash
terraform plan -out=orders.tfplan
terraform show -json orders.tfplan > orders.tfplan.json
```

A plan carries no code for its functions. It points at a zip on disk, an S3 object or a container
image, and none of the three is a handler Yulin can run. A binding matched on the function name the
plan declares is where the behaviour comes from.

```typescript terraform-deploy-plan
/**
 * Deploying a Terraform plan into simulated AWS.
 */

import { SimAws } from "@kensio/yulin";
import { TerraformAdapter } from "@kensio/yulin/terraform";

const simAws = new SimAws();

const { stack } = await new TerraformAdapter(simAws).deployPlan({
  planPath: "terraform/orders.tfplan.json",
  bindings: [
    {
      functionName: "orders-processor",
      handler: (event: { orderId: string }): string => `took ${event.orderId}`,
    },
  ],
});

// The bucket, the table and the queue the configuration declared.
console.log(simAws.s3().getSimBucketByName("orders-uploads")?.bucketName);
console.log(simAws.dynamoDb().findTable("orders-orders")?.tableName);

console.log(stack.status);
```

The Stack is named after the plan file when the deployment does not name one, so
`orders.tfplan.json` deploys as `orders`. Pass `stackName` to name it yourself, and pass the path on
its own where nothing else needs saying.

```typescript terraform-deploy-plan-path
/**
 * Deploying a Terraform plan named by path alone.
 */

import { SimAws } from "@kensio/yulin";
import { TerraformAdapter } from "@kensio/yulin/terraform";

const simAws = new SimAws();

const { stack } = await new TerraformAdapter(simAws).deployPlan(
  "terraform/orders.tfplan.json",
);

console.log(stack.stackName);
```

## What comes back

`deployPlan` answers with the Stack and a report of what reading the plan made of it.

The Stack is an ordinary simulated CloudFormation Stack, and everything the [CloudFormation
docs](https://yulinsim.dev/services/cloudformation/ "Simulated CloudFormation usage docs") describe applies to it.
Resources are read with `stack.getResource(...)`, Outputs with `stack.output(...)`, and the whole
thing is torn down with `stack.delete()`.

## What the adapter reads

A resource declared with `count` or `for_each` arrives in the plan already expanded, and each
instance becomes a resource of its own. Resources declared inside a module are reached through the
module path they were declared under, however many modules deep.

An attribute Terraform could not resolve at plan time is absent from the plan's values. The plan
keeps the reference behind it, and that reference becomes the link a hand-written template would
have carried.

Ordering is rebuilt. Terraform resolves what it can before writing the plan, so a Lambda permission
naming a function the same plan creates carries the function's name as a plain string. The value is
right and the edge CloudFormation orders from has gone with it. Every reference a resource declares
becomes an ordering edge, whether or not the value resolved.

## Supplying environment variables and role policies

Terraform resolves nothing inside a value it could not build. A Lambda `environment.variables` map
holding one reference to a queue of the same plan arrives unknown in its entirety, and the variable
names go with it. An `aws_iam_role_policy` written with `jsonencode` around an ARN of the same plan
arrives without its statements.

Those two cost more than their count suggests (four attributes out of 154 on a hand-written
application configuration). A handler reads its configuration out of environment variables, and
simulated IAM evaluates authorization.

`overrides` supplies them, matched on the name the plan carries, the way a binding is matched on a
function name. An environment is matched on the function's name and an inline policy on the role's.

```typescript terraform-plan-overrides
/**
 * Supplying the values a Terraform plan could not carry.
 */

import { SimAws } from "@kensio/yulin";
import { TerraformAdapter } from "@kensio/yulin/terraform";

const simAws = new SimAws();

const { report } = await new TerraformAdapter(simAws).deployPlan({
  planPath: "terraform/orders.tfplan.json",
  bindings: [
    {
      functionName: "orders-processor",
      handler: (): string => process.env["QUEUE_URL"] ?? "",
    },
  ],
  overrides: [
    {
      functionName: "orders-processor",
      environment: {
        TABLE_NAME: "orders-orders",
        QUEUE_URL:
          "https://sqs.eu-west-1.amazonaws.com/123456789012/orders-processing",
      },
    },
    {
      roleName: "orders-processor",
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "sqs:ReceiveMessage",
              "sqs:DeleteMessage",
              "sqs:GetQueueAttributes",
            ],
            Resource: "*",
          },
        ],
      },
    },
  ],
});

// The attributes the plan lost that no override covered.
console.log(report.lost);
```

An override fills a gap. Where Terraform resolved the value, the plan wins, and environment
variables are merged one variable at a time. A configuration that stops collapsing a value stops
needing the override written for it.

A role whose policy no override supplies is created allowing everything, and `policy` is named on
the report's `lost`. Simulated IAM evaluates authorization, and a role holding no policy would deny
what the configuration allowed and fail the resources using it (an event source mapping is refused
outright when its execution role cannot poll the queue). Supplying the policy takes that default
off. The document is evaluated as it stands, and one omitting `sqs:ReceiveMessage` fails the mapping
the way AWS fails it.

## What it maps

The adapter maps 24 Terraform resource types and folds 11 more into the resource they configure. The
set covers API Gateway, CloudWatch (log groups, metric alarms and EventBridge rules), Cognito,
DynamoDB, ECR, IAM, KMS, Lambda, S3, Secrets Manager, SNS, SQS and SSM Parameter Store.

A hand-written application configuration of 46 resources deploys whole. A configuration built out of
published `terraform-aws-modules` modules reaches 21 of its 25. Of the four it leaves, the Lambda
module uses `null_resource` and `local_file` to package a zip, and an integration and a route read
their values through a `for_each` hop the adapter steps over.

## What the report says

A type with no mapping, and a resource from a provider other than AWS, are recorded and stepped over
rather than failing the deployment.

```typescript terraform-plan-report
/**
 * Reading what a Terraform plan import made of the plan.
 */

import { SimAws } from "@kensio/yulin";
import { TerraformAdapter } from "@kensio/yulin/terraform";

const simAws = new SimAws();

const { report } = await new TerraformAdapter(simAws).deployPlan(
  "terraform/orders.tfplan.json",
);

// [ { address: 'aws_s3_bucket.uploads', type: 'aws_s3_bucket',
//     cfnType: 'AWS::S3::Bucket', logicalId: 'AwsS3BucketUploads' } ]
console.log(report.mapped);

// [ { address: 'aws_route53_zone.public', type: 'aws_route53_zone',
//     reason: 'no mapping for resource type' } ]
console.log(report.skipped);

// The aws_s3_bucket_versioning and friends that became bucket properties.
console.log(report.folded);

// Attributes a mapping could not carry and no override supplied, such as a
// Lambda's environment variables, which Terraform collapses whole when one of
// them is unknown.
console.log(report.lost);
```

`mapped`, `folded` and `skipped` add up to the plan's managed resource count. `lost` names the
attributes that did not survive the plan and that no override covered, per resource. A Terraform
value that names a resource of the same plan and sits inside something Terraform builds in one go,
such as a `jsonencode` document or a `for_each` map, is unknown in its entirety and its contents go
with it.

## What a reference cannot reach

A value a plan resolved arrives as a value. A value the plan could not resolve arrives as a
reference, and the import follows that reference to the resource that will produce it, through
module outputs, module variables, `each.value` and `each.key`. That covers what a community module
such as `terraform-aws-modules/apigateway-v2/aws` does with a `routes` map.

Two shapes stop it, and both are recorded as `unresolved required attribute` on `report.skipped`.

A plan records the references of a whole collection in one list, and the list says what the
collection was built from without saying which entry holds which. A `routes` map naming one function
is unambiguous. A `routes` map naming two functions leaves `each.value.uri` able to mean either, and
the import declines. Setting the value with a resource of its own, or with one module call per
function, gives each reference a collection to itself.

A value reaching a resource through a `local` is out of range whatever it holds. A plan carries the
locals' effects and none of their definitions, so there is nothing to follow.

## The scope of what it reads

One plan JSON file, already produced. Reading HCL, reading `terraform.tfstate`, and running
`terraform` as a subprocess are all outside it.
