import { assertStringIncludes } from "@kensio/smartass";
import { describe, it, vi } from "vitest";
import { SimLiveReloadReport } from "./sim-live-reload-report.js";

describe("SimLiveReloadReport", () => {
  it("says live reload is on and where the channel is", () => {
    // Given a server that has started listening with live reload on
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // When it reports itself
    new SimLiveReloadReport().announce("8787");

    // Then the divergence is stated, along with the reserved path
    const reported = String(warn.mock.calls[0]?.[0]);
    assertStringIncludes(reported, "live reload is on");
    assertStringIncludes(
      reported,
      "http://sim-aws.localhost:8787/__sim-aws/live-reload",
    );
  });
});
