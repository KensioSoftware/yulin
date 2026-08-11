import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simCfnCfResponseHeadersPolicyServerTiming } from "./sim-cfn-cf-rh-policy-server-timing.js";

describe("simCfnCfResponseHeadersPolicyServerTiming", () => {
  function refuse(detail: string): never {
    throw new Error(
      `Invalid AWS::CloudFront::ResponseHeadersPolicy CacheHeaders: ${detail}`,
    );
  }

  it("sets the Server-Timing header once enabled", () => {
    const header = simCfnCfResponseHeadersPolicyServerTiming(
      { ServerTimingHeadersConfig: { Enabled: true, SamplingRate: 50 } },
      refuse,
    );

    assertNonNullable(header);
    assertIdentical(header.name, "Server-Timing");
  });

  it("sets nothing when disabled", () => {
    assertUndefined(
      simCfnCfResponseHeadersPolicyServerTiming(
        { ServerTimingHeadersConfig: { Enabled: false } },
        refuse,
      ),
    );
  });

  it("sets nothing when the section is absent", () => {
    assertUndefined(simCfnCfResponseHeadersPolicyServerTiming({}, refuse));
  });

  it("refuses a section with no boolean Enabled", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        simCfnCfResponseHeadersPolicyServerTiming(
          { ServerTimingHeadersConfig: {} },
          refuse,
        ),
      ).message,
      "ServerTimingHeadersConfig needs a boolean Enabled",
    );
  });

  it("refuses a section that is not an object", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        simCfnCfResponseHeadersPolicyServerTiming(
          { ServerTimingHeadersConfig: "nope" },
          refuse,
        ),
      ).message,
      "ServerTimingHeadersConfig must be an object",
    );
  });
});
