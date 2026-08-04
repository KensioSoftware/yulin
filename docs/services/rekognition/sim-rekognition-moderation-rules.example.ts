/**
 * The three kinds of rule, and which one wins.
 */

import { readFileSync } from "node:fs";

import { SimAws } from "@kensio/yulin";
import { simRekognitionImageHash } from "@kensio/yulin/rekognition";

const simAws = new SimAws();
const moderation = simAws.rekognition().moderation();

// Everything not matched by another rule.
moderation.byDefault({ labels: [] });

// One S3 object, by the Name a request gives Rekognition.
moderation.onName("raw/nsfw.png", { labels: ["Explicit Nudity"] });

// One image, by the hash of its bytes, for a system that generates its own
// object keys.
const fixture = readFileSync("test/fixtures/violent.jpg");
moderation.onHash(simRekognitionImageHash(fixture), {
  labels: [{ name: "Weapon Violence", confidence: 88.4 }],
});
