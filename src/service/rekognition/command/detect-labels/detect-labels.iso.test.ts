import { DetectLabelsCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayEquals,
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
import type { SimDetectLabelsCommandOutput } from "./detect-labels.command.js";

async function simAwsWithImage(
  objectName = "cat.jpg",
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
  input: { MaxLabels?: number; MinConfidence?: number } = {},
): Promise<SimDetectLabelsCommandOutput> {
  return await simAws.rekognition().detectLabels(
    new DetectLabelsCommand({
      Image: { S3Object: { Bucket: "uploads", Name: objectName } },
      ...input,
    }),
  );
}

function labelNames(detected: SimDetectLabelsCommandOutput): string[] {
  return detected.Labels.map((label) => label.Name);
}

describe("Detecting labels in a simulated image", () => {
  it("answers with the built-in result until a rule says otherwise", async () => {
    // Given an image in a Bucket and no rules registered against it.
    const simAws = await simAwsWithImage();

    // When its labels are detected.
    const detected = await detect(simAws, "cat.jpg");

    // Then the documented AWS example response comes back, from the version
    // of the model it was published against.
    assertArrayEquals(labelNames(detected), ["Mobile Phone"]);
    assertIdentical(detected.LabelModelVersion, "3.0");

    const [label] = detected.Labels;
    assertNonNullable(label);
    assertIdentical(label.Confidence, 99.9364013671875);
    assertArrayEquals(
      label.Parents.map((parent) => parent.Name),
      ["Phone"],
    );
    assertArrayEquals(
      label.Aliases.map((alias) => alias.Name),
      ["Cell Phone"],
    );
    assertArrayEquals(
      label.Categories.map((category) => category.Name),
      ["Technology and Computing"],
    );
    assertIdentical(label.Instances[0]?.BoundingBox.Left, 0.3604024350643158);
  });

  it("answers with the labels declared for an object name", async () => {
    // Given an object declared to hold a photograph of a cat.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", {
        labels: [
          {
            name: "Cat",
            confidence: 98.2,
            parents: ["Animal", "Pet", "Feline"],
          },
        ],
      });

    // When its labels are detected.
    const detected = await detect(simAws, "cat.jpg", { MaxLabels: 10 });

    // Then the declared label comes back with what was declared alongside it.
    assertArrayEquals(labelNames(detected), ["Cat"]);
    const [cat] = detected.Labels;
    assertNonNullable(cat);
    assertIdentical(cat.Confidence, Math.fround(98.2));
    assertArrayEquals(
      cat.Parents.map((parent) => parent.Name),
      ["Animal", "Pet", "Feline"],
    );
    // Nothing is filled in from the label name, so what was not declared is
    // empty rather than guessed at from an ontology Yulin does not have.
    assertArrayLength(cat.Aliases, 0);
    assertArrayLength(cat.Categories, 0);
    assertArrayLength(cat.Instances, 0);
  });

  it("reports a label declared as a bare name", async () => {
    // Given a label declared as a name on its own.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", { labels: ["Cat"] });

    // When its labels are detected.
    const detected = await detect(simAws, "cat.jpg");

    // Then it is reported at the default confidence, which is a float32 value
    // as every real Rekognition confidence is.
    assertIdentical(detected.Labels[0]?.Confidence, Math.fround(97.530106));
  });

  it("orders labels by descending confidence", async () => {
    // Given labels declared in no particular order.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", {
        labels: [
          { name: "Pet", confidence: 71.5 },
          { name: "Cat", confidence: 98.2 },
          { name: "Grass", confidence: 88 },
        ],
      });

    // When its labels are detected.
    const detected = await detect(simAws, "cat.jpg");

    // Then the most confident label is first, as real Rekognition reports
    // them.
    assertArrayEquals(labelNames(detected), ["Cat", "Grass", "Pet"]);
  });

  it("filters labels below the requested confidence", async () => {
    // Given a confident label and a doubtful one.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", {
        labels: [
          { name: "Cat", confidence: 98.2 },
          { name: "Fence", confidence: 62 },
        ],
      });

    // When its labels are detected at a confidence above one of them.
    const detected = await detect(simAws, "cat.jpg", { MinConfidence: 80 });

    // Then the doubtful one is gone.
    assertArrayEquals(labelNames(detected), ["Cat"]);
  });

  it("filters at 55 when the request does not say", async () => {
    // Given a label below the label detection default but above the content
    // moderation one.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", { labels: [{ name: "Fence", confidence: 52 }] });

    // When its labels are detected with no MinConfidence.
    const detected = await detect(simAws, "cat.jpg");

    // Then it is filtered out, because label detection defaults to 55 rather
    // than to the 50 moderation uses.
    assertArrayLength(detected.Labels, 0);
  });

  it("returns every label when the request asks for a confidence of zero", async () => {
    // Given a label well below the default confidence.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", { labels: [{ name: "Fence", confidence: 12 }] });

    // When its labels are detected with an explicit zero rather than no value
    // at all.
    const detected = await detect(simAws, "cat.jpg", { MinConfidence: 0 });

    // Then the label survives: an explicit 0 is a request for everything, not
    // an unset value to be promoted to 55.
    assertArrayLength(detected.Labels, 1);
  });

  it("takes the most confident labels when MaxLabels caps them", async () => {
    // Given more labels than the request wants back.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", {
        labels: [
          { name: "Pet", confidence: 71.5 },
          { name: "Cat", confidence: 98.2 },
          { name: "Grass", confidence: 88 },
        ],
      });

    // When its labels are detected with room for two.
    const detected = await detect(simAws, "cat.jpg", { MaxLabels: 2 });

    // Then the two most confident come back, which is what AWS documents
    // MaxLabels as returning.
    assertArrayEquals(labelNames(detected), ["Cat", "Grass"]);
  });

  it("applies MaxLabels after the confidence filter", async () => {
    // Given a confident label, a doubtful one, and a request that would fit
    // both.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", {
        labels: [
          { name: "Cat", confidence: 98.2 },
          { name: "Fence", confidence: 62 },
          { name: "Grass", confidence: 88 },
        ],
      });

    // When its labels are detected with a confidence one of them fails.
    const detected = await detect(simAws, "cat.jpg", {
      MaxLabels: 2,
      MinConfidence: 80,
    });

    // Then the room is spent on labels that survived the filter rather than
    // on labels that then filtered out.
    assertArrayEquals(labelNames(detected), ["Cat", "Grass"]);
  });

  it("answers with nothing when the request asks for no labels", async () => {
    // Given a declared label.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", { labels: ["Cat"] });

    // When its labels are detected with an explicit MaxLabels of zero.
    const detected = await detect(simAws, "cat.jpg", { MaxLabels: 0 });

    // Then no labels come back: an explicit 0 is a request for none, not an
    // unset value to be read as uncapped.
    assertArrayLength(detected.Labels, 0);
  });

  it("reports the instances a label was declared with", async () => {
    // Given a label declared with two of the object in the image.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", {
        labels: [
          {
            name: "Cat",
            confidence: 98.2,
            instances: [
              {
                boundingBox: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 },
                confidence: 96.5,
              },
              {
                boundingBox: { left: 0.5, top: 0.2, width: 0.3, height: 0.4 },
              },
            ],
          },
        ],
      });

    // When its labels are detected.
    const detected = await detect(simAws, "cat.jpg");

    // Then both instances are located, and the one with no confidence of its
    // own takes the label's, since a cat detected at 98 is not located at 40.
    const [cat] = detected.Labels;
    assertNonNullable(cat);
    assertArrayLength(cat.Instances, 2);
    assertIdentical(cat.Instances[0].Confidence, Math.fround(96.5));
    assertIdentical(cat.Instances[0].BoundingBox.Height, Math.fround(0.4));
    assertIdentical(cat.Instances[1].Confidence, Math.fround(98.2));
  });

  it("matches an image by content hash whatever it is called", async () => {
    // Given a rule for the hash of some image bytes, and an object storing
    // those bytes under a name nothing was declared for.
    const simAws = await simAwsWithImage("2f9c1e40-uuid.png", bluePngBytes);
    simAws
      .rekognition()
      .labels()
      .onHash(simRekognitionImageHash(bluePngBytes), { labels: ["Cat"] });

    // When its labels are detected.
    const detected = await detect(simAws, "2f9c1e40-uuid.png");

    // Then the hash rule answers, which is what makes a system that generates
    // its own object keys testable.
    assertArrayEquals(labelNames(detected), ["Cat"]);
  });

  it("consults hash rules and the default for an image passed as bytes", async () => {
    // Given a name rule, a hash rule and a default.
    const simAws = new SimAws();
    const labels = simAws.rekognition().labels();
    labels.byDefault({ labels: ["Grass"] });
    labels.onName("cat.jpg", { labels: ["Cat"] });
    labels.onHash(simRekognitionImageHash(bluePngBytes), { labels: ["Cat"] });

    // When images are detected as bytes rather than as S3 objects.
    const hashed = await simAws
      .rekognition()
      .detectLabels(
        new DetectLabelsCommand({ Image: { Bytes: bluePngBytes } }),
      );
    const unknown = await simAws
      .rekognition()
      .detectLabels(new DetectLabelsCommand({ Image: { Bytes: redPngBytes } }));

    // Then the hash rule matches and the default answers for the rest, since
    // bytes have no name for a name rule to match.
    assertArrayEquals(labelNames(hashed), ["Cat"]);
    assertArrayEquals(labelNames(unknown), ["Grass"]);
  });

  it("keeps label rules apart from moderation rules", async () => {
    // Given an object declared to hold a cat and to fail moderation.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("cat.jpg", { labels: ["Cat"] });
    simAws
      .rekognition()
      .moderation()
      .onName("cat.jpg", { labels: ["Weapons"] });

    // When its labels are detected.
    const detected = await detect(simAws, "cat.jpg");

    // Then it answers from the label rules alone, since each operation owns
    // the result shape it answers with.
    assertArrayEquals(labelNames(detected), ["Cat"]);
  });

  it("keeps rules to the Account and Region they were registered in", async () => {
    // Given a rule registered in one Region only.
    const simAws = new SimAws();
    simAws
      .rekognition()
      .labels()
      .byDefault({ labels: ["Cat"] });

    // When labels are detected in another Region.
    const elsewhere = await simAws
      .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
      .rekognition()
      .detectLabels(new DetectLabelsCommand({ Image: { Bytes: redPngBytes } }));

    // Then that Region answers from its own rules, as a real Rekognition
    // endpoint answers for the Region it belongs to.
    assertArrayEquals(labelNames(elsewhere), ["Mobile Phone"]);
  });
});
