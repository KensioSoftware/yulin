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
