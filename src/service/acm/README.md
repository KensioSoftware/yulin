# Simulated ACM implementation

This directory contains the simulated AWS Certificate Manager service implementation.

Sim ACM currently focuses on certificate request, lookup, listing, and CloudFormation-created
certificates. It is an in-memory service for tests and local development, not a full ACM replica.

## Entry points

- `sim-acm.ts` is the main service object for one account/region scope.
- `index.ts` exports the public ACM simulator API for `@kensio/yulin/acm`.
- `certificate/` contains the simulated certificate model.
- `command/` contains AWS SDK-style command handlers.
- `validation/` contains domain validation against sim Route53.
- `registry/` contains the simulation-wide index of ACM facades by account and Region.
- `cfn/` contains CloudFormation support for `AWS::CertificateManager::Certificate`, including
  publishing validation records the template asks for.
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

Domain validation options are `SimAcmDomainValidation` objects rather than plain data, because each
domain on a certificate carries its own validation status. `isValidated` on the certificate is the
gate issuance waits on, and `issue()` marks any still-pending domain successful so the per-domain
statuses stay consistent with the certificate status.

The model is small. Command handlers and output factories translate it into AWS-shaped responses
where needed.

## Domain validation

Validation lives under `validation/`.

`SimAcmCertificateValidation` owns issuance. `RequestCertificate` hands it each new certificate
instead of scheduling `issue()` directly, and it evaluates the certificate as background work, then
again whenever DNS records change, until every domain has succeeded.

Whether a domain must be validated at all is decided per domain:

- ACM with no `SimAcmDnsRecords` at all, which is a standalone `SimAcm`, validates nothing.
- a domain not using `DNS` validation is not checked.
- otherwise `SimAcmDnsValidationMode` decides. The default `auto` mode requires validation only
  where a hosted zone covers the domain name, so certificates for domains the simulation is not
  authoritative for are issued rather than left stuck. `always` and `never` are the overrides behind
  `SimAcm.requireDnsValidation()` and `SimAcm.autoIssueCertificates()`.

`SimAcmDnsRecords` is the port ACM depends on, and `SimRoute53AcmDnsRecords` implements it over the
shared `SimRoute53Registry`. All DNS name handling stays in that adapter, because Route53 stores
record names and values normalised and comparisons have to match. The registry spans simulated
accounts, so a certificate in one account can validate against a hosted zone in another, as real ACM
validates against public DNS.

Re-evaluation is driven by record change notifications from Route53 rather than by polling. A
polling loop that rescheduled itself would never let `BackgroundTasks.complete()` drain, since it
drains until no tasks remain. Pushing instead means a certificate whose record never appears simply
stays pending.

`SimAcmDnsValidationCompleter` backs `SimAcm.completeDnsValidation()`: it publishes each validation
record into the hosted zone covering it, settles the certificate, and throws
`SimAcmDnsValidationFailed` naming the records that had nowhere to go.

## RequestCertificate

`RequestCertificateCommandHandler` validates the required inputs, sequences background work, creates
a certificate, stores it in the service certificate map, and schedules domain validation as a
background task. Validation is what issues the certificate, once every domain has succeeded.

Current behaviour:

- `DomainName` is required.
- more than 50 tags throws `TooManyTagsException`.
- `ValidationMethod` defaults to `DNS`.
- certificate ARNs are generated from the account, region, and a stable sequence number.
- DNS validation records are deterministic CNAMEs derived from account, region, and domain.
- the command returns the new `CertificateArn`.

Issuance is not scheduled directly. The handler hands the certificate to `SimAcmCertificateValidation`,
which issues it once every domain is validated. See the domain validation section below.

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

## Registered certificates

`registerSimAcmCertificate` stands up a certificate under an ARN the caller chose, for a template that
names a certificate some other stack created. This is setup, and it lives outside `command/` for that
reason. `SimAcm.registerCertificate` is its only entry point, with `SimRoute53.registerHostedZone` as
the precedent.

Three registrations are refused, all as `InvalidArgsException`. An ARN another certificate holds, a
string that parses as no ACM certificate ARN, and an ARN outside this ACM's own account and Region.
That last refusal keeps the two views of a certificate together. `SimAcmRegistry` resolves an ARN
through the account and Region inside it, and a certificate registered elsewhere would answer commands
here while every service looking it up missed it.

A registered certificate is `ISSUED` by default and holds no domain validation options. The
validation flow leaves it alone. `status` overrides the default for a test that wants an expired or
revoked certificate.

`RequestCertificate` allocates ARNs from the size of the certificate Map, and a registered certificate
can sit on the sequence number that count reaches. `makeUntakenCertificate` in the command handler
steps past a taken ARN, keeping an allocation from replacing a registration.

## CloudFormation support

ACM CloudFormation support lives under `cfn/`.

`SimAcmCfnResourceFactory` currently supports:

- `AWS::CertificateManager::Certificate`

The factory itself is a thin switch on resource type. `SimCfnAcmCertificateCreator` reads resolved
CloudFormation properties through the ACM certificate property helpers, then creates the certificate
through the normal `requestCertificate()` command path. It does not construct certificates directly.

Supported certificate properties include:

- `DomainName`
- `SubjectAlternativeNames`
- `ValidationMethod`
- `DomainValidationOptions`, including `HostedZoneId`
- `Tags`

`DomainValidationOptions` has its own property reader, `SimCfnAcmDomainValidationReader`, because it
carries two unrelated things. `DomainName` and `ValidationDomain` are ACM API fields and go into the
request-certificate command. `HostedZoneId` is CloudFormation-only, with no equivalent in the ACM
API, and says where CloudFormation should publish the validation record.

### CloudFormation-driven validation

Creation is not finished when the request command returns. `SimCfnAcmCertificateValidation` then:

1. publishes each domain's validation record into the Hosted Zone its `HostedZoneId` names, through
   `SimCfnAcmValidationRecords`;
2. settles the certificate through `SimAcm.settleCertificateValidation()`;
3. fails the Resource if the certificate is still not issued.

Records go through Route53's own `ChangeResourceRecordSets` command path rather than being written
into the zone directly, so a validation record is an ordinary record in the hosted zone: listed by
`ListResourceRecordSets` and answerable over DNS. Record mutations are scheduled, so each one waits
on the zone's synchronization before the certificate is checked against DNS.

A `HostedZoneId` naming a zone the simulator does not hold is skipped rather than failing. Zone IDs
are matched leniently and deliberately not validated as simulator-shaped IDs, because a template
commonly carries the ID of a real zone from a real account: that is an external zone rather than a
broken template. The certificate then follows the usual rule and is issued with nothing
authoritative for its domain.

Waiting for issuance inside Resource creation is what makes dependent resources see an issued
certificate, as they would in real CloudFormation. Failing rather than leaving the Resource pending
is a deliberate difference: real CloudFormation sits in `CREATE_IN_PROGRESS` for hours before timing
out, which is no use in a test.

## Certificate lookup from other services

`SimAcmRegistry` indexes the ACM facades of one SimAws instance by account and Region. Other
services hold only a certificate ARN, so this is how they get from that ARN back to the certificate:
it parses the ARN with `parseSimArn`, finds the ACM for that account and Region, and reads the
certificate from its map. CloudFront uses it to check a Distribution's viewer certificate.

Every way an ARN can fail to name a certificate here returns undefined rather than throwing, because
the caller reports the failure in its own terms. CloudFront, for instance, reports all of them as
`InvalidViewerCertificate`, exactly as real CloudFront does.

## Background scheduling

Sim ACM uses the shared background scheduler for AWS-like async sequencing.

Current uses:

- commands sequence before reading or mutating certificate state.
- requested certificates are inserted immediately.
- domain validation is scheduled as background work after creation, and again on DNS record changes.

Tests that need the final issued state should drain the simulator background tasks, for example
through the broader `SimAws` background completion helper.

## Error model

ACM-specific errors live under `error/`.

Current errors cover the behaviours implemented by the simulator:

- invalid command arguments
- too many tags
- certificate not found
- DNS validation that could not be completed, which is a simulator diagnostic rather than an AWS
  error: real ACM leaves the certificate pending until it times out hours later.

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
