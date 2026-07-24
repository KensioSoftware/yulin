import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaRuntimeError } from "../../../../error/sim-lambda-runtime.error.js";
import { SimLambdaNoVmSdkModuleProvider } from "./sim-lambda-vm-sdk-module-provider.js";

describe("SimLambdaNoVmSdkModuleProvider", () => {
  it("fails AWS SDK requires with wiring guidance", () => {
    // Given a standalone provider with no simulated AWS environment.
    const provider = new SimLambdaNoVmSdkModuleProvider();

    // When an AWS SDK package is requested, then it fails with an AWS-like
    // runtime import error explaining how to wire the provider.
    const error = assertThrowsError(() =>
      provider.provideModule("@aws-sdk/client-s3"),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "@aws-sdk/client-s3");
    assertStringIncludes(error.message, "vmSdkModuleProvider");
  });

  it("declines non-SDK specifiers", () => {
    // Given a standalone provider.
    const provider = new SimLambdaNoVmSdkModuleProvider();

    // When a non-SDK package is requested, then the provider declines so the
    // archive resolution error is reported instead.
    assertUndefined(provider.provideModule("left-pad"));
  });
});
