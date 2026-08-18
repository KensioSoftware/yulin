# Simulated Rekognition implementation

This directory contains the simulated Rekognition implementation. Three image detections are
simulated, `DetectModerationLabels`, `DetectLabels` and `DetectFaces`, each for an image supplied as
bytes or as an S3 object, along with the face collections that hold indexed faces and the search
that finds them again.

The guiding decision here is that no image recognition happens. Rekognition is a service where the
interesting behaviour is not the call but what the call returns, so the simulation maintains no
opinion about the bytes and answers from results a test declared, in the way simulated ACM issues
certificates without producing real TLS certificates. Everything else in this directory exists to
make the parts around that answer behave the way AWS does: the request checking, the S3 read, the
IAM decision, and the taxonomy a returned label belongs to.

## Entry points

- `sim-rekognition.ts` is the service facade for one account/region scope.
- `index.ts` exports the public Rekognition simulator API for `@kensio/yulin/rekognition`.

`SimRekognition` owns a `SimRekognitionModeration`, a `SimRekognitionLabels`, a
`SimRekognitionFaces` and a `SimRekognitionFaceMatches`, which own the rules the operations answer
from. Rules are grouped per operation rather than hung off the facade, so an operation group is
added beside the others without the facade growing a result shape for each.

The service is scoped to an account and region because its rules are: a detection made in one Region
is answered by the rules registered in that Region, as a real Rekognition endpoint answers for the
Region it belongs to. Face collections are scoped by that same instance. That is what leaves
`collection/sim-rekognition-collections.ts` an ordinary map, with no scope to check per call.

## The collection model

`collection/` holds the face collections one Account and Region owns.
`command/collection/collection.handler.ts` holds the three lifecycle operations and
`command/face/face.handler.ts` holds the four that work on the faces inside one. Each group shares a
store and an authorization shape, which is what makes each of them one handler.

A collection is the one Rekognition resource with an ARN, so those operations authorize against it
where the detections authorize against `*`. That is why `SimRekognitionAuthorizer.authorize` takes an
optional resource. Every face operation authorizes before it looks the collection up. A denial and
a missing collection stay separate, and a caller with no permission for a collection never learns
whether it is there.

The faces live on the collection record, in `SimRekognitionCollectionFaces`. Removing a collection
removes its faces with it, as it does on AWS.

`SimRekognitionIndexedFace` keeps the `SimRekognitionDetectedFace` it was indexed from. A face
indexed from an image and a face detected in that same image are then the same face, and `ListFaces`
reports the bounding box and confidence the `faces()` rules declared, whatever
`DetectionAttributes` the indexing asked for.

## The face search model

`match/` is the fourth rule set, and it answers `SearchFacesByImage`. The decision that matters
lives here. Nothing in this simulation compares one face with another. Which indexed faces a search
image finds is declared, the way every other Rekognition result here is.

A declared match names one indexed face, by the `ExternalImageId` it was indexed under or by the
`FaceId` `IndexFaces` answered with. Both are carried because each covers a case the other cannot. A
test whose own code registers the face knows the external image id in advance and can write the rule
before anything exists. An application that keeps the generated face id has no external image id to
name, and writes the rule after the indexing that issued it. Declaring both on one match, or
neither, is refused where the rule is written.

`SimRekognitionFaceMatchRule` resolves the declaration and leaves the lookup for the search. The
collection being searched decides which faces a rule reaches. A deleted face then stops being found
with the rule unchanged, and one rule covers both sides of a deletion.

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

Confidences pass through `Math.fround`, in `rule/sim-rekognition-declared-confidence.ts`, which both
operation groups declare their confidences through. Real confidences are float32 values with a long
tail, such as `99.44782257080078`, and a value rounded to four decimals is identifiable as fake.

## The label model

`label/` is much less than the moderation model, because there is nothing to resolve a declared
label against. Yulin ships no general label ontology: AWS's is thousands of entries with no
published enumerable table, so any subset here would be a Yulin invention that could never be
regenerated from an upstream source. A declared label name is therefore accepted as it stands, and
its parents, aliases, categories and instances are whatever the declaration said and empty
otherwise.

`label/sim-rekognition-label-detection.ts` is the resolution, which is validation and ordering. It
refuses a nameless label, a nameless parent and a bounding box that is not a ratio of the image
size, all where the declaration was written. Labels are sorted by descending confidence when the
rule is registered, which is the order real Rekognition reports them in and what makes `MaxLabels`
the most confident labels rather than the first ones declared.

`label/sim-rekognition-label-defaults.ts` holds the built-in default result and
`simRekognitionLabelModelVersion` beside it. The default is the AWS documentation's own example
response, label for label, so an unconfigured detection answers with something real Rekognition has
returned. The two belong in one file because the labels are what that version of the model reported.
Labels have no equivalent of a clean image to default to: an empty result would look like a broken
detection rather than a useful starting point.

## The face model

`face/` is the largest of the three models, because a `FaceDetail` is seventeen members and a
request decides which of them come back.

`face/sim-rekognition-face-declaration.ts` is the declared shape and nothing else. The readers that
go with it are in `sim-rekognition-declared-value.ts`, which reads the attributes that can be
written as a bare value or as a value with a confidence, in the way a label can be written as a bare
name.

`face/sim-rekognition-detected-face.ts` is one resolved face. It holds six small pieces, each
owning the attributes it can check as a group:

- `sim-rekognition-face-frame.ts`, the default subset bar the landmarks: bounding box, confidence,
  pose and quality;
- `sim-rekognition-face-landmarks.ts`, which reports the landmarks that
  `sim-rekognition-face-landmark-points.ts` resolved;
- `sim-rekognition-face-features.ts`, the eight attributes Rekognition answers yes or no to;
- `sim-rekognition-face-emotions.ts`;
- `sim-rekognition-face-age-and-gender.ts`;
- `sim-rekognition-face-eye-direction.ts`.

The split is not decoration. One renderer covering the optional attributes, written to this repo's
conventions, scores over the FTA threshold on its own. `sim-rekognition-face-feature-members.ts` is
split out for the same reason the moderation label list is: it is a table of names, and holding it
beside the code that reads it pushes that file over.

Each piece adds its members through `sim-rekognition-face-detail-builder.ts`, which carries a member
only when the request asked for the attribute it belongs to and the face declared a value for it. A
member with no declared value is left out of the response rather than carried as `undefined`, so a
test can ask which attributes came back. The attribute a member belongs to is passed in beside it
because the two do not share a name: `EyesOpen` is asked for as `EYES_OPEN`.

`sim-rekognition-face-attributes.ts` is the requested set. The default subset is always wanted, so
`["FACE_OCCLUDED"]` is that subset with face occlusion added, and `["ALL", "DEFAULT"]` is the union
the two describe together. It also decides the landmark set: real Rekognition reports five landmarks
unless `ALL` was asked for, and the whole set when it was.

`sim-rekognition-face-defaults.ts` holds the built-in result, which is the AWS documentation's own
example response attribute for attribute, along with `simRekognitionNoFaces` and
`simRekognitionSeveralFaces` for the two results a test that only counts faces needs.

The declaration checks are in the pieces that own the values, and two are worth knowing about.
Landmarks are not required to sit inside the bounding box, because a real Rekognition face box
routinely excludes the chin. Landmark pairs that run across the face, such as `eyeLeft` and
`eyeRight`, are required to be in the order Rekognition reports them in, so a declaration with the
two swapped is refused where it was written.

## Sample images

`sample/` is the five images that ship with the service, for the case the hash rules exist for: an
application that generates its own object keys, where the name a detection sees is not something a
test can match on.

`sample/sim-rekognition-sample-image-files.ts` holds them as base64, so a sample image is the same
bytes in the published package as it is here and reading one needs no filesystem. They are real 16
by 16 PNG and JPEG files, 1,909 bytes in total, which is what keeps the format check applying to
them as it does to any other image. Re-encoding one would change its hash and leave its rule
matching nothing, so they are checked in rather than generated.

`sample/sim-rekognition-sample-rules.ts` is what each one is declared as.
`SimRekognitionModeration` and `SimRekognitionFaces` register those as ordinary hash rules in their
constructors, which is the whole of the mechanism: a rule a test registers for the same image
replaces the built-in one through the usual precedence, and nothing anywhere special-cases a sample
image. It also means a sample image beats a name rule for the key it was uploaded under, since a
hash rule wins.

Each image is declared for the one operation it is named for. Declaring the face images as clean for
moderation as well would decide something the image is not named for, and the moderation default
already reports a clean image.

## Images

`image/` is the path from a request to the bytes a rule is matched against.

`SimRekognitionImageRequests.parse` reads the `Image` member and answers with a request for bytes or
a request for an S3 object. Parsing and reading are separate steps because they happen at different
points: the request is checked before anything else, and the image is read only once the caller has
been authorized for the detection. It is made with the name of the operation that is parsing, so a
refusal names the command the caller sent rather than whichever operation happened to be written
first.

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

`image/sim-rekognition-bounding-box.ts` is shared by the label and face models, because a bounding
box is the same four ratios in both. It refuses a box that does not sit inside the image, which is
stricter than AWS: a real response can put a box outside the image bounds for a face at the edge
that is only partly visible. The check is kept because it catches a box written in pixels, which is
the mistake worth catching.

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
adapter would appear applied here and be applied for real in production. `DetectLabels` has two of
its own with the same shape: `Settings`, whose filters decide which labels a response carries, and a
`Features` naming `IMAGE_PROPERTIES`, whose sharpness and dominant colours would have to be invented
by a simulation that looks at no images.

## Testing

Tests are colocated with the code they exercise. `sim-rekognition-moderation-pipeline.iso.test.ts`
is the exception and sits at the top level, because it is about the whole path rather than one
piece: an upload notifies a function, the function moderates the object the event names with its own
SDK client, and the rules it finds are the ones registered for the Account and Region it runs in.

`test/rekognition/image-fixture.ts` holds the image bytes tests detect on. The PNGs are complete 1x1
files; the JPEG is a file header, which is the whole of what the format check reads.
