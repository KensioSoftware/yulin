import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";

describe("Declaring a simulated moderation result", () => {
  it("refuses a label the moderation taxonomy does not have", () => {
    // Given a simulated Rekognition.
    const simAws = new SimAws();

    // When a rule declares a label real Rekognition would never return, such
    // as one from the previous version of the taxonomy.
    const error = assertThrowsError(() => {
      simAws
        .rekognition()
        .moderation()
        .onName("photo.png", { labels: ["Drug Products"] });
    });

    // Then it is refused where it was written, rather than at detection time.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "is not a Rekognition moderation");
  });

  it("refuses a confidence that is not a percentage", () => {
    // Given a simulated Rekognition.
    const simAws = new SimAws();

    // When a rule declares a confidence outside the range AWS reports in.
    const error = assertThrowsError(() => {
      simAws
        .rekognition()
        .moderation()
        .byDefault({ labels: [{ name: "Violence", confidence: 101 }] });
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "percentage from 0 to 100");
  });

  it("refuses a negative confidence", () => {
    // Given a simulated Rekognition.
    const simAws = new SimAws();

    // When a rule declares a confidence below the range AWS reports in.
    const error = assertThrowsError(() => {
      simAws
        .rekognition()
        .moderation()
        .byDefault({ labels: [{ name: "Violence", confidence: -1 }] });
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "percentage from 0 to 100");
  });

  it("refuses a confidence that is not a number at all", () => {
    // Given a simulated Rekognition.
    const simAws = new SimAws();

    // When a rule declares a confidence of NaN.
    const error = assertThrowsError(() => {
      simAws
        .rekognition()
        .moderation()
        .byDefault({ labels: [{ name: "Violence", confidence: NaN }] });
    });

    // Then it is refused where it was written, rather than being stored as a
    // label that silently never survives MinConfidence filtering.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "percentage from 0 to 100");
  });

  it("refuses a hash rule that is not a sha256 digest", () => {
    // Given a simulated Rekognition.
    const simAws = new SimAws();

    // When a rule is registered against a truncated digest.
    const error = assertThrowsError(() => {
      simAws
        .rekognition()
        .moderation()
        .onHash("9f86d081884c7d65", { labels: ["Violence"] });
    });

    // Then it is refused, rather than being stored as a hash nothing can
    // ever match.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "64 hex characters");
  });

  it("refuses a name rule with no name to match", () => {
    // Given a simulated Rekognition.
    const simAws = new SimAws();

    // When a rule is registered against an empty name.
    const error = assertThrowsError(() => {
      simAws
        .rekognition()
        .moderation()
        .onName("", { labels: ["Violence"] });
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "needs an S3 object name");
  });
});
