import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  bluePngBytes,
  redPngBytes,
} from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simRekognitionImageHash } from "../../image/sim-rekognition-image-hash.js";
import type { SimDetectModerationLabelsCommandOutput } from "./detect-moderation-labels.command.js";

async function simAwsWithImage(
  objectName = "selfie.png",
  bytes = redPngBytes,
): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
  await simAws
    .s3()
    .putObject(
      new PutObjectCommand({ Bucket: "uploads", Key: objectName, Body: bytes }),
    );

  return simAws;
}

async function detect(
  simAws: SimAws,
  objectName: string,
  minConfidence?: number,
): Promise<SimDetectModerationLabelsCommandOutput> {
  return await simAws.rekognition().detectModerationLabels(
    new DetectModerationLabelsCommand({
      Image: { S3Object: { Bucket: "uploads", Name: objectName } },
      ...(minConfidence !== undefined && { MinConfidence: minConfidence }),
    }),
  );
}

describe("Detecting moderation labels in a simulated image", () => {
  it("reports an image as clean until a rule says otherwise", async () => {
    // Given an image in a Bucket and no rules registered against it.
    const simAws = await simAwsWithImage();

    // When it is moderated.
    const detected = await detect(simAws, "selfie.png");

    // Then it comes back clean, from the version of the model whose taxonomy
    // the labels would have come from.
    assertArrayEmpty(detected.ModerationLabels);
    assertIdentical(detected.ModerationModelVersion, "7.0");
    assertArrayEmpty(detected.ContentTypes);
  });

  it("answers with the labels declared for an object name", async () => {
    // Given an object declared to fail moderation.
    const simAws = await simAwsWithImage("photo.png");
    simAws
      .rekognition()
      .moderation()
      .onName("photo.png", { labels: ["Weapons"] });

    // When it is moderated.
    const detected = await detect(simAws, "photo.png");

    // Then the declared label comes back with the category above it, as real
    // Rekognition returns a detected label with its whole chain.
    assertArrayLength(detected.ModerationLabels, 2);
    const [top, declared] = detected.ModerationLabels;
    assertNonNullable(top);
    assertNonNullable(declared);
    assertIdentical(top.Name, "Violence");
    assertIdentical(top.ParentName, "");
    assertIdentical(top.TaxonomyLevel, 1);
    assertIdentical(declared.Name, "Weapons");
    assertIdentical(declared.ParentName, "Violence");
    assertIdentical(declared.TaxonomyLevel, 2);
  });

  it("expands a third level label to both labels above it", async () => {
    // Given an object declared with a third level label.
    const simAws = await simAwsWithImage("party.png");
    simAws
      .rekognition()
      .moderation()
      .onName("party.png", { labels: ["Drinking"] });

    // When it is moderated.
    const detected = await detect(simAws, "party.png");

    // Then all three levels of the chain come back.
    assertIdentical(
      detected.ModerationLabels.map((label) => label.Name).join(" / "),
      "Alcohol / Alcohol Use / Drinking",
    );
    assertIdentical(
      detected.ModerationLabels.map((label) => label.TaxonomyLevel).join(","),
      "1,2,3",
    );
  });

  it("reports a shared parent once, at the higher confidence", async () => {
    // Given an object declared with two labels under one parent, one of them
    // more confident than the other.
    const simAws = await simAwsWithImage("fight.png");
    simAws
      .rekognition()
      .moderation()
      .onName("fight.png", {
        labels: [
          { name: "Physical Violence", confidence: 82 },
          { name: "Blood & Gore", confidence: 91 },
        ],
      });

    // When it is moderated.
    const detected = await detect(simAws, "fight.png");

    // Then the parent appears once, as confidently as its most confident
    // child, which is what keeps it from being filtered out from under one.
    const violence = detected.ModerationLabels.filter(
      (label) => label.Name === "Graphic Violence",
    );
    assertArrayLength(violence, 1);
    assertIdentical(violence[0].Confidence, Math.fround(91));
  });

  it("reports a shared parent at the highest confidence whatever order the labels were declared in", async () => {
    // Given the same two labels declared with the confident one first.
    const simAws = await simAwsWithImage("brawl.png");
    simAws
      .rekognition()
      .moderation()
      .onName("brawl.png", {
        labels: [
          { name: "Blood & Gore", confidence: 91 },
          { name: "Physical Violence", confidence: 82 },
        ],
      });

    // When it is moderated.
    const detected = await detect(simAws, "brawl.png");

    // Then the parent still carries the higher of the two confidences.
    const violence = detected.ModerationLabels.filter(
      (label) => label.Name === "Graphic Violence",
    );
    assertArrayLength(violence, 1);
    assertIdentical(violence[0].Confidence, Math.fround(91));
  });

  it("filters whole chains below the requested confidence", async () => {
    // Given an object declared with a confident label and a doubtful one.
    const simAws = await simAwsWithImage("mixed.png");
    simAws
      .rekognition()
      .moderation()
      .onName("mixed.png", {
        labels: [
          { name: "Weapons", confidence: 96 },
          { name: "Gambling", confidence: 41 },
        ],
      });

    // When it is moderated at the default confidence.
    const detected = await detect(simAws, "mixed.png");

    // Then the doubtful chain is gone entirely, so no surviving label names a
    // parent that is not there.
    assertIdentical(
      detected.ModerationLabels.map((label) => label.Name).join(" / "),
      "Violence / Weapons",
    );
  });

  it("returns every label when the request asks for a confidence of zero", async () => {
    // Given an object declared with a label below the default confidence.
    const simAws = await simAwsWithImage("maybe.png");
    simAws
      .rekognition()
      .moderation()
      .onName("maybe.png", { labels: [{ name: "Gambling", confidence: 41 }] });

    // When it is moderated with an explicit zero rather than no value at all.
    const detected = await detect(simAws, "maybe.png", 0);

    // Then the label survives: an explicit 0 is a request for everything, not
    // an unset value to be promoted to the default of 50.
    assertArrayLength(detected.ModerationLabels, 1);
  });

  it("reports confidences as the float32 values real Rekognition returns", async () => {
    // Given an object declared with a confidence that is not exact in float32.
    const simAws = await simAwsWithImage("smoke.png");
    simAws
      .rekognition()
      .moderation()
      .onName("smoke.png", { labels: [{ name: "Smoking", confidence: 99.4 }] });

    // When it is moderated.
    const detected = await detect(simAws, "smoke.png");

    // Then the confidence carries the trailing digits a real response has,
    // rather than a rounded number no model would produce.
    assertIdentical(detected.ModerationLabels[0]?.Confidence, 99.4000015258789);
  });

  it("matches an image by content hash whatever it is called", async () => {
    // Given a rule for the hash of some image bytes, and an object storing
    // those bytes under a name nothing was declared for.
    const simAws = await simAwsWithImage("2f9c1e40-uuid.png", bluePngBytes);
    simAws
      .rekognition()
      .moderation()
      .onHash(simRekognitionImageHash(bluePngBytes), {
        labels: ["Violence"],
      });

    // When it is moderated.
    const detected = await detect(simAws, "2f9c1e40-uuid.png");

    // Then the hash rule answers, which is what makes a system that generates
    // its own object keys testable.
    assertIdentical(detected.ModerationLabels[0]?.Name, "Violence");
  });

  it("prefers a hash rule to a name rule for the same image", async () => {
    // Given an object matched by both a name rule and a hash rule.
    const simAws = await simAwsWithImage("photo.png");
    const moderation = simAws.rekognition().moderation();
    moderation.onName("photo.png", { labels: ["Gambling"] });
    moderation.onHash(simRekognitionImageHash(redPngBytes), {
      labels: ["Violence"],
    });

    // When it is moderated.
    const detected = await detect(simAws, "photo.png");

    // Then the hash rule wins, being about the image itself rather than about
    // what it happens to be called.
    assertIdentical(detected.ModerationLabels[0]?.Name, "Violence");
  });

  it("consults hash rules and the default for an image passed as bytes", async () => {
    // Given a name rule, a hash rule and a default.
    const simAws = new SimAws();
    const moderation = simAws.rekognition().moderation();
    moderation.byDefault({ labels: ["Gambling"] });
    moderation.onName("selfie.png", { labels: ["Violence"] });
    moderation.onHash(simRekognitionImageHash(bluePngBytes), {
      labels: ["Weapons"],
    });

    // When images are moderated as bytes rather than as S3 objects.
    const hashed = await simAws
      .rekognition()
      .detectModerationLabels(
        new DetectModerationLabelsCommand({ Image: { Bytes: bluePngBytes } }),
      );
    const unknown = await simAws
      .rekognition()
      .detectModerationLabels(
        new DetectModerationLabelsCommand({ Image: { Bytes: redPngBytes } }),
      );

    // Then the hash rule matches and the default answers for the rest, since
    // bytes have no name for a name rule to match.
    assertIdentical(hashed.ModerationLabels.at(-1)?.Name, "Weapons");
    assertIdentical(unknown.ModerationLabels.at(-1)?.Name, "Gambling");
  });

  it("keeps rules to the Account and Region they were registered in", async () => {
    // Given a rule registered in one Region only.
    const simAws = new SimAws();
    simAws
      .rekognition()
      .moderation()
      .byDefault({ labels: ["Gambling"] });

    // When an image is moderated in another Region.
    const elsewhere = await simAws
      .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
      .rekognition()
      .detectModerationLabels(
        new DetectModerationLabelsCommand({ Image: { Bytes: redPngBytes } }),
      );

    // Then that Region answers from its own rules, as a real Rekognition
    // endpoint answers for the Region it belongs to.
    assertArrayEmpty(elsewhere.ModerationLabels);
  });
});
