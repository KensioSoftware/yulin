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
