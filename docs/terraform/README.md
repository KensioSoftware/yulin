# Deploy Terraform plans

`TerraformAdapter` reads a Terraform plan in JSON form and deploys its AWS resources into a
`SimAws` instance.

```bash
npm i -D @kensio/yulin
```

## Create the plan JSON

Save a plan, then convert it to JSON:

```bash
terraform plan -out=orders.tfplan
terraform show -json orders.tfplan > orders.tfplan.json
```

`TerraformAdapter` expects the JSON file produced by `terraform show -json`. The binary `.tfplan`
file is only the input to that command.

## Deploy the plan

Create an adapter for the `SimAws` instance and pass the JSON path to `deployPlan`. A Terraform plan
records the location of each Lambda deployment package. Use a binding to supply an executable
handler for the simulated function:

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

The default stack name comes from the plan filename. For example, `orders.tfplan.json` creates a
stack named `orders`. Pass `stackName` when the stack needs a different name.

If the deployment needs no bindings, overrides, or custom stack name, pass the path directly:

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

## Read the deployed stack and import report

`deployPlan` returns `stack` and `report`.

`stack` is a simulated CloudFormation stack. Use `stack.getResource(...)` to read a resource,
`stack.output(...)` to read an output, and `stack.delete()` to delete it. The
[CloudFormation guide](https://yulinsim.dev/services/cloudformation/ "Simulated CloudFormation usage docs")
describes the rest of the stack API.

`report` explains how Terraform resources were imported:

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

- `mapped` lists resources that became CloudFormation resources.
- `folded` lists Terraform resources that became properties of another resource.
- `skipped` lists resources that were omitted and gives the reason for each omission.
- `lost` lists attributes that the plan could not supply and no override replaced.

The `mapped`, `folded`, and `skipped` lists account for every managed resource in the plan.

## How resources and references are imported

A resource declared with `count` or `for_each` arrives in the plan already expanded, and each
instance becomes a separate simulated resource. The adapter also reads resources from nested
modules.

When an attribute is unknown at plan time, Terraform omits its value but keeps its references. The
adapter follows references through module inputs, module outputs, `each.value`, and `each.key`.

The adapter also restores dependency ordering from each resource's references. This matters when
Terraform has already resolved a reference to a plain string in the planned values.

## Supplying environment variables and role policies

Terraform marks a whole compound value as unknown when any part of it cannot be resolved. This can
remove every key from a Lambda `environment.variables` map. It can also remove every statement from
an IAM policy built with `jsonencode`.

Use `overrides` to supply these values. Lambda environment overrides match the function name. IAM
policy overrides match the role name:

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

An override only fills a missing value. A value resolved by Terraform takes precedence. Environment
variables are merged by key.

If an IAM role's inline policy is missing, Yulin gives the role an allow-all policy so resources can
still be created. The report records `policy` under `lost`. Supplying a policy override removes that
fallback, and simulated IAM evaluates the supplied policy normally.

## Available functionality

- `TerraformAdapter` reads JSON produced by `terraform show -json` for a saved plan.
- `deployPlan` accepts a path or an object containing `planPath`, `stackName`, `bindings`, and
  `overrides`.
- The adapter maps 24 Terraform resource types and folds 11 configuration resources into their
  parent resources.
- Supported resource areas include API Gateway HTTP APIs, CloudWatch, Cognito, DynamoDB, ECR, IAM,
  KMS, Lambda, S3, Secrets Manager, SNS, SQS, and SSM Parameter Store.
- Resources created with `count` and `for_each` are imported as separate instances.
- Resources in nested modules are imported.
- The adapter reports mapped, folded, skipped, and lost data for the plan.

## Limitations

- The adapter reads one existing plan JSON file. It does not read HCL or Terraform state, and it does
  not run Terraform.
- Resources from non-AWS providers and Terraform types without a mapping are skipped and recorded in
  `report.skipped`.
- The adapter cannot follow values through Terraform `local` declarations because a plan contains
  their results but not their definitions.
- A collection reference can be ambiguous. For example, `each.value.uri` cannot be resolved when the
  source collection contains several possible Lambda function references. The affected resource is
  skipped with the reason `unresolved required attribute`.
- Some unknown compound values need an override because Terraform omits the whole value from the
  plan.
