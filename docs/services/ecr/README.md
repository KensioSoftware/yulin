# Simulated ECR

Yulin includes a simulated Amazon ECR for tests and local development. It holds repositories, and
each repository holds images by tag, where a simulated image is a real in-process handler.

That is what this service is for. A container image Lambda function cannot run here, because Yulin
never reads an image, so something has to say what the code inside that image actually is. A
repository is the natural place to say it. It is the stable name for the thing that holds the code,
outliving any tag and any CDK construct ID, and a repository holding a registered handler outlives
the stack that declared it too.

ECR-specific types are imported from the `@kensio/yulin/ecr` subpath.

## What a simulated image is

An image URI is only ever an identifier here. No image is pulled or inspected, and no layer,
manifest, digest or scan finding exists. A simulated image is a handler function, registered against
a repository and a tag.

Registering one is a Yulin-native operation, named `simulateImage` to keep it clear of a simulated
`PutImage`. Real `PutImage` takes an image manifest for layers that were pushed over the Docker
registry protocol. None of that happens in this process, and a simulated `PutImage` would be a
command taking an argument nothing could produce.

## Registering a handler as an image

Register the handler once, in test setup, and every function that runs an image from that repository
is created from it.

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

Naming a repository is what creates it. A repository holds only its images. There is no prior
declaration to make, and a test can name the repository its templates already point at.

The repository takes a bare name such as `orders` or `platform/orders`, and never a full image URI.
The account, the region and the registry host around it come from the simulated ECR the repository
belongs to. A name real ECR would refuse is refused here too.

## How an image URI is matched

Resolving an image URI happens in two steps, and the tag means something different in each.

Finding the repository ignores the tag. A function's `Code.ImageUri` is matched on the registry host
and the repository name, with any tag or digest dropped, because no tag is stable enough to write
into a test. A CDK image asset is tagged with the asset content hash, which changes whenever the
image source does, and a pipeline-built image is usually tagged with a git sha or a build number
passed in as a stack parameter. An `ImageUri` built by `Fn::Sub` or from a stack parameter is
matched on what it resolves to.

Choosing the image in that repository does read the tag. A tag the repository holds selects exactly
that image, and any other tag, or none at all, falls back to the image registered most recently.

The registry host is part of the match, and the account and the region have to agree. A function can
run an image from another account's repository, as it can on real AWS, and a same-named repository
in another account is a different repository.

So `orders:blue` runs the handler registered under `blue` where the repository holds one, and the
handler registered most recently otherwise. That is how a blue/green pair of images in one
repository can back two functions differently, while a content hash tag nobody registered still
finds something to run. Registering a tag again both replaces what it held and makes it the most
recent registration.

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

A function created directly through `CreateFunction` resolves its image the same way a template
function does, as the example above shows. A function whose image resolves to no handler is refused,
the way real Lambda refuses a function whose image it cannot pull.

## Repositories in CloudFormation

`AWS::ECR::Repository` creates a simulated repository. A template declares a repository and never an
image, as real CloudFormation does. A deployed repository starts empty unless a handler has already
been registered in it.

`Ref` returns the repository name, and `Fn::GetAtt` exposes `Arn` and `RepositoryUri`. An
application stack can build its function's `ImageUri` from the repository a platform stack declared.

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

A repository a handler is already registered in is adopted, and the order these happen in makes no
difference. The image can exist before the stack that declares the repository, as it does in real
life.

Tearing the stack down removes the repository only where it holds no simulated image. One that does
is left where it is, and the deletion is recorded as skipped, because the handler in it was
registered outside any stack and is what every later deploy resolves to. Real ECR also refuses to
delete a repository that still holds images, which fails the stack unless the template says
`EmptyOnDelete`. Here the refusal is recorded and the teardown carries on, since what is being
protected is a test's own registration.

Every other property a repository can declare is recorded as an ignored property, and the repository
is created without it. That covers `ImageScanningConfiguration`, `ImageTagMutability`,
`LifecyclePolicy`, `RepositoryPolicyText`, `EncryptionConfiguration`, `EmptyOnDelete` and `Tags`.

## Where a function's handler comes from

Two things can back a container image function, and a deploy is looked at in this order:

1. An [executable binding](https://yulinsim.dev/services/lambda/#executable-bindings) given to that deploy, including one
   naming the image repository. A binding is the more specific thing to have said, since it is about
   one deploy.
2. The simulated ECR repository the function's `Code.ImageUri` names. That is a standing statement
   about what the image is, made once and good for every stack that runs it.

A function with no binding and no registered image is skipped with a diagnostic, and the rest of the
stack deploys. The reason separates a missing repository from an empty one, since those send you to
different places. One is a wrong name, and the other is a handler that was never registered.

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

Current documented limitations:

- No image content, layer, digest, manifest or scan behaviour is simulated. A repository holds
  handlers, and no image is ever pulled or inspected.
- There are no ECR SDK commands. `CreateRepository`, `DescribeRepositories`, `PutImage`,
  `DescribeImages`, `BatchDeleteImage` and `GetAuthorizationToken` are all absent. Registering an
  image is a Yulin-native operation because real `PutImage` takes a manifest for layers pushed over
  the Docker registry protocol, and that protocol never runs in this process.
- Nothing authorizes against a repository. With no requests to authorize, a repository policy goes
  unread and simulated IAM stays out of it.
- Lifecycle policies go unevaluated, and no simulated image ever expires. Tag mutability goes
  unenforced, and registering the same tag again replaces what it held.
- Naming a repository creates it. There is no `CreateRepository` to fail for a name already taken,
  and no way to ask whether a repository exists without making one, other than `hasRepository`.
- A stack teardown records the deletion of a repository holding a simulated image and carries on,
  where real CloudFormation fails the stack unless the template says `EmptyOnDelete`. The repository
  and its handler are left in place, and `EmptyOnDelete` itself goes unread.
- Nothing tracks which stack created a repository. A repository holding no simulated image is
  removed by the teardown of any stack that declared it, and made again by the next deploy.
- Repository tags, registry policies, pull through cache rules, replication configuration and ECR
  Public are not simulated.
- ECR has no HTTP API under `serveSimAws`, and nothing for a Docker client to talk to.
