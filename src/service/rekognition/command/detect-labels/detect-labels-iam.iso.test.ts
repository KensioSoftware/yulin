import { DetectLabelsCommand } from "@aws-sdk/client-rekognition";
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
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import {
  SimRekognitionAccessDeniedException,
  SimRekognitionInvalidS3ObjectException,
} from "../../error/sim-rekognition.error.js";

const detectAction = "rekognition:DetectLabels";

async function simAwsWithImage(): Promise<SimAws> {
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

  return simAws;
}

const imageCommand = new DetectLabelsCommand({
  Image: { S3Object: { Bucket: "uploads", Name: "dog.jpg" } },
});

describe("Authorizing a simulated Rekognition label detection", () => {
  it("allows a caller whose policy permits the detection", async () => {
    // Given a Role allowed to detect labels and to read the image.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Tagger", actions: [detectAction, "s3:GetObject"] },
      simAws,
    );
    simAws
      .rekognition()
      .labels()
      .onName("dog.jpg", { labels: ["Dog"] });

    // When it detects labels in an image.
    const detected = await simAws.rekognition().detectLabels(imageCommand, {
      caller: { kind: "arn", arn: role.Arn },
    });

    // Then the detection runs.
    assertIdentical(detected.Labels[0]?.Name, "Dog");
  });

  it("refuses a caller with no Rekognition permission", async () => {
    // Given a Role allowed to read the image but not to detect labels in it.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Reader", actions: ["s3:GetObject"] },
      simAws,
    );

    // When it detects labels in an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectLabels(imageCommand, {
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

  it("refuses a caller allowed only the other detection", async () => {
    // Given a Role allowed to moderate images but not to detect labels.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Moderator",
        actions: ["rekognition:DetectModerationLabels", "s3:GetObject"],
      },
      simAws,
    );

    // When it detects labels in an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectLabels(imageCommand, {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then it is refused, since each detection is its own action.
    assertInstanceOf(error, SimRekognitionAccessDeniedException);
  });

  it("refuses a policy that names a resource rather than everything", async () => {
    // Given a Role allowed the detection on an ARN rather than on `*`.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "ScopedTagger",
        actions: [detectAction, "s3:GetObject"],
        resource: "arn:aws:s3:::uploads/*",
      },
      simAws,
    );

    // When it detects labels in an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectLabels(imageCommand, {
          caller: { kind: "arn", arn: role.Arn },
        }),
    );

    // Then it is refused, because a detection has no resource to name and is
    // authorized against `*`, here as on real AWS.
    assertInstanceOf(error, SimRekognitionAccessDeniedException);
  });

  it("reports a missing s3:GetObject as an image problem, with the denial as its cause", async () => {
    // Given a Role allowed to detect labels but not to read the image.
    const simAws = await simAwsWithImage();
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "BlindTagger", actions: [detectAction] },
      simAws,
    );

    // When it detects labels in an image.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.rekognition().detectLabels(imageCommand, {
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
});
