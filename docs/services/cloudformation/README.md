# Simulated CloudFormation

Yulin includes a simulated CloudFormation service for tests and local development. It creates
simulated AWS resources from CloudFormation templates, and works with hand-written templates, AWS
SDK-style `CreateStackCommand` calls, or synthesized CDK template files.

## Basic usage

Create a simulated AWS environment, get simulated CloudFormation, and deploy a template.

```typescript sim-cloudformation-basic-template
/**
 * Deploying a simple CloudFormation template into simulated AWS.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

const stack = await simCfn.deployTemplate({
  stackName: "site-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "example-site-bucket",
          WebsiteConfiguration: {
            IndexDocument: "index.html",
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const bucket = simAws.s3().getSimBucketByName("example-site-bucket");
console.log(bucket?.bucketName);
```

`deployTemplate(...)` returns the simulated stack object. If your test needs the created resources
to be available, wait for deployment to complete before asserting final state.

### Naming the template type

A template written inline is typed by `deployTemplate(...)` itself. A test that builds a template up
somewhere else can name that type as `CfnTemplateBodyRecord`.

```typescript sim-cloudformation-template-type
/**
 * Naming the type of a template a test builds somewhere other than the call.
 */

import { SimAws } from "@kensio/yulin";
import type { CfnTemplateBodyRecord } from "@kensio/yulin/cloudformation";

function siteTemplate(bucketName: string): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: bucketName,
        },
      },
    },
  };
}

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "typed-site-stack",
  template: siteTemplate("typed-site-bucket"),
});

await stack.waitForDeployComplete();

console.log(simAws.s3().getSimBucketByName("typed-site-bucket")?.bucketName);
```

## Creating stacks with AWS SDK command shapes

You can also use AWS SDK-style CloudFormation commands.

```typescript sim-cloudformation-create-stack-command
/**
 * Creating a simulated CloudFormation Stack with CreateStackCommand.
 */

import {
  CreateStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "command-stack",
    TemplateBody: JSON.stringify({
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "command-stack-bucket",
          },
        },
      },
    }),
  }),
);

await simCfn.waitForStackDeployComplete("command-stack");

const describeOutput = await simCfn.describeStacks(
  new DescribeStacksCommand({
    StackName: "command-stack",
  }),
);

console.log(describeOutput.Stacks?.[0]?.StackStatus);
```

`createStack(...)` starts deployment and returns once the stack has been accepted. Resource creation
continues asynchronously, similar to real CloudFormation. Use `waitForStackDeployComplete(...)` when
you need final stack state.

## Stack deployment is asynchronous

A stack may be visible before all resources have finished creating.

```typescript sim-cloudformation-wait-for-deploy
/**
 * Waiting for a simulated CloudFormation deployment to finish.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "async-stack",
  template: {
    Resources: {
      WaitHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await simAws.cloudFormation().waitForStackDeployComplete("async-stack");
```

You can also wait through the returned stack object:

```typescript sim-cloudformation-stack-wait
/**
 * Waiting via the returned simulated CloudFormation Stack object.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "stack-object-wait",
  template: {
    Resources: {
      WaitHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await stack.waitForDeployComplete();
```

If your scenario also depends on asynchronous work scheduled by the created services, you can drain
the broader simulator background tasks:

```typescript sim-cloudformation-background-tasks
/**
 * Waiting for simulated AWS background tasks to complete.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// Deploy stacks and interact with simulated services...

await simAws.backgroundTasksComplete();
```

## Updating a stack

`UpdateStackCommand` applies a changed template to a stack that is already deployed. Resources the
new template adds are created, resources it drops are deleted, and resources it changed are
replaced. Everything else is left alone, holding whatever it holds in simulated S3, DynamoDB or
anywhere else. That is what lets a long-running local process pick up an infrastructure change
without restarting and losing its data.

```typescript sim-cloudformation-update-stack
/**
 * Applying a changed template with UpdateStackCommand.
 */

import {
  CreateStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

const siteBucket = {
  Type: "AWS::S3::Bucket",
  Properties: { BucketName: "site-content" },
};

const deployedTemplate = JSON.stringify({
  Resources: { SiteBucket: siteBucket },
});

const changedTemplate = JSON.stringify({
  Resources: {
    SiteBucket: siteBucket,
    UploadsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "site-uploads" },
    },
  },
});

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "site",
    TemplateBody: deployedTemplate,
  }),
);
await simCfn.waitForStackDeployComplete("site");

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "site-content",
    Key: "index.html",
    Body: "<h1>Hello</h1>",
  }),
);

// Apply the changed template to the stack that is already there.
await simCfn.updateStack(
  new UpdateStackCommand({
    StackName: "site",
    TemplateBody: changedTemplate,
  }),
);
await simCfn.waitForStackUpdateComplete("site");

// The bucket the new template adds is in simulated S3.
console.log(simAws.s3().getSimBucketByName("site-uploads"));

// And the bucket the template did not change still holds its object.
const page = await simAws
  .s3()
  .getObject(
    new GetObjectCommand({ Bucket: "site-content", Key: "index.html" }),
  );
console.log(page.Body);
```

The resource work runs in the background, as deployment does. `updateStack(...)` returns once the
stack has moved to `UPDATE_IN_PROGRESS`, and `waitForStackUpdateComplete(...)` waits for the
resources to change. `DescribeStacksCommand` reports `UPDATE_IN_PROGRESS` in between and
`UPDATE_COMPLETE` after, along with the outputs resolved again against the new template.

`UpdateStackCommand` refuses a stack name that was never deployed, with the same `ValidationError`
that `DescribeStacksCommand` answers such a name with. An update of a stack that was never there
could mean nothing else.

### What counts as a change

Resources are compared as they resolve, not as they are written. A changed parameter value shows up
as a changed resource even when the template body is identical, and a template reordered without
being changed shows up as no change at all. Outputs are compared the same way. The rest of the
template body is compared as written. A change to a section the simulator ignores, such as
`Description`, is still an update.

A template that changes nothing at all is refused with a `ValidationError` reading
`No updates are to be performed.`, the same answer CloudFormation gives. So is an update asked for
while another is still running.

### Changed resources are replaced

A resource whose template entry changed is deleted and created again from the new template. Real
CloudFormation updates most properties in place and keeps what the resource holds. That makes this a
divergence worth knowing about. A bucket that gains a property loses its objects here, where in AWS
it would keep them. In-place update is the obvious next step, still to be built.

Two things follow from replacement:

- A resource naming a replaced resource is replaced too, all the way up the dependency chain, and
  nothing is left pointing at a resource that has gone. Real CloudFormation hands the dependent the
  new physical name and leaves it standing.
- `UpdateReplacePolicy` is not read. Honouring `Retain` would leave the old resource holding the
  name the replacement needs, and CDK marks buckets and tables with it as a matter of course, so
  every such update would fail. The old resource is deleted whatever the policy says.

A failed update leaves the stack in `UPDATE_FAILED` with the reason on it, and leaves the resources
where the update got to. There is no rollback to the previous template.
`waitForStackUpdateComplete(...)` rethrows the error, and `DescribeStacksCommand` reports it as
`StackStatusReason`. Dealing with the cause and sending `UpdateStackCommand` again applies the rest
of the change.

## Deleting a stack

`DeleteStackCommand` deletes the resources a stack created, in the reverse of the order they were
created in, and then releases the stack name.

```typescript sim-cloudformation-delete-stack
/**
 * Deleting a simulated CloudFormation Stack with DeleteStackCommand.
 */

import {
  CreateStackCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

const templateBody = JSON.stringify({
  Resources: {
    SiteBucket: {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: "deletable-stack-bucket",
      },
    },
  },
});

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "deletable-stack",
    TemplateBody: templateBody,
  }),
);
await simCfn.waitForStackDeployComplete("deletable-stack");

await simCfn.deleteStack(
  new DeleteStackCommand({ StackName: "deletable-stack" }),
);
await simCfn.waitForStackDeleteComplete("deletable-stack");

// The Bucket has gone from simulated S3.
console.log(simAws.s3().getSimBucketByName("deletable-stack-bucket"));

// And the Stack name is free, so the same Stack can be deployed again.
await simCfn.createStack(
  new CreateStackCommand({
    StackName: "deletable-stack",
    TemplateBody: templateBody,
  }),
);
await simCfn.waitForStackDeployComplete("deletable-stack");
```

Deletion runs in the background, as deployment does. `deleteStack(...)` returns once the stack has
moved to `DELETE_IN_PROGRESS`, and `waitForStackDeleteComplete(...)` waits for the resources to go.
`DescribeStacksCommand` reports `DELETE_IN_PROGRESS` in between, and then refuses the stack name with
a `ValidationError` once the deletion has finished. That is how CloudFormation answers a name it no
longer holds.

Deleting a stack name that was never deployed succeeds, as it does in CloudFormation.

### When a resource cannot be deleted

Some resources refuse to go, the same way they do in AWS. An S3 bucket that still holds objects is
the common one. CloudFormation fails there and never empties the bucket for you. That is why CDK
ships an `autoDeleteObjects` custom resource.

A refusal leaves the stack in `DELETE_FAILED` with the reason on it, and keeps the stack name in use.
`waitForStackDeleteComplete(...)` rethrows the error, and `DescribeStacksCommand` reports it as
`StackStatusReason`. Dealing with the cause and sending `DeleteStackCommand` again deletes the stack.

### `DeletionPolicy`

A resource declared with `DeletionPolicy: Retain` is left in simulated AWS and reported as
`DELETE_SKIPPED`, the same as CloudFormation reports it. The rest of the stack still deletes around
it, and the stack name is still released. `RetainExceptOnCreate` is treated the same way, because the
two differ only in what a rolled back creation does, and sim CloudFormation never rolls a deployment
back.

Retained resources are readable from the stack:

```typescript
console.log(stack.retainedResources.map((resource) => resource.logicalId));
```

## Parameters

Template parameters can be supplied when creating a stack.

```typescript sim-cloudformation-parameters
/**
 * Supplying simulated CloudFormation Parameters.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "parameter-stack",
  template: {
    Parameters: {
      BucketName: {
        Type: "String",
        Default: "default-parameter-bucket",
      },
    },
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            Ref: "BucketName",
          },
        },
      },
    },
  },
  parameters: {
    BucketName: "configured-parameter-bucket",
  },
});

await stack.waitForDeployComplete();

console.log(
  simAws.s3().getSimBucketByName("configured-parameter-bucket")?.bucketName,
);
```

A parameter with no supplied value takes the template default, when the template has one.

A parameter's `Type` is read for the `AWS::SSM::Parameter::Value<...>` types, which hold a Parameter
Store name and resolve to the value stored under it. See
[reading a parameter through a template Parameter](https://yulinsim.dev/services/ssm/#reading-a-parameter-through-a-template-parameter).
Every other type is accepted and its value used as written, with no validation of the value against
the type.

## Intrinsic functions

Sim CloudFormation supports common intrinsic functions used by supported resources.

### `Ref`

```typescript sim-cloudformation-ref
/**
 * Using Ref between simulated CFN resources.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "ref-stack",
  template: {
    Resources: {
      SourceBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "source-ref-bucket",
        },
      },
      WebsiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::Join": ["-", [{ Ref: "SourceBucket" }, "website"]],
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(
  simAws.s3().getSimBucketByName("source-ref-bucket-website")?.bucketName,
);
```

For supported resource types, `Ref` returns the resource-specific CloudFormation value. For example,
an S3 Bucket `Ref` returns the Bucket name.

### `Fn::GetAtt`

```typescript sim-cloudformation-get-att
/**
 * Using Fn::GetAtt with a simulated CloudFront Distribution.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "get-att-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "get-att-site-bucket",
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Enabled: true,
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: "get-att-site-bucket.s3.amazonaws.com",
                S3OriginConfig: {},
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "SiteOrigin",
              ViewerProtocolPolicy: "allow-all",
            },
          },
        },
      },
      DistributionNameHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
        Properties: {
          Value: {
            "Fn::GetAtt": ["SiteDistribution", "DomainName"],
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
```

For `AWS::CloudFront::Distribution`, `Fn::GetAtt: ["Distribution", "DomainName"]` returns the
simulated CloudFront hostname, such as `e123example.cloudfront.net`.

#### Values from a skipped Resource

A Resource that was skipped, because its type is outside the simulation or because there is no
simulated Resource to create at all, still answers both intrinsics. `Ref` returns the logical ID, and
`Fn::GetAtt` returns the string `<logical ID>.<attribute name>`.

```typescript sim-cloudformation-skipped-resource-values
/**
 * The stand-in values a skipped CloudFormation Resource answers with.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "stand-in-stack",
  template: {
    Resources: {
      AlarmRule: {
        Type: "AWS::CloudWatch::Alarm",
      },
    },
    Outputs: {
      AlarmRef: { Value: { Ref: "AlarmRule" } },
      AlarmArn: { Value: { "Fn::GetAtt": ["AlarmRule", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.output("AlarmRef"));
// "AlarmRule"

console.log(stack.output("AlarmArn"));
// "AlarmRule.Arn"

for (const skipped of stack.skippedResources) {
  console.log(skipped.logicalId, skipped.skippedReason);
  // "AlarmRule Unsupported sim CloudFormation Resource service CloudWatch"
}
```

The stand-ins are what lets a template with unsimulated Resources in it deploy at all. Without them,
every Resource holding a `Ref` or `Fn::GetAtt` to a skipped Resource would fail too, and so would
every Resource depending on those, until one EventBridge rule took the whole stack down with it. The skip
stays where it happened.

A stand-in is deliberately shaped unlike an ARN. It fails closed wherever the simulator reads it.

- In an IAM policy `Resource` it matches no ARN, so a caller relying on that statement is denied.
- In a property that is parsed as an ARN it is refused as malformed, and that Resource fails.
  Handing `Fn::GetAtt: ["Orders", "StreamArn"]` from a skipped DynamoDB table to an
  `AWS::Lambda::EventSourceMapping` fails with
  `EventSourceArn Orders.StreamArn names no simulated Lambda event source`.
- Handed to a Lambda function through its environment, it names something absent. The function's own
  SDK call fails the way a call for a missing resource does. A `PutItem` naming the skipped table
  gets `ResourceNotFoundException: No DynamoDB Table named Orders`.

A stand-in stands in for something absent, and is never a value to rely on. A test asserting against
one is asserting on a Resource that was never created. `stack.skippedResources` is where to find out
which Resources those are and why, under
[Inspecting stacks and resources](#inspecting-stacks-and-resources).

### `Fn::Join`

```typescript sim-cloudformation-fn-join
/**
 * Joining literal values and Refs in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "join-stack",
  template: {
    Parameters: {
      BucketPrefix: {
        Type: "String",
        Default: "joined",
      },
    },
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::Join": ["-", [{ Ref: "BucketPrefix" }, "site", "bucket"]],
          },
        },
      },
    },
  },
});
```

### `Fn::Sub`

```typescript sim-cloudformation-fn-sub
/**
 * Substituting parameter and resource values in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "sub-stack",
  template: {
    Parameters: {
      SiteName: {
        Type: "String",
        Default: "docs",
      },
    },
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            // eslint-disable-next-line no-template-curly-in-string
            "Fn::Sub": "${SiteName}-site-bucket",
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(simAws.s3().getSimBucketByName("docs-site-bucket")?.bucketName);
```

### `Fn::FindInMap`

A template `Mappings` section holds two levels of keys against a value. `Fn::FindInMap` reads one of
those values, given the map name, the top-level key and the second-level key.

```typescript sim-cloudformation-fn-find-in-map
/**
 * Reading a value from template Mappings in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "find-in-map-stack",
  template: {
    Parameters: {
      Environment: {
        Type: "String",
        Default: "staging",
      },
    },
    Mappings: {
      EnvironmentMap: {
        staging: { BucketName: "staging-site-bucket" },
        production: { BucketName: "production-site-bucket" },
      },
    },
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::FindInMap": [
              "EnvironmentMap",
              { Ref: "Environment" },
              "BucketName",
            ],
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(simAws.s3().getSimBucketByName("staging-site-bucket")?.bucketName);
```

Each of the three arguments can be a nested expression as well as a literal string, as long as it
resolves to a string. The example above uses a `Ref` to a parameter for the top-level key. A `Ref` to
the `AWS::Region` pseudo parameter works the same way, for the per-region maps that `Fn::FindInMap`
is most often used for, and a nested `Fn::FindInMap` can supply any of the three arguments.

The value a lookup returns can be any type. A list value is returned as a list.

`Fn::FindInMap` is resolved when the template is read, before any resource is created, and can be
used in resource properties and in `Outputs`. A map name or key missing from `Mappings` fails the
deployment with an error naming the path that could not be found.

### `Fn::Split` and `Fn::Select`

`Fn::Split` cuts a string into a list on a delimiter. `Fn::Select` reads one value out of a list by
its zero-based index. They are usually written together, to pull one part out of a string another
resource gave.

```typescript sim-cloudformation-fn-select-split
/**
 * Naming a bucket after part of another bucket's domain name.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "select-split-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "site-bucket" },
      },
      LogsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            "Fn::Join": [
              "-",
              [
                {
                  "Fn::Select": [
                    0,
                    {
                      "Fn::Split": [
                        ".",
                        { "Fn::GetAtt": ["SiteBucket", "DomainName"] },
                      ],
                    },
                  ],
                },
                "logs",
              ],
            ],
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// site-bucket-logs, from the first part of site-bucket.s3.amazonaws.com
console.log(simAws.s3().getSimBucketByName("site-bucket-logs")?.bucketName);
```

The delimiter is a literal string. The string being split can be any expression that resolves to a
string, including a `Ref`, an `Fn::GetAtt` or another function. A delimiter absent from the string
gives a one-element list, and a delimiter at the start or end of the string gives an empty element
there, as CloudFormation does.

`Fn::Select` takes its list from a literal list, from `Fn::Split`, or from anything else that
resolves to a list, such as an `Fn::FindInMap` of a list value. The index is a number or a string of
digits, so a `Ref` to a parameter can supply it.

That pair is how a host is read out of a URL. CDK writes this shape when a CloudFront origin points
at a Lambda function URL:

```json
{
  "DomainName": {
    "Fn::Select": [
      2,
      { "Fn::Split": ["/", { "Fn::GetAtt": ["Url", "FunctionUrl"] }] }
    ]
  }
}
```

`https://abc123.lambda-url.eu-west-2.on.aws/` splits into
`["https:", "", "abc123.lambda-url.eu-west-2.on.aws", ""]`, so index 2 is the host.

An index past the end of the list, a negative or fractional index, and a second argument of any type
but a list all fail the deployment, as they are all templates AWS rejects. The error names the
resource and the property path the value sat at, for example
`Sim CloudFormation Resource LogsBucket value at Properties.BucketName`.

### `Fn::ImportValue`

`Fn::ImportValue` reads a value another Stack exported. A Stack exports one by giving an Output an
`Export.Name`, and a Stack in the same Account and Region imports it by that name.

CDK writes both halves on its own. Referencing a resource in another Stack of the same app puts an
`Export` on the producer and an `Fn::ImportValue` on the consumer, with no opt-in.

```typescript sim-cloudformation-fn-import-value
/**
 * Sharing a value between two simulated CloudFormation Stacks.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cloudFormation = simAws.cloudFormation();

await cloudFormation.deployTemplate({
  stackName: "producer-stack",
  template: {
    Resources: {
      Uploads: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "shared-uploads" },
      },
    },
    Outputs: {
      UploadsBucket: {
        Value: { Ref: "Uploads" },
        Export: { Name: "producer-stack:UploadsBucket" },
      },
    },
  },
});

const consumer = await cloudFormation.deployTemplate({
  stackName: "consumer-stack",
  template: {
    Resources: {
      UploadsTopic: {
        Type: "AWS::SNS::Topic",
        Properties: {
          TopicName: "uploads-topic",
          DisplayName: { "Fn::ImportValue": "producer-stack:UploadsBucket" },
        },
      },
    },
  },
});

await consumer.waitForDeployComplete();

// shared-uploads, read from the export the producer Stack published
console.log(consumer.getResource("UploadsTopic")?.properties["DisplayName"]);
```

Deploy the producer first. An export is published once the producer's Outputs have resolved, which
happens after its Resources have been created. A consumer deployed ahead of its producer has
nothing to import.

An import naming an export no Stack has published fails with `No export named <name> found`, the
way CloudFormation refuses one. A Stack exporting a name another Stack already holds fails to
deploy. A deleted Stack releases its export names, leaving them free for the next Stack.

Exports are scoped per Account and Region, as they are on AWS. A Stack in one Region reads only the
exports published in that Region.

## Dynamic references

A `{{resolve:...}}` dynamic reference reads a value from another service while a resource is being
created. It is written into the template as ordinary text, so it can sit inside a longer string.

`Fn::Sub` and `Fn::Join` resolve first, and the reference is read from the string they built. CDK
writes that shape whenever a secret sits in the same stack as the resource reading it (the secret's
ARN arrives as a `Ref`).

`{{resolve:ssm:name}}` and `{{resolve:ssm:name:3}}` read a simulated SSM parameter. See
[reading a parameter with a dynamic reference](https://yulinsim.dev/services/ssm/#reading-a-parameter-with-a-dynamic-reference)
for what they resolve to, and for what happens when Parameter Store cannot answer one.

`{{resolve:secretsmanager:secret-id:secret-string:json-key:version-stage:version-id}}` reads a
simulated secret. See
[reading a secret with a dynamic reference](https://yulinsim.dev/services/secretsmanager/#reading-a-secret-with-a-dynamic-reference)
for the segments and for what a reference Secrets Manager cannot answer resolves to.

`{{resolve:ssm-secure:...}}` is left in the template as written, and is not resolved yet.

## Conditions

A template `Conditions` section names boolean expressions over the stack's parameter values. A
condition decides whether a resource is created, and which value `Fn::If` gives a property or an
output.

```typescript sim-cloudformation-conditions
/**
 * Choosing resources and property values by condition in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "conditions-stack",
  template: {
    Parameters: {
      EnvName: { Type: "String" },
    },
    Conditions: {
      IsProd: { "Fn::Equals": [{ Ref: "EnvName" }, "prod"] },
    },
    Resources: {
      Backups: {
        Type: "AWS::S3::Bucket",
        Condition: "IsProd",
        Properties: { BucketName: "site-backups" },
      },
      Site: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: {
            // eslint-disable-next-line no-template-curly-in-string
            "Fn::If": ["IsProd", "site", { "Fn::Sub": "site-${EnvName}" }],
          },
        },
      },
    },
  },
  parameters: { EnvName: "dev" },
});

await stack.waitForDeployComplete();

// site-dev
console.log(simAws.s3().getSimBucketByName("site-dev")?.bucketName);

// false, because IsProd is false
console.log(stack.getResource("Backups") !== undefined);
```

### Writing a condition

A condition is built from `Fn::Equals`, `Fn::And`, `Fn::Or` and `Fn::Not`. `Fn::And` and `Fn::Or`
take a list of two to ten conditions, and `Fn::Not` takes a list of exactly one. A condition can
name another condition with `{ "Condition": "OtherCondition" }`, in any order, so a condition may
name one written below it in the section.

```json
{
  "IsProd": { "Fn::Equals": [{ "Ref": "EnvName" }, "prod"] },
  "IsStaging": { "Fn::Equals": [{ "Ref": "EnvName" }, "staging"] },
  "IsDeployed": {
    "Fn::Or": [{ "Condition": "IsProd" }, { "Condition": "IsStaging" }]
  }
}
```

`Fn::Equals` compares its two values as strings, as CloudFormation does. A JSON number in the
template matches the string a parameter carries.

The whole section is evaluated once per deployment, before any resource is created. A condition can
read parameters and pseudo parameters and nothing else. A comparison that would need a created
resource, such as an `Fn::GetAtt`, fails the deployment rather than reading as false.

### `Fn::If`

`Fn::If` takes a condition name, a value to use when it is true, and a value to use when it is
false. It works anywhere a resource property or an output value is read.

Only the branch the condition selects is resolved. The other branch is left alone, and may name a
resource this deployment never creates.

### The resource `Condition` attribute

A resource carrying a `Condition` attribute whose condition is false is never created. It is absent
from `stack.getResource(...)`. A resource sim CloudFormation skips behaves differently. A skipped resource
stays in the stack and answers `Ref` and `Fn::GetAtt` with
[stand-in values](#values-from-a-skipped-resource).

With the resource absent, another resource naming it fails the deployment, with an error naming both
resources and the condition. That covers a `Ref` or `Fn::GetAtt` that is actually reached, and a
`DependsOn`. A name carried only by the unselected branch of an `Fn::If` is never reached, and never
fails.

A `Condition` attribute naming a condition the template leaves undefined fails the same way.

## Resource dependencies

Resources can depend on each other explicitly with `DependsOn`.

```typescript sim-cloudformation-depends-on
/**
 * Explicit resource dependencies in a simulated CFN template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "depends-on-stack",
  template: {
    Resources: {
      SourceBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "dependency-source-bucket",
        },
      },
      DependentBucket: {
        Type: "AWS::S3::Bucket",
        DependsOn: "SourceBucket",
        Properties: {
          BucketName: "dependency-target-bucket",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
```

Resources that reference another resource with `Ref` are also created after the referenced resource
is ready.

## Deploying synthesized CDK templates

Use `deployTemplateFile(...)` to deploy a template file, including the JSON templates CDK synthesis
produces.

```typescript sim-cloudformation-cdk-template-file
/**
 * Deploying a synthesized CDK template file into simulated AWS.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws
  .cloudFormation()
  .deployTemplateFile(
    path.join(process.cwd(), "cdk.out", "TestStack.template.json"),
  );

await stack.waitForDeployComplete();
```

You can also pass an object when you need extra deployment options:

```typescript sim-cloudformation-template-file-options
import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplateFile({
  templatePath: path.join(process.cwd(), "cdk.out", "TestStack.template.json"),
  stackName: "local-cdk-stack",
});

await stack.waitForDeployComplete();
```

This is useful for local integration tests where you want CDK to produce the template, then Yulin to
create the simulated resources from that synthesized output template.

A template path with no file at it is refused with
`No Sim CloudFormation template file at <path>`, naming the resolved path. A synthesized template
is build output, and a checkout that has yet to synthesize one meets this on the first run.

## Deploying a template written as YAML

CloudFormation takes a template in JSON or in YAML, and a template written by hand is usually YAML.
`deployTemplateFile(...)` reads a `.yaml` or `.yml` file as YAML.

```yaml
Resources:
  WorkQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub "${AWS::StackName}-work"
Outputs:
  QueueArn:
    Value: !GetAtt WorkQueue.Arn
```

```typescript sim-cloudformation-yaml-template-file
/**
 * Deploying a hand-written YAML template file into simulated AWS.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws
  .cloudFormation()
  .deployTemplateFile(
    path.join(process.cwd(), "infrastructure", "work-stack.yaml"),
  );

await stack.waitForDeployComplete();

console.log(stack.stackName); // "work-stack"
```

The Stack name comes from the file name with the extension dropped, the way a synthesized name drops
`.template.json`.

Short-form tags resolve to what their long forms resolve to. `!GetAtt WorkQueue.Arn` and
`Fn::GetAtt: [WorkQueue, Arn]` are the same Output. The tags Yulin reads are `!Ref`, `!GetAtt`,
`!Join`, `!Sub`, `!FindInMap`, `!If`, `!Split`, `!Select`, `!ImportValue`, `!And`, `!Equals`, `!Not`,
`!Or` and `!Condition`. A tag for an intrinsic Yulin has no behaviour for, such as `!Base64`, fails
the deployment by name. Nothing deploys holding the bare value the tag was written against.

A file that does not parse is refused by naming the resolved path, along with the line and column the
parser stopped at. `updateTemplateFile(...)` and watching read the file the same way, and a saved
YAML template updates its Stack in place.

## A YAML TemplateBody

`CreateStackCommand` and `UpdateStackCommand` take a YAML `TemplateBody`, as CloudFormation does.
The field carries no file name to say which format it holds. Yulin reads the body as JSON, and as
YAML when that fails.

```typescript sim-cloudformation-yaml-template-body
/**
 * Creating a simulated CloudFormation Stack from a YAML TemplateBody.
 */

import { CreateStackCommand } from "@aws-sdk/client-cloudformation";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();

await simCfn.createStack(
  new CreateStackCommand({
    StackName: "work-stack",
    TemplateBody: [
      "Resources:",
      "  WorkQueue:",
      "    Type: AWS::SQS::Queue",
      "    Properties:",
      "      QueueName: work-queue",
      "Outputs:",
      "  QueueArn:",
      "    Value: !GetAtt WorkQueue.Arn",
    ].join("\n"),
  }),
);

await simCfn.waitForStackDeployComplete("work-stack");

const stack = simCfn.getStackByName("work-stack");

console.log(stack?.outputs.get("QueueArn")?.value);
```

Short-form tags resolve as they do in a template file, and a body naming the SAM transform is
expanded the way a JSON one is. An `UpdateStackCommand` may hand a Stack a YAML body whichever
format the Stack was deployed from.

A body that fails both attempts is refused by naming the Stack, along with what each format made of
it.

## Deploying a whole cloud assembly

`deployCdkOut(...)` deploys the Stacks a `cdk.out` directory holds, each into the region its own
environment names. The assembly's `manifest.json` is where that comes from, so an app synthesizing
several Stacks across several regions needs no loop of its own and no region constants beside it.

```typescript sim-cloudformation-cdk-out-assembly
/**
 * Deploying every Stack a synthesized CDK cloud assembly holds.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const stacks = await simAws
  .cloudFormation()
  .deployCdkOut(path.join(process.cwd(), "cdk.out"));

const siteStack = stacks.get("SiteStack");
const dnsStack = stacks.get("DnsStack");

console.log(siteStack?.getResource("SiteBucket")?.simResource);
console.log(dnsStack?.getResource("SiteRecord")?.simResource);
```

A Stack synthesized with `env: { region: "us-east-1" }` deploys into simulated us-east-1, whatever
region the call was made in. A Stack synthesized without `env` takes the region of the scope it was
asked through, and every Stack takes that scope's Account.

Stacks deploy in an order their manifest dependencies allow, so a Stack that consumes another
Stack's export goes second. The deployed Stacks come back keyed by name, each one the same
`SimCfnStack` `deployTemplateFile(...)` answers with.

`cloudfront.experimental.EdgeFunction` in a Stack outside us-east-1 is one construct that needs the
whole assembly. It puts the function in a us-east-1 support Stack, and the using Stack reads the
function's ARN back from an SSM parameter that Stack wrote. Both have to deploy for the read to find
anything. See [simulated Lambda@Edge](https://yulinsim.dev/services/cloudfront/#simulated-lambdaedge).

### Deploying part of an assembly

Most apps synthesize Stacks a test has no use for, a deployment pipeline among them. `stackNames`
picks the ones to deploy, naming each by Stack name or by CDK artifact ID.

```typescript sim-cloudformation-cdk-out-stack-names
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const stacks = await simAws.cloudFormation().deployCdkOut({
  directoryPath: "cdk.out",
  stackNames: ["SiteStack", "DnsStack"],
});

console.log(stacks.keys().toArray());
```

Naming a Stack the assembly lacks fails the call, listing the Stacks it does hold.

The order the Stacks are named in is the order they deploy in. A Stack the manifest says another
depends on still goes first, whatever order the two are named in, and an assembly deployed whole
keeps the order its own manifest holds.

### Bindings and transforms for one Stack

A call naming a directory has no single template to attach bindings to, so `stackOptions` keys them
by Stack. Each entry takes the `bindings`, `parameters` and `transform` that
`deployTemplateFile(...)` takes for one template.

```typescript sim-cloudformation-cdk-out-stack-options
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const stacks = await simAws.cloudFormation().deployCdkOut({
  directoryPath: "cdk.out",
  stackNames: ["ApiStack"],
  stackOptions: {
    ApiStack: {
      parameters: { Stage: "test" },
      bindings: [
        {
          logicalId: "UploadFunction",
          handler: (): { statusCode: number } => ({ statusCode: 200 }),
        },
      ],
    },
  },
});

console.log(stacks.get("ApiStack")?.stackName);
```

An options key matching no Stack being deployed fails the call, so a renamed Stack takes its
bindings with it rather than quietly losing them.

### Transforming a Stack with an earlier Stack's values

A `stackOptions` transform is handed the Stacks the same call has already deployed, keyed by Stack
name. A CDK app that creates a certificate in one Stack and uses it in another passes the ARN across
as a plain string, and the ARN the synthesized template carries belongs to the real account.
Simulated ACM issues its own. Reading it back off the Stack that created it keeps both Stacks in one
`deployCdkOut` call.

```typescript sim-cloudformation-cdk-out-stack-transform
import { SimAws } from "@kensio/yulin";
import type { CfnTemplateBodyRecord } from "@kensio/yulin/cloudformation";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

/** The ARN the CDK app pins, because the Stack that issues it is another one. */
const synthesizedCertificateArn =
  "arn:aws:acm:us-east-1:111122223333:certificate/11111111-2222-3333-4444-555555555555";

/** Put the ARN simulated ACM issued wherever the synthesized one is named. */
function withSimulatedCertificate(
  template: CfnTemplateBodyRecord,
  certificateArn: string,
): CfnTemplateBodyRecord {
  return JSON.parse(
    JSON.stringify(template).replaceAll(
      synthesizedCertificateArn,
      () => certificateArn,
    ),
  ) as CfnTemplateBodyRecord;
}

const stacks = await simAws.cloudFormation().deployCdkOut({
  directoryPath: "cdk.out",
  stackNames: ["DnsStack", "SiteStack"],
  stackOptions: {
    SiteStack: {
      transform: (template, deployed): CfnTemplateBodyRecord =>
        withSimulatedCertificate(
          template,
          deployed.get("DnsStack")?.output("SiteCertificateArn") ?? "",
        ),
    },
  },
});

console.log(stacks.get("SiteStack")?.stackName);
```

The map holds the Stacks deployed ahead of this one and nothing else. The first Stack to deploy is
handed an empty one. Naming the Stacks in the order they have to go in is what puts the certificate
there in time, since two Stacks passing a plain string between them declare no dependency for the
manifest to carry.

## Editing a synthesized template before deploying it

Sometimes a synthesized template needs a change before Yulin will deploy it, such as dropping a
resource or property that this simulator refuses. Read the file, edit the parsed object,
then deploy it with `deployTemplate(...)`, naming the file it came from:

```typescript sim-cloudformation-cdk-edited-template
/**
 * Deploying a synthesized CDK template edited in memory.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { SimAws } from "@kensio/yulin";

const templatePath = path.join(
  process.cwd(),
  "cdk.out",
  "TestStack.template.json",
);

const synthesized = JSON.parse(await readFile(templatePath, "utf8")) as {
  Resources: Record<string, { Type: string }>;
};

const resources = Object.fromEntries(
  Object.entries(synthesized.Resources).filter(
    ([logicalId]) => logicalId !== "AnalyticsQueue",
  ),
);

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "local-cdk-stack",
  template: { ...synthesized, Resources: resources },
  templatePath,
});

await stack.waitForDeployComplete();
```

The `template` object is what gets deployed, and the template file itself goes unread.
`templatePath` only tells Yulin which cloud assembly the template came from, letting it find the
sibling `TestStack.assets.json` manifest and the staged asset directories beside it. Without it,
anything that needs a CDK asset, such as a `Custom::CDKBucketDeployment` or a Lambda function
bundled with `Code.fromAsset`, fails with `No CDK assets manifest is available.`

## Adapting a synthesized template on the way in

Editing the parsed object works for a template you deploy once. A template you keep reading, because
it is [watched](#watching-a-template-file) or applied again as an update, needs the same change made
every time it is read. `transform` is that hook. It is given the parsed template and answers with the
one to deploy, on the deployment and again on every change:

```typescript sim-cloudformation-transform-template-file
/**
 * Adapting a synthesized template every time it is read.
 */

import { SimAws } from "@kensio/yulin";
import type { CfnTemplateBodyRecord } from "@kensio/yulin/cloudformation";

const simAws = new SimAws();

/**
 * Drop the records pointing at a hosted zone that only exists in the real
 * account.
 */
function withoutDnsRecords(
  template: CfnTemplateBodyRecord,
): CfnTemplateBodyRecord {
  const resources = Object.fromEntries(
    Object.entries(template.Resources).filter(
      ([, resource]) =>
        (resource as { Type?: string }).Type !== "AWS::Route53::RecordSet",
    ),
  );

  return { ...template, Resources: resources };
}

await simAws.cloudFormation().deployTemplateFile({
  templatePath: "cdk.out/TestStack.template.json",
  transform: withoutDnsRecords,
  watch: true,
});
```

This is for what a simulation cannot resolve at all, such as an ARN carrying a real account or a
hosted zone ID that came from `HostedZone.fromLookup`. A property Yulin leaves unmodelled rarely
needs it. S3, DynamoDB, Cognito, API Gateway v2, SQS and KMS
[record it and carry on](#properties-a-resource-was-created-without).

The template file is still the real one. There is no derived `.local.template.json` in `cdk.out` to
keep in step with it. Staged assets resolve as they always did, from the assets manifest beside
`templatePath`, since the cloud assembly is found by path and never read out of the template.

`updateTemplateFile(...)` takes it too, for a consumer driving updates itself. Give it the same
deployment object, and the difference applied is the difference in the file.

A transform that throws fails the deployment, with what it threw as the cause. On a watched change it
is reported the way a failed update is. The stack keeps the resources it had, and the watch carries on
to the next save.

## Applying a changed template file

`updateTemplateFile(...)` reads a deployed template file again and applies it to its stack, the same
way [`UpdateStackCommand`](#updating-a-stack) applies a changed template body. Give it what the
deployment was given, since parameters are part of what an update applies:

```typescript sim-cloudformation-update-template-file
/**
 * Applying a synthesized template file to the stack it was deployed as.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const templatePath = path.join(
  process.cwd(),
  "cdk.out",
  "TestStack.template.json",
);

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplateFile({ templatePath });

// Something synthesizes the stack again here.

await simAws.cloudFormation().updateTemplateFile({ templatePath });
```

The sibling assets manifest is read again with the template. A resource the update replaces reads the
assets that synthesis staged, not the ones the stack was deployed with.

A file written without being changed is refused with `No updates are to be performed.`, and a failed
update leaves the stack in `UPDATE_FAILED` holding whatever the update reached. There is no rollback
to the template it was deployed from. A failure part way through has already deleted, replaced or
created some of the resources the change asked for.

## Watching a template file

A local dev process holds simulated data that a restart would throw away, and a template file is
data rather than code. `watch` keeps reading the file, so re-synthesizing the stack updates it in
place while the process carries on:

```typescript sim-cloudformation-watch-template-file
/**
 * Updating a deployed stack whenever its template file is synthesized again.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

await simAws.cloudFormation().deployTemplateFile({
  templatePath: path.join(process.cwd(), "cdk.out", "TestStack.template.json"),
  watch: {
    reload: srv,
  },
});
```

`watch: true` watches with nothing to do afterwards.

`reload` is the local server, and reloads the browsers connected to it once the update is complete.
It reloads when the resources have changed, not when the write lands. A browser therefore arrives on
the resources the new template asked for. A write that changed nothing is a no-op, and reloads
nothing. A failed update reloads nothing either, since a browser has no business on a stack the
update never reached. Anything with a `reload()` method will do, and a test can watch a template
without serving anything.

A server serving without live reload can never reload anything, and says so as the deployment asks it
to. Saying it on the first change instead would be a long way from the mistake. Serve with
[`{ liveReload: true }`](https://yulinsim.dev/serve/#live-reload).

`onUpdated` runs once the update is complete too, for whatever else a change is worth doing, with or
without a `reload` alongside it. Given both, the callback runs first and the reload follows it, and a
browser arriving on the new resources finds whatever the callback left ready for it.

`onFailed` is given the update the changed template failed to survive. It reports the failure and
nothing else.
The stack is left holding whatever the update reached, as it is after an update through the command.
What a failure does keep is the process, and the resources it never got to. A template that no longer
deploys leaves a working environment where a restart on it would leave none.

A burst of writes is one update. Saving a file is several filesystem events, so changes are held
until they stop arriving. `settleMs` is how long that wait is, and it defaults to the 250ms
[`yulin watch` settles at](https://yulinsim.dev/serve/#one-restart-for-a-burst-of-writes). A synth that
keeps writing is updated from after five seconds of it, without waiting for it to stop.

[`transform`](#adapting-a-synthesized-template-on-the-way-in) runs again on every change. A template
that needs adapting before Yulin will take it can still be watched as the file synthesis writes.

Watching holds a filesystem handle open, so the process stays alive on its own. That is what a dev
process wants. Anything with an end, such as a test, calls `stopWatchingTemplateFiles()` when it is
done. `watchedTemplateFiles()` names what is being watched. Both are per Account and Region, and a
simulation deploying into more than one has one call each.
[`simAws.close()`](https://yulinsim.dev/serve/#stopping-and-restarting) is the exception. It lets go of the
template watches in every scope, along with everything else the environment is holding, and a served
environment gets that from `srv.close()`.

Yulin never synthesizes anything. It reads the output template, so run your own `cdk synth` and let
the watch pick up what it writes.

### Under `yulin watch`

[`yulin watch`](https://yulinsim.dev/serve/#restarting-on-a-file-change) restarts the process when a
deployed template changes. A watched template is left to the process that is watching it instead. The
stack updates in place, and everything held in simulated S3, DynamoDB and SQS stays where it is. That
needs no configuring, because the process names the file it is holding.

## CDK S3 BucketDeployment

Yulin can simulate selected CDK custom resources. A common use case is CDK S3 BucketDeployment,
where local files are deployed into a simulated S3 Bucket.

```typescript sim-cloudformation-cdk-bucket-deployment
/**
 * Serving CDK BucketDeployment files through simulated S3.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  await simAws
    .cloudFormation()
    .deployTemplateFile("cdk.out/TestStack.template.json");

  const response = await fetch(
    `http://foo-bucket.s3-website.us-east-1.sim-aws.localhost:${srv.port}/`,
  );

  console.log(response.status);
  console.log(await response.text());
} finally {
  await srv.close();
}
```

The files in the staged asset directory become Objects in the destination Bucket, keyed by their path
relative to the asset root. When the Bucket is configured for website hosting, or sits behind a
CloudFront Distribution, those Objects are what gets served.

This is the `aws s3 sync` the real provider function shells out to. The properties CDK synthesizes
around it are read the same way:

- `DestinationBucketKeyPrefix` puts the Objects under a key prefix.
- `Exclude` and `Include` choose which files are copied. Every `Exclude` pattern is applied first and
  then every `Include` one, and the last pattern to match a path decides. That is what makes
  `exclude: ["*"], include: ["*.txt"]` mean "only the text files". A file no pattern matches is
  copied. `*` matches across `/`, so `data/*` covers everything under a `data` directory.
- `SystemMetadata` sets content headers on every Object the deployment copies, such as
  `content-encoding` or `cache-control`. Without it, the content type is guessed from the file
  extension. See [Object system metadata](https://yulinsim.dev/services/s3/#object-system-metadata) for what comes back
  on a read. The deployment also tells the destination Bucket what it publishes. A directory
  [mounted over that Bucket](https://yulinsim.dev/services/s3/#inheriting-what-the-deployment-set) for local
  development is then served with the same headers without restating them.
- `Prune` removes the Objects the deployment covers and its source no longer holds. It is on unless
  the deployment turns it off, as the construct is. Pruning only considers what the filters and the
  key prefix select, and leaves alone any Object the deployment would never have copied.

Several deployments can share one Bucket. That is the usual arrangement when the headers differ by
file type, since a `BucketDeployment` sets them for all of its files at once. A second deployment is
how the rest of the site gets different ones. Give the second one `prune: false`, or filters that miss
what the first one covers, the same as you would in AWS.

A deployment with more than one entry in `SourceObjectKeys` copies each source in turn, and a path
two of them share ends up with the later one's content.

Filter patterns take `*` and `?`. The CLI also takes character classes such as `[abc]`, and a pattern
using one is refused by name. Matching it as written risks copying the wrong files, since the pattern
quietly means something else.

### The provider CDK synthesizes

One `BucketDeployment` construct is four resources in the synthesized template, and only one of them
is the `Custom::CDKBucketDeployment` above. The other three are the provider that would have run it
in AWS: an AWS CLI Lambda Layer, a Python Lambda function, and that function's log group. A second
deployment adds another Layer and another custom resource, and shares the one function, because CDK
builds it as a singleton.

None of those three do anything here. Yulin makes the copy itself. The function is never invoked, the
Layer it would have loaded the CLI from is never read, and nothing is ever written to the log
group. The function and the Layer are reported in
[`stack.inertResources`](#resources-deliberately-left-out) rather than as skipped resources, and a
stack whose deployments all worked reports no gaps at all. The log group is created like any other and
stays empty, as an account's would.

That matters beyond tidiness. Sim Lambda declines the provider on its Python runtime with a message
saying to [bind a real in-process handler](#lambda-function-bindings) to the function. That is sound
advice for a Python function of your own, and exactly the wrong thing to do here. It would replace a
working simulation with a hand-written one.

The provider is found through the `ServiceToken` its custom resource names it by, not by the logical
ID CDK generated for it. That ID is a hash of the construct path, and no kind of thing to match on.

## S3 Bucket notifications

The `NotificationConfiguration` property of `AWS::S3::Bucket` deploys through the ordinary
`PutBucketNotificationConfiguration` path. An Object put into the deployed Bucket reaches the deployed
function. CloudFormation spells the configuration differently from the SDK in four places, and Yulin
reads the CloudFormation spelling and refuses the others. Accepting them would deploy a configuration
that quietly lost its filter.

Real CloudFormation has a circular dependency here. The Bucket needs the function's ARN and the
function's permission needs the Bucket's ARN. A template therefore hardcodes `BucketName`, names the
Bucket by ARN literal on the permission, and adds a `DependsOn` so the permission is in place before
S3 validates the destination. Simulated CloudFormation needs the same, and surfaces the alternative as
a dependency resolution failure.

Note that every other `AWS::S3::Bucket` property the simulator has no behaviour for fails the stack
by name. See [Buckets from CloudFormation](https://yulinsim.dev/services/s3/#buckets-from-cloudformation).

### From a CDK app

`bucket.addEventNotification(...)` synthesizes a `Custom::S3BucketNotifications` resource rather than
a Bucket property. Sim CloudFormation applies the configuration it carries through the ordinary
`PutBucketNotificationConfiguration` path, and an Object put into the deployed Bucket reaches the
deployed function.

Deploy into an Account and Region matching the ones the CDK app synthesized for. The `SourceAccount`
on the `AWS::Lambda::Permission` CDK writes beside the notification is a synth-time literal. A stack
deployed into another Account leaves S3 unable to validate the destination, and the stack fails.

See [Event notifications](https://yulinsim.dev/services/s3/#event-notifications) in the S3 docs for the configuration
itself and what it refuses.

## CloudFront resources from CDK

Sim CloudFormation can create CloudFront Distributions from CloudFormation or CDK templates.

```typescript sim-cloudformation-cloudfront-distribution
/**
 * Deploying a template with S3 and CloudFront resources.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "cloudfront-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "cloudfront-site-bucket",
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: {
            Aliases: ["cdn.example.test"],
            Enabled: true,
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: "cloudfront-site-bucket.s3.amazonaws.com",
                S3OriginConfig: {},
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "SiteOrigin",
              ViewerProtocolPolicy: "allow-all",
            },
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const distributionResource = stack.getResource("SiteDistribution");
console.log(distributionResource?.simResource);
```

When served on localhost, the resulting Distribution can be requested through its simulated
CloudFront hostname adapted to the local server.

## CloudFront Function bindings

When a CDK template contains a CloudFront Function, you can bind the template resource to a real
local handler function. This lets local integration tests execute the same handler function that
will run at the CloudFront edge.

```typescript sim-cloudformation-cloudfront-function-binding
/**
 * Binding a local CloudFront Function handler during template deployment.
 */

import { SimAws } from "@kensio/yulin";
import type { CloudFrontFunction } from "@kensio/yulin/cloudfront";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

function viewerRequestHandler(
  event: CloudFrontFunction.ViewerRequestEvent,
): CloudFrontFunction.Request | CloudFrontFunction.Response {
  if (event.request.uri === "/redirect-me.html") {
    return {
      statusCode: 302,
      statusDescription: "Found",
      headers: {
        location: {
          value: "https://example.test/from-bound-handler.html",
        },
      },
    };
  }

  return event.request;
}

try {
  const stack = await simAws.cloudFormation().deployTemplateFile({
    templatePath: "cdk.out/TestStack.template.json",
    bindings: [
      {
        logicalId: "RewriteFunction",
        handler: viewerRequestHandler,
      },
    ],
  });

  await stack.waitForDeployComplete();

  const distributionResource = stack.getResource("SiteDistribution");
  const distribution = distributionResource?.simResource;

  if (
    distribution === undefined ||
    !("distributionId" in distribution) ||
    typeof distribution.distributionId !== "string"
  ) {
    throw new Error("Expected simulated CloudFront Distribution");
  }

  const distributionHost = `${distribution.distributionId.toLowerCase()}.cloudfront.net`;
  const response = await fetch(
    srv.localUrl(`http://${distributionHost}/redirect-me.html`),
    { redirect: "manual" },
  );

  console.log(response.status);
  console.log(response.headers.get("location"));
} finally {
  await srv.close();
}
```

The `bindings` array matches a template resource logical ID to a local handler function. Use it when
CDK has embedded or transformed CloudFront Function source in synthesized output, but your test wants
to provide an executable local function directly.

## Lambda function bindings

`AWS::Lambda::Function` resources support the same bindings. The deployed function is backed by your
real in-process handler. Tests can close over test state and step through the handler in a debugger,
while the stack still wires roles, grants and references as the template declares. A bound function
may omit template `Code` and `Handler` entirely.

```typescript sim-cloudformation-lambda-binding
/**
 * Binding a real in-process Lambda handler during template deployment.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "greeter-stack",
  template: {
    Resources: {
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: "arn:aws:iam::111111111111:role/GreeterRole",
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "GreeterFunction",
      handler: (event: { name: string }): string => `Hello ${event.name}`,
    },
  ],
});

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

console.log(new TextDecoder().decode(output.Payload));
```

Bindings can target the CloudFormation logical ID (or the CDK construct ID recovered from
synthesized metadata), the function name, or the function ARN. Bound handlers still run with the
function's execution Role as the ambient simulated caller, so downstream calls made through
`SimSdk`-intercepted clients are authorized by simulated IAM as on real Lambda. Functions without
a matching binding keep their template code, running in the simulated vm runtime.

### Naming the binding type

One entry of a `bindings` list is a `SimCfnBinding`, exported from `@kensio/yulin/cloudformation`. A
test that builds its bindings in a fixture, or a factory that returns one, names the type from the
import. The same list passes to `deployTemplate`, `deployTemplateFile` and the per-Stack `bindings`
of `deployCdkOut`.

```typescript sim-cloudformation-binding-type
/**
 * Naming the bindings a deployment takes, for a list built somewhere else.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { SimAws } from "@kensio/yulin";
import type { SimCfnBinding } from "@kensio/yulin/cloudformation";

const orders: string[] = [];

const bindings: readonly SimCfnBinding[] = [
  {
    logicalId: "PlaceOrderFunction",
    handler: (event: { item: string }): void => {
      orders.push(event.item);
    },
  },
];

const simAws = new SimAws();

await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      PlaceOrderFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "place-order",
          Role: "arn:aws:iam::111111111111:role/PlaceOrderRole",
        },
      },
    },
  },
  bindings,
});

await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "place-order",
    Payload: JSON.stringify({ item: "sourdough" }),
  }),
);

console.log(orders);
```

A binding names one of five targets. `logicalId`, `functionName`, `arn`, `cdkPath` and
`imageRepository` are the five, and a literal naming two of them fails to compile. The same type
covers a binding to a container an `AWS::ECS::TaskDefinition` declares, which carries `run`, `http`
or `consumes` in place of `handler`. See
[Deploying ECS from CloudFormation](https://yulinsim.dev/services/ecs/#deploying-ecs-from-cloudformation) for those.

## SAM templates

A template naming the `AWS::Serverless-2016-10-31` transform has its SAM resources expanded before
the stack deploys, the way CloudFormation expands them. `AWS::Serverless::Function` becomes an
`AWS::Lambda::Function` and the `AWS::IAM::Role` it runs as. `AWS::Serverless::SimpleTable` becomes
an `AWS::DynamoDB::Table`. `AWS::Serverless::HttpApi` becomes an `AWS::ApiGatewayV2::Api` and its
stage, and `AWS::Serverless::Api` becomes an `AWS::ApiGateway::RestApi` with the deployment and
stage that publish it. `Globals.Function`, `Globals.HttpApi` and `Globals.Api` supply the defaults
every function and every API takes, and a value on the resource itself wins.

The expanded function keeps the logical ID the SAM resource had. `Ref` and `Fn::GetAtt` against that
name answer for the function, and a binding targeting that logical ID backs it with your real
handler. `CodeUri` is never read from disk (a bound function can leave the code out of the template
altogether).

```typescript sim-cloudformation-sam-function
/**
 * Deploying a SAM AWS::Serverless::Function into simulated AWS.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rates-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Globals: {
      Function: {
        Runtime: "nodejs22.x",
        Timeout: 10,
      },
    },
    Resources: {
      Rates: {
        Type: "AWS::Serverless::Function",
        Properties: {
          FunctionName: "rates",
          CodeUri: "src/rates/",
          Handler: "index.handler",
          Environment: {
            Variables: { TABLE_NAME: "rates-table" },
          },
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "Rates",
      handler: (event: { currency: string }): string =>
        `rate for ${event.currency}`,
    },
  ],
});

console.log(stack.getResource("Rates")?.type);

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "rates",
    Payload: JSON.stringify({ currency: "GBP" }),
  }),
);

console.log(new TextDecoder().decode(output.Payload));
```

The execution role is named after the function, `RatesRole` for a function called `Rates`, and
carries the basic execution policy SAM gives one. `Policies` on the function reach it. A policy
document goes on as an inline policy, and a managed policy ARN is attached. SAM policy templates
such as `DynamoDBCrudPolicy` are left ungenerated, because simulated IAM allows every call by
default and a role missing those statements authorizes the same calls either way. A function naming
its own `Role` runs as that role, and gets no expanded one.

### Function events

`Events` on a SAM function expand into whatever puts the function behind them. `Api`, `HttpApi`,
`SQS`, `DynamoDB`, `SNS`, `S3`, `Schedule`, `ScheduleV2` and `EventBridgeRule` are the types this
covers. An event of any other type is left where it is, and the function deploys with nothing in
front of it.

An `HttpApi` event becomes an `AWS::ApiGatewayV2::Integration`, an `AWS::ApiGatewayV2::Route` and the
`AWS::Lambda::Permission` the API invokes the function under. `Path` and `Method` become the route
key (`GET /rates/{currency}`). An event stating no method gets `ANY`, and a `Path` of `$default`
becomes the catch-all route.

Events naming no `ApiId` share one API under the logical ID SAM gives it, `ServerlessHttpApi`, with a
`$default` stage. Two functions with events of their own answer on the same endpoint. An event naming
an `ApiId` routes to the API that logical ID belongs to, and the template brings the stage.

```typescript sim-cloudformation-sam-http-api-event
/**
 * A SAM function reached through the HTTP API its HttpApi event made.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rates-api-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Resources: {
      Rates: {
        Type: "AWS::Serverless::Function",
        Properties: {
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Events: {
            Get: {
              Type: "HttpApi",
              Properties: { Path: "/rates/{currency}", Method: "GET" },
            },
          },
        },
      },
    },
    Outputs: {
      ApiEndpoint: {
        Value: { "Fn::GetAtt": ["ServerlessHttpApi", "ApiEndpoint"] },
      },
    },
  },
  bindings: [
    {
      logicalId: "Rates",
      handler: (request: {
        pathParameters?: Record<string, string>;
      }): { statusCode: number; body: string } => ({
        statusCode: 200,
        body: `rate for ${request.pathParameters?.["currency"]}`,
      }),
    },
  ],
});

await stack.waitForDeployComplete();

const srv = await serveSimAws({ simAws });

const response = await fetch(
  srv.localUrl(`${stack.output("ApiEndpoint")}/rates/GBP`),
);

console.log(await response.text());

await srv.close();
```

`Auth` on the event is left out. Every request matching the expanded route reaches the function.

An `Api` event is the REST half of the same idea. It becomes an `AWS::ApiGateway::Resource` for each
segment of `Path`, an `AWS::ApiGateway::Method` on the last of them carrying a proxy `Integration`
to the function, and the `AWS::Lambda::Permission` the API invokes it under. A `Method` of `any`
becomes `ANY`, and an event stating none gets `ANY` as well. Two events sharing a path prefix share
the resources that spell it, so `/rates` and `/rates/{currency}` sit on one branch of one tree.

Events naming no `RestApiId` share the API SAM calls `ServerlessRestApi`, published to a `Prod`
stage. A REST API carries the stage as the first segment of every path it serves. The example below
requests `/Prod/rates/GBP` for that reason.

```typescript sim-cloudformation-sam-api-event
/**
 * A SAM function reached through the REST API its Api event made.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rates-api-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Resources: {
      Rates: {
        Type: "AWS::Serverless::Function",
        Properties: {
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Events: {
            Get: {
              Type: "Api",
              Properties: { Path: "/rates/{currency}", Method: "GET" },
            },
          },
        },
      },
    },
    Outputs: {
      ApiUrl: {
        Value: {
          "Fn::Join": [
            "",
            [
              "https://",
              { Ref: "ServerlessRestApi" },
              ".execute-api.",
              { Ref: "AWS::Region" },
              ".",
              { Ref: "AWS::URLSuffix" },
              "/",
              { Ref: "ServerlessRestApiProdStage" },
              "/",
            ],
          ],
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "Rates",
      handler: (request: {
        pathParameters?: Record<string, string> | null;
      }): { statusCode: number; body: string } => ({
        statusCode: 200,
        body: `rate for ${request.pathParameters?.["currency"]}`,
      }),
    },
  ],
});

await stack.waitForDeployComplete();

const srv = await serveSimAws({ simAws });

const response = await fetch(
  srv.localUrl(`${stack.output("ApiUrl")}rates/GBP`),
);

console.log(await response.text());
// "rate for GBP"

await srv.close();
```

An event naming a `RestApiId` puts its method on the API that logical ID belongs to, whether an
`AWS::Serverless::Api` or an `AWS::ApiGateway::RestApi` the template declared. The API is named as
the logical ID or as a `Ref` to it. An event naming it any other way, such as through
`Fn::ImportValue`, expands into no resources at all, because a REST API path tree is built downwards
from a root resource this has no way to reach. `Auth` on the event is left out, the same as on an `HttpApi` one.

A `Schedule` event becomes an `AWS::Events::Rule` on a timer, with the `AWS::Lambda::Permission` the
rule invokes the function under. The event's `Schedule` is the rule's `ScheduleExpression`, and the
function runs as a test advances simulated time past a due instant. An `EventBridgeRule` event
becomes the same pair, with the event's `Pattern` as the rule's `EventPattern`. A matching event put
on the bus invokes the function. Both events take `Name` (an `EventBridgeRule` event calls it
`RuleName`), `Description`, `Input` and `Enabled`, and an event naming an `EventBusName` watches
that bus.

```typescript sim-cloudformation-sam-schedule-event
/**
 * A SAM function put on a timer by its Schedule event.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const runs: string[] = [];

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "reconciliation-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Resources: {
      Reconcile: {
        Type: "AWS::Serverless::Function",
        Properties: {
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Events: {
            Hourly: {
              Type: "Schedule",
              Properties: {
                Schedule: "rate(1 hour)",
                Input: JSON.stringify({ ledger: "rates" }),
              },
            },
          },
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "Reconcile",
      handler: (event: { ledger: string }): string => {
        runs.push(event.ledger);

        return "reconciled";
      },
    },
  ],
});

await stack.waitForDeployComplete();

await simAws.clock().advanceBy({ hours: 3 });

console.log(runs);
```

A `ScheduleV2` event becomes an `AWS::Scheduler::Schedule` and the `AWS::IAM::Role` Scheduler assumes
to invoke the function. The role trusts `scheduler.amazonaws.com` and may invoke the one function the
event was declared on. An event naming a `RoleArn` runs as that role, and the expansion makes no role
of its own. `Name`, `Description`, `Input`, `Enabled`, `GroupName`, `StartDate`, `EndDate`,
`ScheduleExpressionTimezone`, `KmsKeyArn` and `FlexibleTimeWindow` carry over. An event stating no
time window gets `OFF`.

`DeadLetterConfig` and `RetryPolicy` on these three events are left out. A delivery is attempted
once, and a failed one is recorded by the rule or the schedule that made it.

A `FunctionUrlConfig` on the function expands into an `AWS::Lambda::Url` named after it, `RatesUrl`
for a function called `Rates`. `AuthType` and `InvokeMode` carry over. `Cors` is left out (the
simulated Function URL answers no preflight request).

### Queue, stream, topic and bucket events

These four event types point the function at something the template already has. Expanding one never
creates the queue, table, topic or bucket it names.

An `SQS` event becomes an `AWS::Lambda::EventSourceMapping` polling the queue its `Queue` ARN names,
and a `DynamoDB` event becomes one reading the stream its `Stream` ARN names. Both are named after
the function and the event (`OrdersWorkEventSourceMapping` for an event called `Work` on a function
called `Orders`). Whatever else the event states goes onto the mapping under the same name, so
`BatchSize`, `StartingPosition`, `Enabled` and `FilterCriteria` all carry across. A property the
mapping has no meaning for is refused by name.

The expanded execution role gains the policy it polls the source under, the way SAM attaches one of
its own. Lambda refuses a mapping whose role cannot poll. A function naming its own `Role` runs as
that role and keeps whatever the template granted it.

```typescript sim-cloudformation-sam-queue-event
/**
 * A SAM function fed by the queue its SQS event names.
 */

import { GetQueueUrlCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const received: string[][] = [];

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Resources: {
      OrdersQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "orders" },
      },
      Orders: {
        Type: "AWS::Serverless::Function",
        Properties: {
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Events: {
            Work: {
              Type: "SQS",
              Properties: {
                Queue: { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
                BatchSize: 5,
              },
            },
          },
        },
      },
    },
  },
  bindings: [
    {
      logicalId: "Orders",
      handler: (event: { Records: readonly { body: string }[] }): string[] => {
        const bodies = event.Records.map((record) => record.body);
        received.push(bodies);

        return bodies;
      },
    },
  ],
});

await stack.waitForDeployComplete();

const { QueueUrl } = await simAws
  .sqs()
  .getQueueUrl(new GetQueueUrlCommand({ QueueName: "orders" }));

await simAws
  .sqs()
  .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));

await simAws.backgroundTasksComplete();

console.log(received);
```

An `SNS` event becomes an `AWS::SNS::Subscription` on the `lambda` protocol, together with the
`AWS::Lambda::Permission` the topic invokes the function under. `Topic` is the topic's ARN.
`FilterPolicy` and `FilterPolicyScope` carry across as the subscription attributes of those names.

An `S3` event is the one with no resource of its own. In CloudFormation a bucket carries its own
notifications, so the event adds a `LambdaConfigurations` entry to the `NotificationConfiguration` of
the bucket its `Bucket` names, and brings the permission S3 invokes the function under. `Bucket` is a
logical ID here rather than an ARN, and the bucket has to be one the template declares. `Events`
states one event name or a list of them, and each one becomes a configuration of its own with the
event's `Filter` on it. Notifications the bucket already declared are kept, and so are the ones
another function's event put there.

Two shapes are refused rather than expanded. A bucket writing its `NotificationConfiguration` or its
`LambdaConfigurations` as an intrinsic such as `Fn::If` is one, because there is no appending to a
list CloudFormation has not resolved yet, and adding the event's own entries would drop whatever the
intrinsic resolved to. The other is a function the template conditions out, which real CloudFormation
refuses for the same reason SAM cannot fix it: the notification belongs to the bucket, the bucket is
not conditioned, and nothing can condition one entry of somebody else's property. Condition the
bucket along with the function, or declare the notification on the bucket yourself.

### Simple tables

`AWS::Serverless::SimpleTable` deploys a table with one partition key and on-demand billing.
`PrimaryKey` names that key, and its `Type` is the SAM name for the attribute type (`String`,
`Number` or `Binary`). A table naming no key is keyed on a string `id`, the key SAM gives it.
`TableName`, `SSESpecification`, `PointInTimeRecoverySpecification` and `ProvisionedThroughput`
carry across as the template wrote them, and a table asking for capacity is billed for the capacity
it asked for. `Tags` are stated as a map
of one value per tag name, and reach the table as the list of `Key` and `Value` pairs DynamoDB
takes.

### HTTP APIs

`AWS::Serverless::HttpApi` deploys an HTTP API and the stage that serves it. The stage is `$default`
until `StageName` names another one, and it carries the logical ID SAM builds for it
(`OrdersApiGatewayDefaultStage` for an API called `Orders`, `OrdersprodStage` for the same API with
`StageName: prod`, and `OrdersStage` followed by ten characters of a hash where the name cannot be
part of an identifier). `AccessLogSettings`, `DefaultRouteSettings`, `RouteSettings`,
`StageVariables` and `Tags` go on the stage, and the rest of the API's properties on the API.

A `DefinitionBody` reaches the API as its OpenAPI `Body`, and the routes, integrations and
authorizers the document declares are created from it. Routes declared outside the document name the
API by `ApiId`, with `Ref` on the SAM logical ID. That is how an `HttpApi` event on a function
reaches an API the template declared, and how an `AWS::ApiGatewayV2::Route` resource of its own
does. An API naming a `DefinitionUri` is recorded as unsupported, because nothing here reads a
document off disk or out of S3.

The API is deployed without `Auth` and `Domain`. SAM writes an `Auth` block into the document it
generates, and deploys a `Domain` as a custom domain name resource, and neither is expanded here.

```typescript sim-cloudformation-sam-table-api
/**
 * Deploying a SAM AWS::Serverless::SimpleTable and AWS::Serverless::HttpApi.
 */

import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Globals: {
      HttpApi: {
        StageVariables: { TABLE_NAME: "orders" },
      },
    },
    Resources: {
      OrdersTable: {
        Type: "AWS::Serverless::SimpleTable",
        Properties: {
          TableName: "orders",
          PrimaryKey: { Name: "orderId", Type: "String" },
        },
      },
      Orders: {
        Type: "AWS::Serverless::HttpApi",
        Properties: { Name: "orders" },
      },
    },
  },
});
await stack.waitForDeployComplete();

console.log(stack.getResource("Orders")?.type);
console.log(stack.getResource("OrdersApiGatewayDefaultStage")?.type);

const described = await simAws
  .dynamoDb()
  .describeTable(new DescribeTableCommand({ TableName: "orders" }));

console.log(described.Table?.KeySchema);
```

### REST APIs

`AWS::Serverless::Api` deploys a REST API, the deployment that publishes it, and the stage `StageName`
names. The stage carries the logical ID SAM builds for it (`OrdersprodStage` for an API called
`Orders` with `StageName: prod`, and `OrdersStage` followed by ten characters of a hash where the
name cannot be part of an identifier). The deployment is `OrdersDeployment`, where SAM appends a
hash of the document it generates. `Variables` become the stage's stage variables, and `Name`,
`Description` and `DisableExecuteApiEndpoint` go on the API.

`StageName` is required on an `AWS::Serverless::Api`, and real SAM refuses a template leaving it
out. Deployment here is best effort, so an API without one publishes to `Prod`, the stage SAM gives
the implicit API.

A REST API takes a name whatever else it declares, and an API stating no `Name` is named after its
logical ID. Methods reach it as resources naming it by `RestApiId`. That is how an `Api` event on a
function reaches an API the template declared, and how an `AWS::ApiGateway::Method` resource of its
own does.

A `DefinitionBody` reaches the API as its Swagger `Body` and is recorded as a property the API was
created without, because reading the document is outside this. An API declaring one deploys with a
root resource and an empty tree under it. An API naming a `DefinitionUri` is recorded as
unsupported, because this reads no document off disk or out of S3.

The API is deployed without `Auth`, `Cors`, `Domain`, `GatewayResponses`, `MethodSettings` and
`BinaryMediaTypes`. SAM writes each of them into the document it generates, and none is expanded
here.

```typescript sim-cloudformation-sam-rest-api
/**
 * Deploying a SAM AWS::Serverless::Api, with the Globals.Api defaults.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Globals: {
      Api: { Variables: { TABLE_NAME: "orders" } },
    },
    Resources: {
      Orders: {
        Type: "AWS::Serverless::Api",
        Properties: { Name: "orders-api", StageName: "prod" },
      },
    },
  },
});
await stack.waitForDeployComplete();

console.log(stack.getResource("Orders")?.type);
// "AWS::ApiGateway::RestApi"

console.log(stack.getResource("OrdersDeployment")?.type);
// "AWS::ApiGateway::Deployment"

console.log(stack.getResource("OrdersprodStage")?.type);
// "AWS::ApiGateway::Stage"
```

SAM expands a REST API through the Swagger document it generates, with the paths, methods and
integrations inside the `Body` of one resource. The expansion here writes the
`AWS::ApiGateway::Resource` and `AWS::ApiGateway::Method` resources directly. A method is then
something the stack holds, answers `Ref` for and tears down. The APIs, stages and methods come out
the same either way, and the logical IDs of the path resources have no counterpart in what SAM
produces.

## Serving deployed resources on localhost

CloudFormation itself is not served as an HTTP API. Instead, you deploy infrastructure through Sim
CloudFormation, then serve the simulated AWS environment with `serveSimAws`.

```typescript sim-cloudformation-serve-localhost
/**
 * Deploy with sim CloudFormation, then serve the simulated resources on localhost.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

try {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "local-site-stack",
    template: {
      Resources: {
        SiteBucket: {
          Type: "AWS::S3::Bucket",
          Properties: {
            BucketName: "local-site-bucket",
            WebsiteConfiguration: {
              IndexDocument: "index.html",
            },
            // A website Bucket needs a public Bucket policy, which Block
            // Public Access refuses until the Bucket opts out.
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              IgnorePublicAcls: true,
            },
          },
        },
        SiteBucketPolicy: {
          Type: "AWS::S3::BucketPolicy",
          Properties: {
            Bucket: { Ref: "SiteBucket" },
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: "*",
                  Action: "s3:GetObject",
                  Resource: "arn:aws:s3:::local-site-bucket/*",
                },
              ],
            },
          },
        },
      },
    },
  });

  await stack.waitForDeployComplete();

  await simAws.s3().putObject({
    input: {
      Bucket: "local-site-bucket",
      Key: "index.html",
      Body: "<h1>Hello from Sim CloudFormation</h1>",
      ContentType: "text/html; charset=utf-8",
    },
  });

  const websiteUrl = simAws.s3().getBucketWebsiteUrl("local-site-bucket");
  const response = await fetch(srv.localUrl(websiteUrl));

  console.log(response.status);
  console.log(await response.text());
} finally {
  await srv.close();
}
```

Use `srv.localUrl(...)` to adapt simulated service URLs to the local server while preserving the
simulated hostname and service routing information.

## Accounts and Regions

Use `SimAws` scopes to create stacks in different simulated Accounts and Regions.

```typescript sim-cloudformation-account-region-scoping
/**
 * Deploying stacks in different simulated Accounts and Regions.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const defaultCfn = simAws.cloudFormation();
const euWest2Cfn = simAws.region("eu-west-2").cloudFormation();
const accountCfn = simAws.account("111111111111").cloudFormation();
const scopedCfn = simAws
  .account("222222222222")
  .region("ap-east-1")
  .cloudFormation();

await defaultCfn.deployTemplate({
  stackName: "default-stack",
  template: {
    Resources: {
      DefaultHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await euWest2Cfn.deployTemplate({
  stackName: "regional-stack",
  template: {
    Resources: {
      RegionalHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await accountCfn.deployTemplate({
  stackName: "account-stack",
  template: {
    Resources: {
      AccountHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});

await scopedCfn.deployTemplate({
  stackName: "scoped-stack",
  template: {
    Resources: {
      ScopedHandle: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    },
  },
});
```

Stacks are scoped to the selected simulated account and region. Resources created by a stack are
created through that same simulated account/region scope unless the underlying simulated service has
different AWS-like scoping behaviour.

An Account ID can always be written as a plain string, as above. Code that wants to name the type
can get a `SimAwsAccountId` from `simAwsAccountId("111111111111")`, which refuses anything other than
a 12-digit AWS Account ID.

## Reading stack Outputs

A deployed stack resolves its template `Outputs` once its resources exist. `stack.output(key)`
answers one of them as a string.

```typescript sim-cloudformation-stack-output
/**
 * Reading a resolved Stack Output as a string.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "output-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "output-site-bucket",
        },
      },
    },
    Outputs: {
      SiteBucketName: {
        Description: "The bucket the site is served from",
        Value: {
          Ref: "SiteBucket",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const bucketName = stack.output("SiteBucketName");

console.log(bucketName); // "output-site-bucket"
```

`output` throws where the template declares no such Output, naming the stack, the key asked for and
the keys it does declare. It throws again where the Output resolved to something other than a
string, since `DescribeStacks` types an `OutputValue` as a string and a template's Output `Value` is
a string field.

`stack.outputs` holds every resolved Output whole, keyed by name, and is where to go for the
description, the export name, or a value that is not a string. Yulin resolves a few attributes as
the lists and booleans they are, and `Fn::GetAtt` on `AWS::Route53::HostedZone` `NameServers` is the
one that reaches an Output in these docs.

```typescript
const nameServers = stack.outputs.get("HostedZoneNameServers")?.value;
```

## Inspecting stacks and resources

After deployment, you can inspect the returned stack and its resources.

```typescript sim-cloudformation-inspect-stack
/**
 * Inspecting resources created by a simulated CloudFormation Stack.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "inspect-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "inspect-site-bucket",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

const bucketResource = stack.getResource("SiteBucket");

console.log(bucketResource?.simResource);
```

This is useful in tests when you want to assert that a specific template resource created the
expected simulated service resource.

### Listing a Stack's Resources

`stack.resources` holds every Resource the template declared, in the order it declared them. Each
entry is the same `SimCfnDeployedResource` that `getResource` answers with, and a caller after a
group of them filters the array itself.

```typescript sim-cloudformation-list-resources
/**
 * Counting the Resources of one type in a deployed Stack.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "list-resources-stack",
  template: {
    Resources: {
      UploadsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "list-resources-uploads" },
      },
      ArchiveBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "list-resources-archive" },
      },
      UploadsTopic: {
        Type: "AWS::SNS::Topic",
        Properties: { TopicName: "list-resources-uploads" },
      },
    },
  },
});

await stack.waitForDeployComplete();

const buckets = stack.resources.filter(
  (resource) => resource.type === "AWS::S3::Bucket",
);

console.log(buckets.map((bucket) => bucket.logicalId));
// ["UploadsBucket", "ArchiveBucket"]
```

`getResource` covers the Resources a test can name. Counting them is the other question. CDK
hashes the logical ID it synthesizes, and a test asserting how many Resources of a type a Stack
declared has no name to ask for in advance. The array is where that assertion goes. Yulin ships no
filtering helpers on top of it (the shapes a test filters on vary too much for an API to guess).

### Naming the deployed Stack type

A deployment answers with a `SimCfnDeployedStack`, and `getResource(...)` with a
`SimCfnDeployedResource`. A helper written away from the deploy call names both from
`@kensio/yulin/cloudformation`.

```typescript sim-cloudformation-deployed-stack-type
/**
 * Naming what a deployment answers with, for a helper written somewhere else.
 */

import { SimAws } from "@kensio/yulin";
import type {
  SimCfnDeployedResource,
  SimCfnDeployedStack,
} from "@kensio/yulin/cloudformation";

function deployedBucket(
  stack: SimCfnDeployedStack,
): SimCfnDeployedResource | undefined {
  return stack.getResource("SiteBucket");
}

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "named-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "named-site-bucket",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(deployedBucket(stack)?.type);
```

A deployed Stack holds what the caller that deployed it reads back:

- `stackName`, `status` and `error`
- `outputs` and `output(...)`, covered under [Reading stack Outputs](#reading-stack-outputs)
- `resources` and `getResource(...)`
- `ignoredProperties`, `skippedResources`, `inertResources`, `skippedResourceDeletions` and
  `retainedResources`
- `waitForDeployComplete()`, `waitForUpdateComplete()` and `waitForDeleteComplete()`
- `delete()` and `teardown()`

The same type is what a `deployCdkOut` transform is handed for the Stacks in front of the one it is
adapting, as `ReadonlyMap<string, SimCfnDeployedStack>`.

### Looking a Resource up by CDK construct ID

`getResource` takes the CDK construct ID as well as the synthesized logical ID. A construct named
`UploadsBucket` synthesizes as `UploadsBucket9F8E7D6C`, and either name answers with that Resource.
The construct ID is the identifier a [binding](#lambda-function-bindings) takes. A test that bound a
handler by construct ID can ask the Stack what it bound, without reading the synthesized template
for the hash.

```typescript sim-cloudformation-construct-id-resource
/**
 * Finding a synthesized Resource by the CDK construct ID it came from.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "construct-id-stack",
  template: {
    Resources: {
      // As CDK synthesizes it, with a hash on the logical ID and the construct
      // path in Metadata.
      UploadsBucket9F8E7D6C: {
        Type: "AWS::S3::Bucket",
        Metadata: {
          "aws:cdk:path": "UploadsStack/UploadsBucket/Resource",
        },
        Properties: {
          BucketName: "construct-id-uploads",
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.getResource("UploadsBucket")?.logicalId);
// "UploadsBucket9F8E7D6C"
```

A logical ID that matches exactly is answered first. A template naming its own Resources resolves
the way it always has. An identifier no Resource carries either way answers `undefined`.

`stack.skippedResources` lists the Resources the deployment did not create. Each one carries a
`skippedReason` saying why that Resource was skipped. A test that expected a resource to exist can
find out why it is missing.

```typescript sim-cloudformation-inspect-skipped
/**
 * Finding out which Resources a simulated CloudFormation Stack skipped.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "skipped-stack",
  template: {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "skipped-site-bucket",
        },
      },
      AlarmRule: {
        Type: "AWS::CloudWatch::Alarm",
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.skippedResources.map((resource) => resource.logicalId));
// ["AlarmRule"]

console.log(stack.getResource("AlarmRule")?.skippedReason);
// "Unsupported sim CloudFormation Resource service CloudWatch"
```

A skipped Resource is still there for `stack.getResource(...)`, and still answers `Ref` and `Fn::GetAtt` with
[stand-in values](#values-from-a-skipped-resource).

A skip is more than a whole Resource type nothing simulates. A service can decline one Resource of a
type it does create, when that Resource asks for something the service cannot model, and the
`skippedReason` says which part it was. An `AWS::Route53::RecordSet` declaring a record type sim
Route53 has no room for is skipped with the record type named. A DNS stack carrying a record beside
the point of the test still deploys. See [record types](https://yulinsim.dev/services/route53/#record-types).

A Resource that was skipped on create is stepped over by a teardown, never deleted, because nothing
reached simulated AWS to delete. It reaches `DELETE_COMPLETE` and stays out of
`stack.skippedResourceDeletions`. That list is for Resources that were created and could not be
removed.

### Resources deliberately left out

`stack.skippedResources` is for gaps. A Resource it names is one a test written against would find
missing, so some Resources are deliberately kept out of it. Those are the ones the simulator left
uncreated on purpose, because nothing it models could tell them apart from Resources it had created.
They are in `stack.inertResources` instead, each with an `inertReason` for what it would take for the
difference to start mattering.

```typescript sim-cloudformation-inert-resources
/**
 * Telling a Resource a Stack is missing from one it left out on purpose.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "inert-stack",
  template: {
    Resources: {
      AwsCliLayer: {
        Type: "AWS::Lambda::LayerVersion",
        Properties: {
          Description: "/opt/awscli/aws",
        },
      },
      AlarmRule: {
        Type: "AWS::CloudWatch::Alarm",
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.skippedResources.map((resource) => resource.logicalId));
// ["AlarmRule"]

console.log(stack.inertResources.map((resource) => resource.logicalId));
// ["AwsCliLayer"]

console.log(stack.getResource("AwsCliLayer")?.inertReason);
// "sim Lambda runs a function's own code archive, or a real in-process handler
//  bound to it, so nothing a Layer carries is ever on a simulated function's
//  module path"
```

An inert Resource behaves in every other way like a skipped one. It is still there for `stack.getResource(...)`,
it answers `Ref` and `Fn::GetAtt` with the same [stand-in values](#values-from-a-skipped-resource),
and a teardown steps over it.

Two things make a Resource inert. Its type can be one no simulated service reads:

- `AWS::Lambda::LayerVersion`, because sim Lambda runs a function's own code archive, or a real
  in-process handler [bound to it](#lambda-function-bindings), and never assembles a Layer onto a
  function's module path.
- `AWS::CDK::Metadata`, the construct-library analytics CDK adds to every synthesized stack.

Or the stack around it can. The provider Lambda function for a CDK custom resource the simulator
carries out itself is inert. Its log group stays ordinary, because log groups are created, and an
empty one is what an account is left with when nothing invokes the provider either. See
[the provider CDK synthesizes](#the-provider-cdk-synthesizes).

## Properties a Resource was created without

Deployment is best effort. A Resource type outside the simulation is skipped and the rest of the
stack still deploys. The same goes one level down. A property the Resource's own service cannot act
on still leaves the Resource created. It is left out, and the omission is recorded in
`stack.ignoredProperties`.

```typescript sim-cloudformation-ignored-properties
/**
 * Finding out which properties a Stack created its Resources without.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "uploads-stack",
  template: {
    Resources: {
      UploadsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "uploads",
          VersioningConfiguration: { Status: "Enabled" },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// The Bucket exists and is usable, unversioned.
console.log(stack.getResource("UploadsBucket")?.deployed);
// true

for (const ignored of stack.ignoredProperties) {
  console.log(ignored.logicalId, ignored.path, ignored.reason);
  // "UploadsBucket VersioningConfiguration VersioningConfiguration is a real
  //  AWS::S3::Bucket property simulated S3 does not act on: Object versions
  //  are not simulated, ..."
}
```

A template parameter that resolved to a stand-in value is recorded in the same list, with the
parameter name as the `logicalId`, its declared `Type` as the `resourceType`, and a `path` of
`Parameters.<parameter name>`. Only the `AWS::SSM::Parameter::Value<...>` types can produce one.

Each entry names the `logicalId` and `resourceType` of the Resource, the `path` to the property, and
a `reason`. The path is the whole way down, and a setting on one entry of a list says which entry it
was on, such as `GlobalSecondaryIndexes.1.WarmThroughput`. The same list is on each Resource as
`resource.ignoredProperties`.

**An ignored property means the simulated Resource behaves differently to the one the template
describes.** That is the trade this makes. A template deploys as far as it can, and the record is
where to check whether what it could not do matters to the test you are writing. A test asserting on
object versions, on a dead-letter queue, or on a rotated key needs to look here before trusting the
result.

A property name AWS has never had is recorded the same way, and never fails the stack. A typo and a
property AWS added after this simulator read the docs look identical from here, and a Resource that
deploys with the unread name reported is more useful than a stack that fails over either.

Two things are still refused outright, and fail the Resource:

- A property that leaves nothing coherent to create, such as an `AWS::S3::Bucket` whose `BucketName`
  is some type other than a string, or an `AWS::DynamoDB::GlobalTable` whose replica list omits the
  region the stack is deploying into. Real CloudFormation refuses these templates too.
- A value the simulated service itself refuses, in the same words an SDK caller gets. An
  `AWS::SQS::Queue` with `FifoQueue: true` is one. A FIFO queue is named `<name>.fifo`, which
  simulated SQS refuses, leaving no queue to create under the name the template gave it.

Properties nothing simulated could tell apart are left off the list. There is no simulated KMS and
Object bytes are stored as they arrive. An `AWS::S3::Bucket` carrying `BucketEncryption` and `Tags`,
as almost every Bucket CDK synthesizes does, therefore records nothing. A report of differences that
make no difference is one nobody can read.

## Handling deployment failures

Some deployment failures happen asynchronously after stack creation has started. To observe those
failures in tests, wait for deployment completion.

```typescript sim-cloudformation-deployment-failure
/**
 * Observing simulated CloudFormation deployment failures.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "failure-stack",
  template: {
    Resources: {
      InvalidBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "Invalid_Bucket_Name",
        },
      },
    },
  },
});

try {
  await stack.waitForDeployComplete();
} catch (error) {
  console.error("Stack deployment failed", error);
}
```

If you use `waitForStackDeployComplete(...)`, deployment errors are also rethrown there.

```typescript
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// Create a stack...

try {
  await simAws.cloudFormation().waitForStackDeployComplete("failure-stack");
} catch (error) {
  console.error("Stack deployment failed", error);
}
```

## Standalone SimCloudFormation

Most users should access CloudFormation through `SimAws` so that CloudFormation can create resources
in the same simulated AWS environment as S3, CloudFront, and other services.

```typescript
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simCfn = simAws.cloudFormation();
```

`SimCloudFormation` is also exported from `@kensio/yulin/cloudformation` for advanced cases. In
normal application tests, prefer the `SimAws` entry point.

## Available functionality

Sim CloudFormation currently supports:

- `CreateStackCommand`, `DescribeStacksCommand`, `UpdateStackCommand` and `DeleteStackCommand`,
  taking a `TemplateBody` written as JSON or as YAML with short-form intrinsic tags
- Waiting for simulated stack deployment, update and deletion completion
- The resource `DeletionPolicy` attribute, for `Retain` and `RetainExceptOnCreate`
- `deployTemplate(...)` for parsed template objects, optionally naming the synthesized template file
  a template edited in memory came from
- `deployTemplateFile(...)` for template files, written as JSON or as YAML with short-form
  intrinsic tags
- `updateTemplateFile(...)` for applying a synthesized template file to the stack it was deployed as
- Watching a deployed template file, updating its stack in place whenever the file changes
- Template `Parameters` with supplied values and defaults
- Template `Outputs`, resolved after resource creation and read from `stack.outputs`
- Template `Mappings`, read with `Fn::FindInMap`
- Template `Conditions`, built from `Fn::Equals`, `Fn::And`, `Fn::Or` and `Fn::Not`
- The resource `Condition` attribute, which decides whether a resource is created
- The `Ref`, `Fn::GetAtt`, `Fn::Join`, `Fn::Sub`, `Fn::FindInMap`, `Fn::If`, `Fn::Split` and
  `Fn::Select` intrinsic functions
- Explicit resource dependencies with `DependsOn`
- Implicit dependencies from resource `Ref` expressions
- SAM templates naming the `AWS::Serverless-2016-10-31` transform, with `AWS::Serverless::Function`
  expanded into a Lambda function and its execution Role, `AWS::Serverless::SimpleTable` into a
  DynamoDB table, `AWS::Serverless::HttpApi` into an HTTP API and its stage,
  `AWS::Serverless::Api` into a REST API with its deployment and stage, and the `Globals.Function`,
  `Globals.HttpApi` and `Globals.Api` defaults applied
- The `HttpApi` event of a SAM function, expanded into the API, integration, route, stage and invoke
  permission that serve it, and the `Api` event, expanded into the API, path resources, method,
  deployment, stage and invoke permission that serve it
- `FunctionUrlConfig` on a SAM function, expanded into a Function URL
- The `Schedule`, `ScheduleV2` and `EventBridgeRule` events of a SAM function, expanded into the
  EventBridge rule or Scheduler schedule that fires the function, and the permission or execution
  Role the invocation is authorized by

The resource types it creates are:

- `AWS::ApiGateway::RestApi`, `AWS::ApiGateway::Resource`, `AWS::ApiGateway::Method`,
  `AWS::ApiGateway::Deployment` and `AWS::ApiGateway::Stage`
- `AWS::ApiGatewayV2::Api`, `AWS::ApiGatewayV2::Integration`, `AWS::ApiGatewayV2::Route` and
  `AWS::ApiGatewayV2::Stage`
- `AWS::CertificateManager::Certificate`
- `AWS::CloudFormation::WaitConditionHandle`
- `AWS::CloudFront::Distribution`, `AWS::CloudFront::Function` and
  `AWS::CloudFront::ResponseHeadersPolicy`
- `AWS::CloudWatch::Alarm`
- `AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolClient` and
  `AWS::Cognito::UserPoolGroup`
- `AWS::DynamoDB::Table` and `AWS::DynamoDB::GlobalTable`
- `AWS::ECR::Repository`
- `AWS::Events::EventBus` and `AWS::Events::Rule`, with the rule's inline `Targets`
- `AWS::IAM::Role`, `AWS::IAM::User`, `AWS::IAM::ManagedPolicy` and `AWS::IAM::Policy`
- `AWS::Kinesis::Stream`
- `AWS::KinesisFirehose::DeliveryStream`
- `AWS::KMS::Key` and `AWS::KMS::Alias`
- `AWS::Lambda::Function`, `AWS::Lambda::Url` and `AWS::Lambda::Permission`
- `AWS::Logs::LogGroup`
- `AWS::Route53::HostedZone`, `AWS::Route53::RecordSet`, `AWS::Route53::KeySigningKey` and
  `AWS::Route53::DNSSEC`
- `AWS::S3::Bucket` and `AWS::S3::BucketPolicy`
- `AWS::Scheduler::Schedule`
- `AWS::SecretsManager::Secret`
- `AWS::SQS::Queue`
- `AWS::SSM::Parameter`
- `AWS::StepFunctions::StateMachine`
- selected CDK custom resources: `Custom::CDKBucketDeployment`, `Custom::S3BucketNotifications` and
  `Custom::CrossRegionStringParameterReader`

Each service's own docs describe what its resource types support.

## Limitations

- Only supported resource types create simulated service resources. An unsupported resource may be
  skipped or may fail the stack, depending on how safely the simulator can model it. A skipped
  resource answers `Ref` and `Fn::GetAtt` with
  [stand-in values](#values-from-a-skipped-resource) rather than the value a created resource would
  have given.
- `stack.skippedResources` deliberately leaves out the resources the simulator did not create on
  purpose, because nothing it models could tell them apart from ones it had. Those are in
  `stack.inertResources` instead, and are listed under
  [resources deliberately left out](#resources-deliberately-left-out). Read both when accounting for
  every resource in a template.
- `AWS::IAM::ManagedPolicy` is created from `ManagedPolicyName`, `Path`, `Description`,
  `PolicyDocument` and `Roles`. Every `Roles` entry names a Role in the Stack's Account, and the
  created policy is attached to each of them. An entry naming no simulated Role fails the resource,
  as an `AWS::IAM::Policy` naming one does. `Users` and `Groups` fail the resource, because neither
  can hold a managed policy attachment in the simulation. Deleting the stack takes the policy off
  the Roles still carrying it before deleting the policy itself.
- `AWS::Logs::LogGroup` is created, including the one CDK writes for a custom resource provider. That
  one is left empty, because the provider is never invoked. A log group a stack declares for a
  Lambda function is the same group that function writes to, and a group already there is taken over
  rather than failing the deploy the way real CloudFormation does. See the
  [simulated CloudWatch Logs docs](https://yulinsim.dev/services/logs/ "Simulated CloudWatch Logs usage docs").
- A resource property outside the simulation is left out and recorded in `stack.ignoredProperties`
  rather than failing the stack. The resource is created behaving differently to the one the
  template describes. See
  [properties a Resource was created without](#properties-a-resource-was-created-without) for what
  is still refused outright.
- A stack update replaces a changed resource rather than updating it in place, so what the resource
  held is lost. See [changed resources are replaced](#changed-resources-are-replaced).
- A watched template file updates its stack in place. That makes the update itself no gentler. A
  changed resource is still replaced and loses what it holds, the same as any other update.
- Yulin never synthesizes a CDK app. It watches the synthesized output template. A change to the app
  itself reaches the stack once something has run `cdk synth` over it.
- A stack update applies a whole template directly. Change sets are outside the simulation, so
  `CreateChangeSetCommand` and `ExecuteChangeSetCommand` have nothing behind them, and neither does
  drift detection.
- A failed stack update is not rolled back to the template the stack was deployed from. The stack is
  left in `UPDATE_FAILED` holding whatever the update managed.
- `UpdateStackCommand` reads `StackName`, `TemplateBody` and `Parameters`. `UsePreviousTemplate` and
  `UsePreviousValue` are not read, so an update has to be given the whole new template.
- An update asked for while another is still running is refused, as CloudFormation refuses it. There
  is no queue behind it.
- A stack deletion deletes only the resource types the simulator can delete. A resource type it
  creates but cannot delete is recorded in `stack.skippedResourceDeletions` and stepped over, the
  same way an unsupported resource type is on create, and the stack still deletes with that resource
  left behind.
- `DeletionPolicy` is read for `Retain` and `RetainExceptOnCreate` only. `Snapshot` is treated as
  `Delete`, because no simulated service takes snapshots.
- `UpdateReplacePolicy` is not read. A replaced resource is deleted whatever it says, for the reason
  given under [changed resources are replaced](#changed-resources-are-replaced).
- `DeleteStackCommand` reads only `StackName`. `RetainResources`, `DeletionMode`, `RoleARN` and
  `ClientRequestToken` are not read, so a stack left in `DELETE_FAILED` cannot be forced through the
  way `FORCE_DELETE_STACK` forces it in AWS.
- A deleted stack cannot be described. Real CloudFormation keeps a deleted stack readable by its
  unique stack ID, and the simulator identifies a stack by its name alone.
- `Fn::FindInMap` accepts only the three-argument form. The four-argument form, where the fourth
  argument is `{ "DefaultValue": ... }`, is rejected.
- `Fn::FindInMap` arguments are resolved from literals, `Parameters` and pseudo parameters. An
  argument that depends on a created resource, such as a `Ref` to a resource logical ID, fails the
  resource with a "could not find map" error. Real CloudFormation allows only `Ref` and a nested
  `Fn::FindInMap` inside `Fn::FindInMap`. The templates affected here are ones real CloudFormation
  would reject as well. The simulator just rejects them later rather than up front.
- `Fn::If` is unsupported inside the `Conditions` section itself. It is rejected there rather than
  read against a half-evaluated section.
- `Fn::Split` and `Fn::Select` accept any argument that resolves to the type they need. Real
  CloudFormation allows only a named set of functions inside each of them. A template the simulator
  resolves may still be one CloudFormation rejects.
- The `Condition` attribute is read on resources but not on outputs. An output carrying one is
  resolved and present in `stack.outputs` whichever way its condition falls, where real
  CloudFormation would leave it out.
- The SAM transform is expanded for `AWS::Serverless::Function`, `AWS::Serverless::SimpleTable`,
  `AWS::Serverless::HttpApi` and `AWS::Serverless::Api`. Every other `AWS::Serverless::*` resource
  type is recorded as unsupported. `Api`, `HttpApi`, `SQS`, `DynamoDB`, `SNS`, `S3`, `Schedule`,
  `ScheduleV2` and `EventBridgeRule` are the event types expanded, and an event of another type,
  such as `Cognito`, is left where it is. `Auth` on an `Api` or `HttpApi` event, and on the implicit API
  either of them shares, is left out. `AutoPublishAlias` and `DeploymentPreference` are left out
  too, because the simulator has one version of a function and nothing to shift traffic between.
- Many advanced CloudFormation features are outside the simulation.
