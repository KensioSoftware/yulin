import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimWatchIgnore } from "./sim-watch-ignore.js";

describe("SimWatchIgnore", () => {
  it("watches project source", () => {
    // Given a source file in the project
    const ignore = new SimWatchIgnore();

    // When it changes
    const ignored = ignore.ignores("src/handler/upload.ts");

    // Then it is worth restarting for
    assertFalse(ignored);
  });

  it("watches a synthesized template", () => {
    // Given the output of a CDK synth
    const ignore = new SimWatchIgnore();

    // When it changes
    const ignored = ignore.ignores("cdk.out/MediaStack.template.json");

    // Then it is worth restarting for, since the stack it deploys has changed
    assertTrue(!ignored);
  });

  it("watches a source file whose name starts like a CDK asset", () => {
    // Given a source file that happens to be named after what it configures
    const ignore = new SimWatchIgnore();

    // When it changes
    const ignored = ignore.ignores("src/asset.config.ts");

    // Then it is watched, since only CDK's output directory holds CDK assets
    assertFalse(ignored);
  });

  it("passes over a change that names nothing", () => {
    // Given an event that named no path at all
    const ignore = new SimWatchIgnore();

    // When it is considered
    const ignored = ignore.ignores("");

    // Then there is nothing there to restart for
    assertFalse(ignored);
  });

  it.each([
    ["node_modules/@aws-sdk/client-s3/dist/index.js"],
    [".git/index"],
    ["dist/index.js"],
    ["coverage/lcov.info"],
    ["cdk.out/asset.9f2c/index.js"],
  ])("passes over %s", (changedPath) => {
    // Given a path nothing writes by hand
    const ignore = new SimWatchIgnore();

    // When it changes
    const ignored = ignore.ignores(changedPath);

    // Then it is not a reason to restart
    assertTrue(ignored);
  });

  it.each([["src/dev.ts~"], ["src/.#dev.ts"], ["src/.dev.ts.swp"], ["4913"]])(
    "passes over the editor working file %s",
    (changedPath) => {
      // Given a file an editor wrote on its way to saving
      const ignore = new SimWatchIgnore();

      // When it changes
      const ignored = ignore.ignores(changedPath);

      // Then it is not the save, so it is not a restart
      assertTrue(ignored);
    },
  );
});
