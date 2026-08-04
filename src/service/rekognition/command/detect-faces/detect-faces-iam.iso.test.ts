import { DetectFacesCommand } from "@aws-sdk/client-rekognition";
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
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import {
  SimRekognitionAccessDeniedException,
  SimRekognitionInvalidS3ObjectException,
} from "../../error/sim-rekognition.error.js";

const detectAction = "rekognition:DetectFaces";

async function simAwsWithImage(): Promise<SimAws> {
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

  return simAws;
}

const imageCommand = new DetectFacesCommand({
  Image: { S3Object: { Bucket: "uploads", Name: "selfie.jpg" } },
});

describe("Authorizing a simulated Rekognition face detection", () => {
  it("allows a caller whose policy permits the detection", async () => {
    // Given a Role allowed to detect faces and to read the image.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "FaceReader", actions: [detectAction, "s3:GetObject"] },
      simAws,
    );

    // When it detects faces in an image.
    const detected = await simAws.rekognition().detectFaces(imageCommand, {
      caller: { kind: "arn", arn: role.Arn },
    });

    // Then the detection runs.
    assertArrayLength(detected.FaceDetails, 1);
  });

  it("refuses a caller with no Rekognition permission", async () => {
    // Given a Role allowed to read the image but not to detect faces in it.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Reader", actions: ["s3:GetObject"] },
      simAws,
    );

    // When it detects faces in an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectFaces(imageCommand, {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then Rekognition's own AccessDeniedException is thrown, with the 400
    // status real Rekognition answers with.
    assertInstanceOf(error, SimRekognitionAccessDeniedException);
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, detectAction);
  });

  it("refuses a caller allowed only another detection", async () => {
    // Given a Role allowed to detect labels but not faces.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Tagger",
        actions: ["rekognition:DetectLabels", "s3:GetObject"],
      },
      simAws,
    );

    // When it detects faces in an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectFaces(imageCommand, {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then it is refused, since each detection is its own action.
    assertInstanceOf(error, SimRekognitionAccessDeniedException);
  });

  it("reports a missing s3:GetObject as an image problem, with the denial as its cause", async () => {
    // Given a Role allowed to detect faces but not to read the image.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "BlindFaceReader", actions: [detectAction] },
      simAws,
    );

    // When it detects faces in an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectFaces(imageCommand, {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then it is the S3 object error real Rekognition reports, and the IAM
    // denial underneath it is still readable.
    assertInstanceOf(error, SimRekognitionInvalidS3ObjectException);
    assertInstanceOf(error.cause, Error);
    assertStringIncludes(error.cause.message, "s3:GetObject");
  });
});
