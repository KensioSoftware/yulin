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

- `create-Distribution/`
- `get-Distribution/`
- `create-function/`

The main `SimCloudFront` class delegates command execution to these handlers rather than keeping
command logic inline.

## Distribution model

Distribution state lives under `Distribution/`.

A simulated Distribution tracks the parts of CloudFront configuration that are needed at request
time, including:

- Distribution ID and domain names
- alternate domain names
- Origins
- Cache Behaviors
- CloudFront Function associations

The `Distribution/configurator/` classes translate AWS-style `DistributionConfig` input into the
internal Distribution model.

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
