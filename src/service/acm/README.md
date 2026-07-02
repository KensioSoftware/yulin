# Simulated ACM implementation

This directory contains the simulated AWS Certificate Manager service implementation.

Sim ACM currently focuses on certificate request, lookup, listing, and CloudFormation-created
certificates. It is an in-memory service for tests and local development, not a full ACM replica.

## Entry points

- `sim-acm.ts` is the main service object for one account/region scope.
- `index.ts` exports the public ACM simulator API for `@kensio/yulin/acm`.
- `certificate/` contains the simulated certificate model.
- `command/` contains AWS SDK-style command handlers.
- `cfn/` contains CloudFormation support for `AWS::CertificateManager::Certificate`.
- `error/` contains ACM-specific AWS-like errors.

`SimAcm` owns a map of certificates keyed by certificate ARN. When used through `SimAws`, ACM is
scoped to the selected account and region, so generated certificate ARNs include that scope.

## Service shape

`SimAcm` is a thin facade. It stores shared service state and delegates each AWS-style operation to
a command handler:

- `requestCertificate()`
- `describeCertificate()`
- `listCertificates()`

The service also exposes its CloudFormation resource factory through `cfnResourceFactory()` so the
generic CloudFormation simulator can create ACM resources without knowing ACM-specific details.

Implementation code should continue using local structural command types rather than importing real
AWS SDK classes from `src/`.

## Certificate model

`SimAcmCertificate` is the internal certificate object. It tracks:

- certificate ARN
- primary domain name
- subject alternative names
- status
- validation method
- domain validation options
- creation time
- issued time
- tags

Certificates start as `PENDING_VALIDATION` when requested. The `issue()` method changes status to
`ISSUED` and records `issuedAt`.

The model is small. Command handlers and output factories translate it into AWS-shaped responses
where needed.

## RequestCertificate

`RequestCertificateCommandHandler` validates the required inputs, sequences background work, creates
a certificate, stores it in the service certificate map, and schedules certificate issuance as a
background task.

Current behaviour:

- `DomainName` is required.
- more than 50 tags throws `TooManyTagsException`.
- `ValidationMethod` defaults to `DNS`.
- certificate ARNs are generated from the account, region, and a stable sequence number.
- DNS validation records are deterministic CNAMEs derived from account, region, and domain.
- the command returns the new `CertificateArn`.

`RequestCertificateFactory` owns the certificate-shaping rules: ARN generation, validation defaults,
domain validation option creation, deterministic validation records, and tag copying.

## DescribeCertificate

`DescribeCertificateCommandHandler` requires `CertificateArn`, sequences background work, looks up
the certificate, and returns an AWS-shaped certificate detail payload.

Unknown certificate ARNs throw `SimAcmResourceNotFoundException`.

`SimAcmCertificateDetailFactory` translates the internal certificate model into the
`DescribeCertificate` output shape. It maps camelCase internal fields to PascalCase AWS response
fields and includes domain validation options with validation records when available.

## ListCertificates

`ListCertificatesCommandHandler` lists certificates from the in-memory certificate map.

Current behaviour:

- background sequencing runs before reading state.
- `CertificateStatuses` filters by certificate status when supplied.
- `MaxItems` defaults to `100` and must be between `1` and `1000`.
- `NextToken` is a numeric start index encoded as a string.
- summaries include the ARN, domain, SAN summary, status, type, key algorithm, usage flag, creation
  time, and issued time.
- SAN summaries are capped at 100 entries, with `HasAdditionalSubjectAlternativeNames` indicating
  truncation.

Listing order follows the map insertion order.

## CloudFormation support

ACM CloudFormation support lives under `cfn/`.

`SimAcmCfnResourceFactory` currently supports:

- `AWS::CertificateManager::Certificate`

The factory reads resolved CloudFormation properties through the ACM certificate property helpers,
then creates the certificate through the normal `requestCertificate()` command path. It does not
construct certificates directly.

Supported certificate properties include:

- `DomainName`
- `SubjectAlternativeNames`
- `ValidationMethod`
- `DomainValidationOptions`
- `Tags`

After the request command returns, the factory reads the created certificate from the service map
and returns it as the CloudFormation-backed resource.

## Background scheduling

Sim ACM uses the shared background scheduler for AWS-like async sequencing.

Current uses:

- commands sequence before reading or mutating certificate state.
- requested certificates are inserted immediately.
- issuance is scheduled as background work after creation.

Tests that need the final issued state should drain the simulator background tasks, for example
through the broader `SimAws` background completion helper.

## Error model

ACM-specific errors live under `error/`.

Current errors cover the behaviours implemented by the simulator:

- invalid command arguments
- too many tags
- certificate not found

Validation that does not yet need an AWS-specific exception may use assertion-style errors. Add a
specific ACM error class when caller-visible failure semantics matter.

## Tests as implementation guides

The colocated `*.iso.test.ts` files document expected behaviour for:

- certificate requests and validation records
- certificate description output
- certificate listing, filtering, pagination, and SAN summary truncation
- CloudFormation certificate creation
- CloudFormation property parsing

The `.iso.test.ts` suffix is for isolated tests that do not perform real network I/O.
