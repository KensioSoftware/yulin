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

The main `SimCloudFront` class owns the Distribution, Function and response headers policy maps
and nothing else.
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
- `origin/` adapts CloudFront Origin requests/responses. `origin/s3/` reaches a sim S3 Bucket
  directly, while `origin/custom/` turns the Origin request back into an HTTP request and sends it
  into the wider simulated environment.

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
an ID and two lists: the headers to add and the headers to remove. Removal happens first, so a header
in both ends up present with the policy's value. Each added header carries an `Override` deciding
whether it replaces one the Origin sent.

Policies are stored on `SimCloudFront` and found by ID, which is what a Behavior's
`responseHeadersPolicyId` names. There is no CreateResponseHeadersPolicy command, so
`cfn/response-headers-policy/` is the only thing that makes one. Its config reader models the custom
and removed headers, and refuses `CorsConfig`, `SecurityHeadersConfig` and `ServerTimingHeadersConfig`
by name: each sets headers of its own, and a policy that quietly sets fewer here than in AWS is a
divergence a passing test would hide.

A lookup miss is `SimCloudFrontNoSuchResponseHeadersPolicy` rather than a pass-through, because the
common cause is a managed policy ID, which names a policy AWS owns rather than one a template
creates.

## Origin access controls

`origin-access-control/` holds the model and its registry, laid out the same way as the response
headers policies above. A `SimCloudFrontOriginAccessControl` is a name, an ID, an optional
description and a signing behaviour. The origin type and signing protocol are fixed at `s3` and
`sigv4`, because `cfn/origin-access-control/` refuses any other value by name rather than storing
one the simulator would then treat as an S3 origin access control. There is no
CreateOriginAccessControl command, so a template is the only thing that makes one.

`SimCloudFrontOriginConfigurator` resolves an Origin's `OriginAccessControlId` through the registry
when the Distribution is created, and stores the result on the `SimCloudFrontS3Origin`. An ID
nothing created is `SimCloudFrontInvalidOriginAccessControl`, as CloudFront refuses the whole
CreateDistribution. Resolution is eager here, unlike a response headers policy, because CloudFront
checks an origin access control at creation rather than when a request arrives.

Nothing reads the stored origin access control yet. It does not sign the Origin request and does not
decide whether the Bucket may be read, so a Distribution serves its S3 Origin the same way with one
as without.

## Cross-service integration

CloudFront often depends on other simulated services.

The key integration points are:

- `SimCloudFrontRegistry`, which records Distribution ownership and alternate domain routing
  information across the broader simulated AWS instance.
- S3 Origin resolution, which lets CloudFront Distributions fetch from simulated S3 buckets and S3
  website Origins.
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
