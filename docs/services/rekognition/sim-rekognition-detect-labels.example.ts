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
