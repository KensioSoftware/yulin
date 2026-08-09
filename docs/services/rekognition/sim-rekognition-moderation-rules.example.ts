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
