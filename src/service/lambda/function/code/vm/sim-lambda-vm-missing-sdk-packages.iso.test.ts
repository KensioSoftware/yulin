import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertStringNotIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { SimLambdaRuntimeError } from "../../../error/sim-lambda-runtime.error.js";
import type { LambdaCodeZipFiles } from "../make-lambda-code-zip.js";
import { simLambdaVmZipFunctionFactory } from "../sim-lambda-vm-zip-function.factory.js";
import { SimSdkLambdaVmModuleProvider } from "./sdk/sim-sdk-lambda-vm-module-provider.js";

/**
 * Package names no project installs, so the host resolves neither of them
 * however this suite is installed.
 */
const absentAlpha = "@aws-sdk/client-absent-alpha";
const absentBeta = "@aws-sdk/client-absent-beta";

function coldStartError(code: string | LambdaCodeZipFiles): Promise<Error> {
  const simFunction = simLambdaVmZipFunctionFactory.make({
    code,
    sdkModuleProvider: new SimSdkLambdaVmModuleProvider({
      simAws: new SimAws(),
    }),
  });
  return assertThrowsErrorAsync(async () => simFunction.invoke({}));
}

describe("sim Lambda function code importing uninstalled AWS SDK packages", () => {
  it("names every package the project has not installed", async () => {
    // Given function code importing two AWS SDK packages the project does
    // not have.
    const error = await coldStartError(`
      const alpha = require("${absentAlpha}");
      const beta = require("${absentBeta}");
      exports.handler = async () => ({ alpha, beta });
    `);

    // Then the cold start is refused once, naming both, so one install
    // covers the set rather than one package costing one run.
    assertInstanceOf(error, SimLambdaRuntimeError);
    assertIdentical(error.name, "Runtime.ImportModuleError");
    assertIdentical(
      error.message,
      `Cannot provide ${absentAlpha}, ${absentBeta} to sim Lambda function ` +
        "code: the packages are not installed. Install them in your " +
        "project, as the real Lambda runtime provides them, or bundle them " +
        "into the function code archive.",
    );
  });

  it("keeps the singular wording for one package", async () => {
    // Given function code importing a single absent AWS SDK package.
    const error = await coldStartError(`
      const alpha = require("${absentAlpha}");
      exports.handler = async () => alpha;
    `);

    // Then the message reads as it always has for the one.
    assertIdentical(
      error.message,
      `Cannot provide ${absentAlpha} to sim Lambda function code: the ` +
        "package is not installed. Install it in your project, as the real " +
        "Lambda runtime provides it, or bundle it into the function code " +
        "archive.",
    );
  });

  it("leaves out packages the project has installed", async () => {
    // Given function code importing an absent package before one the
    // project does have.
    const error = await coldStartError(`
      const alpha = require("${absentAlpha}");
      const s3 = require("@aws-sdk/client-s3");
      exports.handler = async () => ({ alpha, s3 });
    `);

    // Then only the one to install is named.
    assertStringIncludes(error.message, absentAlpha);
    assertStringNotIncludes(error.message, "@aws-sdk/client-s3");
  });

  it("leaves out packages the archive bundles", async () => {
    // Given an archive bundling one AWS SDK package and importing another it
    // does not have.
    const error = await coldStartError({
      "index.js": `
        const bundled = require("@aws-sdk/client-bundled");
        const beta = require("${absentBeta}");
        exports.handler = async () => ({ bundled, beta });
      `,
      "node_modules/@aws-sdk/client-bundled/index.js":
        "module.exports = { bundled: true };",
    });

    // Then the bundled package is not something to install: the archive
    // takes precedence over anything the runtime provides.
    assertStringIncludes(error.message, absentBeta);
    assertStringNotIncludes(error.message, "@aws-sdk/client-bundled");
  });

  it("reports what a bundled dependency imports as it reaches it", async () => {
    // Given an archive whose bundled dependency imports an absent package,
    // which nothing in the function's own code mentions.
    const error = await coldStartError({
      "index.js": `
        const helper = require("helper");
        exports.handler = async () => helper;
      `,
      "node_modules/helper/index.js": `module.exports = require("${absentAlpha}");`,
    });

    // Then it is named on its own. A vendored tree is not read to find one
    // more install; what a bundled package imports is its own business.
    assertStringIncludes(error.message, absentAlpha);
    assertStringIncludes(error.message, "the package is not installed");
  });
});
