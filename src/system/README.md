# System tests

Tests here exercise a whole application across several simulated services at once, rather than one
service in isolation. They are the kind of test Yulin exists for: a single test case that says
something about what a system does, covering the API a user calls, the events that follow, and the
state left behind.

The rest of the suite is colocated with the code it covers, in `src/service/<name>/`. These are not,
because there is no one service they belong to. What they cover is the joins between services, which
is where a simulator earns its keep and where a mock has nothing to say.

Each test file drives a system built by `@kensio/part-factory` factories under `test/`, one per part
of it, composed by a factory for the whole thing. Each factory sends the ordinary SDK commands, so
it reads like the deployment it stands in for, and the test drives the result from the outside: HTTP
requests to the API, Objects put in a Bucket, and assertions on what the system did about them.

The factories live under `test/` rather than beside the code they build, because what they build is
a fictional application rather than a simulated AWS resource. The reusable ones for the latter, such
as `simIamPolicyDocumentFactory` and `simCognitoSignedInFactory`, live in `src/` and ship with the
package, and these use them.

## The systems here

- [The image upload pipeline](#the-image-upload-pipeline), an API and the processing behind it.
- [A load balanced service](#a-load-balanced-service), a request reaching application code in a
  container.

## The image upload pipeline

[image-upload-pipeline.iso.test.ts](image-upload-pipeline.iso.test.ts) covers an application that
takes an image from a signed-in user, checks it, and builds a set of renditions from it. The system
is built by [test/media-pipeline](../../test/media-pipeline).

One upload passes through nine simulated services:

1. The user signs in to a **Cognito** user pool and calls `POST /uploads` on an **API Gateway** HTTP
   API, which only accepts requests carrying a token from that pool.
2. A **Lambda** function records the upload in a **DynamoDB** Table as pending, and answers with the
   key to put the image under.
3. The image appearing in the **S3** Bucket notifies a second function, which asks **Rekognition**
   what is in it. A clean image is copied under the screened prefix; a flagged one is recorded as
   rejected and goes no further.
4. The screened copy notifies an **SQS** queue, which an event source mapping delivers to a third
   function.
5. That function reads the widths to build from **SSM** Parameter Store, writes one rendition per
   width, and records the upload as ready.
6. The user asks the API what became of the upload and gets back delivery URLs on a **CloudFront**
   Distribution, then publishes the one they want.

Every function runs as its own execution role, so each step is allowed only what it does. Taking a
permission away from a role breaks the step that needed it, which is the point: the test says the
system works with the permissions it was actually given. What each step is allowed is in
[media-pipeline-permissions.ts](../../test/media-pipeline/media-pipeline-permissions.ts).

A test stands the whole thing up in one call:

```typescript
const simAws = new SimAws();
const { client } = await mediaPipelineFactory.make({}, simAws);
```

## A load balanced service

[load-balanced-service.iso.test.ts](load-balanced-service.iso.test.ts) covers the other way an
application is deployed: not a function behind an API, but a container behind a load balancer. The
system is built by [test/orders-service](../../test/orders-service), which deploys one
CloudFormation stack.

**CloudFormation** deploys the lot, and one request then passes through four more services:

1. A client asks for `orders.example.test`, which **Route53** resolves to the **load balancer** the
   stack created, through an alias record.
2. The listener forwards the request to a target group, which the **ECS** service registered its
   tasks into when the stack deployed.
3. The service's task carries an nginx container on the registered port and the application behind
   it. Only the application is bound, so that is what answers, which is the divergence the ECS docs
   set out.
4. The application reads and writes a **DynamoDB** table with an ordinary SDK client, authorized as
   the task role the template declared.

Scaling the service to nothing takes its tasks out of the target group, and the load balancer then
answers 503, which is what a real one answers when no target is in service.
