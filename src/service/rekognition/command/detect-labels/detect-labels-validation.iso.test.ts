import { DetectLabelsCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { redPngBytes } from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimRekognition } from "../../sim-rekognition.js";
import {
  SimRekognitionInvalidImageFormatException,
  SimRekognitionInvalidParameterException,
  SimRekognitionInvalidS3ObjectException,
  SimRekognitionUnsimulatedInputException,
} from "../../error/sim-rekognition.error.js";
import type { SimDetectLabelsCommandInput } from "./detect-labels.command.js";

async function detectFailure(
  input: SimDetectLabelsCommandInput,
  simAws = new SimAws(),
): Promise<Error> {
  return await assertThrowsErrorAsync(
    async () => await simAws.rekognition().detectLabels({ input }),
  );
}

describe("Rejecting a malformed DetectLabels request", () => {
  it("requires an image", async () => {
    // Given a request naming no image at all. The SDK's own types require
    // one, so this is the shape a JavaScript caller can still send.
    // When its labels are detected.
    const error = await detectFailure({});

    // Then it is refused as an invalid parameter, as real Rekognition
    // refuses it.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "Image is required");
  });

  it("refuses a MinConfidence outside 0 to 100", async () => {
    // Given a request asking for an impossible confidence.
    // When its labels are detected.
    const error = await detectFailure({
      Image: { Bytes: redPngBytes },
      MinConfidence: 140,
    });

    // Then it is refused, rather than being clamped into range.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "percentage from 0 to 100");
  });

  it("refuses a MaxLabels below zero", async () => {
    // Given a request asking for a negative number of labels.
    // When its labels are detected.
    const error = await detectFailure({
      Image: { Bytes: redPngBytes },
      MaxLabels: -1,
    });

    // Then it is refused, as real Rekognition refuses anything below its
    // minimum of zero.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "whole number of labels");
  });

  it("refuses a MaxLabels that is not a whole number", async () => {
    // Given a request asking for two and a half labels.
    // When its labels are detected.
    const error = await detectFailure({
      Image: { Bytes: redPngBytes },
      MaxLabels: 2.5,
    });

    // Then it is refused rather than rounded, since MaxLabels is an integer
    // on real Rekognition.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "whole number of labels");
  });

  it("refuses a request asking for image properties", async () => {
    // Given a request asking for the quality and colours of the image.
    // When its labels are detected.
    const error = await detectFailure({
      Image: { Bytes: redPngBytes },
      Features: ["GENERAL_LABELS", "IMAGE_PROPERTIES"],
    });

    // Then it is refused by name, because nothing here looks at the image and
    // an invented sharpness would read as a measured one.
    assertInstanceOf(error, SimRekognitionUnsimulatedInputException);
    assertStringIncludes(error.message, "IMAGE_PROPERTIES is not simulated");
  });

  it("refuses a feature Rekognition does not have", async () => {
    // Given a request naming a feature that is not one of the two.
    // When its labels are detected.
    const error = await detectFailure({
      Image: { Bytes: redPngBytes },
      Features: ["FACE_PROPERTIES"],
    });

    // Then it is refused as an invalid parameter, as real Rekognition
    // refuses a value outside the enumeration.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "neither GENERAL_LABELS nor");
  });

  it("detects labels for a request asking for them explicitly", async () => {
    // Given a request naming the feature that is simulated.
    const simAws = new SimAws();

    // When its labels are detected.
    const detected = await simAws.rekognition().detectLabels(
      new DetectLabelsCommand({
        Image: { Bytes: redPngBytes },
        Features: ["GENERAL_LABELS"],
      }),
    );

    // Then it answers as a request naming no features at all does, since
    // GENERAL_LABELS is what AWS uses when nothing is named.
    assertArrayLength(detected.Labels, 1);
  });

  it("refuses a request filtering labels through Settings", async () => {
    // Given a request naming label filters.
    const simAws = new SimAws();

    // When its labels are detected.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectLabels(
          new DetectLabelsCommand({
            Image: { Bytes: redPngBytes },
            Settings: { GeneralLabels: { LabelInclusionFilters: ["Cat"] } },
          }),
        ),
    );

    // Then it is refused rather than ignored, because unapplied filters would
    // answer with labels the caller asked to have left out.
    assertInstanceOf(error, SimRekognitionUnsimulatedInputException);
    assertStringIncludes(error.message, "Settings is not simulated");
  });

  it("refuses an S3 object version, naming the operation that sent it", async () => {
    // Given an object and a request naming a version of it.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "dog.jpg",
        Body: redPngBytes,
      }),
    );

    // When its labels are detected.
    const error = await detectFailure(
      {
        Image: {
          S3Object: { Bucket: "uploads", Name: "dog.jpg", Version: "3" },
        },
      },
      simAws,
    );

    // Then it is refused, and the refusal names DetectLabels rather than the
    // other operation that shares the image member.
    assertInstanceOf(error, SimRekognitionUnsimulatedInputException);
    assertStringIncludes(error.message, "DetectLabels S3Object Version");
  });
});

describe("Detecting labels in an image Rekognition cannot use", () => {
  it("refuses bytes that are not a PNG or a JPEG", async () => {
    // Given an Object holding a placeholder string rather than an image.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "dog.jpg",
        Body: "dog picture",
      }),
    );

    // When its labels are detected.
    const error = await detectFailure(
      { Image: { S3Object: { Bucket: "uploads", Name: "dog.jpg" } } },
      simAws,
    );

    // Then the format is refused, as real Rekognition refuses anything that
    // is not one of the two formats it reads.
    assertInstanceOf(error, SimRekognitionInvalidImageFormatException);
    assertStringIncludes(error.message, "neither PNG nor JPEG");
  });

  it("reports an unknown Bucket as an S3 object problem", async () => {
    // Given no Bucket of that name anywhere in the simulation.
    // When labels in an image in it are detected.
    const error = await detectFailure({
      Image: { S3Object: { Bucket: "nowhere", Name: "dog.jpg" } },
    });

    // Then it is an S3 object error, which is how real Rekognition reports
    // every S3 problem.
    assertInstanceOf(error, SimRekognitionInvalidS3ObjectException);
  });

  it("detects labels in bytes without any simulated S3 at all", async () => {
    // Given a Rekognition built on its own rather than through SimAws.
    const simRekognition = new SimRekognition();
    simRekognition.labels().byDefault({ labels: ["Dog"] });

    // When labels are detected in bytes.
    const detected = await simRekognition.detectLabels(
      new DetectLabelsCommand({ Image: { Bytes: redPngBytes } }),
    );

    // Then it answers, since nothing needed reading.
    assertIdentical(detected.Labels[0]?.Name, "Dog");
  });
});
