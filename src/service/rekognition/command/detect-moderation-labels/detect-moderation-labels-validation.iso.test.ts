import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  jpegBytes,
  redPngBytes,
} from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimRekognition } from "../../sim-rekognition.js";
import {
  SimRekognitionError,
  SimRekognitionInvalidImageFormatException,
  SimRekognitionInvalidParameterException,
  SimRekognitionInvalidS3ObjectException,
  SimRekognitionUnsimulatedInputException,
} from "../../error/sim-rekognition.error.js";

async function simAwsWithObject(body: Uint8Array | string): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "uploads",
      Key: "selfie.png",
      Body: body,
    }),
  );

  return simAws;
}

describe("Rejecting a malformed DetectModerationLabels request", () => {
  it("requires an image", async () => {
    // Given a simulated Rekognition.
    const simAws = new SimAws();

    // When a request names no image at all. The SDK's own types require one,
    // so this is the shape a JavaScript caller can still send.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels({ input: {} }),
    );

    // Then it is refused as an invalid parameter, as real Rekognition
    // refuses it.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "Image is required");
  });

  it("refuses an image carrying both bytes and an S3 object", async () => {
    // Given an image named both ways at once.
    const simAws = new SimAws();

    // When it is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: {
              Bytes: redPngBytes,
              S3Object: { Bucket: "uploads", Name: "selfie.png" },
            },
          }),
        ),
    );

    // Then it is refused rather than one of the two being picked.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "not both");
  });

  it("refuses an image carrying neither bytes nor an S3 object", async () => {
    // Given an empty image.
    const simAws = new SimAws();

    // When it is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .rekognition()
          .detectModerationLabels(
            new DetectModerationLabelsCommand({ Image: {} }),
          ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "either Bytes or S3Object");
  });

  it("refuses an S3 object missing its Bucket or Name", async () => {
    // Given an S3 object named without a key.
    const simAws = new SimAws();

    // When it is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: { S3Object: { Bucket: "uploads" } },
          }),
        ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "both Bucket and Name");
  });

  it("refuses a MinConfidence outside 0 to 100", async () => {
    // Given a request asking for an impossible confidence.
    const simAws = new SimAws();

    // When it is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: { Bytes: redPngBytes },
            MinConfidence: 140,
          }),
        ),
    );

    // Then it is refused, rather than being clamped into range.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "percentage from 0 to 100");
  });

  it("refuses a request naming a custom moderation adapter", async () => {
    // Given a request naming a ProjectVersion, which is a trained adapter.
    const simAws = new SimAws();

    // When it is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: { Bytes: redPngBytes },
            ProjectVersion: "arn:aws:rekognition:us-east-1:1:project/x/1",
          }),
        ),
    );

    // Then it is refused by name, because answering from the built-in model
    // would make the adapter look applied here and be applied in production.
    assertInstanceOf(error, SimRekognitionUnsimulatedInputException);
    assertStringIncludes(error.message, "ProjectVersion is not simulated");
  });

  it("refuses a request asking for a human review loop", async () => {
    // Given a request naming a HumanLoopConfig.
    const simAws = new SimAws();

    // When it is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: { Bytes: redPngBytes },
            HumanLoopConfig: {
              HumanLoopName: "review",
              FlowDefinitionArn: "arn:aws:sagemaker:us-east-1:1:flow/x",
            },
          }),
        ),
    );

    // Then it is refused, so no response carries a HumanLoopActivationOutput
    // this simulation would have had to invent.
    assertInstanceOf(error, SimRekognitionUnsimulatedInputException);
    assertStringIncludes(error.message, "HumanLoopConfig is not simulated");
  });

  it("refuses an S3 object version", async () => {
    // Given a request naming a version of an S3 object.
    const simAws = await simAwsWithObject(redPngBytes);

    // When it is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: {
              S3Object: {
                Bucket: "uploads",
                Name: "selfie.png",
                Version: "3",
              },
            },
          }),
        ),
    );

    // Then it is refused, since simulated S3 has no object versions and would
    // have answered with the current one.
    assertInstanceOf(error, SimRekognitionUnsimulatedInputException);
    assertStringIncludes(error.message, "Version is not simulated");
  });
});

describe("Reading a simulated image Rekognition cannot use", () => {
  it("refuses bytes that are not a PNG or a JPEG", async () => {
    // Given an Object holding a placeholder string rather than an image.
    const simAws = await simAwsWithObject("cat picture");

    // When it is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: { S3Object: { Bucket: "uploads", Name: "selfie.png" } },
          }),
        ),
    );

    // Then the format is refused, as real Rekognition refuses anything that
    // is not one of the two formats it reads.
    assertInstanceOf(error, SimRekognitionInvalidImageFormatException);
    assertStringIncludes(error.message, "neither PNG nor JPEG");
  });

  it("accepts JPEG bytes as readily as PNG bytes", async () => {
    // Given a JPEG.
    const simAws = new SimAws();

    // When it is moderated.
    const detected = await simAws
      .rekognition()
      .detectModerationLabels(
        new DetectModerationLabelsCommand({ Image: { Bytes: jpegBytes } }),
      );

    // Then the format is identified from the bytes and the detection runs.
    assertStringIncludes(detected.ModerationModelVersion, "7.");
  });

  it("reports an unknown Bucket as an S3 object problem", async () => {
    // Given no Bucket of that name anywhere in the simulation.
    const simAws = new SimAws();

    // When an image in it is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: { S3Object: { Bucket: "nowhere", Name: "selfie.png" } },
          }),
        ),
    );

    // Then it is an S3 object error, which is how real Rekognition reports
    // every S3 problem.
    assertInstanceOf(error, SimRekognitionInvalidS3ObjectException);
    assertStringIncludes(error.message, "Unable to get object metadata");
  });

  it("reports a missing object with the underlying error as its cause", async () => {
    // Given a Bucket with nothing of that name in it.
    const simAws = await simAwsWithObject(redPngBytes);

    // When a missing object is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: { S3Object: { Bucket: "uploads", Name: "missing.png" } },
          }),
        ),
    );

    // Then the S3 error is kept as the cause, so what actually went wrong is
    // still readable from what was thrown.
    assertInstanceOf(error, SimRekognitionInvalidS3ObjectException);
    assertInstanceOf(error.cause, Error);
    assertStringIncludes(error.cause.name, "NoSuchKey");
  });

  it("refuses a Bucket in another Region", async () => {
    // Given a Bucket created in another Region.
    const simAws = new SimAws();
    await simAws
      .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "elsewhere" }));

    // When an image in it is moderated from this Region.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: { S3Object: { Bucket: "elsewhere", Name: "selfie.png" } },
          }),
        ),
    );

    // Then it is refused, as real Rekognition reads only Buckets in its own
    // Region, and the message says where the Bucket actually is.
    assertInstanceOf(error, SimRekognitionInvalidS3ObjectException);
    assertStringIncludes(error.message, "the Bucket is in eu-west-2");
  });

  it("says so when a standalone Rekognition has no S3 to read from", async () => {
    // Given a Rekognition built on its own rather than through SimAws.
    const simRekognition = new SimRekognition();

    // When an S3 object is moderated.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simRekognition.detectModerationLabels(
          new DetectModerationLabelsCommand({
            Image: { S3Object: { Bucket: "uploads", Name: "selfie.png" } },
          }),
        ),
    );

    // Then the wiring is named rather than the object being reported missing.
    assertInstanceOf(error, SimRekognitionError);
    assertStringIncludes(error.message, "built without simulated S3");
  });

  it("moderates bytes without any simulated S3 at all", async () => {
    // Given a Rekognition built on its own.
    const simRekognition = new SimRekognition();
    simRekognition.moderation().byDefault({ labels: ["Gambling"] });

    // When an image is moderated as bytes.
    const detected = await simRekognition.detectModerationLabels(
      new DetectModerationLabelsCommand({ Image: { Bytes: redPngBytes } }),
    );

    // Then it answers, since nothing needed reading.
    assertStringIncludes(detected.ModerationLabels[0]?.Name ?? "", "Gambling");
  });
});
