import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { redPngBytes } from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import {
  SimRekognitionAccessDeniedException,
  SimRekognitionInvalidS3ObjectException,
} from "../../error/sim-rekognition.error.js";

const detectAction = "rekognition:DetectModerationLabels";

async function simAwsWithImage(): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "uploads" }));
  await simAws.s3().putObject(
    new PutObjectCommand({
      Bucket: "uploads",
      Key: "selfie.png",
      Body: redPngBytes,
    }),
  );

  return simAws;
}

const imageCommand = new DetectModerationLabelsCommand({
  Image: { S3Object: { Bucket: "uploads", Name: "selfie.png" } },
});

describe("Authorizing a simulated Rekognition detection", () => {
  it("allows a caller whose policy permits the detection", async () => {
    // Given a Role allowed to moderate and to read the image.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Moderator", actions: [detectAction, "s3:GetObject"] },
      simAws,
    );

    // When it moderates an image.
    const detected = await simAws
      .rekognition()
      .detectModerationLabels(imageCommand, {
        caller: { kind: "arn", arn: role.Arn },
      });

    // Then the detection runs.
    assertIdentical(detected.ModerationModelVersion, "7.0");
  });

  it("refuses a caller with no Rekognition permission", async () => {
    // Given a Role allowed to read the image but not to moderate it.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Reader", actions: ["s3:GetObject"] },
      simAws,
    );

    // When it moderates an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(imageCommand, {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then Rekognition's own AccessDeniedException is thrown, with the 400
    // status real Rekognition answers with rather than the 403 several other
    // services use.
    assertInstanceOf(error, SimRekognitionAccessDeniedException);
    assertIdentical(error.name, "AccessDeniedException");
    assertIdentical(error.$metadata.httpStatusCode, 400);
    assertStringIncludes(error.message, detectAction);
  });

  it("refuses a policy that names a resource rather than everything", async () => {
    // Given a Role allowed the detection on an ARN rather than on `*`.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "ScopedModerator",
        actions: [detectAction, "s3:GetObject"],
        resource: "arn:aws:s3:::uploads/*",
      },
      simAws,
    );

    // When it moderates an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(imageCommand, {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then it is refused, because a detection has no resource to name and is
    // authorized against `*`, here as on real AWS.
    assertInstanceOf(error, SimRekognitionAccessDeniedException);
  });

  it("reports a missing s3:GetObject as an image problem, with the denial as its cause", async () => {
    // Given a Role allowed to moderate but not to read the image.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "BlindModerator", actions: [detectAction] },
      simAws,
    );

    // When it moderates an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectModerationLabels(imageCommand, {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then it is the S3 object error real Rekognition reports, and the IAM
    // denial underneath it is still readable, so the missing grant can be
    // found from what was thrown.
    assertInstanceOf(error, SimRekognitionInvalidS3ObjectException);
    assertInstanceOf(error.cause, Error);
    assertStringIncludes(error.cause.message, "s3:GetObject");
  });

  it("reads an image from a Bucket in another Account", async () => {
    // Given a Bucket in another Account whose policy admits this Role.
    const otherAccountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "CrossAccountModerator",
        actions: [detectAction, "s3:GetObject"],
      },
      simAws,
    );

    const otherS3 = simAws
      .accountRegionScope(otherAccountId, simAws.defaultRegionName)
      .s3();
    await otherS3.createBucket(new CreateBucketCommand({ Bucket: "partner" }));
    await otherS3.putObject(
      new PutObjectCommand({
        Bucket: "partner",
        Key: "selfie.png",
        Body: redPngBytes,
      }),
    );
    await otherS3.putBucketPolicy({
      input: {
        Bucket: "partner",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: role.Arn },
              Action: "s3:GetObject",
              Resource: "arn:aws:s3:::partner/*",
            },
          ],
        }),
      },
    });

    simAws
      .rekognition()
      .moderation()
      .onName("selfie.png", { labels: ["Violence"] });

    // When the image is moderated from this Account.
    const detected = await simAws.rekognition().detectModerationLabels(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: "partner", Name: "selfie.png" } },
      }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then it is read across the Account boundary, as real Rekognition reads
    // a Bucket another Account's policy admits it to.
    assertIdentical(detected.ModerationLabels[0]?.Name, "Violence");
  });
});
