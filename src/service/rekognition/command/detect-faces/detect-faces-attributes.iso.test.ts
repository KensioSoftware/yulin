import {
  type Attribute,
  DetectFacesCommand,
} from "@aws-sdk/client-rekognition";
import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { redPngBytes } from "../../../../../test/rekognition/image-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimRekognitionFacesResult } from "../../face/sim-rekognition-face-declaration.js";
import type {
  SimDetectFacesCommandOutput,
  SimRekognitionFaceDetailOutput,
} from "./detect-faces.command.js";

const wholeFace: SimRekognitionFacesResult = {
  faces: [
    {
      boundingBox: { left: 0.3, top: 0.2, width: 0.3, height: 0.4 },
      confidence: 99.4,
      pose: { roll: -5.8, yaw: -2.4, pitch: 2.6 },
      quality: { brightness: 96.1, sharpness: 95.5 },
      landmarks: {
        eyeLeft: { x: 0.35, y: 0.3 },
        eyeRight: { x: 0.5, y: 0.3 },
        nose: { x: 0.42, y: 0.36 },
        mouthLeft: { x: 0.37, y: 0.45 },
        mouthRight: { x: 0.49, y: 0.45 },
        chinBottom: { x: 0.43, y: 0.62 },
      },
      ageRange: { low: 18, high: 26 },
      gender: { value: "Female", confidence: 99.8 },
      emotions: ["CALM", { type: "HAPPY", confidence: 65.5 }],
      eyeDirection: { yaw: 16.3, pitch: -6.4, confidence: 99.9 },
      smile: { value: true, confidence: 89.7 },
      eyeglasses: false,
      sunglasses: false,
      beard: false,
      mustache: false,
      eyesOpen: true,
      mouthOpen: false,
      faceOccluded: { value: false, confidence: 99.9 },
    },
  ],
};

async function detect(
  attributes?: Attribute[],
  result = wholeFace,
): Promise<SimDetectFacesCommandOutput> {
  const simAws = new SimAws();
  simAws.rekognition().faces().byDefault(result);

  return await simAws.rekognition().detectFaces(
    new DetectFacesCommand({
      Image: { Bytes: redPngBytes },
      ...(attributes !== undefined && { Attributes: attributes }),
    }),
  );
}

function onlyFace(
  detected: SimDetectFacesCommandOutput,
): SimRekognitionFaceDetailOutput {
  const [face] = detected.FaceDetails;
  assertNonNullable(face);

  return face;
}

function landmarkNames(face: SimRekognitionFaceDetailOutput): string[] {
  return (face.Landmarks ?? []).map((landmark) => landmark.Type);
}

describe("Choosing the attributes a face detection reports", () => {
  it("reports the default subset for a request that asks for nothing", async () => {
    // Given a face declared with every attribute on it.
    // When it is detected with no Attributes at all.
    const face = onlyFace(await detect());

    // Then the five default attributes come back and nothing else, which is
    // the subset AWS always returns.
    assertArrayEquals(
      Object.keys(face).toSorted((one, other) => one.localeCompare(other)),
      ["BoundingBox", "Confidence", "Landmarks", "Pose", "Quality"],
    );
  });

  it("reports every attribute for a request that asks for ALL", async () => {
    // Given a face declared with every attribute on it.
    // When it is detected with ALL.
    const face = onlyFace(await detect(["ALL"]));

    // Then the facial attributes come back beside the default subset.
    assertIdentical(face.AgeRange?.Low, 18);
    assertIdentical(face.Gender?.Value, "Female");
    assertTrue(face.Smile?.Value);
    assertFalse(face.Eyeglasses?.Value);
    assertFalse(face.Sunglasses?.Value);
    assertFalse(face.Beard?.Value);
    assertFalse(face.Mustache?.Value);
    assertTrue(face.EyesOpen?.Value);
    assertFalse(face.MouthOpen?.Value);
    assertFalse(face.FaceOccluded?.Value);
    assertIdentical(face.EyeDirection?.Yaw, Math.fround(16.3));
    assertArrayLength(face.Emotions ?? [], 2);
    assertIdentical(face.Confidence, Math.fround(99.4));
  });

  it("adds one requested attribute to the default subset", async () => {
    // Given a face declared with every attribute on it.
    // When it is detected asking only for face occlusion.
    const face = onlyFace(await detect(["FACE_OCCLUDED"]));

    // Then occlusion arrives with the default subset, since AWS returns that
    // subset whatever else was asked for.
    assertFalse(face.FaceOccluded?.Value);
    assertIdentical(face.Confidence, Math.fround(99.4));
    assertUndefined(face.Smile);
    assertUndefined(face.AgeRange);
  });

  it("treats ALL and DEFAULT together as the union of the two", async () => {
    // Given a face declared with every attribute on it.
    // When it is detected asking for both.
    const face = onlyFace(await detect(["ALL", "DEFAULT"]));

    // Then everything comes back, as AWS documents the two combining.
    assertIdentical(face.AgeRange?.High, 26);
    assertIdentical(face.Quality?.Sharpness, Math.fround(95.5));
  });

  it("leaves out an attribute nothing was declared for", async () => {
    // Given a face declared with a bounding box and nothing else.
    const declared = {
      faces: [
        { boundingBox: { left: 0.3, top: 0.2, width: 0.3, height: 0.4 } },
      ],
    };

    // When it is detected with every attribute.
    const face = onlyFace(await detect(["ALL"], declared));

    // Then the members with no declared value are absent rather than present
    // and undefined, so a test can ask which attributes came back.
    assertArrayEquals(
      Object.keys(face).toSorted((one, other) => one.localeCompare(other)),
      ["BoundingBox", "Confidence"],
    );
    assertFalse(Object.hasOwn(face, "AgeRange"));
  });

  it("reports the five default landmarks unless ALL was asked for", async () => {
    // Given a face declared with six landmarks on it.
    // When it is detected with the default attributes.
    const face = onlyFace(await detect());

    // Then the five landmarks AWS reports by default come back, in the order
    // it reports them in, and the sixth is left out.
    assertArrayEquals(landmarkNames(face), [
      "eyeLeft",
      "eyeRight",
      "mouthLeft",
      "mouthRight",
      "nose",
    ]);
  });

  it("reports every declared landmark for a request that asks for ALL", async () => {
    // Given a face declared with six landmarks on it.
    // When it is detected with ALL.
    const face = onlyFace(await detect(["ALL"]));

    // Then the chin comes back too, which is what makes ALL worth asking for.
    assertArrayLength(face.Landmarks ?? [], 6);
    assertIdentical(face.Landmarks?.[5]?.Type, "chinBottom");
    assertIdentical(face.Landmarks[5].X, Math.fround(0.43));
  });

  it("orders emotions by descending confidence", async () => {
    // Given a face declared as calm at the face's own confidence and happy at
    // a lower one.
    // When it is detected with ALL.
    const face = onlyFace(await detect(["ALL"]));

    // Then the most confident emotion is first, as real Rekognition reports
    // them, and the bare name took the face's confidence.
    assertArrayEquals(
      (face.Emotions ?? []).map((emotion) => emotion.Type),
      ["CALM", "HAPPY"],
    );
    assertIdentical(face.Emotions?.[0]?.Confidence, Math.fround(99.4));
  });

  it("leaves landmarks out entirely when none were declared", async () => {
    // Given a face declared without landmarks.
    const declared = { faces: [{ confidence: 90 }] };

    // When it is detected.
    const face = onlyFace(await detect(["ALL"], declared));

    // Then there is no empty Landmarks member to read as a face with no eyes.
    assertFalse(Object.hasOwn(face, "Landmarks"));
  });
});
