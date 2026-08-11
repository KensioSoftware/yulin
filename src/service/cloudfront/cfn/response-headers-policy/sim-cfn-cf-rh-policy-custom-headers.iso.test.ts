import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simCfnCfResponseHeadersPolicyCustomHeaders,
  simCfnCfResponseHeadersPolicyRemoveHeaders,
} from "./sim-cfn-cf-rh-policy-custom-headers.js";

function refuse(detail: string): never {
  throw new Error(
    `Invalid AWS::CloudFront::ResponseHeadersPolicy CacheHeaders: ${detail}`,
  );
}

describe("simCfnCfResponseHeadersPolicyCustomHeaders", () => {
  function headersFrom(items: unknown[]) {
    return simCfnCfResponseHeadersPolicyCustomHeaders(
      { CustomHeadersConfig: { Items: items } },
      refuse,
    );
  }

  it("reads a custom header's name, value and Override", () => {
    const headers = headersFrom([
      { Header: "Cache-Control", Override: true, Value: "public, max-age=0" },
    ]);

    assertArrayLength(headers, 1);
    assertIdentical(headers[0].name, "Cache-Control");
    assertIdentical(headers[0].value, "public, max-age=0");
    assertTrue(headers[0].override);
  });

  it("reads a policy with no CustomHeadersConfig as adding nothing", () => {
    assertArrayLength(
      simCfnCfResponseHeadersPolicyCustomHeaders({}, refuse),
      0,
    );
  });

  it("reads a section with no Items as adding nothing", () => {
    assertArrayLength(
      simCfnCfResponseHeadersPolicyCustomHeaders(
        { CustomHeadersConfig: {} },
        refuse,
      ),
      0,
    );
  });

  it("refuses an item missing its Header, Value or Override", () => {
    assertStringIncludes(
      assertThrowsError(() => headersFrom([{ Override: true, Value: "x" }]))
        .message,
      "need a string Header and Value",
    );
    assertStringIncludes(
      assertThrowsError(() => headersFrom([{ Header: "Vary", Value: "x" }]))
        .message,
      "CustomHeadersConfig item Vary needs a boolean Override",
    );
  });

  it("refuses an item that is not an object", () => {
    assertStringIncludes(
      assertThrowsError(() => headersFrom(["Vary"])).message,
      "CustomHeadersConfig items must be objects",
    );
  });

  it("refuses Items that are not an array", () => {
    assertStringIncludes(
      assertThrowsError(() =>
        simCfnCfResponseHeadersPolicyCustomHeaders(
          { CustomHeadersConfig: { Items: "nope" } },
          refuse,
        ),
      ).message,
      "CustomHeadersConfig Items must be an array",
    );
  });
});

describe("simCfnCfResponseHeadersPolicyRemoveHeaders", () => {
  function namesFrom(items: unknown[]) {
    return simCfnCfResponseHeadersPolicyRemoveHeaders(
      { RemoveHeadersConfig: { Items: items } },
      refuse,
    );
  }

  it("reads the name of a header to remove", () => {
    const names = namesFrom([{ Header: "Server" }]);

    assertArrayLength(names, 1);
    assertIdentical(names[0], "Server");
  });

  it("reads a policy with no RemoveHeadersConfig as removing nothing", () => {
    assertArrayLength(
      simCfnCfResponseHeadersPolicyRemoveHeaders({}, refuse),
      0,
    );
  });

  it("refuses an item without a name", () => {
    assertStringIncludes(
      assertThrowsError(() => namesFrom([{}])).message,
      "RemoveHeadersConfig items need a string Header",
    );
  });
});
