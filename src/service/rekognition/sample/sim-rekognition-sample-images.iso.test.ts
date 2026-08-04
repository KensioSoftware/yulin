import {
  assertArrayLength,
  assertIdentical,
  assertNumberBetween,
  assertSetSize,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simRekognitionImageFormat } from "../image/sim-rekognition-image-format.js";
import { simRekognitionImageHash } from "../image/sim-rekognition-image-hash.js";
import { simRekognitionSampleImageFiles } from "./sim-rekognition-sample-image-files.js";
import { simRekognitionSampleImages } from "./sim-rekognition-sample-images.js";

const everySample = [
  simRekognitionSampleImages.passesModeration(),
  simRekognitionSampleImages.flaggedByModeration(),
  simRekognitionSampleImages.noFaces(),
  simRekognitionSampleImages.oneFace(),
  simRekognitionSampleImages.severalFaces(),
];

describe("The simulated Rekognition sample images", () => {
  it("are images in the two formats Rekognition reads", () => {
    // Given the sample images.
    // When each one's format is identified from its own bytes.
    const formats = everySample.map((bytes) =>
      simRekognitionImageFormat(bytes),
    );

    // Then each is a real PNG or JPEG, so the format check applies to a
    // sample image as it does to any other image, with no path around it.
    assertArrayLength(formats, 5);
    assertIdentical(formats[1], "JPEG");
    assertIdentical(formats[3], "JPEG");
    assertIdentical(formats[0], "PNG");
  });

  it("are five different images", () => {
    // Given the sample images.
    // When their content hashes are taken.
    const hashes = new Set(
      everySample.map((bytes) => simRekognitionImageHash(bytes)),
    );

    // Then no two share a hash, so no two share a rule.
    assertSetSize(hashes, 5);
  });

  it("hash to what their built-in rules were registered against", () => {
    // Given one sample image.
    const bytes = simRekognitionSampleImages.oneFace();

    // When it is hashed the way a test would hash a fixture.
    const hash = simRekognitionImageHash(bytes);

    // Then it is the hash the image itself reports, which is what the
    // built-in rule was registered against.
    assertIdentical(hash, simRekognitionSampleImageFiles.oneFace.hash);
  });

  it("answer with a copy, so one caller cannot spoil another's", () => {
    // Given the bytes of a sample image.
    const first = simRekognitionSampleImages.noFaces();

    // When a caller writes into them.
    first.set([0x00, 0x00, 0x00, 0x00]);

    // Then the next caller still gets the image, and its hash still matches
    // the rule registered for it.
    const second = simRekognitionSampleImages.noFaces();
    assertIdentical(simRekognitionImageFormat(second), "PNG");
    assertIdentical(
      simRekognitionImageHash(second),
      simRekognitionSampleImageFiles.noFaces.hash,
    );
  });

  it("stay small enough to ship in the package", () => {
    // Given the sample images.
    // When their sizes are added up.
    const bytes = everySample.reduce((total, image) => total + image.length, 0);

    // Then they are the couple of kilobytes they were meant to be. They ship
    // in the published package, so this is a size budget rather than a fact
    // about the pictures.
    assertNumberBetween(bytes, 1, 4096);
  });
});
