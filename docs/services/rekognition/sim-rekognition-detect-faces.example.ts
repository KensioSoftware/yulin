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
    Key: "raw/selfie.png",
    Body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGO4I2IDAAL8AS3VzMq8AAAAAElFTkSuQmCC",
      "base64",
    ),
  }),
);

simAws
  .rekognition()
  .faces()
  .onName("raw/selfie.png", {
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
    Image: { S3Object: { Bucket: "uploads", Name: "raw/selfie.png" } },
    Attributes: ["ALL"],
  }),
);

console.log(detected.FaceDetails.length); // 1
console.log(detected.FaceDetails[0]?.AgeRange); // { Low: 18, High: 26 }
console.log(detected.FaceDetails[0]?.Smile);
// { Value: true, Confidence: 99.4000015258789 }
