# Simulated Route53 implementation

This directory contains the simulated Route53 service implementation.

Sim Route53 focuses on the parts of DNS that matter for Yulin-local service routing:
hosted zones, record-set changes, CloudFormation-created DNS resources, and resolving simulated HTTP
hostnames to other simulated AWS service targets. It is not a general DNS server and does not
attempt to model every Route53 API or DNS record behaviour.

The main design goal is to let tests and local development wire familiar AWS-shaped Route53
resources into the broader simulator. In practice, this means Route53 can create hosted zones and
records, then use those records to route local HTTP requests to other sim services such as sim S3
or sim CloudFront.

## Entry points

- `sim-route53.ts` is the main in-memory service facade. It owns hosted zones for one simulated AWS
  account scope.
- `index.ts` exports the public Route53 simulator API for `@kensio/yulin/route53`.
- `command/` contains AWS SDK-style command handlers.
- `hosted-zone/` contains the hosted-zone state model and record store.
- `record/` contains the internal record representation.
- `resolve/` contains Yulin-local hostname resolution.
- `local-name/` contains conversion and normalization helpers for simulated hostnames.
- `cfn/` contains CloudFormation support for supported `AWS::Route53::*` resources.
- `dnssec/` contains the key-signing key model and the DNSKEY derivation behind it.
- `error/` contains Route53-specific AWS-like errors.

When used through `SimAws`, Route53 is exposed from account/region containers like other services,
but it is memoised at the simulated account level. That mirrors the practical shape of Route53 as a
global service while still fitting Yulin's account/region navigation API.

## Service state model

`SimRoute53` owns a map of hosted zones. The hosted-zone ID is the storage key. Hosted-zone names
are normalized and stored on the hosted-zone object, not used as the primary key, because Route53
supports multiple hosted zones with the same DNS name in some scenarios.

### Hosted-zone IDs

Allocated hosted-zone IDs are a `Z` prefix followed by 21 uppercase alphanumerics. Caller-supplied
IDs are only checked for that shape, not for that length: real Route53 hosted-zone IDs vary, with a
documented maximum of 32 characters and IDs in the wild commonly 14 or 21 characters. A real ID
copied out of an AWS account is therefore usable against the simulator.

`normalizeSimRoute53HostedZoneId` strips an optional `/hostedzone/` prefix and rejects a malformed
or missing ID with `SimRoute53InvalidInput`. A well-formed ID that no hosted zone owns is left to
fail later with `SimRoute53NoSuchHostedZone`, so callers can tell a bad ID apart from an unknown
zone. `assertIsSimRoute53HostedZoneId` applies the same shape check as an internal invariant.

`SimRoute53` is a thin facade. It does not contain command implementation details. Each public
AWS-style operation is one line into `SimRoute53Commands`, which holds the command handlers and the
hosted-zone map, IAM and background scheduler they share.

This keeps the service object responsible for shared state and wiring, while command handlers own
validation, state transitions, and AWS-shaped outputs.

## Command handling

AWS SDK-style operations are implemented under `command/`.

Each supported command area contains local structural command types, a handler, and focused tests.
As with the other simulated services, implementation code under `src/` should not import real AWS
SDK packages. The local command interfaces are shaped to accept real SDK command instances from user
code and tests without making the simulator depend on those SDK packages.

Supported command areas currently include:

- `create-hosted-zone/`
- `get-hosted-zone/`
- `delete-hosted-zone/`
- `list-hosted-zones-by-name/`
- `change-resource-record-sets/`
- `list-resource-record-sets/`
- `dnssec/`

`dnssec/` is the exception to one directory per command. Its seven commands all start from the same
hosted zone lookup and authorization, and four of them work on the same key-signing key list, so
they are grouped by the collaborators they share the way the simulated KMS commands are.

The command handlers follow the same broad pattern used by other sim services:

1. validate required command input
2. normalize Route53-specific identifiers or names
3. sequence through the shared background scheduler where relevant
4. read or mutate the hosted-zone map
5. return an AWS-like minimal output shape

The outputs are minimal. They include the fields needed by current tests and integrations, not every
field returned by AWS.

## Hosted-zone model

Hosted-zone state lives under `hosted-zone/`.

`SimRoute53HostedZone` is the source of truth for:

- hosted-zone ID
- normalized hosted-zone name
- caller reference
- hosted-zone config
- synchronization status
- the hosted-zone record store

Hosted-zone names are normalized into Route53-style absolute names with a trailing dot. The internal
record store normalizes record names separately, so record lookup is stable even when callers mix
trailing-dot and non-trailing-dot forms.

Hosted zones have a minimal lifecycle status:

- `PENDING`
- `INSYNC`

Creation starts with a pending hosted zone and schedules background synchronization to move it to
`INSYNC`. Record-set changes also move the zone back to `PENDING`, schedule the mutation, then mark
it `INSYNC` after the scheduled work completes.

Callers can observe Route53's asynchronous operations without the simulator needing a full
change-tracking subsystem.

## Caller references and hosted-zone creation

`CreateHostedZoneCommandHandler` treats `CallerReference` as an idempotency key for the simulator.

The creation flow is:

1. require `Name`
2. require `CallerReference`
3. allocate a unique simulated hosted-zone ID
4. run background sequencing
5. reject an existing hosted zone with the same caller reference
6. create a `SimRoute53HostedZone`
7. insert it into the hosted-zone map
8. schedule hosted-zone synchronization completion
9. return hosted-zone details, change info, delegation-set nameservers, and location metadata

Duplicate caller references throw `SimRoute53HostedZoneAlreadyExists`.

## Registering a pre-existing Hosted Zone

`SimRoute53.registerHostedZone()` stands up a Hosted Zone with a caller-chosen ID. It is a setup
method rather than a command, in the way `SimS3.mountBucketFilesystem` is: it arranges the world in
a way the real API has no operation for, so it stays off the command surface and `CreateHostedZone`
keeps allocating its own ID as AWS does.

It exists because a CDK app using `HostedZone.fromLookup` bakes the looked-up zone's real ID into
the synthesized template, and every `AWS::Route53::RecordSet` names that ID. Nothing rewrites IDs as
a template deploys, so the simulation has to be able to own the ID the template already names.

`registerSimRoute53HostedZone` in `hosted-zone/` does the work. It normalizes the ID the same way
commands do, so a malformed one is `SimRoute53InvalidInput` before any state changes, and refuses an
ID already held with `SimRoute53HostedZoneAlreadyExists`. The zone goes into both the Account's
hosted-zone map and `SimRoute53Registry`, which is what a created zone does and what makes DNS
resolution work for it.

A registered zone is `INSYNC` from the start through `markSynchronized()`, because there is nothing
to synchronize: the zone is described as already existing rather than created here. Its caller
reference is derived from its ID, since the creation that would have supplied one happened outside
the simulation.

### A zone the template names but never creates

Registering the zone is a setup step the caller has to know to take, and a template using
`HostedZone.fromLookup` describes the zone well enough that they should not have to. So
`cfn/record-set/resolve/sim-cfn-r53-looked-up-zone.ts` registers one on demand: a RecordSet naming a
`HostedZoneId` no zone holds gets that zone stood up as the record is created, with `nameInferred`
set on the registration.

The template carries the ID but never the name, so the name is inferred from the record names.
`SimRoute53HostedZone.widenInferredName` takes each subsequent record name and drops labels from the
front of the zone name until what is left is a suffix of both, using
`hosted-zone/sim-route53-zone-name-widening.ts`. That converges on the shortest name containing every
record, which is the zone apex for any stack holding a record there.

`nameInferred` is what keeps this off ordinary zones. A zone that was named rather than guessed keeps
its name, so a record outside it stays outside it rather than silently widening a zone the caller
described.

The simulator does not currently try to emulate all AWS edge cases around duplicate zone names,
delegation sets, private-zone VPC associations, or caller-reference replay output. The caller
reference is mainly used to prevent accidental duplicate CloudFormation-created zones and to match
current test needs.

## Record model

Route53 records use an internal `SimRoute53Record` shape. Records are stored inside
`SimRoute53HostedZoneRecords`.

The record store is keyed by normalized record name and record type. This means one hosted zone can
contain distinct records such as:

- `A example.test`
- `AAAA example.test`
- `CNAME www.example.test`
- `TXT example.test`

`simRoute53RecordTypes` in `record/sim-route53-record.ts` is the list, and the union is derived from
it so the guard in `sim-route53-record-type.ts` cannot drift from the type. It is wider than the set
simulated DNS answers queries for: `MX`, `SRV`, `CAA` and `PTR` are stored, listed and deployable
from a template so a zone can model a real one, but nothing resolves them. See
[DNS wire format](#dns-wire-format).

Record normalization is simple:

- record names are normalized with Route53 local-name helpers
- record values go through `normaliseSimRoute53RecordValue` in
  `record/sim-route53-record-value.ts`, which normalizes them like DNS names
- `TXT`, `MX`, `SRV`, `CAA` and `PTR` values are preserved exactly as given

DNS-like target values need consistent comparison and resolution. A TXT value is arbitrary text, and
the other four hold a structured string — a preference and a host, a priority, weight, port and
target, a CAA flag, tag and value — that nothing in the simulator resolves against, so it is stored
as written rather than taken apart or folded to a hostname. A test asserting on an `MX` record gets
back the string its stack declared.

The record store supports three mutation modes:

- `create()` rejects duplicate name/type records
- `upsert()` creates or replaces a name/type record
- `delete()` removes by name/type and is tolerant of missing records

The store also notifies listeners registered through `onChange()` after every mutation.
`SimRoute53Registry` subscribes each hosted zone as it is registered and re-broadcasts through its
own `onRecordChange()`, so other simulated services can watch DNS across every account without
holding a reference to individual zones. Sim ACM uses this to validate certificates when their
validation record appears. Pushing changes this way rather than having watchers poll is what keeps
background task draining terminating.

Reads are `get()` for one name/type pair and `list()` for the whole zone. Both return copies, so
callers cannot mutate hosted-zone state through a returned record. `list()` returns records in map
insertion order rather than DNS order, because the store is a lookup structure; callers that need
Route53 ordering sort the result themselves.

The simulator does not currently model routing policies, weighted records, health checks,
multi-value answer records, or alias-specific evaluation beyond converting alias targets into record
values for supported routing scenarios. DNSSEC is modelled as zone state rather than as records:
see [DNSSEC](#dnssec).

## ChangeResourceRecordSets behaviour

`ChangeResourceRecordSetsCommandHandler` implements batched record mutations for a hosted zone.

The command flow is:

1. normalize the supplied hosted-zone ID
2. require `ChangeBatch.Changes`
3. run background sequencing
4. resolve the target hosted zone
5. validate every change before mutating anything
6. move the hosted zone to `PENDING`
7. schedule the actual record mutations
8. return change info using the hosted zone's current status

Validation and application are separate. This makes a change batch behave more like a single
operation. Invalid changes are rejected before any of the batch's record mutations are applied.

Each change is converted from AWS-style `ResourceRecordSet` input into the internal
`SimRoute53Record` shape. Standard `ResourceRecords` values and `AliasTarget.DNSName` are both
reduced to the same internal record-value list. That lets downstream resolution treat normal CNAME
records and CloudFormation alias-style records through the same simple record abstraction.

The actual mutation is scheduled through the hosted zone's synchronization mechanism. Tests or
CloudFormation resource creation paths that need the record to exist immediately after a scheduled
change should wait for hosted-zone synchronization or drain the broader simulator background tasks.

## ListResourceRecordSets behaviour

`ListResourceRecordSetsCommandHandler` returns one Hosted Zone's records in Route53 DNS name order.

DNS name order compares names from the rightmost label inwards, which puts the zone apex first and
groups names under a shared parent together. `compareSimRoute53RecordNames` implements that
comparison; `compareSimRoute53Records` adds the record type as a tiebreak so records sharing a name
still have a total ordering for pagination.

Pagination mirrors `ListHostedZonesByName` but markers are a name and a record type rather than a
name and a hosted-zone ID. `StartRecordName` is normalised the same way stored record names are, so
absolute and relative forms select the same page.

Records are converted to AWS-shaped `ResourceRecordSet` output in `record-set-output.ts`. Stored
names gain their trailing dot back at this boundary. Alias records are returned with an
`AliasTarget` rather than `ResourceRecords`, but the alias hosted-zone ID is not stored on the
record, so `AliasTarget.HostedZoneId` is omitted rather than invented.

Authorization uses the hosted-zone ARN, matching `ChangeResourceRecordSets`, and runs before the
hosted-zone lookup so an unauthorized caller cannot learn whether a zone ID exists.

## Hosted-zone lookup and listing

`GetHostedZoneCommandHandler` resolves hosted-zone IDs in the same normalized form used by
record-set changes. Unknown zones throw Route53-specific not-found errors.

`ListHostedZonesByName` builds a deterministic page from the in-memory hosted-zone map. Listing is
sorted by:

1. hosted-zone name
2. hosted-zone ID

The secondary ID sort is necessary because hosted-zone names are not unique. It keeps pagination
stable even when multiple zones share the same name.

Pagination support is implemented around Route53-style DNSName/HostedZoneId markers and numeric
`MaxItems`.

## Yulin-local name model

The `local-name/` helpers define the boundary between external HTTP hostnames and Route53 logical
DNS names.

The resolver works with Yulin-local hostnames rather than doing real DNS. A served Yulin instance
can receive an HTTP request for a local URL, convert that host into a logical Route53 name, then ask
`SimRoute53` whether that name eventually points at a simulated service target.

This design avoids running a DNS server. Route53 remains an in-memory name graph used by the local
HTTP serving layer.

## HTTP hostname resolution

Hostname resolution lives under `resolve/`.

`SimRoute53Resolver` converts an incoming Yulin-local HTTP hostname into a `SimAwsServiceTarget`
when possible. The resolver has two layers:

1. built-in recognition of Yulin service hostnames
2. CNAME following through hosted-zone records

Built-in targets currently include:

- S3 static website hostnames, resolved to service `"s3"` with bucket/resource name and region
- CloudFront distribution hostnames, resolved to service `"cloudFront"` with distribution/resource
  ID
- ELBv2 load balancer hostnames, resolved to service `"elbV2"` with the DNS name as the resource
  name, which is what the ELBv2 registry routes by

`SimRoute53S3ServiceTargets` and `SimRoute53RegionalServiceTargets` hold the shapes with something in
common: S3's two endpoints and two hostname styles, and the SDK endpoints whose last label is a
Region because the local URL rewriting dropped the AWS domain. A load balancer's hostname keeps its
domain, since nothing rewrites it on the way in, and its shape is read by
`readSimElbV2LoadBalancerHost` so that writing the name and reading it back are one file's answer.

If the incoming hostname is already a built-in simulated service hostname, the resolver returns the
target directly. Otherwise, it looks for a `CNAME` record matching the logical name and follows the
target.

A hostname a resource claimed for itself is asked about in one of two places, and `SimRoute53Resolver`
takes one `SimAwsServiceHosts` for each. `serviceHosts` is asked after the built-in shapes and
before any record. A Cognito hosted domain answers there. `shadowableServiceHosts` is asked where no
record names the hostname, and an API Gateway custom domain answers there. An alias record for a
hostname therefore still decides where the name goes after an HTTP API is given that hostname as a
custom domain.

CNAME resolution is bounded:

- the resolver tracks visited names to stop cycles immediately
- a maximum CNAME depth prevents unbounded chains
- resolution returns `undefined` when a chain cannot reach a supported local service target

The resolver does not query real DNS and does not implement general record-type lookup for HTTP
routing. CNAME chains are enough for the supported use case: mapping user-friendly hosted-zone names
to simulated S3 websites, CloudFront hostnames or other services.

## Most-specific hosted-zone matching

Record lookup across hosted zones is handled by `SimRoute53HostedZoneRecordFinder`.

When resolving a record, it scans all hosted zones and chooses the record from the most-specific
hosted zone whose name contains the queried name. For example, if both of these zones exist:

- `example.test`
- `sub.example.test`

then a lookup for `www.sub.example.test` prefers records from `sub.example.test`.

This is an important Route53-like behaviour. It lets tests model overlapping hosted zones without
requiring a global DNS tree. The implementation remains simple because hosted zones are still just
entries in a map; most-specific selection is applied only during record lookup.

`findZone()` answers the related but distinct question of which hosted zone covers a name at all,
regardless of the records it currently holds. That is what a caller needs to decide where a new
record should be written, or to establish that nothing in the simulation could ever answer for a
name. Sim ACM uses it for both.

## CloudFormation support

Sim Route53 CloudFormation support lives under `cfn/`.

`SimRoute53CloudFormationResourceFactory` currently supports:

- `AWS::Route53::HostedZone`
- `AWS::Route53::RecordSet`
- `AWS::Route53::KeySigningKey`
- `AWS::Route53::DNSSEC`

CloudFormation creation is delegated from the generic CloudFormation engine into this
service-specific factory. The generic CloudFormation service resolves dependencies and properties;
Route53 only interprets Route53 resource schemas and creates Route53 service objects through normal
service paths.

### HostedZone resources

`SimCfnRoute53HostedZoneCreator` creates hosted zones through `route53.createHostedZone()` rather
than constructing hosted-zone objects directly.

This keeps CloudFormation-created hosted zones consistent with SDK-created hosted zones:

- hosted-zone IDs are allocated the same way
- names are normalized the same way
- caller-reference uniqueness is enforced the same way
- synchronization status behaves the same way

The CloudFormation logical ID is used as the hosted-zone caller reference. This gives a
deterministic idempotency key inside the simulated stack.

Supported hosted-zone properties are narrow:

- `Name` must be a string
- `HostedZoneConfig`, when present, must be an object
- `HostedZoneConfig.Comment`, when present, must be a string
- `HostedZoneConfig.PrivateZone`, when present, must be a boolean

Unsupported hosted-zone features such as VPC associations are represented only structurally where
needed by command shapes; they are not currently part of the runtime routing model.

### RecordSet resources

CloudFormation record-set support is split into smaller helpers under `cfn/record-set/`:

- `resolve/` decides which hosted zone the record belongs to
- `build/` converts CloudFormation properties into an AWS-style record-set shape
- `parse/` handles nested record-set structures such as alias targets
- `apply/` writes the record through the normal `changeResourceRecordSets()` command path

The applicator does not write directly into hosted-zone records. It builds a record-set command and
calls the Route53 command handler, then waits for hosted-zone synchronization and reads back the
created record.

CloudFormation-created records should follow the same validation, normalization, change scheduling,
and status transitions as SDK-created records.

## Hosted-zone summary serving

`serve/` holds Route53's own localhost HTTP controller, which is unlike the S3 and CloudFront
controllers in that it does not serve a simulated AWS resource. It serves Yulin's view of the
simulated hosted zones so a developer running `serveSimAws` can inspect Route53 state in a browser.

The hostname is `dns.sim-aws.localhost`, whose logical name is defined by `simRoute53DnsHostName`.
`SimRoute53ServiceTargetResolver` recognises it ahead of the S3 and CloudFront hostnames, so it
cannot be shadowed by hosted-zone records, in the same way the other built-in service hostnames
cannot. That means the summary stays reachable whatever a test has created.

The summary reads the hosted-zone model directly rather than issuing `ListResourceRecordSets`,
because it is an environment-wide development view rather than an AWS API call: it is not scoped to
one Account and it does not apply sim IAM authorization. Zones come from `SimRoute53Registry` via
`SimRoute53.resolvableHostedZones()`, so zones created in any simulated Account appear.

Rendering is split into `zone-summary/`, with the page structure in
`sim-route53-zone-summary-page.ts` and escaping in `sim-route53-summary-html.ts`. Hosted-zone names
and record values originate in user templates and test code, so everything rendered is escaped.

## DNSSEC

DNSSEC state lives under `dnssec/`, on the hosted zone rather than on the account-scoped service.
`SimRoute53HostedZone` holds a `SimRoute53ZoneDnssec` in the same way it holds its records, so a
zone reached through the shared registry carries its signing state with it.

`SimRoute53ZoneDnssec` keeps the zone's key-signing keys and whether the zone is being signed apart,
because AWS does: adding a key does not start signing, and stopping signing leaves the keys in
place. That separation is what lets a zone be prepared for DNSSEC before its DS record is published.

`SimRoute53KeySigningKey` holds what Route53 adds on top of the KMS key: a name within the zone, a
status, and the DNSSEC parameters derived once at creation. Real Route53 derives them once in the
same way, which is why there is no operation to point an existing key-signing key at another KMS
key.

The derivation is the part worth getting right, because it is what a test asserts on:

- `sim-route53-dnskey-rdata.ts` takes the raw X and Y point out of the DER `SubjectPublicKeyInfo`
  `GetPublicKey` returns, and builds the DNSKEY RDATA from it. A point that is not an uncompressed
  P-256 one is refused rather than read as if it were.
- `sim-route53-dnskey-tag.ts` computes the key tag by the RFC 4034 Appendix B algorithm.
- `SimRoute53Dnskey` digests the canonical owner name and that RDATA into the delegation signer
  value, and formats the DS and DNSKEY records.

There is one algorithm rather than a table, in `sim-route53-dnssec-algorithm.ts`, because Route53
only accepts an `ECC_NIST_P256` key: ECDSA with SHA-256, algorithm 13, and the SHA-256 digest,
algorithm 2.

`sim-route53-dnskey.iso.test.ts` checks the key tag and the digest against the published ECDSA
P-256 example in RFC 6605 Appendix A.1. Self-consistency would not catch an algorithm that is wrong
in the same way twice, and these values are exactly the ones a registrar would be given.

### Reaching KMS

A key-signing key is built on a KMS customer managed key, and Route53 is account-scoped while KMS is
account and region-scoped. `SimKmsRegistry` bridges that, in the way `SimAcmRegistry` lets CloudFront
reach a certificate: a key ARN carries both the account and the region, so the lookup is the same
shape. `SimRoute53KskKmsKey` then applies the checks real Route53 applies before it takes a key.

A standalone `new SimRoute53()` has no registry, and refuses rather than accepting an unchecked key.

## DNS wire format

`dns/` holds the DNS message codec: enough of the wire format to decode a query
from a real resolver and encode a response it will accept. It has no sockets and
no knowledge of hosted zones, so it is exercised entirely by unit tests plus one
localhost test against a real client.

The scope is narrow, which is what keeps the codec small:

- Only six of the ten stored record types are encodable: `A`, `AAAA`, `CNAME`,
  `TXT`, `NS`, `SOA`. `dns-record-type.ts` names that subset as
  `SimRoute53DnsRecordType`, maps it to and from wire type numbers, and returns
  `undefined` for any other query type so a caller answers with no records rather
  than guessing at an encoding it does not have. A stored type with no encoder,
  such as `MX`, arrives as a wire number the map does not hold and is treated the
  same way. Narrowing the type rather than widening the map is what keeps the
  encoders exhaustive: adding a stored type cannot silently leave `encodeDnsRdata`
  with a case it cannot handle.
- **`ANY` (QTYPE 255) is a query type, not a record type**, so it
  does not map to a stored record type. `dnsAnyQueryType` is exported for a
  caller that wants to recognise it, but what to _answer_ for `ANY` is answer
  semantics rather than wire format, and is not the codec's decision. Note that
  RFC 8482 discourages returning every record at a name in response to `ANY`, so
  "answer with all of them" is not an obvious default to build in.
- **Names are always written uncompressed.** Compression is optional for a
  message author and every resolver must accept uncompressed names, so leaving
  it out removes the most error-prone part of the format. Compression pointers
  found while decoding are rejected rather than followed: the only names decoded
  are question names, which have nothing before them to point back at.
- **EDNS0 is ignored.** Anything after the question is skipped, and no OPT record
  is ever returned. That is how a server without EDNS support behaves, and
  resolvers fall back cleanly.
- Exactly one question per query is required. Multiple questions are legal in the
  format but unused in practice, so the count is checked rather than partially
  handled.

`wire/` holds the primitives — names, header, question, resource records — and
`rdata/` holds one encoder per RDATA shape. `dns-query.ts` and `dns-response.ts`
compose those into whole datagrams. Malformed input throws `DnsMessageFormatError`
rather than returning a sentinel, because a bad datagram is an expected condition
for a server on a socket and the server needs to answer it with a format error.

`dns-codec.loc.test.ts` is the test that matters most: it stands a UDP socket in
front of the codec and queries it with Node's own `node:dns` resolver, which is
c-ares. That proves the encoding against an independent implementation rather
than against the codec's own decoder. Node's resolver is used rather than `dig`
because it needs no external package and works the same on a laptop and in CI.

## DNS answer semantics

`dns/answer/` turns a decoded question into the records, response code and authority section that
answer it. It is separate from `SimRoute53Resolver`, which resolves an HTTP hostname to
a service target: an HTTP request only needs to know which simulated service handles a host, while a
DNS answer needs record types, CNAME chains, and the difference between a name that does not exist
and a name holding no record of the queried type.

The pieces are small and each does one thing:

- `sim-route53-dns-zone-finder.ts` picks the most specific hosted zone containing a name, the same
  longest-suffix rule the HTTP record finder uses.
- `sim-route53-dns-record-chase.ts` walks CNAME and alias records looking for the queried type,
  bounded by both a visited-name set and a maximum depth.
- `sim-route53-dns-service-target.ts` synthesises an address record for a name owned by a simulated
  service. Those hostnames are recognised by shape rather than stored, so nothing holds an address
  for them; answering with the address the local server listens on is what makes a DNS lookup and an
  HTTP request for the same name describe the same thing.
- `sim-route53-dns-soa.ts` supplies the SOA a negative answer carries, using the zone's own record
  when it has one and synthesising a Route53-shaped default when it does not.
- `sim-route53-dns-answerer.ts` composes those and decides the response code.

Two distinctions carry most of the behaviour. A name the zone holds under another type is `NOERROR`
with no answers; a name it does not hold is `NXDOMAIN`. A name held by no zone at all is `REFUSED`,
because the simulator is authoritative only for its own zones and cannot say a name exists nowhere.

**Aliases are followed, not answered.** An alias record stores a hostname rather than data of its own
type, so encoding one as an address would fail. The chase follows it without adding it to the answer
and records that the answer name should stay put, so the synthesised address appears under the name
holding the alias. That matches Route53, where an alias is transparent.

## DNS serving

The socket lives in `src/serve/dns/`, mirroring how HTTP splits `SimAwsHttp` from
`SimAwsLocalServer`. `SimAwsDns` turns a query datagram into a response datagram and holds no socket,
so it is testable without networking; `SimAwsDnsServer` owns the UDP socket.

`SimAwsDns.handleQuery` never throws. A server on a socket has to answer whatever arrives, so a
datagram that cannot be read becomes a format error rather than taking the server down, and the query
ID is echoed even then so the resolver can match the response.

`serveSimAws` brings DNS up alongside HTTP rather than making it opt-in, binding the same port number
on UDP that HTTP took on TCP. That is usually free, the two protocols having separate port
namespaces, but it is not guaranteed: on collision the server binds an ephemeral port and reports it
through `dnsPort`.

## Cross-service routing role

Route53's main cross-service role is name indirection for the local serving path.

S3 and CloudFront can produce simulated service hostnames. Route53 records can point friendlier
names at those targets with CNAME or alias-like records. The local HTTP serving layer can then
resolve an incoming host through sim Route53 and dispatch the request to the correct simulated
service controller.

Route53 does not own S3 buckets, CloudFront distributions, or their registries. It only resolves
names to a service target shape. The actual request handling remains with the owning service:

- S3 validates bucket existence, region, website configuration, and object lookup
- CloudFront validates distribution ownership, aliases, origins, behaviours, and functions

This separation keeps Route53 as a name-resolution layer instead of turning it into a cross-service
router with service-specific state.

## Background scheduling

Route53 uses the shared background scheduler for AWS-like asynchronous sequencing.

Current uses include:

- `CreateHostedZone` sequences before mutating the hosted-zone map
- hosted-zone creation schedules a transition from `PENDING` to `INSYNC`
- `ChangeResourceRecordSets` sequences before finding and updating the zone
- record-set changes are scheduled as hosted-zone synchronization work
- CloudFormation record-set creation waits for hosted-zone synchronization before returning the
  created record

The most important distinction is between scheduling and visibility:

- hosted zones are inserted into the service map during the create command
- record changes are applied later by scheduled synchronization work

Tests that need eventual Route53 state can use:

```typescript
await simAws.backgroundTasksComplete();
```

CloudFormation record-set creation already waits for the specific hosted-zone synchronization it
scheduled, because dependent CloudFormation resources may need the record to exist after the
resource is marked complete.

## Error model

Route53-specific errors live under `error/`.

The current error model is lightweight and focused on behaviours covered by the simulator:

- duplicate hosted-zone caller references use `SimRoute53HostedZoneAlreadyExists`
- missing hosted zones use Route53-specific not-found errors
- unsupported record-change actions and invalid resource shapes throw diagnostic errors

Some validation failures use assertion-style errors or `TypeError` because the simulator
does not yet model every AWS Route53 exception type. Prefer adding AWS-like error classes when a new
behaviour needs callers to distinguish failure modes programmatically.

## Tests as implementation guides

The colocated `*.iso.test.ts` files are the best reference for expected Route53 behaviour.

Useful areas:

- `command/create-hosted-zone/*.iso.test.ts`
  - hosted-zone creation
  - caller-reference uniqueness
  - initial change info and synchronization behaviour
  - AWS SDK structural compatibility

- `command/get-hosted-zone/*.iso.test.ts`
  - hosted-zone ID normalization
  - hosted-zone output shape
  - missing-zone behaviour

- `command/list-hosted-zones-by-name/*.iso.test.ts`
  - deterministic sorting
  - marker handling
  - max-items parsing
  - pagination behaviour

- `command/change-resource-record-sets/*.iso.test.ts`
  - change validation
  - hosted-zone lookup
  - CREATE/UPSERT/DELETE behaviour
  - alias target conversion
  - scheduled synchronization

- `command/list-resource-record-sets/*.iso.test.ts`
  - DNS name ordering
  - alias and standard record output shapes
  - name/type pagination markers
  - hosted-zone ARN authorization

- `hosted-zone/*.ts` and related tests
  - record storage invariants
  - normalization and duplicate handling

- `local-name/*.iso.test.ts`
  - conversion between local HTTP hostnames and logical Route53 names

- `resolve/*.iso.test.ts`
  - built-in S3 website and CloudFront target recognition
  - CNAME chains
  - cycle and depth handling
  - most-specific hosted-zone record matching

- `cfn/**/*.iso.test.ts`
  - CloudFormation hosted-zone validation
  - CloudFormation record-set property building
  - hosted-zone resolution for record sets
  - alias-target parsing
  - service factory dispatch

The `.iso.test.ts` suffix is for isolated tests that do not perform real network I/O. Sim Route53's
current test suite is mostly isolated because sim Route53 itself is an in-memory name-resolution
service. Localhost networking is usually exercised in the services that consume Route53 resolution,
such as S3 or CloudFront serving tests.

## Implementation conventions

When extending simulated Route53:

- keep `SimRoute53` as a thin service facade
- put AWS SDK-style operation behaviour in command handlers under `command/`
- keep hosted-zone metadata and record state in the hosted-zone model
- use `SimRoute53HostedZoneRecords` for record normalization and storage
- avoid direct record-map mutation from CloudFormation helpers; prefer the normal command path
- preserve the validation-then-schedule structure for record-change batches
- use local structural command and CloudFormation property types instead of importing AWS SDK
  packages from implementation code
- keep Route53 resolution focused on name-to-service-target resolution, not service-specific request
  handling
- add resolver support only when it maps cleanly to a `SimAwsServiceTarget`
- prefer focused isolated tests for new command, record, and resolver behaviour
- add localhost integration tests in consuming services when the full served request path matters

The most important design rule is: Route53 owns names, not the services behind those names. It can
resolve a simulated hostname to a target, but S3, CloudFront, and other services remain responsible
for their own runtime state and request semantics.
