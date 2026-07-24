import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../../aws/sim-aws.js";
import { SimSdkLambdaVmModuleProvider } from "./sim-sdk-lambda-vm-module-provider.js";

/**
 * Build the error shape Node.js module resolution throws for a missing
 * package.
 */
function makeModuleNotFoundError(specifier: string): Error {
  const error = new Error(`Cannot find module '${specifier}'`);
  return Object.assign(error, { code: "MODULE_NOT_FOUND" });
}

describe("SimSdkLambdaVmModuleProvider", () => {
  it("provides an intercepted AWS SDK package module", () => {
    // Given a provider for a simulated AWS environment.
    const simAws = new SimAws();
    const provider = new SimSdkLambdaVmModuleProvider({
      simAws,
      regionName: "eu-west-2",
    });

    // When an AWS SDK client package is requested.
    const provided = provider.provideModule("@aws-sdk/client-s3") as Record<
      string,
      unknown
    >;

    // Then a wrapped module is provided: the client class is intercepted
    // while other exports pass through by identity.
    assertNonNullable(provided);
    assertFalse(provided["S3Client"] === S3Client);
    assertIdentical(provided["GetObjectCommand"], GetObjectCommand);
  });

  it("caches provided modules per specifier", () => {
    // Given a provider for a simulated AWS environment.
    const provider = new SimSdkLambdaVmModuleProvider({ simAws: new SimAws() });

    // When the same package is requested twice.
    const first = provider.provideModule("@aws-sdk/client-s3");
    const second = provider.provideModule("@aws-sdk/client-s3");

    // Then the identical module object is returned, as repeated requires
    // within one runtime observe one module instance.
    assertIdentical(first, second);
  });

  it("declines non-SDK specifiers", () => {
    // Given a provider for a simulated AWS environment.
    const provider = new SimSdkLambdaVmModuleProvider({ simAws: new SimAws() });

    // When a non-SDK package is requested, then the provider declines so the
    // archive resolution error is reported instead.
    assertUndefined(provider.provideModule("left-pad"));
  });

  it("reports an uninstalled AWS SDK package helpfully", () => {
    // Given a provider whose host require cannot resolve the package.
    const provider = new SimSdkLambdaVmModuleProvider({
      simAws: new SimAws(),
      requireModule: () => {
        throw makeModuleNotFoundError("@aws-sdk/client-unknown");
      },
    });

    // When the package is requested, then the failure explains how to make
    // the package available.
    const error = assertThrowsError(() =>
      provider.provideModule("@aws-sdk/client-unknown"),
    );

    assertStringIncludes(error.message, "@aws-sdk/client-unknown");
    assertStringIncludes(error.message, "not installed");
  });

  it("propagates installed-package initialization failures unchanged", () => {
    // Given a provider whose host require resolves the package but the
    // package throws while initializing.
    const provider = new SimSdkLambdaVmModuleProvider({
      simAws: new SimAws(),
      requireModule: () => {
        throw new Error("boom during package initialization");
      },
    });

    // When the package is requested, then the real initialization error is
    // reported rather than a misleading not-installed message.
    const error = assertThrowsError(() =>
      provider.provideModule("@aws-sdk/client-s3"),
    );

    assertIdentical(error.message, "boom during package initialization");
  });

  it("rejects a host module that is not a module object", () => {
    // Given a provider whose host require returns a non-object.
    const provider = new SimSdkLambdaVmModuleProvider({
      simAws: new SimAws(),
      requireModule: () => "not-a-module",
    });

    // When the package is requested, then the malformed module is reported.
    const error = assertThrowsError(() =>
      provider.provideModule("@aws-sdk/client-s3"),
    );

    assertStringIncludes(error.message, "did not export a module object");
  });
});
