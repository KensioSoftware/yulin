import http from "node:http";
import https from "node:https";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  assertArrayEquals,
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

function providedModule(
  provider: SimSdkLambdaVmModuleProvider,
  specifier: string,
): Record<string, unknown> {
  return provider.provideModule(specifier) as Record<string, unknown>;
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

    // And a built-in it has nothing to do with is left to the host's own.
    assertUndefined(provider.provideModule("node:fs"));
  });

  it("provides the HTTP transport modules a bundled SDK reaches for", () => {
    // Given a provider for a simulated AWS environment.
    const provider = new SimSdkLambdaVmModuleProvider({ simAws: new SimAws() });

    // When the transport modules are requested, by both the names a bundler
    // and a hand-written require use.
    const plainHttp = providedModule(provider, "http");
    const nodeHttp = providedModule(provider, "node:http");
    const plainHttps = providedModule(provider, "https");
    const nodeHttps = providedModule(provider, "node:https");

    // Then each is the module of the same name, with only the function that
    // starts a request replaced.
    assertIdentical(plainHttp["Agent"], http.Agent);
    assertIdentical(nodeHttp["Agent"], http.Agent);
    assertIdentical(plainHttps["Agent"], https.Agent);
    assertIdentical(nodeHttps["Agent"], https.Agent);
    assertFalse(nodeHttp["request"] === http.request);
    assertFalse(nodeHttps["request"] === https.request);
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

  it("names the packages the host cannot resolve", () => {
    // Given a provider whose host has one of the packages and not the other.
    const provider = new SimSdkLambdaVmModuleProvider({
      simAws: new SimAws(),
      requireModule: (specifier) => {
        if (specifier === "@aws-sdk/client-present") {
          return { presentExport: true };
        }
        throw makeModuleNotFoundError(specifier);
      },
    });

    // When the provider is asked which of a set it cannot resolve.
    const unresolved = provider.unresolvedModules([
      "@aws-sdk/client-present",
      "@aws-sdk/client-unknown",
      "left-pad",
    ]);

    // Then only the AWS SDK package it serves and cannot resolve is named:
    // a package it does not serve at all is nothing for it to report.
    assertArrayEquals(unresolved, ["@aws-sdk/client-unknown"]);
  });

  it("counts an already-provided package as resolved", () => {
    // Given a provider that has already provided a package.
    const provider = new SimSdkLambdaVmModuleProvider({ simAws: new SimAws() });
    provider.provideModule("@aws-sdk/client-s3");

    // When it is asked whether that package is missing, then it is not.
    assertArrayEquals(provider.unresolvedModules(["@aws-sdk/client-s3"]), []);
  });

  it("counts a package that fails to initialize as installed", () => {
    // Given a provider whose host resolves the package and the package
    // throws while it initializes.
    const provider = new SimSdkLambdaVmModuleProvider({
      simAws: new SimAws(),
      requireModule: () => {
        throw new Error("boom during package initialization");
      },
    });

    // When it is asked whether the package is missing, then it is not: the
    // package is there, and its own error belongs to the code requiring it.
    assertArrayEquals(provider.unresolvedModules(["@aws-sdk/client-s3"]), []);
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
