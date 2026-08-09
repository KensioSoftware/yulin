import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimRekognitionDeclarationError } from "../error/sim-rekognition.error.js";
import {
  SimRekognitionModerationTaxonomy,
  simRekognitionModerationModelVersion,
  simRekognitionModerationTaxonomy,
} from "./sim-rekognition-moderation-taxonomy.js";

describe("The simulated Rekognition moderation taxonomy", () => {
  it("numbers a label by how deep it sits", () => {
    // Given the published taxonomy.
    const taxonomy = new SimRekognitionModerationTaxonomy();

    // When labels from each of its three levels are looked up.
    const top = taxonomy.require("Violence");
    const second = taxonomy.require("Graphic Violence");
    const third = taxonomy.require("Self-Harm");

    // Then each carries the level real Rekognition reports it at, and a top
    // level label carries an empty parent name rather than no parent at all.
    assertIdentical(top.taxonomyLevel, 1);
    assertIdentical(top.parentName, "");
    assertIdentical(second.taxonomyLevel, 2);
    assertIdentical(second.parentName, "Violence");
    assertIdentical(third.taxonomyLevel, 3);
    assertIdentical(third.parentName, "Graphic Violence");
  });

  it("answers a label with the labels above it, top level first", () => {
    // Given the taxonomy.
    const taxonomy = simRekognitionModerationTaxonomy;

    // When a third level label's chain is taken.
    const chain = taxonomy.chain("Weapon Violence");

    // Then it runs from the top level category down to the label itself.
    assertArrayLength(chain, 3);
    assertIdentical(
      chain.map((node) => node.name).join(" / "),
      "Violence / Graphic Violence / Weapon Violence",
    );
  });

  it("answers a top level label with only itself", () => {
    // Given the taxonomy.
    const taxonomy = simRekognitionModerationTaxonomy;

    // When a top level label's chain is taken.
    const chain = taxonomy.chain("Gambling");

    // Then it is the label alone, since there is nothing above it. Gambling
    // is the one category with no second level labels under it either.
    assertArrayLength(chain, 1);
    assertIdentical(chain[0].name, "Gambling");
  });

  it("knows a label it has and refuses one it does not", () => {
    // Given the taxonomy.
    const taxonomy = simRekognitionModerationTaxonomy;

    // When a label is checked and an invented one is required.
    const error = assertThrowsError(() => taxonomy.require("Kittens"));

    // Then the invented one is refused, naming how many labels there are to
    // choose from.
    assertTrue(taxonomy.has("Middle Finger"));
    assertTrue(!taxonomy.has("Kittens"));
    assertInstanceOf(error, SimRekognitionDeclarationError);
    assertStringIncludes(error.message, "52 labels");
  });

  it("names the model version its labels belong to", () => {
    // Given the taxonomy and the version pinned beside it.
    // Then the version is the one whose label names these are: the previous
    // one called this category Explicit Nudity rather than Explicit.
    assertIdentical(simRekognitionModerationModelVersion, "7.0");
    assertTrue(simRekognitionModerationTaxonomy.has("Explicit"));
  });
});
