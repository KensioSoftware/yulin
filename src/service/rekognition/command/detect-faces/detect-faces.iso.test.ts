import {
  type Attribute,
  DetectFacesCommand,
} from "@aws-sdk/client-rekognition";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  bluePngBytes,
  redPngBytes,
} from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  simRekognitionNoFaces,
  simRekognitionSeveralFaces,
} from "../../face/sim-rekognition-face-defaults.js";
import { simRekognitionImageHash } from "../../image/sim-rekognition-image-hash.js";
import type { SimDetectFacesCommandOutput } from "./detect-faces.command.js";

async function simAwsWithImage(
  objectName = "selfie.jpg",
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
  attributes?: Attribute[],
): Promise<SimDetectFacesCommandOutput> {
  return await simAws.rekognition().detectFaces(
    new DetectFacesCommand({
      Image: { S3Object: { Bucket: "uploads", Name: objectName } },
      ...(attributes !== undefined && { Attributes: attributes }),
    }),
  );
}

describe("Detecting faces in a simulated image", () => {
  it("answers with the built-in result until a rule says otherwise", async () => {
    // Given an image in a Bucket and no rules registered against it.
    const simAws = await simAwsWithImage();

    // When its faces are detected.
    const detected = await detect(simAws, "selfie.jpg");

    // Then the one face from the documented AWS example response comes back,
    // with the default subset of attributes on it.
    assertArrayLength(detected.FaceDetails, 1);

    const [face] = detected.FaceDetails;
    assertNonNullable(face);
    assertIdentical(face.Confidence, 99.99872589111328);
    assertIdentical(face.BoundingBox?.Left, 0.08881539851427078);
    assertIdentical(face.Pose?.Roll, -5.83309268951416);
    assertIdentical(face.Quality?.Brightness, 96.16363525390625);
  });

  it("answers with the faces declared for an object name", async () => {
    // Given an object declared to hold two people.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .faces()
      .onName("selfie.jpg", {
        faces: [
          {
            boundingBox: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 },
            confidence: 99.4,
          },
          {
            boundingBox: { left: 0.5, top: 0.2, width: 0.3, height: 0.4 },
          },
        ],
      });

    // When its faces are detected.
    const detected = await detect(simAws, "selfie.jpg");

    // Then both come back in the order they were declared, and the one with
    // no confidence of its own is detected at the built-in confidence.
    assertArrayLength(detected.FaceDetails, 2);
    assertIdentical(detected.FaceDetails[0].Confidence, Math.fround(99.4));
    assertIdentical(
      detected.FaceDetails[0].BoundingBox?.Left,
      Math.fround(0.1),
    );
    assertIdentical(detected.FaceDetails[1].Confidence, 99.99872589111328);
  });

  it("answers with no faces for an image declared without any", async () => {
    // Given an object declared to be a photograph of a landscape.
    const simAws = await simAwsWithImage("landscape.jpg");
    simAws.rekognition().faces().onName("landscape.jpg", { faces: [] });

    // When its faces are detected.
    const detected = await detect(simAws, "landscape.jpg");

    // Then the detection found nothing, which is a result rather than a
    // missing rule.
    assertArrayEmpty(detected.FaceDetails);
  });

  it("declares an empty image and a crowded one from the built-in results", async () => {
    // Given the two built-in results declared against two objects.
    const simAws = await simAwsWithImage("landscape.jpg");
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "uploads",
        Key: "crowd.jpg",
        Body: bluePngBytes,
      }),
    );
    const faces = simAws.rekognition().faces();
    faces.onName("landscape.jpg", simRekognitionNoFaces);
    faces.onName("crowd.jpg", simRekognitionSeveralFaces);

    // When both are detected.
    const empty = await detect(simAws, "landscape.jpg");
    const crowd = await detect(simAws, "crowd.jpg");

    // Then a test that only counts faces needs to declare nothing of its own.
    assertArrayEmpty(empty.FaceDetails);
    assertArrayLength(crowd.FaceDetails, 3);
    assertIdentical(crowd.FaceDetails[2].Confidence, Math.fround(98.62));
  });

  it("gives an attribute the face's confidence when it declares none", async () => {
    // Given a face declared as smiling, with no confidence on the smile.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .faces()
      .onName("selfie.jpg", {
        faces: [{ confidence: 98.5, smile: true, gender: "Female" }],
      });

    // When its faces are detected with every attribute.
    const detected = await detect(simAws, "selfie.jpg", ["ALL"]);

    // Then the attributes take the face's own confidence, since a face
    // detected at 98.5 is not usually judged to be smiling at 40.
    const [face] = detected.FaceDetails;
    assertNonNullable(face);
    assertTrue(face.Smile?.Value);
    assertIdentical(face.Smile.Confidence, Math.fround(98.5));
    assertIdentical(face.Gender?.Value, "Female");
    assertIdentical(face.Gender.Confidence, Math.fround(98.5));
  });

  it("matches an image by content hash whatever it is called", async () => {
    // Given a rule for the hash of some image bytes, and an object storing
    // those bytes under a name nothing was declared for.
    const simAws = await simAwsWithImage("2f9c1e40-uuid.png", bluePngBytes);
    simAws
      .rekognition()
      .faces()
      .onHash(simRekognitionImageHash(bluePngBytes), simRekognitionNoFaces);

    // When its faces are detected.
    const detected = await detect(simAws, "2f9c1e40-uuid.png");

    // Then the hash rule answers, which is what makes a system that generates
    // its own object keys testable.
    assertArrayEmpty(detected.FaceDetails);
  });

  it("consults hash rules and the default for an image passed as bytes", async () => {
    // Given a name rule, a hash rule and a default.
    const simAws = new SimAws();
    const faces = simAws.rekognition().faces();
    faces.byDefault(simRekognitionSeveralFaces);
    faces.onName("selfie.jpg", { faces: [{ confidence: 90 }] });
    faces.onHash(simRekognitionImageHash(bluePngBytes), simRekognitionNoFaces);

    // When images are detected as bytes rather than as S3 objects.
    const hashed = await simAws
      .rekognition()
      .detectFaces(new DetectFacesCommand({ Image: { Bytes: bluePngBytes } }));
    const unknown = await simAws
      .rekognition()
      .detectFaces(new DetectFacesCommand({ Image: { Bytes: redPngBytes } }));

    // Then the hash rule matches and the default answers for the rest, since
    // bytes have no name for a name rule to match.
    assertArrayEmpty(hashed.FaceDetails);
    assertArrayLength(unknown.FaceDetails, 3);
  });

  it("keeps face rules apart from label rules", async () => {
    // Given an object declared to hold a cat and no faces.
    const simAws = await simAwsWithImage();
    simAws
      .rekognition()
      .labels()
      .onName("selfie.jpg", { labels: ["Cat"] });
    simAws.rekognition().faces().onName("selfie.jpg", simRekognitionNoFaces);

    // When its faces and its labels are detected.
    const faces = await detect(simAws, "selfie.jpg");
    const labels = await simAws.rekognition().detectLabels({
      input: { Image: { S3Object: { Bucket: "uploads", Name: "selfie.jpg" } } },
    });

    // Then each operation answers from its own rules, since each owns the
    // result shape it answers with.
    assertArrayEmpty(faces.FaceDetails);
    assertArrayEquals(
      labels.Labels.map((label) => label.Name),
      ["Cat"],
    );
  });

  it("keeps rules to the Account and Region they were registered in", async () => {
    // Given a rule registered in one Region only.
    const simAws = new SimAws();
    simAws.rekognition().faces().byDefault(simRekognitionNoFaces);

    // When faces are detected in another Region.
    const elsewhere = await simAws
      .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
      .rekognition()
      .detectFaces(new DetectFacesCommand({ Image: { Bytes: redPngBytes } }));

    // Then that Region answers from its own rules, as a real Rekognition
    // endpoint answers for the Region it belongs to.
    assertArrayLength(elsewhere.FaceDetails, 1);
  });
});
