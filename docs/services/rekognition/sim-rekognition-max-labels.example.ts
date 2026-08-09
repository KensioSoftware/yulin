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
