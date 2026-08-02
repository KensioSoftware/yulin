import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimHttpApiStageStore } from "./sim-http-api-stage-store.js";
import { SimHttpApiStageSelector } from "./sim-http-api-stage-selector.js";
import { SimHttpApiStage } from "./sim-http-api-stage.js";

const selector = new SimHttpApiStageSelector();

/**
 * Build the stages of an API from their names.
 */
function stagesFor(stageNames: readonly string[]): SimHttpApiStageStore {
  const stages = new SimHttpApiStageStore();

  for (const stageName of stageNames) {
    stages.add(
      new SimHttpApiStage({
        stageName,
        autoDeploy: true,
        createdDate: new Date(0),
      }),
    );
  }

  return stages;
}

describe("Choosing the sim HTTP API stage that serves a request", () => {
  it("takes a named stage off the front of the path", () => {
    // Given an API with a named stage
    const stages = stagesFor(["dev"]);

    // When a request arrives under that name
    const selected = selector.select(stages, ["dev", "pets", "6"]);

    // Then the stage serves it, and the routes see the rest of the path
    assertNonNullable(selected);
    assertIdentical(selected.stage.stageName, "dev");
    expect(selected.segments).toStrictEqual(["pets", "6"]);
  });

  it("gives the whole path to the default stage", () => {
    // Given an API with only the default stage
    const stages = stagesFor(["$default"]);

    // When a request arrives
    const selected = selector.select(stages, ["pets", "6"]);

    // Then the default stage serves it with nothing taken off the path, since
    // it is served at the root of the endpoint
    assertNonNullable(selected);
    assertIdentical(selected.stage.stageName, "$default");
    expect(selected.segments).toStrictEqual(["pets", "6"]);
  });

  it("prefers a named stage to the default stage", () => {
    // Given an API with both a default stage and a stage named pets
    const stages = stagesFor(["$default", "pets"]);

    // When a request whose first segment is that name arrives
    const selected = selector.select(stages, ["pets", "dog"]);

    // Then the named stage takes it, because stage selection runs before the
    // routes see anything, whatever a route would have made of /pets/dog
    assertNonNullable(selected);
    assertIdentical(selected.stage.stageName, "pets");
    expect(selected.segments).toStrictEqual(["dog"]);
  });

  it("falls back to the default stage for an unknown first segment", () => {
    // Given an API with a default stage and a named one
    const stages = stagesFor(["$default", "dev"]);

    // When a request names neither
    const selected = selector.select(stages, ["pets", "6"]);

    // Then the default stage serves it with the path intact
    assertNonNullable(selected);
    assertIdentical(selected.stage.stageName, "$default");
    expect(selected.segments).toStrictEqual(["pets", "6"]);
  });

  it("serves the root of the endpoint from the default stage", () => {
    // Given an API with a default stage
    const stages = stagesFor(["$default"]);

    // When the root is requested, which has no segments at all
    const selected = selector.select(stages, []);

    // Then the default stage takes it
    assertIdentical(selected?.stage.stageName, "$default");
  });

  it("does not read $default in a path as a stage name", () => {
    // Given an API with a default stage
    const stages = stagesFor(["$default"]);

    // When a request happens to start with that literal path segment
    const selected = selector.select(stages, ["$default", "pets"]);

    // Then it is a path, not a stage name: the default stage is served at the
    // root of the endpoint and is not addressable by name
    assertNonNullable(selected);
    assertIdentical(selected.stage.stageName, "$default");
    expect(selected.segments).toStrictEqual(["$default", "pets"]);
  });

  it("matches no stage when the API has none for the request", () => {
    // Given an API whose only stage is a named one
    const stages = stagesFor(["dev"]);

    // When a request arrives outside it, with no default stage to catch it
    const selected = selector.select(stages, ["pets", "6"]);

    // Then nothing serves it, which is a 404 on real AWS
    assertUndefined(selected);
  });
});
