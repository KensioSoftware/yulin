import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import type { SimRekognitionLabels } from "./sim-rekognition-labels.js";

function labels(): SimRekognitionLabels {
  return new SimAws().rekognition().labels();
}

describe("Declaring a simulated label result", () => {
  it("accepts any label name, since Yulin has no label ontology", () => {
    // Given a simulated Rekognition.
    // When a rule declares a label that is nowhere in Yulin.
    labels().byDefault({ labels: ["Pizza"] });

    // Then it is accepted. Real Rekognition returns thousands of labels with
    // no published enumerable list, so refusing a name would be failing
    // closed against Yulin's own incompleteness rather than against something
    // AWS cannot do.
  });

  it("refuses a label with no name", () => {
    // Given a simulated Rekognition.
    // When a rule declares a label with an empty name.
    const error = assertThrowsError(() => {
      labels().byDefault({ labels: [""] });
    });

    // Then it is refused where it was written.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "needs a label name");
  });

  it("refuses a confidence that is not a percentage", () => {
    // Given a simulated Rekognition.
    // When a rule declares a confidence outside the range AWS reports in.
    const error = assertThrowsError(() => {
      labels().byDefault({ labels: [{ name: "Dog", confidence: 101 }] });
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "percentage from 0 to 100");
  });

  it("refuses a parent with no name of its own", () => {
    // Given a simulated Rekognition.
    // When a rule declares a label whose parent has an empty name.
    const error = assertThrowsError(() => {
      labels().onName("dog.jpg", {
        labels: [{ name: "Dog", parents: ["Animal", ""] }],
      });
    });

    // Then it is refused, rather than a response carrying a nameless parent.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "A declared parent for 'Dog'");
  });

  it("refuses an alias with no name of its own", () => {
    // Given a simulated Rekognition.
    // When a rule declares a label whose alias has an empty name.
    const error = assertThrowsError(() => {
      labels().byDefault({ labels: [{ name: "Dog", aliases: [""] }] });
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "A declared alias for 'Dog'");
  });

  it("refuses a category with no name of its own", () => {
    // Given a simulated Rekognition.
    // When a rule declares a label whose category has an empty name.
    const error = assertThrowsError(() => {
      labels().byDefault({ labels: [{ name: "Dog", categories: [""] }] });
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "A declared category for 'Dog'");
  });

  it("refuses a bounding box that is not a ratio of the image size", () => {
    // Given a simulated Rekognition.
    // When a rule locates an instance in pixels rather than in ratios.
    const error = assertThrowsError(() => {
      labels().byDefault({
        labels: [
          {
            name: "Dog",
            instances: [
              { boundingBox: { left: 120, top: 40, width: 300, height: 220 } },
            ],
          },
        ],
      });
    });

    // Then it is refused where it was written, since real Rekognition reports
    // a bounding box as ratios of the image's own width and height.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "has a left of 120");
    assertStringIncludes(error.message, "ratio of the image size");
  });

  it("refuses an instance confidence that is not a percentage", () => {
    // Given a simulated Rekognition.
    // When a rule declares an instance at an impossible confidence.
    const error = assertThrowsError(() => {
      labels().byDefault({
        labels: [
          {
            name: "Dog",
            instances: [
              {
                boundingBox: { left: 0.1, top: 0.1, width: 0.2, height: 0.2 },
                confidence: -3,
              },
            ],
          },
        ],
      });
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "percentage from 0 to 100");
  });

  it("refuses a hash rule that is not a sha256 digest", () => {
    // Given a simulated Rekognition.
    // When a rule is registered against a truncated digest.
    const error = assertThrowsError(() => {
      labels().onHash("9f86d081884c7d65", { labels: ["Dog"] });
    });

    // Then it is refused, rather than being stored as a hash nothing can ever
    // match.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "64 hex characters");
  });

  it("refuses a name rule with no name to match", () => {
    // Given a simulated Rekognition.
    // When a rule is registered against an empty name.
    const error = assertThrowsError(() => {
      labels().onName("", { labels: ["Dog"] });
    });

    // Then it is refused.
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "needs an S3 object name");
  });
});
