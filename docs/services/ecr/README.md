# Simulated ECR

Yulin represents an ECR image with an in-process Lambda handler. Register the handler against a
repository and tag, then deploy or create a container image function that uses the image URI.

ECR-specific types are imported from the `@kensio/yulin/ecr` subpath.

## What a simulated image is

An image URI identifies a registered handler. Image content remains outside the simulation.

Use the Yulin-specific `simulateImage` method to register a handler. The simulated surface has no
ECR SDK or Docker registry operations.

## Registering a handler as an image

Register the handler during test setup. Lambda resolves image functions from the same repository.

```typescript sim-ecr-register-image
/**
 * Registering a handler as the image in a simulated ECR repository.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

simAws
  .ecr()
  .repository("orders")
  .simulateImage({
    imageTag: "latest",
    handler: (event: { orderId: string }): string =>
      `Processed ${event.orderId}`,
  });

// Any stack whose function image points into that repository runs the handler.
await simAws.cloudFormation().deployTemplate({
  stackName: "orders-api",
  template: {
    Resources: {
      OrdersFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
          PackageType: "Image",
          Code: {
            ImageUri:
              `${simAws.defaultAccountId}.dkr.ecr.` +
              `${simAws.defaultRegionName}.amazonaws.com/orders:2f0e1dab4c`,
          },
        },
      },
    },
  },
});

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "orders",
    Payload: JSON.stringify({ orderId: "order-1" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
```

Calling `repository(name)` creates the repository if it is absent.

Pass a repository name such as `orders` or `platform/orders`. The selected simulated account and
Region supply the registry host.

## How an image URI is matched

Yulin first matches the registry host and repository name. It then looks for the requested tag. A
registered tag selects that handler. An unknown tag, a digest or no tag selects the most recently
registered handler. This fallback lets content-hash and build-number tags resolve without copying
those generated values into the test.

The registry host determines the account and Region. Repositories with the same name in different
scopes remain separate. Cross-account image references are supported.

Registering a tag again replaces its handler and makes that handler the most recent registration.

```typescript sim-ecr-image-tags
/**
 * Two tagged images in one simulated ECR repository.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const registryHost =
  `${simAws.defaultAccountId}.dkr.ecr.` +
  `${simAws.defaultRegionName}.amazonaws.com`;

simAws
  .ecr()
  .repository("orders")
  .simulateImage({ imageTag: "blue", handler: (): string => "blue handler" })
  .simulateImage({ imageTag: "green", handler: (): string => "green handler" });

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders-blue",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
    PackageType: "Image",
    Code: { ImageUri: `${registryHost}/orders:blue` },
  }),
);

const output = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "orders-blue" }));

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString()); // "blue handler"

await simAws.backgroundTasksComplete();
```

Direct `CreateFunction` calls and CloudFormation deployments use the same resolution rules. Lambda
refuses an image URI that resolves to no handler.

## Repositories in CloudFormation

Simulated CloudFormation creates `AWS::ECR::Repository`. The repository starts empty unless a
handler was already registered under its name.

`Ref` returns the repository name. `Fn::GetAtt` supports `Arn` and `RepositoryUri`.

```typescript sim-ecr-cloudformation-repository
/**
 * An AWS::ECR::Repository declared by one stack and used by another.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The platform stack declares the repository.
const platformStack = await simAws.cloudFormation().deployTemplate({
  stackName: "platform",
  template: {
    Resources: {
      OrdersRepository: {
        Type: "AWS::ECR::Repository",
        Properties: { RepositoryName: "orders" },
      },
    },
    Outputs: {
      RepositoryUri: {
        Value: { "Fn::GetAtt": ["OrdersRepository", "RepositoryUri"] },
      },
    },
  },
});

await platformStack.waitForDeployComplete();

const repositoryUri = platformStack.output("RepositoryUri");

if (typeof repositoryUri !== "string") {
  throw new TypeError("No RepositoryUri Output");
}

// The handler stands in for whatever the pipeline would have pushed.
simAws
  .ecr()
  .repository("orders")
  .simulateImage({ handler: (): string => "ran the repository image" });

// The application stack runs an image from it.
await simAws.cloudFormation().deployTemplate({
  stackName: "orders-api",
  template: {
    Resources: {
      OrdersFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
          PackageType: "Image",
          Code: { ImageUri: `${repositoryUri}:latest` },
        },
      },
    },
  },
});

const output = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "orders" }));

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
```

A deployment adopts a repository that already contains a registered handler.

Stack teardown removes an empty repository. A repository containing a handler remains in place and
its deletion is recorded as skipped. Teardown continues after the skipped deletion.

Other repository properties are recorded as ignored. These include `ImageScanningConfiguration`, `ImageTagMutability`,
`LifecyclePolicy`, `RepositoryPolicyText`, `EncryptionConfiguration`, `EmptyOnDelete` and `Tags`.

## Where a function's handler comes from

Yulin resolves a container image function in this order:

1. An [executable binding](https://yulinsim.dev/services/lambda/#executable-bindings) supplied for the deployment.
2. The handler registered in the ECR repository named by `Code.ImageUri`.

A function with no binding or registered image is skipped. The diagnostic distinguishes a missing
repository from a repository with no handlers.

## Available functionality

- Repositories, made by naming them, scoped by account and region
- `simulateImage`, registering a real in-process handler as the image under a tag
- Resolution of a Lambda `Code.ImageUri` to that handler, finding the repository on registry host
  and name alone, then reading the tag to choose between the images it holds
- Functions created from a repository image through CloudFormation and through `CreateFunction`
- Images resolved across accounts and regions, as real Lambda pulls across them
- `AWS::ECR::Repository`, answering `Ref` with the repository name and `Fn::GetAtt` with `Arn` and
  `RepositoryUri`

## Limitations

- No image content, layer, digest, manifest or scan behaviour is simulated. A repository holds
  handlers, and no image is ever pulled or inspected.
- There are no ECR SDK commands. `CreateRepository`, `DescribeRepositories`, `PutImage`,
  `DescribeImages`, `BatchDeleteImage` and `GetAuthorizationToken` are all absent. Registering an
  image is a Yulin-native operation because real `PutImage` takes a manifest for layers pushed over
  the Docker registry protocol, and that protocol never runs in this process.
- CloudFormation authorizes `ecr:CreateRepository` and `ecr:DeleteRepository`. Handler registration
  has no caller and skips authorization. Repository policies are ignored.
- Lifecycle policies go unevaluated, and no simulated image ever expires. Tag mutability goes
  unenforced, and registering the same tag again replaces what it held.
- Naming a repository creates it. There is no `CreateRepository` to fail for a name already taken,
  and no way to ask whether a repository exists without making one, other than `hasRepository`.
- A stack teardown records the deletion of a repository holding a simulated image and carries on,
  where real CloudFormation fails the stack unless the template says `EmptyOnDelete`. The repository
  and its handler are left in place, and `EmptyOnDelete` itself goes unread.
- The repository model records no owning stack. Teardown of any declaring stack removes an empty
  repository.
- Repository tags, registry policies, pull through cache rules, replication configuration and ECR
  Public are absent.
- `serveSimAws` exposes no ECR HTTP API or Docker registry endpoint.
