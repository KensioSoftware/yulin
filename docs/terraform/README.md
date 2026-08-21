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
docs](../services/cloudformation/ "Simulated CloudFormation usage docs") describe applies to it.
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

## What the report says

The set of Terraform resource types the adapter maps is deliberately small. A type with no mapping,
and a resource from a provider other than AWS, are recorded and stepped over rather than failing the
deployment.

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

// Attributes a mapping could not carry, such as a Lambda's environment
// variables, which Terraform collapses whole when one of them is unknown.
console.log(report.lost);
```

`mapped`, `folded` and `skipped` add up to the plan's managed resource count. `lost` names the
attributes that did not survive the plan, per resource. A Terraform value that names a resource of
the same plan and sits inside something Terraform builds in one go, such as a `jsonencode` document
or a `for_each` map, is unknown in its entirety and its contents go with it.

## The scope of what it reads

One plan JSON file, already produced. Reading HCL, reading `terraform.tfstate`, and running
`terraform` as a subprocess are all outside it.
