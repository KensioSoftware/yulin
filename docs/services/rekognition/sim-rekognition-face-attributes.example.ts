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
