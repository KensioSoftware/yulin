# Simulated ECR implementation

This directory contains the simulated ECR service implementation.

There is very little here, and that is the point. ECR holds repositories, a repository holds images
by tag, and a simulated image is a real in-process handler. Everything else about a real registry is
image content, which Yulin never reads.

## Why there are no SDK commands

Every other simulated service here handles SDK commands. This one handles none, because the
operation that matters has no SDK equivalent worth simulating.

Real `PutImage` takes an image manifest describing layers that were already pushed over the Docker
registry protocol. None of that exists in this process: there are no layers, no digests and no
Docker. So registering a handler as an image is a Yulin-native operation, `simulateImage`, named so
it cannot be mistaken for a simulated `PutImage`. `DescribeImages` and the rest would answer with
made-up manifest data for the same reason, so they are absent rather than wrong.

What is left is state and lookup, which is why there is no `command/` directory, no authorizer and
no SDK router.

## Entry points

- `sim-ecr.ts` is the main in-memory service object for one account/region scope.
- `index.ts` exports the public ECR simulator API for `@kensio/yulin/ecr`.

## Repository model

Repository state lives under `repository/`.

`SimEcrRepositoryStore` makes a repository the first time it is named, because a repository here
holds nothing of its own beyond its images: there is no setting on one this simulation acts on, so
there is nothing a creation could have got wrong. That is also what lets a test register a handler
in a repository before any stack declaring it is deployed, and what makes an `AWS::ECR::Repository`
Resource adopt that repository rather than replace it.

`SimEcrRepositoryAddress` builds the two forms AWS names a repository by, from the account and
region the service is scoped to: the registry host form a Lambda `Code.ImageUri` carries, and the
ARN form an IAM policy and `Fn::GetAtt` carry.

`requiredSimEcrRepositoryName` refuses a name real ECR would refuse. It reads the name by splitting
on its separators rather than with the single expression AWS documents, because that expression
nests three quantifiers, which is the shape a name can be written to make take exponential time to
match.

## Image model

`SimEcrImage` is a tag and a handler. `SimEcrImageHandler` is the sim Lambda handler type, since a
handler function is the only thing this simulator can run, and a duplicate structural type would
only have to be kept in step with it.

Finding a repository ignores the tag, which is the same decision deploy-time image bindings made: no
tag is stable enough to write into a test, since a CDK image asset is tagged with a content hash and
a pipeline-built image with a build number. Choosing an image within that repository does read it: a
tag the repository holds answers with exactly that image, and any other tag, or none, with the image
registered most recently. Honouring a tag it does hold is what makes registering two of them mean
anything.

Registering a tag again takes it out of the map before putting it back, so the replacement counts as
the most recent registration rather than keeping the position the tag first went in at.

## Resolving an image URI

`SimEcrImageReference` reads a container image reference as the repository it names and the tag it
asks for. The repository half is read by `SimCfnImageRepositoryTarget`, which deploy-time image
bindings already match on, so an image URI is understood one way wherever it arrives from.

`SimEcrRegistry` indexes repositories across the whole simulation, by that repository reference
rather than by name. A Lambda function holds nothing but an image URI, and the registry host in that
URI carries the account and the region, so a function in one account can run an image from another
account's registry, as it can on real AWS. This follows `SimAcmRegistry`, which is how a service
holding only a certificate ARN reaches the certificate.

Simulated Lambda is the one thing that reads it, through `SimEcrLambdaContainerImages` on the Lambda
side. That adapter reports finding no repository apart from finding a repository with no image,
because the two send a reader to different places: a name that is wrong, or a handler that was never
registered.

## CloudFormation

`cfn/` owns `AWS::ECR::Repository`, which is the only ECR Resource type that means anything here. A
template declares a repository and never an image, which is what real CloudFormation does too: an
image is pushed by whatever built it, long before the stack that runs it.

`SimCfnEcrRepositoryPropertyRules` records every other property as ignored. All of them describe
image content, so a repository created without them is still a repository that does what one does
here.

A teardown removes a repository holding no simulated image, and records the deletion of one that
holds an image rather than carrying it out. The handler in it was registered outside any stack, and
it is what every later deploy resolves to, so taking it down with one stack would leave the next one
resolving nothing. Real ECR refuses that deletion as well, which fails the stack unless the template
says `EmptyOnDelete`; recording it keeps a teardown from failing over a test's own registration.
