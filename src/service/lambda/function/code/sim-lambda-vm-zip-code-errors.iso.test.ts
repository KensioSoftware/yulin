import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimZipArchive } from "../../../../util/zip/zip-archive.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimLambdaRuntimeError } from "../../error/sim-lambda-runtime.error.js";
import { SimLambdaFunction } from "../sim-lambda-function.js";
import {
  type LambdaCodeZipFiles,
  makeLambdaCodeZip,
} from "./make-lambda-code-zip.js";
import {
  parseLambdaHandlerName,
  SimLambdaVmZipCode,
} from "./sim-lambda-vm-zip-code.js";

const accountRegionScope = {
  accountId: "111111111111" as SimAwsAccountId,
  regionName: "eu-west-2" as AwsRegionName,
};

function makeVmFunction(
  code: string | LambdaCodeZipFiles,
  handlerName = "index.handler",
): SimLambdaFunction {
  const archive = SimZipArchive.fromBytes(makeLambdaCodeZip(code));
  return new SimLambdaFunction({
    name: "vm-error-test",
    roleArn: "arn:aws:iam::111111111111:role/VmErrorRole",
    accountRegionScope,
    code: new SimLambdaVmZipCode({
      archive,
      handlerName,
      environment: {
        functionName: "vm-error-test",
        regionName: "eu-west-2",
        memorySizeMb: 128,
      },
    }),
  });
}

describe("sim Lambda vm zip code runtime errors", () => {
  it("reports a missing handler module as Runtime.ImportModuleError", async () => {
    // Given an archive without the module the handler name references.
    const simFunction = makeVmFunction(
      { "other.js": "exports.handler = async () => null;" },
      "index.handler",
    );

    // When the function is invoked, the cold start fails.
    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    // Then the failure is the AWS-like import module runtime error.
    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "Cannot find module './index'");
    assertStringIncludes(error.message, "other.js");
  });

  it("reports an ES module handler file as unsupported", async () => {
    const simFunction = makeVmFunction(
      { "index.mjs": "export const handler = async () => null;" },
      "index.handler",
    );

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "index.mjs is an ES module");
  });

  it("reports a missing export as Runtime.HandlerNotFound", async () => {
    const simFunction = makeVmFunction(
      "exports.somethingElse = async () => null;",
    );

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.HandlerNotFound");
    assertStringIncludes(error.message, "index.handler is undefined");
  });

  it("reports invalid source as Runtime.UserCodeSyntaxError", async () => {
    const simFunction = makeVmFunction("exports.handler = async ((( => null;");

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.UserCodeSyntaxError");
    assertStringIncludes(error.message, "index.js");
  });

  it("hints that ES module syntax needs CommonJS instead", async () => {
    const simFunction = makeVmFunction(
      "export const handler = async () => null;",
    );

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.UserCodeSyntaxError");
    assertStringIncludes(error.message, "exports.handler = ...");
  });

  it("reports a module top-level failure as Runtime.ImportModuleError", async () => {
    const simFunction = makeVmFunction(`
      throw new Error("boom at init");
    `);

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "boom at init");
  });

  it("reports an unbundled dependency as Runtime.ImportModuleError", async () => {
    // Given code requiring a dependency that is not in the archive; on real
    // Lambda dependencies must be bundled into the deployment package.
    const simFunction = makeVmFunction(`
      const missing = require("not-bundled");
      exports.handler = async () => missing;
    `);

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "Cannot find module 'not-bundled'");
  });

  it("reports an unreadable bundled package.json as an import error", async () => {
    // Given a bundled dependency whose package.json cannot be parsed.
    const simFunction = makeVmFunction({
      "index.js": `
        const broken = require("broken");
        exports.handler = async () => broken;
      `,
      "node_modules/broken/package.json": "{not json",
      "node_modules/broken/index.js": "module.exports = 1;",
    });

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "JSON");
  });

  it("keeps failing on repeated invocations after a failed cold start", async () => {
    // Given code that fails at import time.
    const simFunction = makeVmFunction("throw new Error('boom at init');");

    // When the function is invoked twice.
    const first = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );
    const second = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    // Then both invocations report the same cold start failure.
    assertIdentical(first.name, "Runtime.ImportModuleError");
    assertIdentical(second.name, "Runtime.ImportModuleError");
  });
});

describe("Lambda handler name parsing", () => {
  it("splits the module path and export name on the last dot", () => {
    const parsed = parseLambdaHandlerName("src/app.service.handler");

    assertIdentical(parsed.modulePath, "src/app.service");
    assertIdentical(parsed.exportName, "handler");
  });

  it("rejects a handler name without a file and method", () => {
    for (const badHandlerName of ["nodots", "index.", ".handler"]) {
      const error = assertThrowsError(() =>
        parseLambdaHandlerName(badHandlerName),
      );

      assertInstanceOf(error, SimLambdaRuntimeError);
      assertIdentical(error.name, "Runtime.MalformedHandlerName");
    }
  });
});
