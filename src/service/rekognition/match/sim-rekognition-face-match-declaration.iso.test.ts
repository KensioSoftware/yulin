import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import type { SimRekognitionDeclaredFaceMatch } from "./sim-rekognition-face-match-declaration.js";
import type { SimRekognitionFaceMatches } from "./sim-rekognition-face-matches.js";

function faceMatches(): SimRekognitionFaceMatches {
  return new SimAws().rekognition().faceMatches();
}

function declarationError(match: SimRekognitionDeclaredFaceMatch): Error {
  return assertThrowsError(() => {
    faceMatches().byDefault({ matches: [match] });
  });
}

describe("Declaring a simulated face search result", () => {
  it("accepts a match naming the id a face was indexed under", () => {
    // Given a simulated Rekognition
    // When a rule says which indexed face an image finds
    faceMatches().onName("door/visitor.jpg", {
      matches: [{ externalImageId: "ada" }],
    });

    // Then it is accepted, and the similarity is left to the default
  });

  it("accepts a match naming the id IndexFaces answered with", () => {
    faceMatches().onName("door/visitor.jpg", {
      matches: [{ faceId: "0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d" }],
    });
  });

  it("refuses a match naming both kinds of id", () => {
    // Given a match declared with a face id and an external image id
    const error = declarationError({
      faceId: "0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
      externalImageId: "ada",
    });

    // Then it is refused where it was written, since the two say different
    // things about which faces the search finds
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "face match 1");
    assertStringIncludes(error.message, "not both");
  });

  it("refuses a match naming no face at all", () => {
    // Given a match declared with a similarity and nothing to apply it to
    const error = declarationError({ similarity: 99 });

    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(
      error.message,
      "either a faceId or an externalImageId",
    );
  });

  it("refuses a similarity outside the range Rekognition reports", () => {
    // Given a match declared as more alike than anything can be
    const error = declarationError({ externalImageId: "ada", similarity: 120 });

    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "percentage from 0 to 100");
  });
});
