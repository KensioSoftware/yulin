# Simulated CloudFormation

Yulin includes a simulated CloudFormation service for tests and local development.

Sim CloudFormation creates simulated AWS resources from CloudFormation templates. It can be used with
hand-written templates, AWS SDK-style `CreateStackCommand` calls, or synthesized CDK template files.

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

Updating a stack name that is not there is refused with the same `ValidationError` that
`DescribeStacksCommand` refuses it with, because there is nothing else an update of a stack that is
not there could mean.

### What counts as a change

Resources are compared as they resolve rather than as they are written, so a changed parameter value
shows up as a changed resource even when the template body is identical, and a template reordered
without being changed does not. Outputs are compared the same way. The rest of the template body is
compared as written, so a change to a section the simulator does not act on, such as `Description`,
is still an update.

A template that changes nothing at all is refused with a `ValidationError` reading
`No updates are to be performed.`, which is what CloudFormation answers. So is an update asked for
while another is still running.

### Changed resources are replaced

A resource whose template entry changed is deleted and created again from the new template. Real
CloudFormation updates most properties in place and keeps what the resource holds, so this is a
divergence worth knowing about: a bucket that gains a property loses its objects here, where in AWS
it would keep them. In-place update is the obvious next step and is not implemented yet.

Two things follow from replacement:

- A resource naming a replaced resource is replaced too, all the way up the dependency chain, so
  nothing is left pointing at a resource that has gone. Real CloudFormation hands the dependent the
  new physical name instead of recreating it.
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
a `ValidationError` once the deletion has finished, which is how CloudFormation answers a name it no
longer holds.

Deleting a stack name that is not there succeeds rather than failing, as it does in CloudFormation.

### When a resource cannot be deleted

Some resources refuse to go, the same way they do in AWS. An S3 bucket that still holds objects is
the common one: CloudFormation fails there rather than emptying the bucket first, which is why CDK
ships an `autoDeleteObjects` custom resource.

A refusal leaves the stack in `DELETE_FAILED` with the reason on it, and keeps the stack name in use.
`waitForStackDeleteComplete(...)` rethrows the error, and `DescribeStacksCommand` reports it as
`StackStatusReason`. Dealing with the cause and sending `DeleteStackCommand` again deletes the stack.

### `DeletionPolicy`

A resource declared with `DeletionPolicy: Retain` is left in simulated AWS and reported as
`DELETE_SKIPPED`, which is what CloudFormation does with it. The rest of the stack still deletes
around it, and the stack name is still released. `RetainExceptOnCreate` is treated the same way,
because the two differ only in what a rolled back creation does, and sim CloudFormation does not roll
a deployment back.

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

When a parameter value is not supplied, the template default is used if present.

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

A Resource that was skipped, because its type is not simulated or because there is no simulated
Resource to create at all, still answers both intrinsics. `Ref` returns the logical ID, and
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
      AlarmTopic: {
        Type: "AWS::SNS::Topic",
      },
    },
    Outputs: {
      TopicRef: { Value: { Ref: "AlarmTopic" } },
      TopicArn: { Value: { "Fn::GetAtt": ["AlarmTopic", "TopicArn"] } },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.outputs.get("TopicRef")?.value);
// "AlarmTopic"

console.log(stack.outputs.get("TopicArn")?.value);
// "AlarmTopic.TopicArn"

for (const skipped of stack.skippedResources) {
  console.log(skipped.logicalId, skipped.skippedReason);
  // "AlarmTopic Unsupported sim CloudFormation Resource service SNS"
}
```

The stand-ins are what lets a template with unsimulated Resources in it deploy at all. Without them,
every Resource holding a `Ref` or `Fn::GetAtt` to a skipped Resource would fail too, and so would
every Resource depending on those, until one SNS topic took the whole stack down with it. The skip
stays where it happened.

A stand-in is deliberately not ARN-shaped, so it fails closed wherever the simulator reads it.

- In an IAM policy `Resource` it matches no ARN, so a caller relying on that statement is denied.
- In a property that is parsed as an ARN it is refused as malformed, and that Resource fails.
  Handing `Fn::GetAtt: ["Orders", "StreamArn"]` from a skipped DynamoDB table to an
  `AWS::Lambda::EventSourceMapping` fails with
  `EventSourceArn Orders.StreamArn names no simulated Lambda event source`.
- Handed to a Lambda function through its environment, it names something that is not there, so the
  function's own SDK call fails as a call for a missing resource does. A `PutItem` naming the
  skipped table gets `ResourceNotFoundException: No DynamoDB Table named Orders`.

A stand-in stands in for something absent, so it is not a value to rely on. A test asserting against
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

Each of the three arguments can be a nested expression rather than a literal string, as long as it
resolves to a string. The example above uses a `Ref` to a parameter for the top-level key. A `Ref` to
the `AWS::Region` pseudo parameter works the same way, for the per-region maps that `Fn::FindInMap`
is most often used for, and a nested `Fn::FindInMap` can supply any of the three arguments.

The value a lookup returns does not have to be a string. A list value is returned as a list.

`Fn::FindInMap` is resolved when the template is read, before any resource is created, so it can be
used in resource properties and in `Outputs`. A map name or key that is not in `Mappings` fails the
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
string, including a `Ref`, an `Fn::GetAtt` or another function. A delimiter the string does not
contain gives a one-element list, and a delimiter at the start or end of the string gives an empty
element there, as CloudFormation does.

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

An index past the end of the list, a negative or fractional index, and a second argument that is not
a list all fail the deployment, as they are all templates AWS rejects. The error names the resource
and the property path the value sat at, for example
`Sim CloudFormation Resource LogsBucket value at Properties.BucketName`.

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
console.log(stack.resources.has("Backups"));
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

`Fn::Equals` compares its two values as strings, as CloudFormation does, so a JSON number in the
template matches the string a parameter carries.

The whole section is evaluated once per deployment, before any resource is created, so a condition
can read parameters and pseudo parameters and nothing else. A comparison that would need a created
resource, such as an `Fn::GetAtt`, fails the deployment rather than reading as false.

### `Fn::If`

`Fn::If` takes a condition name, a value to use when it is true, and a value to use when it is
false. It works anywhere a resource property or an output value is read.

Only the branch the condition selects is resolved. The other branch is left alone, so it can name a
resource this deployment does not create.

### The resource `Condition` attribute

A resource carrying a `Condition` attribute whose condition is false is not created at all. It is
absent from `stack.resources`, which is different from a resource sim CloudFormation skips: a
skipped resource stays in the stack and answers `Ref` and `Fn::GetAtt` with
[stand-in values](#values-from-a-skipped-resource).

Because the resource does not exist, another resource naming it fails the deployment, with an error
naming both resources and the condition. That covers a `Ref` or `Fn::GetAtt` that is actually
reached, and a `DependsOn`. A name carried only by the branch of an `Fn::If` the condition did not
select is not reached, so it does not fail.

A `Condition` attribute naming a condition the template does not define fails the same way.

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

Use `deployTemplateFile(...)` to deploy a JSON template file, including templates produced by CDK
synthesis.

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

## Editing a synthesized template before deploying it

Sometimes a synthesized template needs a change before Yulin will deploy it, such as dropping a
resource or property that this simulator does not accept. Read the file, edit the parsed object,
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

The template file is not read as the template: the `template` object is what gets deployed.
`templatePath` only tells Yulin which cloud assembly the template came from, so it can find the
sibling `TestStack.assets.json` manifest and the staged asset directories beside it. Without it,
anything that needs a CDK asset, such as a `Custom::CDKBucketDeployment` or a Lambda function
bundled with `Code.fromAsset`, fails with `No CDK assets manifest is available.`

## Adapting a synthesized template on the way in

Editing the parsed object works for a template you deploy once. A template you keep reading, because
it is [watched](#watching-a-template-file) or applied again as an update, needs the same change made
every time it is read. `transform` is that: it is given the parsed template and answers with the one
to deploy, on the deployment and again on every change:

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
hosted zone ID that came from `HostedZone.fromLookup`. A property Yulin does not model is usually not
one you need this for: S3, DynamoDB, Cognito, API Gateway v2, SQS and KMS
[record it and carry on](#properties-a-resource-was-created-without).

The template file is still the real one, so there is no derived `.local.template.json` in `cdk.out`
to keep in step with it. Staged assets resolve as they always did, from the assets manifest beside
`templatePath`, since the cloud assembly is found by path rather than read out of the template.

`updateTemplateFile(...)` takes it too, for a consumer driving updates itself. Give it the same
deployment object, so the difference applied is the difference in the file.

A transform that throws fails the deployment, with what it threw as the cause. On a watched change it
is reported the way a failed update is: the stack keeps the resources it had, and the watch carries
on to the next save.

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

The sibling assets manifest is read again with the template, so a resource the update replaces reads
the assets that synthesis staged rather than the ones the stack was deployed with.

A file written without being changed is refused with `No updates are to be performed.`, and a failed
update leaves the stack in `UPDATE_FAILED` holding whatever the update reached. There is no rollback
to the template it was deployed from, so a failure part way through has already deleted, replaced or
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
    onUpdated: () => {
      srv.reload();
    },
  },
});
```

`watch: true` watches with nothing to do afterwards.

`onUpdated` runs once the update is complete, which is where a served page gets reloaded. It runs
when the resources have changed rather than when the write lands, so a browser reloads onto the
resources the new template asked for. A write that changed nothing is a no-op, so nothing reloads
for it.

`onFailed` is given an update the changed template did not survive. It reports the failure and
nothing else: the stack is left holding whatever the update reached, as an update through the
command is. What a failure does keep is the process, and the resources it never got to, so a
template that no longer deploys leaves a working environment where a restart on it would leave
none.

A burst of writes is one update. Saving a file is several filesystem events, so changes are held
until they stop arriving. `settleMs` is how long that wait is, and it defaults to the 250ms
[`yulin watch` settles at](../../serve/README.md#one-restart-for-a-burst-of-writes). A synth that
keeps writing is updated from after five seconds of it, rather than being held off until it stops.

[`transform`](#adapting-a-synthesized-template-on-the-way-in) runs again on every change, so a
template that needs adapting before Yulin will take it can still be watched as the file synthesis
writes.

Watching holds a filesystem handle open, so the process does not exit on its own. That is what a dev
process wants. Anything with an end, such as a test, calls `stopWatchingTemplateFiles()` when it is
done. `watchedTemplateFiles()` names what is being watched.

Yulin never synthesizes anything. It reads the output template, so run your own `cdk synth` and let
the watch pick up what it writes.

### Under `yulin watch`

[`yulin watch`](../../serve/README.md#restarting-on-a-file-change) restarts the process when a
deployed template changes. A watched template is left to the process that is watching it instead, so
the stack updates in place and everything held in simulated S3, DynamoDB and SQS stays where it is.
Nothing needs configuring for that: the process names the file it is holding.

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

A CDK BucketDeployment can copy files from synthesized asset output into the simulated Bucket. When
the Bucket is configured for website hosting, those files can be served through Yulin's local
server.

## S3 Bucket notifications

The `NotificationConfiguration` property of `AWS::S3::Bucket` deploys through the ordinary
`PutBucketNotificationConfiguration` path, so an Object put into the deployed Bucket reaches the
deployed function. CloudFormation spells the configuration differently from the SDK in four places,
and Yulin reads the CloudFormation spelling and refuses the others rather than deploying a
configuration that quietly lost its filter.

Real CloudFormation has a circular dependency here. The Bucket needs the function's ARN and the
function's permission needs the Bucket's ARN, so a template hardcodes `BucketName`, names the Bucket
by ARN literal on the permission, and adds a `DependsOn` so the permission is in place before S3
validates the destination. Simulated CloudFormation needs the same, and surfaces the alternative as a
dependency resolution failure.

Note that every other `AWS::S3::Bucket` property the simulator has no behaviour for fails the stack
by name. See [Buckets from CloudFormation](../s3/README.md#buckets-from-cloudformation).

### From a CDK app

`bucket.addEventNotification(...)` synthesizes a `Custom::S3BucketNotifications` resource rather than
a Bucket property. Sim CloudFormation applies the configuration it carries through the ordinary
`PutBucketNotificationConfiguration` path, so an Object put into the deployed Bucket reaches the
deployed function.

Deploy into an Account and Region matching the ones the CDK app synthesized for. The `SourceAccount`
on the `AWS::Lambda::Permission` CDK writes beside the notification is a synth-time literal, so a
stack deployed into another Account leaves S3 unable to validate the destination, and the stack
fails.

See [Event notifications](../s3/README.md#event-notifications) in the S3 docs for the configuration
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
real in-process handler, so tests can close over test state and step through the handler in a
debugger, while the stack still wires roles, grants and references as the template declares. A bound
function may omit template `Code` and `Handler` entirely.

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

`stack.skippedResources` lists the Resources the deployment did not create. Each one carries a
`skippedReason` naming the type that is not simulated, so a test that expected a resource to exist
can find out why it does not.

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
      AlarmTopic: {
        Type: "AWS::SNS::Topic",
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.skippedResources.map((resource) => resource.logicalId));
// ["AlarmTopic"]

console.log(stack.getResource("AlarmTopic")?.skippedReason);
// "Unsupported sim CloudFormation Resource service SNS"
```

A skipped Resource is still in `stack.resources`, and still answers `Ref` and `Fn::GetAtt` with
[stand-in values](#values-from-a-skipped-resource).

## Properties a Resource was created without

Deployment is best effort. A Resource type that is not simulated is skipped and the rest of the
stack still deploys, and the same goes one level down: a property the Resource's own service cannot
act on does not stop the Resource being created. It is left out, and the omission is recorded in
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

Each entry names the `logicalId` and `resourceType` of the Resource, the `path` to the property, and
a `reason`. The path is the whole way down, so a setting on one entry of a list says which entry it
was on, such as `GlobalSecondaryIndexes.1.WarmThroughput`. The same list is on each Resource as
`resource.ignoredProperties`.

**An ignored property means the simulated Resource behaves differently to the one the template
describes.** That is the trade this makes: a template deploys as far as it can, and the record is
where to check whether what it could not do matters to the test you are writing. A test asserting on
object versions, on a dead-letter queue, or on a rotated key needs to look here before trusting the
result.

A property name that is not one AWS has is recorded the same way rather than failing the stack. A
typo and a property AWS added after this simulator read the docs look identical from here, and a
Resource that deploys with the unread name reported is more useful than a stack that fails over
either.

Two things are still refused outright, and fail the Resource:

- A property that leaves nothing coherent to create, such as an `AWS::S3::Bucket` whose `BucketName`
  is not a string, or an `AWS::DynamoDB::GlobalTable` whose replica list does not include the region
  the stack is deploying into. Real CloudFormation refuses these templates too.
- A value the simulated service itself refuses, which is refused in the same words an SDK caller
  gets. An `AWS::SQS::Queue` with `FifoQueue: true` is one: a FIFO queue is named `<name>.fifo`,
  which simulated SQS refuses, so there is no queue to create under the name the template gave it.

Properties nothing simulated could tell apart are not listed. There is no simulated KMS and Object
bytes are stored as they arrive, so an `AWS::S3::Bucket` carrying `BucketEncryption` and `Tags`, as
almost every Bucket CDK synthesizes does, records nothing: a report of differences that make no
difference is one nobody can read.

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

- `CreateStackCommand`, `DescribeStacksCommand`, `UpdateStackCommand` and `DeleteStackCommand`
- Waiting for simulated stack deployment, update and deletion completion
- The resource `DeletionPolicy` attribute, for `Retain` and `RetainExceptOnCreate`
- `deployTemplate(...)` for parsed template objects, optionally naming the synthesized template file
  a template edited in memory came from
- `deployTemplateFile(...)` for synthesized JSON template files
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

The resource types it creates are:

- `AWS::ApiGatewayV2::Api`, `AWS::ApiGatewayV2::Integration`, `AWS::ApiGatewayV2::Route` and
  `AWS::ApiGatewayV2::Stage`
- `AWS::CertificateManager::Certificate`
- `AWS::CloudFormation::WaitConditionHandle`
- `AWS::CloudFront::Distribution` and `AWS::CloudFront::Function`
- `AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolClient` and
  `AWS::Cognito::UserPoolGroup`
- `AWS::DynamoDB::Table` and `AWS::DynamoDB::GlobalTable`
- `AWS::IAM::Role`, `AWS::IAM::ManagedPolicy` and `AWS::IAM::Policy`
- `AWS::KMS::Key` and `AWS::KMS::Alias`
- `AWS::Lambda::Function`, `AWS::Lambda::Url` and `AWS::Lambda::Permission`
- `AWS::Route53::HostedZone` and `AWS::Route53::RecordSet`
- `AWS::S3::Bucket` and `AWS::S3::BucketPolicy`
- `AWS::SecretsManager::Secret`
- `AWS::SQS::Queue`
- `AWS::SSM::Parameter`
- selected CDK custom resources: `Custom::CDKBucketDeployment` and `Custom::S3BucketNotifications`

Each service's own docs describe what its resource types support.

## Limitations

- `TemplateBody` must be JSON when using `CreateStackCommand` or `UpdateStackCommand`. YAML parsing
  is not currently provided by the CloudFormation service.
- Only supported resource types create simulated service resources. An unsupported resource may be
  skipped or may fail the stack, depending on how safely the simulator can model it. A skipped
  resource answers `Ref` and `Fn::GetAtt` with
  [stand-in values](#values-from-a-skipped-resource) rather than the value a created resource would
  have given.
- A resource property that is not simulated is left out and recorded in `stack.ignoredProperties`
  rather than failing the stack, so the resource is created behaving differently to the one the
  template describes. See
  [properties a Resource was created without](#properties-a-resource-was-created-without) for what
  is still refused outright.
- A stack update replaces a changed resource rather than updating it in place, so what the resource
  held is lost. See [changed resources are replaced](#changed-resources-are-replaced).
- A watched template file updates its stack in place, which does not make the update itself any
  gentler: a changed resource is still replaced and loses what it holds, the same as any other
  update.
- Yulin never synthesizes a CDK app. It watches the synthesized output template, so a change to the
  app itself only reaches the stack once something has run `cdk synth` over it.
- A stack update applies a whole template directly. Change sets are not supported, so
  `CreateChangeSetCommand` and `ExecuteChangeSetCommand` have nothing behind them, and neither does
  drift detection.
- A failed stack update is not rolled back to the template the stack was deployed from. The stack is
  left in `UPDATE_FAILED` holding whatever the update managed.
- `UpdateStackCommand` reads `StackName`, `TemplateBody` and `Parameters`. `UsePreviousTemplate` and
  `UsePreviousValue` are not read, so an update has to be given the whole new template as JSON.
- An update asked for while another is still running is refused, as CloudFormation refuses it. There
  is no queue behind it.
- A stack deletion deletes only the resource types the simulator can delete. A resource type it
  creates but cannot delete is recorded in `stack.skippedResourceDeletions` and stepped over, the
  same way an unsupported resource type is on create, so the stack still deletes with that resource
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
  resource with a "could not find map" error rather than being resolved. Real CloudFormation allows
  only `Ref` and a nested `Fn::FindInMap` inside `Fn::FindInMap`, so this only affects templates real
  CloudFormation would reject as well, but the simulator does not reject them up front.
- `Fn::If` is not supported inside the `Conditions` section itself. It is rejected there rather than
  read against a half-evaluated section.
- `Fn::Split` and `Fn::Select` accept any argument that resolves to the type they need. Real
  CloudFormation allows only a named set of functions inside each of them, so a template the
  simulator resolves may still be one CloudFormation rejects.
- The `Condition` attribute is read on resources but not on outputs. An output carrying one is
  resolved and present in `stack.outputs` whichever way its condition falls, where real
  CloudFormation would leave it out.
- Many advanced CloudFormation features are not supported.
