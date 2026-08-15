# Simulated CloudFront implementation

Sim CloudFront usage docs: [`../../../docs/services/cloudfront/README.md`](../../../docs/services/cloudfront/README.md)

This directory contains the simulated CloudFront service implementation.

The implementation focuses on behaviour that is useful for isolated tests and local development. It
does not try to reproduce every CloudFront feature, but it should emulate supported behaviour
consistently enough that application code can interact with it through familiar AWS SDK commands and
HTTP requests.

## Entry points

- `sim-cloudfront.ts` is the main in-memory service object. It owns simulated CloudFront resources
  for one account/region scope.
- `index.ts` exports the public CloudFront simulator API for `@kensio/yulin/cloudfront`.
- `globals.ts` provides optional CloudFront Function global types for users who want them.

## Command handling

AWS SDK-style operations are implemented under `command/`.

Each supported command has its own directory containing:

- command input/output typing
- a handler that applies AWS-like validation and state changes
- tests for the simulated command behaviour

It's important that nothing under `src/` imports from the real AWS SDK packages. Otherwise, users
would have to install all AWS SDKs to be able to use Yulin. Instead, we define interfaces that have
a similar shape to the real AWS SDK types. The tests use the real AWS SDK classes to confirm that
those shapes fit the real AWS SDK types.

Current command areas include:

- `create-distribution/`
- `get-distribution/`
- `update-distribution/`
- `delete-distribution/`
- `create-function/`
- `delete-function/`

## Key value stores

`key-value-store/` holds the store model and the collaborators the commands share.

The store is reached through two different AWS SDK clients, so it is reached two ways here. The
CloudFront client owns the resource, and its five commands are under `command/key-value-store/`,
grouped behind `SimCfKeyValueStoreCommands` and reached as `simCloudFront.keyValueStores()`. The key
value store client owns the data, and its six commands are under `command/key-value-store-data/`,
behind `SimCloudFrontKeyValueStoreApi` and reached as `simAws.cloudFrontKeyValueStore()`. Both work
on the same `SimCloudFrontKeyValueStoreRegistry`, the way both AWS clients work on one store. This
mirrors how sim DynamoDB Streams is a second API over sim DynamoDB's state rather than a service of
its own.

`DescribeKeyValueStore` is a command name both clients have, answering with different things. They
do not collide because SDK interception resolves the router by the client's AWS service before it
looks up the command name.

`SimCfKeyValueStoreAccess` is what every command is given: the registry, IAM and the clock. Its
`authorizedByName` resolves a store and authorizes the action on the store's ARN, and authorizes
against the store wildcard first when the name resolves to nothing, so an unauthorized caller cannot
learn which names exist.

`SimCfKeyValueStoreUsers` decides whether a store can be deleted.
`SimCffKeyValueStoreUsers` under `cff/kvs/` is what answers, by reading the Function map live. It
stays an interface because the delete command has no business knowing about Functions, and because a
standalone `SimCloudFront` with no Functions has nothing to ask.

### Reading a store from a Function

`cff/kvs/` holds what a Function reaches a store through. `cffCloudFrontModule` builds the `cf` a
Function sees, closed over that Function's own store, and `CffKvsHandle` is what `cf.kvs()` returns.
The handle is read-only: a Function can never write to a store, so there is deliberately no method
for it.

The two kinds of Function reach `cf` differently, which is the whole difficulty here. Source code
runs in a `vm` context, so `cf` goes in as a context global and `cffSourceWithoutCloudFrontImport`
rewrites `import cf from "cloudfront"` into a binding to it: a `vm.Script` is not a module, so the
import would otherwise be a syntax error. A Function given as a function reference is an ordinary
closure with no sandbox, so `simCffCloudFrontGlobal` holds its module in an `AsyncLocalStorage` store
for the length of the invocation and a global `cf` accessor resolves to it. The store follows the
invocation across await points, which matters because reading a key value store is awaited, and it
is what keeps two concurrently running Functions reading their own stores. This mirrors
`SimProcessEnvironment`, which does the same thing for a Lambda or ECS handler's `process.env`.

Reading a store is asynchronous, so `SimCloudFrontFunction.handleViewerRequest` and
`handleViewerResponse` return promises and `SimCffApplicator` awaits them. A synchronous handler
still works unchanged: awaiting a plain value is what makes both shapes the same.

Unlike the Distribution commands, these enforce the `IfMatch` ETag rather than accepting and
ignoring it. The data API requires it on every write and CloudFront refuses a stale one, so a caller
that does not thread the ETag through fails here the way it would fail against CloudFront.

The main `SimCloudFront` class owns the Distribution, Function and response headers policy maps
and nothing else. The key value store registry is owned by `SimCloudFrontCommands` instead, because
the facade never reads it.
`SimCloudFrontCommands` holds the collaborators every command shares (IAM, the registry, the Origin
resolvers, the background scheduler) and builds the handlers, so the facade stays state plus
delegation.

## Distribution model

Distribution state lives under `Distribution/`.

A simulated Distribution tracks the parts of CloudFront configuration that are needed at request
time, including:

- Distribution ID and domain names
- alternate domain names
- Origins
- Cache Behaviors
- CloudFront Function associations
- the default root object
- custom error responses
- whether the Distribution is enabled

The `Distribution/configurator/` classes translate AWS-style `DistributionConfig` input into the
internal Distribution model.

### Updating and deleting

CloudFront takes a whole `DistributionConfig` on an update rather than a patch, so
`UpdateDistribution` applies it as a replacement: `replaceConfiguration` on the Distribution drops
everything derived from the previous config, and the same configurators then apply the new one from
scratch. The alternate domain names are resynchronized in the registry around that, so a name the
update drops is free for another Distribution.

`assertDeletable` on the Distribution holds the rule that CloudFront will not delete a Distribution
that is still serving. Deleting also deregisters the Distribution from `SimCloudFrontRegistry`,
which is what actually stops it serving: request routing reads the registry rather than one
Account's own Distribution map.

The `IfMatch` ETag is accepted and not checked. See the Limitations section of the usage docs.

### Default root object and custom error responses

`SimCloudFrontCustomErrorConfigurator` refuses configuration CloudFront refuses: an `ErrorCode`
outside the set CloudFront supports, and a `ResponsePagePath` or `ResponseCode` given without the
other. A rule with neither only configures error caching, which nothing here caches, so it is
accepted and left out of the internal model. `DefaultRootObject` beginning with a forward slash is
refused for the same reason: in real CloudFront it answers the Distribution root with a 403, so a
Distribution carrying one is not worth creating.

### Viewer certificates

`distribution/viewer-certificate/` holds the checks CloudFront applies to a Distribution's ACM
certificate. They run before any Distribution state is allocated, because CloudFront rejects the
whole request.

`SimCloudFrontViewerCertificateValidator` rejects, all as `InvalidViewerCertificate`:

- a certificate outside `us-east-1`, which is the gotcha worth simulating: nothing else in a stack
  cares which Region the certificate is in, so the mistake only surfaces at deploy time;
- an ARN that resolves to no certificate;
- a certificate that is not `ISSUED`;
- alternate domain names the certificate does not cover.

`SimCloudFrontAliasCoverage` owns the last of those. A wildcard covers exactly one label, as in AWS:
`*.a.test` covers `www.a.test` but neither `a.test` nor `deep.www.a.test`.

The CloudFront API and CloudFormation capitalise this property differently, so both spellings are
accepted: `ACMCertificateArn`/`SSLSupportMethod` from the API, and
`AcmCertificateArn`/`SslSupportMethod` from `AWS::CloudFront::Distribution`.

Certificates are resolved through `SimAcmRegistry`, so a standalone `SimCloudFront` with no
registry checks nothing.

## Request routing and handling

HTTP request behaviour is split across a few directories:

- `controller/` coordinates request handling for served CloudFront traffic.
  `controller/root-object/` substitutes the default root object for a request to the Distribution
  root, before Behavior resolution so that everything downstream sees the object being served.
  `controller/error/` replaces an Origin error with the Distribution's response page, after the
  Origin fetch and before the viewer-response CloudFront Function. The response page is fetched
  through the same Behavior resolution and Origin fetching as any other request, so it can come from
  an Origin of its own.
  `controller/response-headers/` applies the Behavior's response headers policy, after the custom
  error response and before the viewer-response CloudFront Function. That ordering is CloudFront's
  own: an error page carries the policy's headers, and a function sees them in its event and can
  change them.
- `router/` resolves an incoming `Request` to a simulated Distribution by CloudFront hostname or
  alternate domain name.
- `resolver/` chooses the matching Cache Behavior for a request path.
- `origin/` adapts CloudFront Origin requests/responses. `origin/s3/` reads a sim S3 Bucket through
  that Bucket's own GetObject command, while `origin/custom/` turns the Origin request back into an
  HTTP request and sends it into the wider simulated environment.

  Who an S3 Origin reads as is worked out per request by `SimCfS3OriginSigner`: as the CloudFront
  service principal where the origin access control signs, and anonymously otherwise, which is the
  unsigned request real CloudFront sends to the S3 REST endpoint. Either way the Bucket policy
  decides what the Distribution can serve. That is why `SimCloudFrontS3OriginResolver` answers with
  the Bucket and the sim S3 holding it rather than a bare `SimS3Bucket`: the read goes through that
  scope's command. A denial becomes a 403 from the Origin, which the Distribution's custom error
  response for 403 can then replace.

When a sim AWS is served on localhost, CloudFront requests are routed through this layer to find the
right sim Distribution, Origin and Behavior.

## CloudFront Functions

Sim CloudFront Function support lives under `cff/`.

Important pieces include:

- `sim-cloudfront-function.ts`, the simulated CloudFront Function resource
- `adapter/`, which converts between native Fetch API `Request`/`Response` objects and CloudFront
  Function event shapes.
- `function-code-input/`, which supports function code input handling.

CloudFront Functions are represented as JavaScript handlers and can be associated with viewer
request and viewer response events on cache Behaviors.

## Response headers policies

`response-headers-policy/` holds the policy model. A `SimCloudFrontResponseHeadersPolicy` is a name,
an ID, the headers to add and remove, the security headers list, an optional Server-Timing header and
an optional `SimCloudFrontResponseHeadersPolicyCors`. Removal happens first, so a header in both ends
up present with the policy's value. Each added header, including a security header, carries an
`Override` deciding whether it replaces one the Origin sent; CORS has one `originOverride` for the
whole section instead, matching CloudFront's own schema.

`SimCloudFrontResponseHeadersPolicyCors` is its own class because applying it needs the viewer
request, not just the response: CloudFront reflects the request's `Origin` header against the
configured allow list rather than sending the list itself, so `apply()` takes the header's value and
adds nothing when it names no allowed Origin, the same as CloudFront answering none rather than a
mismatched one.

Policies are stored on `SimCloudFront` and found by ID, which is what a Behavior's
`responseHeadersPolicyId` names. There is no CreateResponseHeadersPolicy command, so
`cfn/response-headers-policy/` is the only thing that makes one. Its config reader models every
section: `CustomHeadersConfig` and `RemoveHeadersConfig` as before, `SecurityHeadersConfig` as one
header per sub-section, `ServerTimingHeadersConfig` as a fixed header once `Enabled` (not sampled, so
a test does not depend on chance), and `CorsConfig` into the CORS model above.

A lookup miss at request time is `SimCloudFrontNoSuchResponseHeadersPolicy` rather than a
pass-through. In practice this is defence in depth rather than the common path: `ResponseHeadersPolicyId` is checked eagerly too, by `SimCloudFrontBehaviorConfigurator` when the Distribution is
created or updated, so a Behavior naming an ID nothing created — commonly a managed policy ID, which
names a policy AWS owns rather than one a template creates — fails there as
`SimCloudFrontInvalidResponseHeadersPolicyId`, the same as real CloudFront refuses the whole
CreateDistribution/UpdateDistribution rather than deploying and failing the first request that needs
it.

## Origin access controls

`origin-access-control/` holds the model and its registry, laid out the same way as the response
headers policies above. A `SimCloudFrontOriginAccessControl` is a name, an ID, an optional
description, an origin type and a signing behaviour. The origin type is `s3` or `lambda`, the two
CloudFront signs for that are modelled here; MediaStore and MediaPackage V2 are refused by name in
`cfn/origin-access-control/` rather than stored as something the simulator would then treat like one
of the two. The signing protocol is fixed at `sigv4`, the only one CloudFront offers. There is no
CreateOriginAccessControl command, so a template is the only thing that makes one.

`SimCloudFrontOriginConfigurator` resolves an Origin's `OriginAccessControlId` through the registry
when the Distribution is created, and stores the result on the `SimCloudFrontS3Origin` or
`SimCloudFrontCustomOrigin`. An ID nothing created is `SimCloudFrontInvalidOriginAccessControl`, as
CloudFront refuses the whole CreateDistribution, and so is an origin type that does not match the
Origin it was named on: `assertSimCfOacOriginType` checks that in both directions, since an origin
access control for a Bucket signs nothing a Function URL will admit.
`SimCloudFrontBehaviorConfigurator` resolves a Behavior's `ResponseHeadersPolicyId` the same eager
way, for the same reason: CloudFront checks both at creation rather than when a request arrives.

`SimCfS3OriginSigner` reads the stored origin access control on every Origin fetch. One whose
`signs` getter is true makes the read a request from the `cloudfront.amazonaws.com` service
principal, carrying the Distribution's ARN as `aws:SourceArn` and its Account as
`aws:SourceAccount`, which is the pair a Bucket policy written for an origin access control is
conditioned on. A `never` signing behaviour reads anonymously, as an Origin with none does.

`SimCfCustomOriginSigner` is the same idea for a custom Origin, and says the same three things a
different way. A custom Origin request leaves CloudFront over the simulated HTTP boundary, so it
carries them as the `x-sim-aws-caller` and `x-sim-aws-source-arn`/`x-sim-aws-source-account` control
headers, which is how anything else calling into simulated AWS in process states who it is. That is
what an `AWS_IAM` Function URL evaluates its `lambda:InvokeFunctionUrl` permission for
`cloudfront.amazonaws.com` against, so a template omitting the permission answers 403 rather than
being admitted anyway. The headers are stripped at the boundary, so the function's event shows the
request its viewer sent.

A viewer's own control headers are dropped from the Origin request before the Origin's are applied,
so who the Origin request is from is the Origin's decision and never the viewer's. The HTTP boundary
has already stripped them from a request that arrived that way, and a request handed straight to the
controller in process has not, so `simCfCustomOriginRequest` strips them rather than relying on
where the request came from.

That resolution is per request rather than per Origin because an Origin does not know its
Distribution until one fetches through it. Deciding it earlier would be wrong anyway: in a CDK stack
the Bucket policy is created after the Distribution, since it names the Distribution's ARN.

## Cross-service integration

CloudFront often depends on other simulated services.

The key integration points are:

- `SimCloudFrontRegistry`, which records Distribution ownership and alternate domain routing
  information across the broader simulated AWS instance.
- S3 Origin resolution, which lets CloudFront Distributions fetch from simulated S3 buckets and S3
  website Origins. `makeSimCfS3OriginResolver` resolves an Origin domain to the Bucket in the
  Account and Region that own it, which need not be where the Distribution was created: real
  CloudFront checks neither ownership nor existence at CreateDistribution, and what a Distribution
  may read is the Bucket policy's business.
- `SimCfCustomOriginDispatcher`, which resolves a custom Origin domain through simulated Route53 and
  serves the request over the same in-process HTTP entry point as a request arriving on localhost.
  CloudFront therefore needs no per-service knowledge: an HTTP API endpoint, a Lambda Function URL
  and a hosted-zone record pointing at either all reach their service the same way. A standalone
  `SimCloudFront` has no dispatcher, and refuses a custom Origin rather than reaching the network.
- `SimAcmRegistry`, which resolves the ACM Certificate a Distribution's viewer certificate ARN
  names, wherever in the simulated AWS instance it lives.

A standalone `SimCloudFront` instance can be used directly, but full CloudFront routing is usually
most useful through `SimAws`, where CloudFront, S3, and the shared registry are wired together.

## Tests as implementation guides

The colocated `*.iso.test.ts` and `*.loc.test.ts` files are useful references when changing
CloudFront internals. They show the expected simulator behaviour for routing, Distribution
configuration, request handling, CloudFront Functions, and S3 Origin integration.

The `.iso.test.ts` suffix is for isolated "unit" tests which do no real networking (but might access
the local filesystem). The isolated tests can be low-level and focused on a single class, or
high-level and exercise the coordination between multiple classes. What distinguishes isolated tests
is that they do not perform real network.

The `.loc.test.ts` suffix is for local integration tests which do real networking on localhost.
These tend to be higher-level and exercise the simulated system as a whole by making requests to it
on localhost. Note that the local tests and system under test are all still in a single process
together so that it's possible to step through the local tests in the debugger.
