# Simulated Rekognition

Simulated Rekognition answers detection calls from results declared against images, so a test can
say which image fails moderation or holds a dog without any image analysis happening. No recognition
of any kind is performed on the bytes.

Rekognition-specific types are imported from the `@kensio/yulin/rekognition` subpath.

## Moderating an image

`DetectModerationLabels` takes an image as bytes or as an S3 object. Every image is clean until a
rule says otherwise.

```typescript sim-rekognition-detect-moderation-labels
/**
 * Declaring a moderation result for one S3 object and detecting it.
 */

import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/nsfw.png",
    Body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
      "base64",
    ),
  }),
);

// The object is declared to fail moderation.
simAws
  .rekognition()
  .moderation()
  .onName("raw/nsfw.png", { labels: ["Explicit Nudity"] });

const detected = await simAws.rekognition().detectModerationLabels(
  new DetectModerationLabelsCommand({
    Image: { S3Object: { Bucket: "uploads", Name: "raw/nsfw.png" } },
  }),
);

console.log(detected.ModerationLabels.map((label) => label.Name));
// [ "Explicit", "Explicit Nudity" ]
console.log(detected.ModerationModelVersion); // "7.0"
```

The image is read through simulated S3 as the caller making the detection, so the caller needs
`s3:GetObject` for it as well as `rekognition:DetectModerationLabels`.

Image bytes go in as `Image.Bytes` instead, which needs no Bucket:

```typescript
const detected = await simAws
  .rekognition()
  .detectModerationLabels(
    new DetectModerationLabelsCommand({ Image: { Bytes: imageBytes } }),
  );
```

## Detecting labels in an image

`DetectLabels` answers with the objects, scenes and concepts an image is declared to hold. Each
label carries the parents, aliases, categories and instances it was declared with, and nothing else:
a label is reported as written.

```typescript sim-rekognition-detect-labels
/**
 * Declaring the labels for one S3 object and detecting them.
 */

import { DetectLabelsCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/dog.png",
    Body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
      "base64",
    ),
  }),
);

simAws
  .rekognition()
  .labels()
  .onName("raw/dog.png", {
    labels: [
      {
        name: "Dog",
        confidence: 98.2,
        parents: ["Animal", "Pet", "Canine"],
        aliases: ["Puppy"],
        categories: ["Animals and Pets"],
        // A bounding box is in ratios of the image size, as AWS reports it.
        instances: [
          { boundingBox: { left: 0.36, top: 0.09, width: 0.26, height: 0.85 } },
        ],
      },
      { name: "Grass", confidence: 71.4 },
    ],
  });

const detected = await simAws.rekognition().detectLabels(
  new DetectLabelsCommand({
    Image: { S3Object: { Bucket: "uploads", Name: "raw/dog.png" } },
    MaxLabels: 10,
  }),
);

console.log(detected.Labels.map((label) => label.Name)); // [ "Dog", "Grass" ]
console.log(detected.Labels[0]?.Parents);
// [ { Name: "Animal" }, { Name: "Pet" }, { Name: "Canine" } ]
console.log(detected.LabelModelVersion); // "3.0"
```

Labels come back in descending order of confidence, which is the order real Rekognition reports them
in. A declared instance with no confidence of its own takes its label's.

An image no rule matches gets the built-in default result: the one `Mobile Phone` label from the
example response in the AWS `DetectLabels` documentation, with the parent, alias, category and
bounding box AWS documents it with. That is a real Rekognition response, but which labels an
unconfigured image gets is a simulator convention rather than what AWS would return for it.

Nothing is filled in from a label name. Declaring `Dog` with no parents reports `Dog` with no
parents, and declaring a `Pizza` nobody has heard of reports `Pizza`, because Yulin ships no general
label ontology to check a name against or to expand one from.

## Declaring results

Results are declared per operation. `moderation()` holds the rules `DetectModerationLabels` answers
from and `labels()` holds the rules `DetectLabels` answers from. Both take the same three kinds of
rule: an exact S3 object name, an exact content hash, or anything at all.

```typescript sim-rekognition-moderation-rules
/**
 * The three kinds of rule, and which one wins.
 */

import { SimAws } from "@kensio/yulin";
import { simRekognitionImageHash } from "@kensio/yulin/rekognition";

const simAws = new SimAws();
const moderation = simAws.rekognition().moderation();

// Everything not matched by another rule.
moderation.byDefault({ labels: [] });

// One S3 object, by the Name a request gives Rekognition.
moderation.onName("raw/nsfw.png", { labels: ["Explicit Nudity"] });

// One image, by the hash of its bytes, for a system that generates its own
// object keys. These bytes would usually come from a fixture file, read with
// readFileSync, and the hash is of the exact bytes the test uploads.
const fixture = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQs7kDAAGyATf/cv8XAAAAAElFTkSuQmCC",
  "base64",
);
moderation.onHash(simRekognitionImageHash(fixture), {
  labels: [{ name: "Weapon Violence", confidence: 88.4 }],
});
```

A hash rule wins, then a name rule, then the default. Matching is exact, with no pattern syntax, so
which rule applies never depends on how specific a pattern looks.

A name is the `Name` in the request, which is the S3 object key. It is matched on its own rather
than with the Bucket, so a rule for a key applies to that key in whichever Bucket the request names.
An image passed as `Image.Bytes` has no name at all, so it consults hash rules and then the default.

The hash is the sha256 digest of the image bytes as they were received, as lowercase hex.
`simRekognitionImageHash` produces it from a fixture. Re-encoding an image between uploading it and
detecting on it changes the digest, so hash the exact bytes the test puts through the system.

A label can be declared as a name on its own, or as a name with what is to be reported alongside it.
A moderation label declared as a name reports at a confidence of `96.68000030517578`, and a
detection label at `97.53010559082031`.

## Moderation labels come back with their parents

A declared label expands to its whole chain in the version 7.0 moderation taxonomy, so handler code
that filters on the top-level category sees what it would see on AWS. Each label carries the
`ParentName` and `TaxonomyLevel` real Rekognition reports.

```typescript sim-rekognition-taxonomy-chain
/**
 * A third level label arrives with the two labels above it.
 */

import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
  "base64",
);

simAws
  .rekognition()
  .moderation()
  .byDefault({ labels: [{ name: "Drinking", confidence: 92 }] });

const detected = await simAws
  .rekognition()
  .detectModerationLabels(
    new DetectModerationLabelsCommand({ Image: { Bytes: imageBytes } }),
  );

console.log(detected.ModerationLabels);
// [
//   { Name: "Alcohol", ParentName: "", TaxonomyLevel: 1, Confidence: 92 },
//   { Name: "Alcohol Use", ParentName: "Alcohol", TaxonomyLevel: 2, ... },
//   { Name: "Drinking", ParentName: "Alcohol Use", TaxonomyLevel: 3, ... },
// ]
```

Every label in one chain shares that chain's confidence, and `MinConfidence` filters whole chains,
so a surviving label never names a parent that is not in the response. A label two chains share is
reported once, at the higher of the two confidences.

A label the taxonomy does not have is refused where it is declared rather than at detection time.
That includes a version 6.1 name that version 7.0 dropped, such as `Graphic Male Nudity`, which
became `Exposed Male Genitalia`. Some names survived the move with a different place in the
taxonomy: `Explicit Nudity` is still a label, but it now sits under `Explicit` rather than being a
top-level category itself.

## Filtering by confidence

`MinConfidence` compares inclusively and defaults to what the operation defaults to on AWS: 50 for
`DetectModerationLabels` and 55 for `DetectLabels`. An explicit `0` asks for every label rather than
being read as unset.

```typescript sim-rekognition-min-confidence
/**
 * Two labels declared with different confidences, filtered by the request.
 */

import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
  "base64",
);

simAws
  .rekognition()
  .moderation()
  .byDefault({
    labels: [
      { name: "Weapons", confidence: 96 },
      { name: "Gambling", confidence: 41 },
    ],
  });

const strict = await simAws.rekognition().detectModerationLabels(
  new DetectModerationLabelsCommand({
    Image: { Bytes: imageBytes },
    MinConfidence: 80,
  }),
);

console.log(strict.ModerationLabels.map((label) => label.Name));
// [ "Violence", "Weapons" ]
```

Confidences are float32 values, as real Rekognition confidences are, so a declared `99.4` comes back
as `99.4000015258789`.

`DetectLabels` also takes a `MaxLabels`, which applies after the confidence filter and keeps the most
confident labels of the ones that survived it. An explicit `0` asks for no labels rather than being
read as unset.

```typescript sim-rekognition-max-labels
/**
 * Three labels, narrowed by confidence and then by how many were asked for.
 */

import { DetectLabelsCommand } from "@aws-sdk/client-rekognition";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
  "base64",
);

simAws
  .rekognition()
  .labels()
  .byDefault({
    labels: [
      { name: "Dog", confidence: 98.2 },
      { name: "Grass", confidence: 88 },
      { name: "Fence", confidence: 62 },
    ],
  });

const detected = await simAws.rekognition().detectLabels(
  new DetectLabelsCommand({
    Image: { Bytes: imageBytes },
    MinConfidence: 80,
    MaxLabels: 2,
  }),
);

console.log(detected.Labels.map((label) => label.Name)); // [ "Dog", "Grass" ]
```

## Moderating an upload

An upload can moderate itself: a Bucket notification invokes a function, and the function moderates
the object the event names. The function calls Rekognition in the Account and Region it runs in, so
the rules a test registers on `simAws.rekognition()` are the ones it finds.

```typescript sim-rekognition-upload-pipeline
/**
 * An upload moderated by the Lambda function its Bucket notifies.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateBucketCommand,
  PutBucketNotificationConfigurationCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { makeLambdaCodeZip } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const moderatorArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:moderator`;

const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "ModeratorRole",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "ModeratorRole",
    PolicyName: "ModeratePolicy",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        // A detection has no resource to name, so this one has to be `*`.
        {
          Effect: "Allow",
          Action: "rekognition:DetectModerationLabels",
          Resource: "*",
        },
        // Reading the image does, so this one names the Bucket.
        {
          Effect: "Allow",
          Action: "s3:GetObject",
          Resource: "arn:aws:s3:::uploads/*",
        },
      ],
    }),
  }),
);

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "moderator",
    Role: role.Role.Arn,
    Handler: "index.handler",
    Code: {
      ZipFile: makeLambdaCodeZip({
        "index.js": `
const {
  RekognitionClient,
  DetectModerationLabelsCommand,
} = require("@aws-sdk/client-rekognition");

exports.handler = async (event) => {
  const record = event.Records[0].s3;
  const detected = await new RekognitionClient({}).send(
    new DetectModerationLabelsCommand({
      Image: {
        S3Object: { Bucket: record.bucket.name, Name: record.object.key },
      },
    }),
  );

  console.log(record.object.key, detected.ModerationLabels.length);

  return detected.ModerationLabels.length === 0 ? "clean" : "flagged";
};
`,
      }),
    },
  }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "moderator",
    StatementId: "AllowS3",
    Action: "lambda:InvokeFunction",
    Principal: "s3.amazonaws.com",
    SourceArn: "arn:aws:s3:::uploads",
    SourceAccount: simAws.defaultAccountId,
  }),
);

await simAws.s3().putBucketNotificationConfiguration(
  new PutBucketNotificationConfigurationCommand({
    Bucket: "uploads",
    NotificationConfiguration: {
      LambdaFunctionConfigurations: [
        {
          Id: "moderate-uploads",
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: moderatorArn,
          Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] } },
        },
      ],
    },
  }),
);

simAws
  .rekognition()
  .moderation()
  .onName("raw/nsfw.png", { labels: ["Explicit Nudity"] });

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "raw/nsfw.png",
    Body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
      "base64",
    ),
  }),
);

// Delivery and the detection it triggers both happen in the background.
await simAws.backgroundTasksComplete();
```

A handler that writes a moderated copy back into the Bucket that triggered it will notify itself for
ever, so filter the notification configuration by prefix or suffix as this one does.

## Permissions and errors

Each detection is authorized as its own action against `*`: `rekognition:DetectModerationLabels` and
`rekognition:DetectLabels`. Real Rekognition gives the detection operations no resource-level
permissions, so a policy naming an ARN reaches nothing, here as on AWS. A denial throws
`AccessDeniedException` with a 400 status, which is what real Rekognition answers with rather than
the 403 several other services use.

The caller is authorized for the detection before the image is read, so a caller without the
Rekognition permission is told about that rather than about an S3 object.

Every S3 problem becomes `InvalidS3ObjectException`, as it does on real Rekognition, whether the
Bucket is missing, the object is missing, or the caller may not read it. The underlying simulator
error is kept as the error's `cause`, so a missing `s3:GetObject` grant is still diagnosable:

```typescript
try {
  await simAws.rekognition().detectModerationLabels(command);
} catch (error) {
  console.log(error.name); // "InvalidS3ObjectException"
  console.log(error.cause); // the sim IAM access denial
}
```

Bytes that are not a PNG or a JPEG are refused with `InvalidImageFormatException`. The format comes
from the leading bytes of the image, so a test that stores a placeholder string in a Bucket and
moderates it gets that error.

## Accounts and Regions

Rekognition is scoped to an Account and a Region, and so are the rules registered against it. A
detection made in one Region is answered by the rules registered in that Region.

```typescript
simAws.account("111111111111").region("eu-west-2").rekognition();
```

An image is read from a Bucket in another Account when that Bucket's policy allows the caller, as
real Rekognition reads across Accounts. A Bucket in another Region is refused, as real Rekognition
reads only Buckets in its own Region.

## Available functionality

Simulated Rekognition currently supports:

- `DetectModerationLabelsCommand` and `DetectLabelsCommand`, for an image supplied as `Image.Bytes`
  or as `Image.S3Object`
- Results declared by exact S3 object name, by exact image content hash, or as a default, with the
  hash rule winning, then the name rule, then the default
- The complete version 7.0 content moderation taxonomy, with a declared label expanding to its
  parents and carrying `ParentName` and `TaxonomyLevel`
- Detected labels carrying declared `Parents`, `Aliases`, `Categories` and `Instances`, ordered by
  descending confidence
- `MinConfidence` filtering, defaulting to 50 for moderation and 55 for label detection, and
  `MaxLabels` after it
- `simRekognitionImageHash`, for hashing a fixture to declare a rule against
- PNG and JPEG format detection from the image bytes
- IAM authorization on `rekognition:DetectModerationLabels` and `rekognition:DetectLabels`, with the
  image read from S3 as the caller
- SDK interception of `RekognitionClient`, including from inside a simulated Lambda function

## Limitations

- `DetectFaces`, `DetectText`, face collections and the video operations are not simulated. An
  intercepted client sending one of those Commands is refused by name.
- Yulin ships no general label ontology, because AWS's is thousands of entries with no published
  enumerable table.
- A declared label's `Parents` appear on that label alone. Real `DetectLabels` also returns each
  ancestor as a label in its own right, which needs the ontology above. Declare the ancestors as
  labels too when the code under test reads them that way.
- A declared label name is not checked against anything, for the same reason. Refusing a real AWS
  label because a Yulin list was missing it would be failing closed against Yulin's own gaps.
- `DetectLabels` `Settings` filters and `IMAGE_PROPERTIES` are refused rather than ignored. Applying
  no filters would answer with labels the caller asked to have left out, and image quality and
  dominant colours would have to be invented by a simulation that looks at no images.
- A custom moderation adapter named with `ProjectVersion`, and a human review loop named with
  `HumanLoopConfig`, are both refused rather than ignored. Answering from the built-in model would
  make an adapter look applied here and be applied in production.
- `ContentTypes` is always empty. Real Rekognition puts `Animated` or `Illustrated` there for
  content it identifies as such, which needs an image to look at.
- Nothing looks at the image beyond its first few bytes. A PNG of a kitten declared as `Violence`
  comes back as `Violence`, and an image no rule matches gets the built-in `Mobile Phone` result.
- The format comes from the image bytes and never from a stored content type. Simulated S3 keeps a
  `ContentType` given to `PutObject` as a metadata key, and has none at all when the uploader did
  not set one, so trusting it would make the same bytes detectable or not depending on how they were
  uploaded.
- A `Version` on an `Image.S3Object` is refused, because simulated S3 has no object versions and
  would have answered with the current one.
- There are no CloudFormation resource types for Rekognition, and Rekognition is not served over
  `serveSimAws`.
- The moderation taxonomy is the published version 7.0 label list. A label from version 6.1 is
  refused, since real Rekognition no longer returns one.
