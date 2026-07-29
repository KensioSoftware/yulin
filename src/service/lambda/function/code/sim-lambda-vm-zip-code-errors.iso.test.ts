import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simLambdaVmZipFunctionFactory } from "./sim-lambda-vm-zip-function.factory.js";
import { SimLambdaRuntimeError } from "../../error/sim-lambda-runtime.error.js";
import { parseLambdaHandlerName } from "./sim-lambda-vm-zip-code.js";

describe("sim Lambda vm zip code runtime errors", () => {
  it("reports a missing handler module as Runtime.ImportModuleError", async () => {
    // Given an archive without the module the handler name references.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: { "other.js": "exports.handler = async () => null;" },
      handlerName: "index.handler",
    });

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
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: { "index.mjs": "export const handler = async () => null;" },
      handlerName: "index.handler",
    });

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "index.mjs is an ES module");
  });

  it("reports a nullish module export as Runtime.HandlerNotFound", async () => {
    // Given modules that export null and undefined instead of an object.
    const sources = ["module.exports = null;", "module.exports = undefined;"];

    const [nullExportError, undefinedExportError] = await Promise.all(
      sources.map(async (source) =>
        assertThrowsErrorAsync(async () =>
          simLambdaVmZipFunctionFactory
            .make({
              code: source,
            })
            .invoke({}),
        ),
      ),
    );

    assertInstanceOf(nullExportError, SimLambdaRuntimeError);
    assertIdentical(nullExportError.name, "Runtime.HandlerNotFound");
    assertInstanceOf(undefinedExportError, SimLambdaRuntimeError);
    assertIdentical(undefinedExportError.name, "Runtime.HandlerNotFound");
  });

  it("re-attempts a failed module require, as Node.js does", async () => {
    // Given a module that fails at import time and code that catches the
    // require error and retries.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const attempts = [];
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            require("./broken.js");
            attempts.push("loaded");
          } catch (error) {
            attempts.push(error.message);
          }
        }
        exports.handler = async () => attempts.join(",");
      `,
        "broken.js": "throw new Error('broken module');",
      },
    });

    // When the function is invoked.
    const result = await simFunction.invoke({});

    // Then the failed module was evicted and both requires re-threw, rather
    // than the retry observing silently empty exports.
    assertIdentical(result, "broken module,broken module");
  });

  it("reports a missing export as Runtime.HandlerNotFound", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: "exports.somethingElse = async () => null;",
    });

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.HandlerNotFound");
    assertStringIncludes(error.message, "index.handler is undefined");
  });

  it("reports an inherited property as Runtime.HandlerNotFound", async () => {
    // Given a module that does not export the named handler, where that name
    // happens to exist on Object.prototype.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: "exports.somethingElse = async () => null;",
      handlerName: "index.constructor",
    });

    // When the function is invoked.
    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    // Then the prototype member is not mistaken for an exported handler.
    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.HandlerNotFound");
    assertStringIncludes(error.message, "index.constructor is undefined");
  });

  it("reports invalid source as Runtime.UserCodeSyntaxError", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: "exports.handler = async ((( => null;",
    });

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.UserCodeSyntaxError");
    assertStringIncludes(error.message, "index.js");
  });

  it("hints that ES module syntax needs CommonJS instead", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: "export const handler = async () => null;",
    });

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.UserCodeSyntaxError");
    assertStringIncludes(error.message, "exports.handler = ...");
  });

  it("reports a module top-level failure as Runtime.ImportModuleError", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: `
      throw new Error("boom at init");
    `,
    });

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
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: `
      const missing = require("not-bundled");
      exports.handler = async () => missing;
    `,
    });

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "Cannot find module 'not-bundled'");
  });

  it("reports an unreadable bundled package.json as an import error", async () => {
    // Given a bundled dependency whose package.json cannot be parsed.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const broken = require("broken");
        exports.handler = async () => broken;
      `,
        "node_modules/broken/package.json": "{not json",
        "node_modules/broken/index.js": "module.exports = 1;",
      },
    });

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "JSON");
  });

  it("reports an unparseable JSON module as an import error", async () => {
    // Given code requiring a JSON module that cannot be parsed.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const config = require("./config.json");
        exports.handler = async () => config;
      `,
        "config.json": "{not valid json",
      },
    });

    const error = await assertThrowsErrorAsync(async () =>
      simFunction.invoke({}),
    );

    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertStringIncludes(error.message, "Cannot parse JSON module config.json");
  });

  it("keeps failing on repeated invocations after a failed cold start", async () => {
    // Given code that fails at import time.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: "throw new Error('boom at init');",
    });

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
