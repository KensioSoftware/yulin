# Simulated S3 implementation

Sim S3 usage docs: [`../../../docs/services/s3/README.md`](../../../docs/services/s3/README.md)

This directory contains the simulated S3 service implementation.

The implementation focuses on S3 behaviour that is useful for isolated tests, local development, and
cross-service simulations. It does not try to implement all of S3, but supported behaviours should
be similar to those in the real AWS. User application code can interact with the simulator through
familiar AWS SDK command shapes, CloudFormation resources, and local HTTP requests.

## Entry points

- `sim-s3.ts` is the main in-memory S3 service object for one account/region scope.
- `index.ts` exports the public S3 simulator API for `@kensio/yulin/s3`.
- `sim-s3-global-registry.ts` records Bucket ownership across account/region scopes inside one
  simulated AWS instance.
- `Bucket/` contains the simulated Bucket model, Bucket-name validation, name-availability checks,
  static website configuration, and the event notification configuration.
- `notification/` contains event notification delivery: the event, its `Records` serialisation, and
  the destinations S3 pushes to.
- `object/` contains the simulated S3 Object model.
- `storage/` contains pluggable Bucket storage implementations.
- `command/` contains AWS SDK-style command handlers.
- `serve/` contains localhost HTTP routing and object serving, for both the static website endpoint
  and the REST API endpoint that presigned URLs address.
- `cfn/` contains CloudFormation resource support for `AWS::S3::Bucket`.
- `error/` contains AWS-like S3 error classes.

A `SimS3` instance can be used directly for isolated S3-only tests. When accessed through `SimAws`,
S3 is scoped to an account and region, and shares registries needed for cross-region Bucket lookup
and integration with other simulated services.

## Service and Bucket state model

`SimS3` owns a local map of buckets:

- the map contains only buckets in that `SimS3` instance's account/region scope
- each Bucket is represented by `SimS3Bucket`
- each Bucket owns its storage implementation and static website configuration

S3 Bucket names are global in AWS, so Yulin models this with `SimS3GlobalRegistry`. The registry
maps a Bucket name to the account/region scope that owns it. The registry is "global" only within a
simulated AWS instance: it is still encapsulated state and can be freely recreated for isolation.

Bucket creation updates both places:

1. the account/region-local `SimS3.buckets` map
2. the shared `SimS3GlobalRegistry`

This lets direct SDK-style operations use local Bucket state while HTTP routing and cross-service
integrations can find a Bucket by name across account/region scopes.

## Command handling

AWS SDK-style operations are implemented under `command/`.

Each supported command has its own directory containing:

- command input/output typing
- a handler that validates input and applies state changes
- tests for expected simulator behaviour

The main `SimS3` class delegates command execution to handlers rather than keeping command logic
inline. For example, `SimS3.putObject()` calls `commands.objects.put()`, which creates a
`PutObjectCommandHandler` with the Bucket map and background scheduler, then calls `handle()`.

Supported command areas currently include:

- `create-Bucket/`
- `list-buckets/`
- `put-bucket-website/`
- `put-bucket-policy/`
- `get-bucket-policy/`
- `delete-bucket-policy/`
- `put-public-access-block/`
- `get-public-access-block/`
- `delete-public-access-block/`
- `put-object/`
- `get-object/`
- `list-objects/`
- `delete-object/`
- `delete-objects/`
- `put-bucket-notification-configuration/`
- `get-bucket-notification-configuration/`

`SimS3Commands` owns the wiring: every handler is built from the same Bucket map, IAM and background
scheduler, so that construction lives in one place rather than being repeated once per command on
the service facade. It groups the commands into areas, each a small class under `command/`:

- `SimS3BucketCommands` in `command/bucket/`
- `SimS3BucketPolicyCommands` in `command/bucket-policy/`
- `SimS3PublicAccessBlockCommands` in `command/public-access-block/`
- `SimS3ObjectCommands` in `command/object/`
- `SimS3NotificationCommands` in `command/notification/`

An area holds the shared `SimS3BucketCommandState` and hands it to the handler it runs, so adding a
command means adding one method to the area it belongs to. `requireSimS3Bucket` is the shared Bucket lookup
that raises `SimS3NoSuchBucket`, which is what real S3 answers before considering anything else
about a Bucket-scoped request.

It's important that implementation code under `src/` does not depend on real AWS SDK package
classes. Command types are local structural types with shapes compatible with the AWS SDK. Tests may
use real AWS SDK command classes to prove compatibility.

## Background sequencing

Command handlers use the shared `BackgroundScheduler` before mutating or reading state in places
where real AWS behaviour may involve asynchronous sequencing.

The common pattern is:

1. validate required inputs
2. find or validate existing resources
3. `await background.sequence()`
4. read or mutate simulated state

This gives tests a hook for deterministic sequencing while still allowing the simulator to model
non-instant background work elsewhere in Yulin.

## Bucket creation and name availability

`CreateBucketCommandHandler` is responsible for creating buckets.

The creation flow is:

1. require `input.Bucket`
2. run `background.sequence()`
3. validate the Bucket name with `validateS3BucketName`
4. check global name availability with `SimS3BucketNameAvailability`
5. create a `SimS3Bucket`
6. add it to the local Bucket map
7. register it in `SimS3GlobalRegistry`
8. return an AWS-like output containing `BucketArn`, `Location`, and `$metadata`

Bucket-name availability checks use both the local map and the global registry:

- if the name is already owned by the same account, the simulator throws
  `SimS3BucketAlreadyOwnedByYou`
- if the name is already owned by another account, the simulator throws `SimS3BucketAlreadyExists`
- a defensive local-map check repairs the global registry if local state somehow exists without
  global registration, then throws the owned-by-you error

## Bucket model

`SimS3Bucket` is the core Bucket object. It stores:

- `bucketName`
- the owning account/region scope
- a `SimS3BucketStorage` implementation
- a `SimS3BucketWebsite` configuration

Its public methods are small:

- `putObject(object)`
- `getObject(key)`
- `listObjects(prefix?)`
- `configureSimStorage(storage)`
- `configureWebsite(website)`
- `getWebsite()`
- `getWebsiteUrl()`
- `configurePolicy(policy)`
- `getPolicy()`
- `deletePolicy()`
- `configurePublicAccessBlock(publicAccessBlock)`
- `getPublicAccessBlock()`
- `deletePublicAccessBlock()`
- `configureNotifications(notifications)`
- `getNotifications()`

The Bucket resource policy is stored parsed rather than as a JSON string, because that is the shape
sim IAM evaluates. `GetBucketPolicy` serializes it back on the way out, so the string a caller reads
is a normalized form of what was applied rather than the original text.

## Block Public Access

`bucket/public-access/` holds the Block Public Access model. There are two distinct states and
`SimS3PublicAccessBlock` has a named constructor for each. `blockingAll()` is what a Bucket nobody
has configured gets, matching real S3's default for new Buckets. `fromConfiguration(...)` is what a
`PutPublicAccessBlock` call or a `PublicAccessBlockConfiguration` property produces, and it takes
the configuration literally: a setting left out of it is off, because the configuration replaces the
previous one wholesale rather than merging into it.

That second rule is load-bearing. CDK's `BlockPublicAccess.BLOCK_ACLS` sets only `blockPublicAcls`
and `ignorePublicAcls`, leaving `BlockPublicPolicy` out of the synthesized template entirely, and
pairing it with `publicReadAccess` is the standard way to build a public website Bucket. Treating
the omitted setting as enabled refuses that template, which real AWS deploys without complaint; the
CDK BucketDeployment local test exercises exactly this.

Only `BlockPublicPolicy` currently has an effect. `SimS3PublicPolicyGuard` applies it in the
`PutBucketPolicy` handler, after authorization, because the setting refuses a policy the caller is
otherwise entitled to apply. It throws `SimS3AccessDenied`, which is S3 itself refusing the request
rather than sim IAM denying it, so it is deliberately not `SimIamAccessDenied`.

Deciding whether a document is public is split up so each piece stays small:

- `SimS3PublicPolicy` walks the statements and decides the document
- `simS3PrincipalIsWildcard` decides whether a statement's `Principal` names everyone
- `simS3ConditionPinsPrincipal` decides whether a `Condition` ties a wildcard `Principal` to fixed
  values, which is what makes an otherwise public statement non-public in real S3

The determination fails closed throughout: a statement the simulator cannot classify counts as
public, so the policy is refused rather than quietly stored. `aws:SourceIp` is deliberately excluded
from the pinning condition keys because real S3 judges CIDR breadth and the simulator does not.

By keeping storage behind `SimS3BucketStorage`, the Bucket model stays independent of whether
objects live in memory or on the local filesystem.

## Object model and metadata

Objects are represented as `SimS3Object` instances. In normal command flow,
`PutObjectCommandHandler` creates these from `PutObject` command input:

- missing body becomes an empty `Buffer`
- string body is converted with `Buffer.from`
- `Uint8Array` body is converted with `Buffer.from`
- other body types currently throw an error

Metadata is stored separately from the object body. `PutObjectCommandHandler` combines:

- `input.Metadata`
- the system metadata request fields, mapped to their lowercase header names by
  `object/s3-system-metadata.ts`

`GetObjectCommandHandler` returns object bodies as Node `Readable` streams and returns stored
metadata through `Metadata`.

`object/s3-system-metadata.ts` holds the list of headers S3 remembers about an Object, pairing the
request field a write sets each one with against the lowercase key it is stored under. Both sides
read that list, so a header cannot be written without being served or served without being writable.
`SimPutObjectCommandInput` declares one field per entry, and the builder indexes the input by those
field names, which makes a missing field a type error rather than a silently dropped header.

`object/s3-object-response-headers.ts` is the single mapping from stored metadata to HTTP response
headers, and every path that serves an Object goes through it: the S3 REST endpoint reader, the
static website endpoint and the CloudFront S3 Origin. It returns the system metadata S3 keeps as a
header and hands back on a read, and nothing else, so user-defined metadata does not leak into the
response. Keeping it in one place is what stops the three endpoints disagreeing about what reading an
Object looks like.

The other way these headers reach an Object is a CDK BucketDeployment's `SystemMetadata`, which
builds the metadata record directly. A `PUT` over the S3 REST endpoint is the one write path that
does not cover them all: it reads `content-type` off the request and nothing else.

## Storage implementations

Bucket storage is pluggable through the `SimS3BucketStorage` interface.

### In-memory storage

`MemoryS3BucketStorage` is the default storage for new buckets.

It keeps objects in a `Map<string, SimS3Object>` keyed by object key. It supports:

- exact key lookup
- prefix filtering for list operations
- replacing objects by putting another object with the same key
- removing an object by key, which is a no-op when the key is not stored

This storage is fast, isolated, and appropriate for most tests.

### Filesystem storage

`FilesystemS3BucketStorage` maps simulated S3 objects to files under a local directory. It is useful
for local development scenarios such as serving a static site from a real directory through
simulated S3 and CloudFront.

`SimS3.mountBucketFilesystem(bucketName, directoryPath, options)` is the high-level API for switching
an existing Bucket to filesystem-backed storage.

### Watching a mounted directory

A mount given somewhere to reload, as `{ reload: srv }`, watches the directory as well as serving it.
The pieces are in `mount/`:

- `SimS3MountDirectoryEvents` holds the recursive `fs.watch`. It drops an event naming the directory
  itself, which is macOS replaying the directory's own creation to a watch started moments after it,
  and would otherwise reload the browser on start-up for a build that never happened.
- `SimS3MountWatch` puts those events through `SimWatchSettle`, so a build writing a tree of files is
  one reload, and reloads when they stop.
- `SimS3MountWatches` is the collection, one watch per Bucket, held by `SimS3BucketAccess`. It also
  decides what a `yulin watch` supervisor is told: a watched mount is a held path, so a rebuild
  reloads rather than restarting the process and taking every simulated Bucket, Table and Stack with
  it, while an unwatched one is a reported path as it always was.

A recursive watch holds an open filesystem handle, so `SimS3.stopWatchingMountedDirectories()` is the
way to let it go. A dev process never calls it; a test does. `SimS3.close()` is the same thing under
the name `SimAwsClosing` gives it, which is how `SimAws.close()` reaches these watches without
knowing that S3 is where they live.

Filesystem storage behaviour:

- object keys map to relative file paths under the configured directory
- `putObject` creates parent directories as needed and writes the object body to disk
- `getObject` reads files from disk and creates `SimS3Object` values
- `listObjects` recursively lists allowed files and returns them as objects
- missing files are treated as missing S3 objects
- file extensions are filtered through filesystem safety rules
- path traversal and unsafe directory/object paths are rejected
- `deleteObject` refuses with `SimS3NotImplemented` rather than unlinking the file

The filesystem implementation includes safety checks to reduce accidental unsafe file access, but it
should still be treated as local-development tooling rather than a sandbox boundary. That is why
deletion is refused: a mounted directory belongs to the user, and unlinking files out of it because
a test called `DeleteObject` is not a safe default. This is a deliberate divergence from real S3 and
is recorded in the [usage docs](../../../docs/services/s3/README.md#filesystem-backed-bucket-storage).

## PutObject, GetObject, and ListObjects

### PutObject

`PutObjectCommandHandler`:

1. requires `Bucket` and `Key`
2. looks up the Bucket in the local account/region Bucket map
3. throws `SimS3NoSuchBucket` if absent
4. sequences background work
5. builds a `SimS3Object`
6. stores it through the Bucket storage abstraction
7. returns AWS-like `$metadata`

### GetObject

`GetObjectCommandHandler`:

1. requires `Bucket` and `Key`
2. looks up the Bucket locally
3. throws `SimS3NoSuchBucket` if absent
4. sequences background work
5. gets the object from Bucket storage
6. throws `SimS3NoSuchKey` if absent
7. returns a readable body stream, metadata, and `$metadata`

### ListObjects

`ListObjectsCommandHandler`:

1. requires `Bucket`
2. looks up the Bucket locally
3. throws `SimS3NoSuchBucket` if absent
4. sequences background work
5. lists objects from storage using optional `Prefix`
6. sorts objects lexicographically by key
7. applies marker-based pagination
8. returns `Contents`, `Name`, `Prefix`, `Marker`, `MaxKeys`, `IsTruncated`,
   `NextMarker`, and `$metadata`

`MaxKeys` defaults to `1000`. `NextMarker` is set to the last returned key only when the result is
truncated.

### DeleteObject

`DeleteObjectCommandHandler`:

1. requires `Bucket` and `Key`
2. looks up the Bucket locally, throwing `SimS3NoSuchBucket` if absent
3. sequences background work
4. authorizes `s3:DeleteObject` against the Object ARN through `DeleteObjectAuthorizer`
5. removes the object through the Bucket storage abstraction
6. returns AWS-like `$metadata`

A key that is not stored is not an error. Real S3 deletion is idempotent, so the handler answers the
same way whether or not there was an object to remove.

### DeleteObjects

`DeleteObjectsCommandHandler` handles the batch form:

1. requires `Bucket` and `Delete`
2. reads the request through `DeleteObjectsRequest`, which refuses an empty list or more than 1000
   keys with `SimS3MalformedXml`
3. looks up the Bucket locally, throwing `SimS3NoSuchBucket` if absent
4. sequences background work
5. authorizes and deletes each key on its own, collecting the result in `DeleteObjectsOutcome`
6. returns `Deleted` and `Errors`, omitting `Deleted` when the request asked to be `Quiet`

A batch deletion is not all or nothing. `DeleteObjectsOutcome` turns a `SimIamAccessDenied` into an
`AccessDenied` entry and any other `SimS3Error` into an entry carrying its error name, while the rest
of the batch is still deleted. Anything else is re-raised, so a bug in the simulation cannot arrive
as a per-key AWS error.

## Event notifications

Sim S3 usage docs:
[`../../../docs/services/s3/README.md#event-notifications`](../../../docs/services/s3/README.md#event-notifications)

Notifications are split between the configuration, which is Bucket state, and delivery, which is not.

`bucket/notification/` holds the configuration. `SimS3NotificationConfiguration` is what a Bucket
stores, and `SimS3NotificationFilter` is the object key filter. `SimS3Notification` is one
destination in it, with `SimS3LambdaNotification`, `SimS3QueueNotification` and
`SimS3TopicNotification` as the three kinds.
Everything a configuration is asked, which events reach a destination and whether two of them
conflict, is the same question whatever the destination is, so only the ARN's property name and the
kind of destination it wants differ between the subclasses. Each reads its own entries through
`simS3NotificationProperties`, since the ARN is the only part the destination groups spell
differently.

`SimS3NotificationConfigurationReader` turns a `PutBucketNotificationConfiguration` request into a
configuration, refusing everything it cannot honour before anything is stored, so a refused request
leaves the previous configuration alone. What is left in the reader is the two rules that are about
the configuration as a whole, `simS3AssertNotificationIdsAreUnique` and
`simS3AssertNoNotificationOverlap`, and both look across the destination groups rather than within
one, as real S3 does.

Two rules in there are worth knowing about:

- `simS3ExpandNotificationEvent` expands a configured event type into the concrete events the
  simulator can raise. Everything works on expanded sets rather than on the configured strings,
  because the overlap rule is about event sets: real S3 refuses `s3:ObjectCreated:*` alongside
  `s3:ObjectCreated:Put` on the same filter, and comparing the two as strings would accept it.
- `simS3AssertNoNotificationOverlap` applies that rule. Two configurations conflict when their event
  sets intersect and their filters could both match a key, which needs both the prefixes and the
  suffixes to overlap. That is why `images` with `.jpg` alongside `images` with `.png` is accepted,
  as it is on real S3.

`notification/` holds delivery. The pieces are small on purpose:

- `SimS3ObjectNotifier` is what the Object commands call. It is held in `SimS3BucketCommandState`, so
  one notifier is shared across the commands of a scope and the sequence numbers and delivery ceiling
  see every event.
- `SimS3ObjectEventBuilder` turns something that happened to an Object into a `SimS3ObjectEvent`,
  which is destination-agnostic. `simS3EventRecordsDocument` is the separate serialisation into the
  `Records` document, so a later SNS or EventBridge destination can shape it differently.
- `SimS3NotificationSchedule` consults the Bucket's configuration and schedules delivery on the
  background scheduler. The event is built only once something wants it, because building one hashes
  the Object's bytes.
- `SimS3NotificationDispatcher` offers one event to one destination and records what came of it.
  Everything a destination raises is caught, because a rejected background task would fail an
  unrelated `backgroundTasksComplete()` and real S3 never reports a delivery failure to the caller
  who wrote the Object. `SimS3NotificationCeiling` is the exception: it is counted outside the guard
  so a notification loop surfaces as a named error rather than as a hung test.

`notification/destination/` is the port. `SimS3NotificationDestination` owns both `validate` and
`deliver`, because configuration-time validation and delivery-time re-check are the same
per-destination question asked twice, as real S3 asks it.
`SimS3ServiceNotificationDestinations` answers with the destination of the kind a configuration was
declared for, rather than reading the ARN to decide: a queue ARN under `LambdaFunctionConfigurations`
then reaches the Lambda destination and is refused for not being a function, instead of quietly
being delivered to as a queue. Each destination refuses an ARN that does not name what it delivers
to. `SimS3NoNotificationDestinations` is what a standalone `SimS3` gets, and it refuses by name.

Every destination resolves lazily from the `SimAws` it was built with, never at construction time:
`createLambda` already reaches `scope.s3()` for function code, so an eager `scope.lambda()` in
`createS3` would recurse, because the scope memo records a service only once its factory has
returned.

`SimAwsS3NotificationFunctions` resolves and invokes the function. Whether S3 may invoke a function
is Lambda's own rule, so the decision comes from `SimLambdaServiceInvokeAuthorizer` with the Bucket
ARN and Account supplied as the source.

`SimAwsS3NotificationQueues` does the same for a queue, and splits in two: it applies the one rule
that is S3's, that the queue is in the Bucket's Region, and hands the rest to
`SimS3NotificationQueue`, which is one queue in the Account and Region its ARN names. Everything
there is asked of that Account, which is what makes a cross-Account queue work: its policy is the
grant and its own IAM evaluates it, through `SimSqsServiceSendAuthorizer`. Delivery goes through the
ordinary `SendMessage` path, so the message is the same thing an SDK caller would have sent and is
authorized again on the way in. The refusal is asked for first all the same, so a queue policy saying
no is recorded as a refusal rather than as a fault.

`SimAwsS3NotificationTopics` is the same shape again for a topic, splitting into the Region rule and
`SimS3NotificationTopic`, which is one topic in the Account and Region its ARN names. The decision
comes from `SimSnsServicePublishAuthorizer`, and delivery goes through the ordinary `Publish` path,
so the topic's own subscriptions take the event from there and an S3 event reaches everything the
topic reaches. `SimS3NotificationTopicArn` borrows `parseSnsTopicArn` rather than reading the ARN
itself, since a topic ARN has no resource type segment and a subscription ARN is one with a seventh
part added: reading a subscription ARN as a topic ARN would find a topic nobody named.

The message is the `Records` document a queue destination gets, published with the
`Amazon S3 Notification` subject real S3 publishes and no message attributes, since real S3 sends
none.

The raise point is one call in `PutObjectCommandHandler` and one in each of the two deletion
handlers, after the write and with the caller the authorizer resolved. Every write path funnels
through those, so the SDK, an intercepted SDK client and the REST endpoint are all covered.

`s3:TestEvent` is deliberately not sent. Real S3 puts one on a queue or topic when a configuration
naming it is applied, carrying a flat document with no `Records` in it. Sending it would make the
simplest possible test two messages long and hand a consumer a first body it cannot parse as an
event, and what it exists to prove, that S3 can reach the destination, is what the destination check
already does directly.

## Static website configuration

Static website support is represented by `SimS3BucketWebsite`.

Website configuration can be set through:

- `PutBucketWebsiteCommandHandler`
- CloudFormation `AWS::S3::Bucket` `WebsiteConfiguration`
- direct Bucket configuration in tests

A simulated S3 website is considered enabled if any of these are configured:

- index document
- error document
- redirect-all-requests behaviour
- routing rules

Index document handling follows S3 website-style key selection:

- request for `""` serves the index suffix
- request ending in `/` serves `<requested-key><index-suffix>`
- other requests serve the requested key directly
- if a non-slash folder path has a matching `<path>/<index-suffix>` object, the simulator redirects
  to the slash-terminated URL

Error document handling:

- if the normal object lookup fails
- and an error document key is configured
- and that object exists
- the simulator serves it with status `404`

Redirect handling is delegated to `Bucket/website/redirect/`, including redirect-all-requests and
routing rule logic.

## Localhost HTTP serving

The S3 HTTP implementation under `serve/` answers on the two endpoints real S3 has, and the
hostname is what decides which. `SimRoute53ServiceTargetResolver` sets `endpoint` on the service
target to `website` or `rest`, and everything downstream follows that rather than guessing again.

The main classes are:

- `SimS3ServiceController`
- `SimS3RequestRouter`, with `SimS3ObjectAddress`, `SimS3BucketLocator` and `simS3RestRefusal`
- `SimS3GetObjectController` for the website endpoint
- `SimS3RestController` for the REST endpoint

`SimS3ServiceController` coordinates request handling:

1. route the request to a Bucket and object key
2. return a plain-text failure response if routing fails
3. delegate a website route to `SimS3GetObjectController`, and a REST route to `SimS3RestController`

`SimS3RequestRouter` validates that the service target names a region, then routes by endpoint. The
website endpoint accepts only `GET` and `HEAD` and takes the Bucket from the target's
`resourceName`. The REST endpoint accepts `GET`, `HEAD`, `PUT` and `DELETE`, and `SimS3ObjectAddress` reads
the Bucket and key from either addressing style: virtual-hosted, where the hostname names the
Bucket, or path style, where the first path segment does. `SimS3BucketLocator` then:

1. looks up the Bucket scope through `simAws.s3().findBucketScope(bucketName)`
2. rejects missing buckets
3. rejects requests for the wrong Bucket region
4. returns the Bucket and the account/region scope that owns it

`SimS3RestController` serves the API rather than a website:

- it calls `SimS3.getObject(...)`, `SimS3.putObject(...)` and `SimS3.deleteObject(...)` with the
  caller the authentication boundary resolved, so an HTTP request is authorized by the same IAM code
  path an in-process SDK call goes through, and a presigned URL grants no more than its signer holds
- a `DELETE` answers `204 No Content` whether or not the Object was there, as real S3 does
- `DeleteObjects` is a `POST` to the Bucket rather than an Object request, so it is reachable through
  the SDK but not over this endpoint
- it checks any `x-amz-checksum-*` an upload states before storing anything, through
  `SimS3UploadChecksum`
- failures become the XML error document real S3 answers with, through `SimS3RestErrorResponse`,
  which re-raises anything that is not a simulated S3 or IAM failure

Signature verification itself is not here: it happens once at the serving boundary in
`SimAwsRequestAuthenticator`, which is why this controller only has to ask who the caller is.

`SimS3GetObjectController` serves static website responses:

- returns `403` if static website hosting is not enabled
- applies redirect-all-requests configuration before object lookup
- serves objects with `content-length` and the system metadata headers S3 returns on a read,
  through `object/s3-object-response-headers.ts`
- returns headers but no body for `HEAD`
- applies trailing-slash redirects for folder index documents
- serves configured error documents with status `404`
- otherwise returns a plain-text `404`

This HTTP path is what lets served simulated AWS expose S3 website URLs on localhost.

## Website URLs and cross-service routing

Buckets can produce simulated static website URLs through:

- `SimS3Bucket.getWebsiteUrl()`
- `SimS3.getBucketWebsiteUrl(bucketName)`

The URL is derived from the Bucket name, account/region scope, and website configuration. When Yulin
is served on localhost, higher-level serving code can translate the simulated service URL into a
localhost URL while preserving the target service information.

CloudFront can also use S3 Bucket and website origins. In normal use, CloudFront and S3 are both
created from the same `SimAws` instance so their shared registries and origin resolvers can find the
right simulated Bucket.

## CloudFormation support

S3 CloudFormation support lives under `cfn/`.

`SimS3CloudFormationResourceFactory` currently supports:

- `AWS::S3::Bucket`, through `SimCfnS3BucketCreator`
- `AWS::S3::BucketPolicy`, through `SimCfnS3BucketPolicyCreator`

The factory itself only dispatches on the resource type name; each creator owns one resource type,
as the Lambda factory does.

Bucket policy creation reads the `Bucket` and `PolicyDocument` properties from the resolved
properties, then calls the normal `putBucketPolicy` command path, so a policy declared in a template
is validated and enforced exactly as one applied through the SDK. The simulated Bucket is returned
as the Resource's simulated object, because a Bucket policy has no existence of its own in S3.
A `Bucket` naming a Bucket that does not exist fails the Stack with `SimS3NoSuchBucket` rather than
being skipped.

Bucket resource creation flow:

1. determine the Bucket name

- use resolved `BucketName` when it is a string
- otherwise default to the lowercased logical ID

1. validate the Bucket name
1. create the Bucket through the normal simulated `createBucket` command path
1. fetch the created `SimS3Bucket`
1. read `WebsiteConfiguration`, if present and object-shaped
1. normalize string shorthand forms:

- `IndexDocument: "index.html"` becomes `{ Suffix: "index.html" }`
- `ErrorDocument: "error.html"` becomes `{ Key: "error.html" }`

1. apply website configuration through the normal simulated `putBucketWebsite` command path
1. return the simulated Bucket as the CloudFormation-backed resource

Unsupported S3 CloudFormation resource types throw a diagnostic error.

## Error model

S3-specific errors live in `error/sim-s3.error.ts`.

Handlers throw AWS-like errors for supported failure cases, including:

- no such Bucket
- no such key
- no such Bucket policy
- access denied, for S3's own refusals such as Block Public Access
- Bucket already exists
- Bucket already owned by you
- invalid argument, for a notification configuration with overlapping filters, a repeated
  configuration id, or a destination that could not be validated
- malformed XML, for a `DeleteObjects` request naming no Objects or more than 1000 of them
- not implemented, for something the simulator refuses rather than approximates, such as deleting an
  Object out of filesystem-backed storage

These errors carry AWS-style names and HTTP status metadata where implemented. Tests should assert
the specific simulator error when behaviour depends on AWS-compatible failure semantics.

## Tests as implementation guides

The colocated `*.iso.test.ts` and `*.loc.test.ts` files are useful references when changing S3
internals. They show expected simulator behaviour for commands, Bucket validation, object storage,
website routing, CloudFormation support, filesystem storage, and localhost serving.

The `.iso.test.ts` suffix is for isolated tests that do not perform real network I/O. They may still
use the local filesystem when testing filesystem-backed storage.

The `.loc.test.ts` suffix is for local integration tests that perform real networking on localhost.
These tests still run the simulated system and the test in the same process, which makes them
suitable for debugging the full local request path.

Useful test areas:

- `command/*/*.iso.test.ts` documents SDK-style command semantics
- `Bucket/validate/*.iso.test.ts` documents Bucket-name validation
- `Bucket/website/*.iso.test.ts` documents website configuration and routing decisions
- `Bucket/website/*.loc.test.ts` documents localhost website serving behaviour
- `storage/filesystem/*.iso.test.ts` documents filesystem mapping and safety rules
- `storage/filesystem/*.loc.test.ts` documents filesystem-backed local usage
- `serve/*.iso.test.ts` documents request routing and controller behaviour without real networking
- `serve/*.loc.test.ts` documents served localhost behaviour
- `cfn/**/*.iso.test.ts` documents CloudFormation resource creation and property normalization

## Implementation conventions

When extending simulated S3:

- keep command logic in a command handler under `command/`
- keep `SimS3` as a thin delegating service object
- avoid importing real AWS SDK packages from implementation code under `src/`
- use local structural command types instead
- use `BackgroundScheduler` consistently around state sequencing
- prefer adding behaviour through `SimS3Bucket`, `SimS3BucketWebsite`, or `SimS3BucketStorage`
  rather than special-casing it in controllers
- add focused isolated tests for command/model behaviour
- add localhost tests only when the actual HTTP serving path matters
- preserve encapsulation: "global" registries should be global only inside one simulated AWS
  instance
