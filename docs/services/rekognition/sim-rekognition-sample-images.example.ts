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

const key = `raw/${randomUUID()}.jpg`;

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
