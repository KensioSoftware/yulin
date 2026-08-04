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
