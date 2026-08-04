import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import type {
  SimRekognitionDeclaredFace,
  SimRekognitionDeclaredLandmarks,
} from "./sim-rekognition-face-declaration.js";
import type { SimRekognitionFaces } from "./sim-rekognition-faces.js";

function faces(): SimRekognitionFaces {
  return new SimAws().rekognition().faces();
}

function declarationError(face: SimRekognitionDeclaredFace): Error {
  return assertThrowsError(() => {
    faces().byDefault({ faces: [face] });
  });
}

function landmarkError(landmarks: SimRekognitionDeclaredLandmarks): Error {
  return declarationError({ landmarks });
}

describe("Declaring a simulated face result", () => {
  it("accepts a face declared with nothing but a bounding box", () => {
    // Given a simulated Rekognition.
    // When a rule declares a face by where it is.
    faces().byDefault({
      faces: [
        { boundingBox: { left: 0.3, top: 0.2, width: 0.3, height: 0.4 } },
      ],
    });

    // Then it is accepted, since everything else is an attribute a request
    // may never ask for.
  });

  it("refuses a bounding box that is not a ratio of the image size", () => {
    // Given a simulated Rekognition.
    // When a rule declares a box in pixels rather than in ratios.
    const error = declarationError({
      boundingBox: { left: 350, top: 50, width: 70, height: 90 },
    });

    // Then it is refused where it was written.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "not a ratio of the image size");
  });

  it("refuses a bounding box that runs off the edge of the image", () => {
    // Given a simulated Rekognition.
    // When a rule declares a box whose left and width add up past the image.
    const error = declarationError({
      boundingBox: { left: 0.8, top: 0.2, width: 0.4, height: 0.4 },
    });

    // Then it is refused, which is the check that catches a box written in
    // the wrong units.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "puts it outside the image");
  });

  it("refuses a confidence that is not a percentage", () => {
    // Given a simulated Rekognition.
    // When a rule declares a face detected at more than certain.
    const error = declarationError({ confidence: 101 });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "percentage from 0 to 100");
  });

  it("refuses a pose that is not an angle", () => {
    // Given a simulated Rekognition.
    // When a rule declares a face turned further than a face can turn.
    const error = declarationError({ pose: { roll: 0, yaw: 400, pitch: 0 } });

    // Then it is refused, naming the angle that was wrong.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "A yaw declared for 'face 1'");
    assertStringIncludes(error.message, "from -180 to 180");
  });

  it("refuses a quality outside the range AWS reports it in", () => {
    // Given a simulated Rekognition.
    // When a rule declares a brightness above 100.
    const error = declarationError({
      quality: { brightness: 120, sharpness: 95 },
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "not a measure from 0 to 100");
  });

  it("refuses an eye direction that is not an angle", () => {
    // Given a simulated Rekognition.
    // When a rule declares a gaze further round than a gaze goes.
    const error = declarationError({ eyeDirection: { yaw: 200, pitch: 0 } });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "eye direction yaw");
  });

  it("refuses an age that is not a whole number of years", () => {
    // Given a simulated Rekognition.
    // When a rule declares an age of two and a half.
    const error = declarationError({ ageRange: { low: 2.5, high: 26 } });

    // Then it is refused, since real Rekognition estimates whole years.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "whole number of years");
  });

  it("refuses an age range that ends before it begins", () => {
    // Given a simulated Rekognition.
    // When a rule declares a range the wrong way round.
    const error = declarationError({ ageRange: { low: 40, high: 20 } });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "ends before it begins");
  });

  it("refuses a gender real Rekognition does not predict", () => {
    // Given a simulated Rekognition.
    // When a rule declares a value outside the two AWS reports.
    const error = declarationError({
      gender: { value: "Nonbinary" } as unknown as "Male",
    });

    // Then it is refused, because the response would carry a value no real
    // caller has to handle.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "'Male' or 'Female'");
  });

  it("refuses an emotion Rekognition does not report", () => {
    // Given a simulated Rekognition.
    // When a rule declares a feeling that is not one of the nine.
    const error = declarationError({
      emotions: ["BORED" as unknown as "CALM"],
    });

    // Then it is refused where it was written.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "not an emotion Rekognition reports");
  });

  it("refuses the same emotion twice", () => {
    // Given a simulated Rekognition.
    // When a rule declares a face as happy at two confidences.
    const error = declarationError({
      emotions: ["HAPPY", { type: "HAPPY", confidence: 20 }],
    });

    // Then it is refused, since real Rekognition reports each emotion once.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "declared twice");
  });

  it("refuses a landmark Rekognition does not report", () => {
    // Given a simulated Rekognition.
    // When a rule declares a landmark that is not one of the thirty.
    const error = landmarkError({
      earLeft: { x: 0.2, y: 0.4 },
    } as unknown as SimRekognitionDeclaredLandmarks);

    // Then it is refused rather than silently dropped from the response.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "not a landmark Rekognition reports");
  });

  it("refuses a landmark that is not a ratio of the image size", () => {
    // Given a simulated Rekognition.
    // When a rule declares an eye off the image.
    const error = landmarkError({ eyeLeft: { x: 1.4, y: 0.4 } });

    // Then it is refused, naming the landmark and the axis.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "The 'eyeLeft' landmark");
    assertStringIncludes(error.message, "has an x of 1.4");
  });

  it("refuses eyes that are the wrong way round", () => {
    // Given a simulated Rekognition.
    // When a rule declares the left eye to the right of the right one.
    const error = landmarkError({
      eyeLeft: { x: 0.7, y: 0.3 },
      eyeRight: { x: 0.3, y: 0.3 },
    });

    // Then it is refused, because a test asserting that the left eye is on
    // the left would pass here and fail on AWS.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "look swapped");
  });

  it("accepts a landmark outside the bounding box", () => {
    // Given a simulated Rekognition.
    // When a rule declares a chin below the box the face was found in.
    faces().byDefault({
      faces: [
        {
          boundingBox: { left: 0.3, top: 0.2, width: 0.3, height: 0.3 },
          landmarks: { chinBottom: { x: 0.45, y: 0.62 } },
        },
      ],
    });

    // Then it is accepted, because a real Rekognition face box routinely
    // excludes the chin.
  });

  it("refuses more faces than Rekognition detects in one image", () => {
    // Given a simulated Rekognition.
    // When a rule declares a hundred and one faces.
    const error = assertThrowsError(() => {
      faces().byDefault({
        faces: Array.from({ length: 101 }, () => ({ confidence: 90 })),
      });
    });

    // Then it is refused, since AWS detects the hundred largest faces and no
    // more.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "100 largest faces");
  });

  it("refuses a rule with no S3 object name to match", () => {
    // Given a simulated Rekognition.
    // When a name rule is registered with an empty name.
    const error = assertThrowsError(() => {
      faces().onName("", { faces: [] });
    });

    // Then it is refused, as the other operation groups refuse it.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "needs an S3 object name");
  });

  it("refuses a hash rule that is not a content hash", () => {
    // Given a simulated Rekognition.
    // When a hash rule is registered with something that is not a digest.
    const error = assertThrowsError(() => {
      faces().onHash("not-a-digest", { faces: [] });
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "sha256 digest");
  });
});
