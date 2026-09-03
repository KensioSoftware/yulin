# Simulated Rekognition

Yulin simulates Rekognition by returning results declared for an image name or content hash. It does
not analyze the image. Tests can define labels, moderation results, faces, and face matches while
application code uses the normal Rekognition commands.

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
    Key: "incoming/photo.png",
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
  .onName("incoming/photo.png", { labels: ["Weapons"] });

const detected = await simAws.rekognition().detectModerationLabels(
  new DetectModerationLabelsCommand({
    Image: { S3Object: { Bucket: "uploads", Name: "incoming/photo.png" } },
  }),
);

console.log(detected.ModerationLabels.map((label) => label.Name));
// [ "Violence", "Weapons" ]
console.log(detected.ModerationModelVersion); // "7.0"
```

The image is read through simulated S3 as the caller making the detection. The caller needs
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

`DetectLabels` returns the objects, scenes, and concepts declared for an image. Each label contains
only the parents, aliases, categories, and instances in its declaration.

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
    Key: "incoming/cat.png",
    Body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
      "base64",
    ),
  }),
);

simAws
  .rekognition()
  .labels()
  .onName("incoming/cat.png", {
    labels: [
      {
        name: "Cat",
        confidence: 98.2,
        parents: ["Animal", "Pet", "Feline"],
        aliases: ["Kitten"],
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
    Image: { S3Object: { Bucket: "uploads", Name: "incoming/cat.png" } },
    MaxLabels: 10,
  }),
);

console.log(detected.Labels.map((label) => label.Name)); // [ "Cat", "Grass" ]
console.log(detected.Labels[0]?.Parents);
// [ { Name: "Animal" }, { Name: "Pet" }, { Name: "Feline" } ]
console.log(detected.LabelModelVersion); // "3.0"
```

Labels come back in descending order of confidence, which is the order real Rekognition reports them
in. A declared instance with no confidence of its own takes its label's.

An image that matches no rule gets a built-in `Mobile Phone` result based on the AWS
`DetectLabels` example response. This default is a Yulin convention. AWS results depend on the image.

Yulin does not validate or expand general detection labels. Declaring `Cat` without parents returns
`Cat` without parents.

## Detecting faces in an image

`DetectFaces` returns the faces declared for an image, including their positions and requested
attributes.

```typescript sim-rekognition-detect-faces
/**
 * Declaring the faces in one S3 object and detecting them.
 */

import { DetectFacesCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: "incoming/selfie.png",
    Body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
      "base64",
    ),
  }),
);

simAws
  .rekognition()
  .faces()
  .onName("incoming/selfie.png", {
    faces: [
      {
        // A bounding box is in ratios of the image size, as AWS reports it.
        boundingBox: { left: 0.3, top: 0.2, width: 0.3, height: 0.4 },
        confidence: 99.4,
        ageRange: { low: 18, high: 26 },
        gender: "Female",
        smile: true,
        sunglasses: { value: false, confidence: 99.9 },
        emotions: ["CALM"],
      },
    ],
  });

const detected = await simAws.rekognition().detectFaces(
  new DetectFacesCommand({
    Image: { S3Object: { Bucket: "uploads", Name: "incoming/selfie.png" } },
    Attributes: ["ALL"],
  }),
);

console.log(detected.FaceDetails.length); // 1
console.log(detected.FaceDetails[0]?.AgeRange); // { Low: 18, High: 26 }
console.log(detected.FaceDetails[0]?.Smile);
// { Value: true, Confidence: 99.4000015258789 }
```

Faces come back in the order they were declared. An attribute with no confidence of its own takes
the face's, and a face detected at 99.4 is reported as smiling at 99.4. A face declared with no
confidence at all is detected at the built-in one.

Use `{ faces: [] }` for an image with no faces. Two built-in results cover common face-count tests:

```typescript
import {
  simRekognitionNoFaces,
  simRekognitionSeveralFaces,
} from "@kensio/yulin/rekognition";

const faces = simAws.rekognition().faces();

faces.onName("incoming/landscape.png", simRekognitionNoFaces);
faces.onName("incoming/crowd.png", simRekognitionSeveralFaces);
```

An image that matches no rule gets the face from the AWS `DetectFaces` example response, including
its attributes and 30 landmarks. This default is a Yulin convention.

## Choosing the facial attributes

`BoundingBox`, `Confidence`, `Pose`, `Quality` and `Landmarks` come back whatever a request asked
for, being the default subset AWS always returns. `ALL` adds the rest, and naming one attribute adds
that one, so `["FACE_OCCLUDED"]` is the default subset with face occlusion on top.
`["ALL", "DEFAULT"]` is the union the two describe together.

Landmarks follow AWS too. Five come back unless `ALL` was asked for, and every declared landmark
when it was.

```typescript sim-rekognition-face-attributes
/**
 * One face detected twice, with the default attributes and with ALL.
 */

import { DetectFacesCommand } from "@aws-sdk/client-rekognition";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
  "base64",
);

simAws
  .rekognition()
  .faces()
  .byDefault({
    faces: [
      {
        boundingBox: { left: 0.3, top: 0.2, width: 0.3, height: 0.4 },
        confidence: 99.4,
        landmarks: {
          eyeLeft: { x: 0.35, y: 0.3 },
          eyeRight: { x: 0.5, y: 0.3 },
          chinBottom: { x: 0.43, y: 0.62 },
        },
        smile: true,
      },
    ],
  });

const byDefault = await simAws
  .rekognition()
  .detectFaces(new DetectFacesCommand({ Image: { Bytes: imageBytes } }));

console.log(Object.keys(byDefault.FaceDetails[0] ?? {}));
// [ "BoundingBox", "Confidence", "Landmarks" ]
console.log(
  byDefault.FaceDetails[0]?.Landmarks?.map((landmark) => landmark.Type),
);
// [ "eyeLeft", "eyeRight" ]

const everything = await simAws.rekognition().detectFaces(
  new DetectFacesCommand({
    Image: { Bytes: imageBytes },
    Attributes: ["ALL"],
  }),
);

console.log(everything.FaceDetails[0]?.Smile?.Value); // true
console.log(
  everything.FaceDetails[0]?.Landmarks?.map((landmark) => landmark.Type),
);
// [ "eyeLeft", "eyeRight", "chinBottom" ]
```

An undeclared attribute is left out of the response, in place of coming back empty. A face declared
with a bounding box and no more comes back as a bounding box and a confidence, however many
attributes the request asked for.

A declaration is checked where it is written. A bounding box or a landmark outside the image is
refused, as is an age range that ends before it begins, an emotion Rekognition never reports, and a
pair of landmarks that runs the wrong way across the face, such as an `eyeLeft` to the right of
`eyeRight`. So is a result declaring more than a hundred faces, the most real Rekognition detects in
one image. A landmark may sit outside the bounding box, because a real Rekognition face box routinely
excludes the chin.

## Declaring results

Declare results separately for each operation. Use `moderation()` for `DetectModerationLabels`,
`labels()` for `DetectLabels`, `faces()` for `DetectFaces`, and `faceMatches()` for
`SearchFacesByImage`. Each API accepts rules for an exact S3 object name, an exact content hash, or a
default result.

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
moderation.onName("incoming/photo.png", { labels: ["Weapons"] });

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

Rules use exact matching. Hash rules take precedence over name rules, which take precedence over the
default.

A name is the `Name` in the request, the S3 object key. It is matched on its own, with the Bucket
left out, so a rule for a key applies to that key in whichever Bucket the request names. An image
passed as `Image.Bytes` has no name at all, and consults hash rules and then the default.

The hash is the sha256 digest of the image bytes as they were received, as lowercase hex.
`simRekognitionImageHash` produces it from a fixture. Re-encoding an image between uploading it and
detecting on it changes the digest, so hash the exact bytes the test puts through the system.

A label can be declared as a name on its own, or as a name with what is to be reported alongside it.
A moderation label declared as a name reports at a confidence of `96.68000030517578`, and a
detection label at `97.53010559082031`.

`faceMatches()` declares people where the other three declare labels. A match names one indexed
face, by the `ExternalImageId` it was indexed under or by the `FaceId` `IndexFaces` answered with,
and says how alike the search reports it as.

```typescript sim-rekognition-face-match-rules
/**
 * The two ways a rule names the face a search finds.
 */

import {
  CreateCollectionCommand,
  IndexFacesCommand,
} from "@aws-sdk/client-rekognition";
import { SimAws } from "@kensio/yulin";
import { simRekognitionSampleImages } from "@kensio/yulin/rekognition";

const simAws = new SimAws();
const simRekognition = simAws.rekognition();
const faceMatches = simRekognition.faceMatches();

// Every image starts here, finding nobody.
faceMatches.byDefault({ matches: [] });

// By the external image id the indexing request gave the face. A test can
// write this before anything is indexed.
faceMatches.onName("door/visitor.jpg", {
  matches: [{ externalImageId: "ada", similarity: 98.5 }],
});

// By the id IndexFaces answered with, for an application that keeps it.
await simRekognition.createCollection(
  new CreateCollectionCommand({ CollectionId: "staff" }),
);

const indexed = await simRekognition.indexFaces(
  new IndexFacesCommand({
    CollectionId: "staff",
    Image: { Bytes: simRekognitionSampleImages.oneFace() },
  }),
);

faceMatches.onName("door/courier.jpg", {
  matches: indexed.FaceRecords.map((record) => ({
    faceId: record.Face.FaceId,
  })),
});
```

An `externalImageId` rule can be written before anything is indexed. That suits a test whose own
code registers the face. A `faceId` rule is written after the indexing that issued the id, and names
one face exactly. Where the same external image id covers several faces, each one comes back as its
own match. A match that states no similarity reports at `99.97222137451172`, the similarity in the
AWS `SearchFacesByImage` example response. Declaring both kinds of id on one match, or neither, is
refused where the rule is written.

## Sample images

Yulin includes five small images with predeclared hash rules. Application code can upload one under
any object key and receive a known result without registering another rule.

| Image                                              | Format | Detected as                                       |
| -------------------------------------------------- | ------ | ------------------------------------------------- |
| `simRekognitionSampleImages.passesModeration()`    | PNG    | no moderation labels                              |
| `simRekognitionSampleImages.flaggedByModeration()` | JPEG   | `Violence`, `Graphic Violence`, `Weapon Violence` |
| `simRekognitionSampleImages.noFaces()`             | PNG    | no faces                                          |
| `simRekognitionSampleImages.oneFace()`             | JPEG   | one face, the built-in default face               |
| `simRekognitionSampleImages.severalFaces()`        | PNG    | three faces                                       |

```typescript sim-rekognition-sample-images
/**
 * A sample image uploaded under a key the application invented.
 */

import { randomUUID } from "node:crypto";

import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "@kensio/yulin";
import { simRekognitionSampleImages } from "@kensio/yulin/rekognition";

const simAws = new SimAws();
await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

const key = `incoming/${randomUUID()}.jpg`;

await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: key,
    Body: simRekognitionSampleImages.flaggedByModeration(),
  }),
);

const detected = await simAws.rekognition().detectModerationLabels(
  new DetectModerationLabelsCommand({
    Image: { S3Object: { Bucket: "uploads", Name: key } },
  }),
);

console.log(detected.ModerationLabels.map((label) => label.Name));
// [ "Violence", "Graphic Violence", "Weapon Violence" ]
```

Each image is declared for the one operation it is named for. The moderation images say nothing
about faces and the face images say nothing about moderation. Those detections answer from their own
rules as they would for any other image.

The built-in rules are ordinary hash rules registered when the service is made, and declaring a rule
for the same image replaces it. The precedence matters here. A hash rule beats a name rule, so a
sample image is overridden by hash, and never by the key it was uploaded under.

```typescript
const sample = simRekognitionSampleImages.flaggedByModeration();

simAws
  .rekognition()
  .moderation()
  .onHash(simRekognitionImageHash(sample), { labels: [] });
```

The images are valid 16 by 16 PNG and JPEG files. Rekognition checks their file signatures but does
not inspect their visual content.

## Moderation labels come back with their parents

A declared label expands to its whole chain in the version 7.0 moderation taxonomy. Handler code
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

Every label in one chain shares that chain's confidence, and `MinConfidence` filters whole chains. A
surviving label always names a parent the response carries. A label two chains share is reported
once, at the higher of the two confidences.

A label outside the taxonomy is refused where it is declared, ahead of detection time. That includes
a version 6.1 name that version 7.0 dropped, such as `Drug Products`, which became `Products` under
`Drugs & Tobacco`. Some names survived the move with a different place in the taxonomy. `Drinking`
is still a label, and it now sits under `Alcohol Use` rather than directly under `Alcohol`.

## Filtering by confidence

`MinConfidence` compares inclusively and defaults to what the operation defaults to on AWS, being 50
for `DetectModerationLabels` and 55 for `DetectLabels`. An explicit `0` asks for every label, and is
never read as unset.

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

Confidences are float32 values, as real Rekognition confidences are, and a declared `99.4` comes
back as `99.4000015258789`.

`DetectLabels` also takes a `MaxLabels`, which applies after the confidence filter and keeps the most
confident labels of the ones that survived it. An explicit `0` asks for no labels, and is never read
as unset.

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
      { name: "Cat", confidence: 98.2 },
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

console.log(detected.Labels.map((label) => label.Name)); // [ "Cat", "Grass" ]
```

## Moderating an upload

An upload can moderate itself. A Bucket notification invokes a function, and the function moderates
the object the event names. The function calls Rekognition in the Account and Region it runs in, so
the rules a test registers on `simAws.rekognition()` are the ones it finds.

This is the flow the sample images exist for. The object goes in under a key the application
generated, and the sample image's own hash rule decides the result, leaving the test with no key to
name.

```typescript sim-rekognition-upload-pipeline
/**
 * An upload moderated by the Lambda function its Bucket notifies.
 */

import { randomUUID } from "node:crypto";

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
import { simRekognitionSampleImages } from "@kensio/yulin/rekognition";

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
          Filter: {
            Key: { FilterRules: [{ Name: "prefix", Value: "incoming/" }] },
          },
        },
      ],
    },
  }),
);

// The sample image is already declared as failing moderation, so the key it
// goes in under is the application's business rather than the test's.
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "uploads",
    Key: `incoming/${randomUUID()}.jpg`,
    Body: simRekognitionSampleImages.flaggedByModeration(),
  }),
);

// Delivery and the detection it triggers both happen in the background.
await simAws.backgroundTasksComplete();
```

A handler that writes a moderated copy back into the Bucket that triggered it will notify itself for
ever. Filter the notification configuration by prefix or suffix, as this one does.

## Face collections

A collection stores indexed faces so an application can search for the same person later.

```typescript sim-rekognition-collections
/**
 * Creating, listing and removing a Rekognition face collection.
 */

import {
  CreateCollectionCommand,
  DeleteCollectionCommand,
  ListCollectionsCommand,
} from "@aws-sdk/client-rekognition";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simRekognition = simAws.rekognition();

const created = await simRekognition.createCollection(
  new CreateCollectionCommand({ CollectionId: "staff" }),
);

console.log(created.CollectionArn);
// arn:aws:rekognition:us-east-1:888888888888:collection/staff

const listed = await simRekognition.listCollections(
  new ListCollectionsCommand({}),
);

console.log(listed.CollectionIds); // ["staff"]
console.log(listed.FaceModelVersions); // ["7.0"]

await simRekognition.deleteCollection(
  new DeleteCollectionCommand({ CollectionId: "staff" }),
);
```

A collection belongs to one Account and Region, as it does on AWS, so a listing in another Region misses it. Creating one under a name already held raises `ResourceAlreadyExistsException`, and removing one that was never created raises `ResourceNotFoundException`.

Every collection reports face model version 7.0. Real Rekognition stamps a collection with the version in force when it was created, and that version moves as AWS retrains. Nothing here recognises a face, so one fixed version is stated rather than a moving one invented.

## Indexing faces and finding them again

`IndexFaces` puts the faces an image holds into a collection. Which faces an image holds is what the
`faces()` rules declare, the same rules `DetectFaces` answers from. An image with one declared face
indexes one face, at the bounding box and the confidence that rule gave it, and an image no rule
matches indexes the built-in default face.

`SearchFacesByImage` answers from the `faceMatches()` rules. They say which indexed faces one image
finds, and an image no rule matches finds nobody.

```typescript sim-rekognition-face-indexing
/**
 * Indexing a face into a collection and recognising the same person later.
 */

import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  IndexFacesCommand,
  ListFacesCommand,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { simRekognitionSampleImages } from "@kensio/yulin/rekognition";

const simAws = new SimAws();
const simRekognition = simAws.rekognition();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "photos" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "photos",
    Key: "staff/ada.jpg",
    Body: simRekognitionSampleImages.oneFace(),
  }),
);
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "photos",
    Key: "door/visitor.jpg",
    Body: simRekognitionSampleImages.oneFace(),
  }),
);

await simRekognition.createCollection(
  new CreateCollectionCommand({ CollectionId: "staff" }),
);

const indexed = await simRekognition.indexFaces(
  new IndexFacesCommand({
    CollectionId: "staff",
    Image: { S3Object: { Bucket: "photos", Name: "staff/ada.jpg" } },
    ExternalImageId: "ada",
  }),
);

console.log(indexed.FaceRecords.map((record) => record.Face.ExternalImageId));
// [ "ada" ]

const listed = await simRekognition.listFaces(
  new ListFacesCommand({ CollectionId: "staff" }),
);

console.log(listed.Faces.length); // 1

// The visitor at the door is declared to be that member of staff.
simRekognition
  .faceMatches()
  .onName("door/visitor.jpg", { matches: [{ externalImageId: "ada" }] });

const found = await simRekognition.searchFacesByImage(
  new SearchFacesByImageCommand({
    CollectionId: "staff",
    Image: { S3Object: { Bucket: "photos", Name: "door/visitor.jpg" } },
  }),
);

console.log(found.FaceMatches.map((match) => match.Face.ExternalImageId));
// [ "ada" ]

const deleted = await simRekognition.deleteFaces(
  new DeleteFacesCommand({
    CollectionId: "staff",
    FaceIds: listed.Faces.map((face) => face.FaceId),
  }),
);

console.log(deleted.DeletedFaces.length); // 1
```

Each indexed face gets a `FaceId` of its own, and every face from one call shares an `ImageId`. Both
are uuids, as they are on AWS. An application that stores a `FaceId` and looks it up later works
here the way it works there.

A declared match reaches the faces the searched collection holds. `DeleteFaces` removes one and the
same rule then finds nobody. One rule covers both sides of a deletion. `DeletedFaces` reports the
ids that were there, and an id the collection never held comes back in
`UnsuccessfulFaceDeletions` as `FACE_NOT_FOUND`.

`FaceMatchThreshold` filters on the similarity the rule stated and defaults to 80, as it does on
AWS. `MaxFaces` caps how many matches come back, most alike first. A search with an image the
`faces()` rules give no face raises `InvalidParameterException`, as real Rekognition does when there
is no face to search with.

`ListFaces` reports the faces one collection holds, in the order they were indexed, and narrows to
the ids a request names. `MaxResults` pages the listing and the `NextToken` in the response reaches
the next page. A listing that asks for no page size comes back whole.

## Permissions and errors

Each detection is authorized as its own action against `*`, one of
`rekognition:DetectModerationLabels`, `rekognition:DetectLabels` and `rekognition:DetectFaces`. Real
Rekognition gives the detection operations no resource-level permissions, and a policy naming an ARN
reaches nothing, here as on AWS.

A collection is the other kind. It has an ARN, so `rekognition:CreateCollection`,
`rekognition:DeleteCollection`, `rekognition:IndexFaces`, `rekognition:ListFaces`,
`rekognition:SearchFacesByImage` and `rekognition:DeleteFaces` authorize against that collection's
ARN, and a policy naming one collection reaches only that collection. `rekognition:ListCollections`
reads them all, so it authorizes against `*`. Each face operation is authorized before the
collection is looked up. A caller with no permission for a collection never learns whether it is
there. A denial throws `AccessDeniedException` with a 400 status, which is
what real Rekognition answers with, where several other services use 403.

The caller is authorized for the detection before the image is read. A caller without the Rekognition
permission is told about that, and never about an S3 object.

Every S3 problem becomes `InvalidS3ObjectException`, as it does on real Rekognition, whether the
Bucket is missing, the object is missing, or the caller may not read it. The underlying simulator
error is kept as the error's `cause`, leaving a missing `s3:GetObject` grant diagnosable:

```typescript
try {
  await simAws.rekognition().detectModerationLabels(command);
} catch (error) {
  console.log(error.name); // "InvalidS3ObjectException"
  console.log(error.cause); // the sim IAM access denial
}
```

Bytes that are neither a PNG nor a JPEG are refused with `InvalidImageFormatException`. The format
comes from the leading bytes of the image. A test that stores a placeholder string in a Bucket and
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

## Supported operations

- `DetectModerationLabelsCommand`, `DetectLabelsCommand` and `DetectFacesCommand`, for an image
  supplied as `Image.Bytes` or as `Image.S3Object`
- Results declared by exact S3 object name, by exact image content hash, or as a default, with the
  hash rule winning, then the name rule, then the default
- The complete version 7.0 content moderation taxonomy, with a declared label expanding to its
  parents and carrying `ParentName` and `TaxonomyLevel`
- Detected labels carrying declared `Parents`, `Aliases`, `Categories` and `Instances`, ordered by
  descending confidence
- `MinConfidence` filtering, defaulting to 50 for moderation and 55 for label detection, and
  `MaxLabels` after it
- Detected faces carrying the declared bounding box, confidence, pose, quality, landmarks, age
  range, gender, emotions, eye direction and the eight yes or no attributes
- `Attributes` handling for face detection, with the default subset always returned, `ALL` adding
  the rest, and five landmarks reported unless `ALL` was asked for
- `simRekognitionNoFaces` and `simRekognitionSeveralFaces`, for a test that counts faces
- Five built-in sample images, real PNG and JPEG files with their hashes already declared, for a
  clean and a flagged moderation result and for zero, one and three faces
- `simRekognitionImageHash`, for hashing a fixture to declare a rule against
- PNG and JPEG format detection from the image bytes
- IAM authorization on `rekognition:DetectModerationLabels`, `rekognition:DetectLabels` and
  `rekognition:DetectFaces`, with the image read from S3 as the caller
- `CreateCollectionCommand`, `ListCollectionsCommand` and `DeleteCollectionCommand`, scoped to one
  Account and Region
- `IndexFacesCommand`, `ListFacesCommand`, `SearchFacesByImageCommand` and `DeleteFacesCommand`,
  with the faces put in a collection taken from the `faces()` rules for the image they came from
- Face searches declared through `faceMatches()`, by the external image id a face was indexed under
  or by the face id `IndexFaces` answered with, filtered by `FaceMatchThreshold` and capped by
  `MaxFaces`
- `ListFaces` narrowing to named face ids, and paging on `MaxResults` and `NextToken`
- IAM authorization on `rekognition:CreateCollection`, `rekognition:DeleteCollection`,
  `rekognition:IndexFaces`, `rekognition:ListFaces`, `rekognition:SearchFacesByImage` and
  `rekognition:DeleteFaces` against the collection's own ARN, and on `rekognition:ListCollections`
  against `*`
- SDK interception of `RekognitionClient`, including from inside a simulated Lambda function

## Limitations

- `DetectText`, `CompareFaces` and the video operations are left out. An intercepted client sending
  one of those Commands is refused by name.
- `SearchFaces`, which searches by face id, and the `SearchUsers` and user association operations are
  left out. An intercepted client sending one of those Commands is refused by name.
- `QualityFilter` is refused on `IndexFaces` and `SearchFacesByImage`. Real Rekognition uses it to
  drop faces it judges too blurry or too small. Nothing here judges an image. A filter set on the
  request would drop faces on AWS and keep them here.
- A `MaxFaces` on `IndexFaces` takes the faces in the order they were declared, and the rest come
  back in `UnindexedFaces` as `EXCEEDS_MAX_FACES`. Real Rekognition indexes the largest.
- A search reports the first face declared for the image as the one it searched with. Real
  Rekognition uses the largest, and nothing here measures a face.
- `UserId` is refused on `ListFaces`, and `UnsuccessfulFaceDeletions` never reports
  `ASSOCIATED_TO_AN_EXISTING_USER`. A face is never associated with a user here. A listing narrowed
  to one would answer with the whole collection.
- A `ListFaces` page with no `MaxResults` holds the whole collection. Real Rekognition pages at a
  thousand faces. The two differ only for a collection larger than that.
- A face detection reports the emotions that were declared and no others. Real `DetectFaces` returns
  all eight emotion types every time, with the ones it failed to see at a low confidence. Declare
  the emotions the code under test reads.
- `OrientationCorrection` is left off a `DetectFaces` response, because AWS documents its value as
  always null.
- A declared bounding box has to sit inside the image. Real Rekognition can report one that spills
  over, for a face at the image edge that is only partly visible. The check is kept because it
  catches a box written in pixels.
- Landmark pairs that run across the face, such as `eyeLeft` and `eyeRight`, have to be declared in
  the order Rekognition reports them in. A face rolled past upright is the one case where that
  ordering breaks down on AWS, and it cannot be declared here.
- Yulin ships no general label ontology, because AWS's is thousands of entries with no published
  enumerable table.
- A declared label's `Parents` appear on that label alone. Real `DetectLabels` also returns each
  ancestor as a label in its own right, which needs the ontology above. Declare the ancestors as
  labels too when the code under test reads them that way.
- A declared label name goes unchecked, for the same reason. Refusing a real AWS label because a
  Yulin list was missing it would be failing closed against Yulin's own gaps.
- `DetectLabels` `Settings` filters and `IMAGE_PROPERTIES` are refused outright. Applying no filters
  would answer with labels the caller asked to have left out, and image quality and dominant colours
  would have to be invented by a simulation that looks at no images.
- A custom moderation adapter named with `ProjectVersion`, and a human review loop named with
  `HumanLoopConfig`, are both refused outright. Answering from the built-in model would make an
  adapter look applied here and be applied in production.
- `ContentTypes` is always empty. Real Rekognition puts `Animated` or `Illustrated` there for
  content it identifies as such, which needs an image to look at.
- The image is read no further than its first few bytes. A PNG of a kitten declared as `Violence`
  comes back as `Violence`, and an image no rule matches gets the built-in `Mobile Phone` result.
- The sample images are 16 by 16 pictures of coloured shapes, small enough to ship in the package.
  They are drawings rather than photographs of the things they are named for, since nothing decodes
  them.
- The format comes from the image bytes and never from a stored content type. Simulated S3 keeps a
  `ContentType` given to `PutObject` as a metadata key, and has none at all when the uploader left
  it out. Trusting it would make the same bytes detectable or not depending on how they were
  uploaded.
- A `Version` on an `Image.S3Object` is refused, because simulated S3 has no object versions and
  would have answered with the current one.
- There are no CloudFormation resource types for Rekognition, and Rekognition is not served over
  `serveSimAws`.
- The moderation taxonomy is the published version 7.0 label list. A label from version 6.1 is
  refused, since real Rekognition stopped returning one.
