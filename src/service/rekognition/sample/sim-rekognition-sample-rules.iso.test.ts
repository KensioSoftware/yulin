import { randomUUID } from "node:crypto";

import {
  DetectFacesCommand,
  DetectModerationLabelsCommand,
} from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simRekognitionImageHash } from "../image/sim-rekognition-image-hash.js";
import { simRekognitionSampleImages } from "./sim-rekognition-sample-images.js";

/**
 * Upload a sample image under a key the application invented, which is the
 * case the sample images exist for.
 */
async function upload(simAws: SimAws, body: Uint8Array): Promise<string> {
  const key = randomUUID();

  await simAws
    .s3()
    .putObject(
      new PutObjectCommand({ Bucket: "uploads", Key: key, Body: body }),
    );

  return key;
}

async function simAwsWithBucket(): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

  return simAws;
}

async function moderate(
  simAws: SimAws,
  key: string,
): Promise<readonly string[]> {
  const detected = await simAws.rekognition().detectModerationLabels(
    new DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: "uploads", Name: key } },
    }),
  );

  return detected.ModerationLabels.map((label) => label.Name);
}

async function faceCount(simAws: SimAws, key: string): Promise<number> {
  const detected = await simAws.rekognition().detectFaces(
    new DetectFacesCommand({
      Image: { S3Object: { Bucket: "uploads", Name: key } },
    }),
  );

  return detected.FaceDetails.length;
}

describe("Detecting on a simulated Rekognition sample image", () => {
  it("flags the flagged image under a key nothing was declared for", async () => {
    // Given the flagged sample image, uploaded under a generated key.
    const simAws = await simAwsWithBucket();
    const key = await upload(
      simAws,
      simRekognitionSampleImages.flaggedByModeration(),
    );

    // When it is moderated.
    const labels = await moderate(simAws, key);

    // Then it fails, with the chain above the label it was declared as, and
    // the test never had to name the key or hash anything.
    assertArrayEquals(labels, [
      "Violence",
      "Graphic Violence",
      "Weapon Violence",
    ]);
  });

  it("keeps the clean image clean when the default says otherwise", async () => {
    // Given a test that declared every other image as failing moderation.
    const simAws = await simAwsWithBucket();
    simAws
      .rekognition()
      .moderation()
      .byDefault({ labels: ["Weapon Violence"] });
    const key = await upload(
      simAws,
      simRekognitionSampleImages.passesModeration(),
    );

    // When the clean sample image is moderated.
    const labels = await moderate(simAws, key);

    // Then it is still clean: it has a hash rule of its own, and a hash rule
    // wins over the default.
    assertArrayEmpty(labels);
  });

  it("answers with the faces each face sample was declared to hold", async () => {
    // Given the three face sample images, uploaded under generated keys.
    const simAws = await simAwsWithBucket();
    const empty = await upload(simAws, simRekognitionSampleImages.noFaces());
    const one = await upload(simAws, simRekognitionSampleImages.oneFace());
    const several = await upload(
      simAws,
      simRekognitionSampleImages.severalFaces(),
    );

    // When faces are detected in each.
    // Then each answers with what it is named for.
    assertIdentical(await faceCount(simAws, empty), 0);
    assertIdentical(await faceCount(simAws, one), 1);
    assertIdentical(await faceCount(simAws, several), 3);
  });

  it("leaves the operations a sample says nothing about to their own rules", async () => {
    // Given a face sample image uploaded under a generated key.
    const simAws = await simAwsWithBucket();
    const key = await upload(simAws, simRekognitionSampleImages.severalFaces());

    // When it is moderated rather than detected for faces.
    const labels = await moderate(simAws, key);

    // Then moderation answers from its own rules, which report a clean image
    // until a test says otherwise.
    assertArrayEmpty(labels);
  });

  it("is overridden by a rule registered for the same image", async () => {
    // Given a test that declared the flagged sample image as clean.
    const simAws = await simAwsWithBucket();
    const bytes = simRekognitionSampleImages.flaggedByModeration();
    simAws
      .rekognition()
      .moderation()
      .onHash(simRekognitionImageHash(bytes), { labels: [] });
    const key = await upload(simAws, bytes);

    // When it is moderated.
    const labels = await moderate(simAws, key);

    // Then the test's rule answers. The built-in rules are ordinary hash
    // rules, so registering one for the same image replaces it.
    assertArrayEmpty(labels);
  });

  it("ships the built-in rules with every Account and Region", async () => {
    // Given a Rekognition in another Region, which nothing was declared
    // against.
    const simAws = new SimAws();

    // When the flagged sample image is moderated there, as bytes.
    const detected = await simAws
      .account("111111111111")
      .region("eu-west-2")
      .rekognition()
      .detectModerationLabels(
        new DetectModerationLabelsCommand({
          Image: { Bytes: simRekognitionSampleImages.flaggedByModeration() },
        }),
      );

    // Then it fails there too, since each scope registers the built-in rules
    // for itself.
    assertArrayLength(detected.ModerationLabels, 3);
  });
});
