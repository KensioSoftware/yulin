import { DetectFacesCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { redPngBytes } from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimRekognitionInvalidImageFormatException,
  SimRekognitionInvalidParameterException,
  SimRekognitionInvalidS3ObjectException,
  SimRekognitionUnsimulatedInputException,
} from "../../error/sim-rekognition.error.js";
import { SimRekognition } from "../../sim-rekognition.js";
import type { SimDetectFacesCommandInput } from "./detect-faces.command.js";

async function detectFailure(
  input: SimDetectFacesCommandInput,
  simAws = new SimAws(),
): Promise<Error> {
  return await assertThrowsErrorAsync(
    async () => await simAws.rekognition().detectFaces({ input }),
  );
}

describe("Rejecting a malformed DetectFaces request", () => {
  it("requires an image", async () => {
    // Given a request naming no image at all. The SDK's own types require
    // one, so this is the shape a JavaScript caller can still send.
    // When its faces are detected.
    const error = await detectFailure({});

    // Then it is refused as an invalid parameter, as real Rekognition
    // refuses it.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "Image is required");
  });

  it("refuses an attribute Rekognition does not report", async () => {
    // Given a request asking for an attribute outside the enumeration.
    // When its faces are detected.
    const error = await detectFailure({
      Image: { Bytes: redPngBytes },
      Attributes: ["ALL", "HAIR_COLOUR"],
    });

    // Then it is refused, as real Rekognition refuses a value that is not one
    // of the ones it accepts.
    assertInstanceOf(error, SimRekognitionInvalidParameterException);
    assertStringIncludes(error.message, "HAIR_COLOUR");
  });

  it("refuses an input this simulation does not model", async () => {
    // Given a request carrying an option DetectFaces does not take.
    // When its faces are detected.
    const error = await detectFailure({
      Image: { Bytes: redPngBytes },
      QualityFilter: "HIGH",
    } as SimDetectFacesCommandInput);

    // Then it is refused by name rather than dropped, since a dropped option
    // looks applied to the request that sent it.
    assertInstanceOf(error, SimRekognitionUnsimulatedInputException);
    assertStringIncludes(error.message, "DetectFaces QualityFilter");
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
        Key: "selfie.jpg",
        Body: redPngBytes,
      }),
    );

    // When its faces are detected.
    const error = await detectFailure(
      {
        Image: {
          S3Object: { Bucket: "uploads", Name: "selfie.jpg", Version: "3" },
        },
      },
      simAws,
    );

    // Then it is refused, and the refusal names DetectFaces rather than
    // whichever operation shares the image member.
    assertInstanceOf(error, SimRekognitionUnsimulatedInputException);
    assertStringIncludes(error.message, "DetectFaces S3Object Version");
  });
});

describe("Detecting faces in an image Rekognition cannot use", () => {
  it("refuses bytes that are not a PNG or a JPEG", async () => {
    // Given an Object holding a placeholder string rather than an image.
    const simAws = new SimAws();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "selfie.jpg",
        Body: "face picture",
      }),
    );

    // When its faces are detected.
    const error = await detectFailure(
      { Image: { S3Object: { Bucket: "uploads", Name: "selfie.jpg" } } },
      simAws,
    );

    // Then the format is refused, as real Rekognition refuses anything that
    // is not one of the two formats it reads.
    assertInstanceOf(error, SimRekognitionInvalidImageFormatException);
  });

  it("reports an unknown Bucket as an S3 object problem", async () => {
    // Given no Bucket of that name anywhere in the simulation.
    // When faces in an image in it are detected.
    const error = await detectFailure({
      Image: { S3Object: { Bucket: "nowhere", Name: "selfie.jpg" } },
    });

    // Then it is an S3 object error, which is how real Rekognition reports
    // every S3 problem.
    assertInstanceOf(error, SimRekognitionInvalidS3ObjectException);
  });

  it("detects faces in bytes without any simulated S3 at all", async () => {
    // Given a Rekognition built on its own rather than through SimAws.
    const simRekognition = new SimRekognition();

    // When faces are detected in bytes.
    const detected = await simRekognition.detectFaces(
      new DetectFacesCommand({ Image: { Bytes: redPngBytes } }),
    );

    // Then it answers, since nothing needed reading.
    assertArrayLength(detected.FaceDetails, 1);
  });
});
