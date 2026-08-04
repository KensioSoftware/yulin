# Simulated Rekognition implementation

This directory contains the simulated Rekognition implementation. Only image content moderation is
simulated: `DetectModerationLabels`, for an image supplied as bytes or as an S3 object.

The guiding decision here is that no image recognition happens. Rekognition is a service where the
interesting behaviour is not the call but what the call returns, so the simulation maintains no
opinion about the bytes and answers from results a test declared, in the way simulated ACM issues
certificates without producing real TLS certificates. Everything else in this directory exists to
make the parts around that answer behave the way AWS does: the request checking, the S3 read, the
IAM decision, and the taxonomy a returned label belongs to.

## Entry points

- `sim-rekognition.ts` is the service facade for one account/region scope.
- `index.ts` exports the public Rekognition simulator API for `@kensio/yulin/rekognition`.

`SimRekognition` owns a `SimRekognitionModeration`, which owns the rules `DetectModerationLabels`
answers from. Rules are grouped per operation rather than hung off the facade, so `labels()` and
`faces()` can be added beside `moderation()` without the facade growing a result shape for each.

The service is scoped to an account and region because its rules are: a detection made in one Region
is answered by the rules registered in that Region, as a real Rekognition endpoint answers for the
Region it belongs to.

## The rule mechanism

`rule/sim-rekognition-result-rules.ts` is the whole of it, and it is generic over the result type so
each operation group keeps its own. There is one kind of rule and one order between them: an exact
content hash wins, then an exact S3 object name, then the default.

Matching is exact, with no pattern syntax. Partial globs were considered and dropped, because they
force a specificity rule, and a specificity rule is where a surprising answer comes from.

The name a rule matches is the `Name` in the request, which is the S3 object key. It is matched
without the Bucket, so a rule for a key applies to that key in whichever Bucket the request names.
That is a simulator convention rather than AWS behaviour, and it is documented as such.

An image supplied as `Image.Bytes` has no name, which is why hash rules exist: a system that
generates its own object keys has nothing a test can usefully match a name against.

## The moderation model

`moderation/sim-rekognition-moderation-labels.ts` holds the complete version 7.0 taxonomy, all 52
labels, as a name and a parent name each, with `simRekognitionModerationModelVersion` beside them.
Real Rekognition moved from 6.1 to 7.0 by renaming most of the top-level categories, so a response
naming one version's labels under the other version's number would describe nothing AWS has ever
returned. Keeping the label list and the version in one file is what stops that.

`moderation/sim-rekognition-moderation-taxonomy.ts` is the behaviour over that list: a lookup, and
the chain of labels above one. Levels are derived by walking up from a label rather than being
stated per label, so a label cannot be numbered inconsistently with its own parent. The two are
separate files because the label list is 52 names of dense vocabulary, and holding it beside the
logic pushes the file over the FTA complexity threshold.

`moderation/sim-rekognition-moderation-result.ts` turns a declaration into the labels a response
carries. A declaration is resolved when the rule is registered rather than when a detection runs, so
a label real Rekognition has never heard of is refused where it was written.

Two rules there are worth keeping:

- every label in one chain carries that chain's confidence, so filtering on `MinConfidence` cannot
  leave a label naming a parent that is not in the response;
- a label two chains share is reported once, at the highest confidence any chain declared for it,
  because real Rekognition reports a parent at least as confidently as the child that implies it.

Confidences pass through `Math.fround`. Real confidences are float32 values with a long tail, such
as `99.44782257080078`, and a value rounded to four decimals is identifiable as fake.

## Images

`image/` is the path from a request to the bytes a rule is matched against.

`SimRekognitionImageRequests.parse` reads the `Image` member and answers with a request for bytes or
a request for an S3 object. Parsing and reading are separate steps because they happen at different
points: the request is checked before anything else, and the image is read only once the caller has
been authorized for the detection.

`SimRekognitionImage` is the image itself. Its format is decided when it is made, from PNG and JPEG
magic bytes, so bytes that are not an image are refused before any rule is consulted. The stored
content type of an S3 object is deliberately not consulted: simulated S3 keeps a supplied
`ContentType` as a metadata key and has none at all when the uploader did not set one, so trusting
it would make the same bytes detectable or not depending on how they were uploaded.

`SimRekognitionImageObjects` is the seam for reading an S3 object, with two implementations.
`SimAwsRekognitionImageObjects` finds the Bucket through the S3 Bucket registry rather than through
this scope's own S3, so a Bucket owned by another Account resolves, and reads it with an ordinary
GetObject made as the caller. `SimRekognitionUnreachableImageObjects` is what a standalone
`SimRekognition` gets, and says the service was built without S3 rather than reporting the object
missing.

Every S3 failure becomes `InvalidS3ObjectException`, as it does on real Rekognition, with the
underlying simulator error kept as the `cause`. A missing `s3:GetObject` grant would otherwise be
indistinguishable from a missing object.

## Authorization

`command/authorize/sim-rekognition-authorizer.ts` authorizes against `*`, because real Rekognition
gives the detection operations no resource-level permissions. A denial is Rekognition's own
`AccessDeniedException` with a 400 status rather than the shared IAM error, following the
`SimS3AccessDenied` precedent: the error name and status are part of what a caller has to handle.

The order in `DetectModerationLabelsHandler` is deliberate. Checking the request first means a
malformed one fails the same way whatever else the simulation is doing. Authorizing before reading
means a caller without `rekognition:DetectModerationLabels` is told about that rather than about an
S3 object, and goes looking at the right policy.

## Refusals

`command/sim-rekognition-unsimulated-input.ts` refuses request inputs this simulation does not
model, working from the small accepted set rather than from a list of everything Rekognition offers,
so an option nobody thought about is refused rather than dropped.

`ProjectVersion` is the one that matters. A request naming a custom moderation adapter would
otherwise be answered by the built-in model, which is the failure that looks like a pass: the
adapter would appear applied here and be applied for real in production.

## Testing

Tests are colocated with the code they exercise. `sim-rekognition-moderation-pipeline.iso.test.ts`
is the exception and sits at the top level, because it is about the whole path rather than one
piece: an upload notifies a function, the function moderates the object the event names with its own
SDK client, and the rules it finds are the ones registered for the Account and Region it runs in.

`test/rekognition/image-fixture.ts` holds the image bytes tests detect on. The PNGs are complete 1x1
files; the JPEG is a file header, which is the whole of what the format check reads.
