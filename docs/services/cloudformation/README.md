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
  srv.close();
}
```

A CDK BucketDeployment can copy files from synthesized asset output into the simulated Bucket. When
the Bucket is configured for website hosting, those files can be served through Yulin's local
server.

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
  srv.close();
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
  srv.close();
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

- `CreateStackCommand` and `DescribeStacksCommand`
- Waiting for simulated stack deployment completion
- `deployTemplate(...)` for parsed template objects
- `deployTemplateFile(...)` for synthesized JSON template files
- Template `Parameters` with supplied values and defaults
- Template `Outputs`, resolved after resource creation and read from `stack.outputs`
- The `Ref`, `Fn::GetAtt`, `Fn::Join` and `Fn::Sub` intrinsic functions
- Explicit resource dependencies with `DependsOn`
- Implicit dependencies from resource `Ref` expressions

The resource types it creates are:

- `AWS::CertificateManager::Certificate`
- `AWS::CloudFormation::WaitConditionHandle`
- `AWS::CloudFront::Distribution` and `AWS::CloudFront::Function`
- `AWS::Cognito::UserPool`, `AWS::Cognito::UserPoolClient` and
  `AWS::Cognito::UserPoolGroup`
- `AWS::IAM::Role`, `AWS::IAM::ManagedPolicy` and `AWS::IAM::Policy`
- `AWS::KMS::Key` and `AWS::KMS::Alias`
- `AWS::Lambda::Function`, `AWS::Lambda::Url` and `AWS::Lambda::Permission`
- `AWS::Route53::HostedZone` and `AWS::Route53::RecordSet`
- `AWS::S3::Bucket` and `AWS::S3::BucketPolicy`
- `AWS::SecretsManager::Secret`
- `AWS::SQS::Queue`
- `AWS::SSM::Parameter`
- selected CDK custom resources, including CDK S3 BucketDeployment

Each service's own docs describe what its resource types support.

## Limitations

- `TemplateBody` must be JSON when using `CreateStackCommand`. YAML parsing is not currently provided
  by the CloudFormation service.
- Only supported resource types create simulated service resources. An unsupported resource may be
  skipped or may fail the stack, depending on how safely the simulator can model it.
- Unsupported resource properties may be ignored or rejected depending on the resource simulator.
- Stack updates and deletes are not supported.
- Mappings, conditions, and many advanced CloudFormation features are not supported.
