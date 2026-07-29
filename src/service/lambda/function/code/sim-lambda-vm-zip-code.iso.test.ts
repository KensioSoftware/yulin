import { assertIdentical, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simLambdaVmZipFunctionFactory } from "./sim-lambda-vm-zip-function.factory.js";

describe("sim Lambda vm zip code", () => {
  it("runs a source string handler with the event, context and env", async () => {
    // Given zipped source using the event, context, and runtime env vars.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: `
      exports.handler = async (event, context) => ({
        greeted: event.name,
        functionName: context.functionName,
        region: process.env.AWS_REGION,
        memory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
      });
    `,
      memorySizeMb: 256,
    });

    // When the function is invoked.
    const result = await simFunction.invoke({ name: "Yulin" });

    // Then the handler ran in the vm with AWS-like surroundings. The result
    // is cloned because vm result objects belong to the vm realm.
    assertObjectEquals(structuredClone(result) as object, {
      greeted: "Yulin",
      functionName: "vm-test",
      region: "eu-west-2",
      memory: "256",
    });
  });

  it("runs a synchronous vm handler", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: "exports.handler = (event) => event.value * 2;",
    });

    const result = await simFunction.invoke({ value: 21 });

    assertIdentical(result, 42);
  });

  it("keeps module state warm across invocations", async () => {
    // Given module code with top-level state.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: `
      let invocations = 0;
      exports.handler = async () => {
        invocations += 1;
        return invocations;
      };
    `,
    });

    // When the function is invoked repeatedly.
    const first = await simFunction.invoke({});
    const second = await simFunction.invoke({});

    // Then the module cold-starts once and stays warm, as on real Lambda.
    assertIdentical(first, 1);
    assertIdentical(second, 2);
  });

  it("supports relative requires between archived modules", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const { greet } = require("./lib/greeting.js");
        exports.handler = async (event) => greet(event.name);
      `,
        "lib/greeting.js": "exports.greet = (name) => 'Hi ' + name;",
      },
    });

    const result = await simFunction.invoke({ name: "relative" });

    assertIdentical(result, "Hi relative");
  });

  it("supports requiring Node.js built-in modules", async () => {
    // Given code using a built-in, which the real runtime provides.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: `
      const crypto = require("node:crypto");
      exports.handler = async (event) =>
        crypto.createHash("sha256").update(event.text).digest("hex");
    `,
    });

    const result = await simFunction.invoke({ text: "hello" });

    assertIdentical(
      result,
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("supports node_modules bundled in the archive", async () => {
    // Given a dependency with a package.json main, as SAM-style packaging
    // bundles.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const decorate = require("decorate");
        exports.handler = async (event) => decorate(event.text);
      `,
        "node_modules/decorate/package.json": '{"main":"lib/main.js"}',
        "node_modules/decorate/lib/main.js":
          "module.exports = (text) => '** ' + text + ' **';",
      },
    });

    const result = await simFunction.invoke({ text: "packaged" });

    assertIdentical(result, "** packaged **");
  });

  it("supports node_modules without a package.json main", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const plain = require("plain");
        exports.handler = async () => plain;
      `,
        "node_modules/plain/index.js": "module.exports = 'no package.json';",
      },
    });

    const result = await simFunction.invoke({});

    assertIdentical(result, "no package.json");
  });

  it("loads a module required from several places only once", async () => {
    // Given two modules both requiring a shared module with side effects.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const first = require("./first.js");
        const second = require("./second.js");
        exports.handler = async () => first.loads + second.loads;
      `,
        "first.js": "exports.loads = require('./shared.js').loads;",
        "second.js": "exports.loads = require('./shared.js').loads;",
        "shared.js": `
        exports.loads = (globalThis.sharedLoads = (globalThis.sharedLoads ?? 0) + 1);
      `,
      },
    });

    // When the function is invoked.
    const result = await simFunction.invoke({});

    // Then the shared module evaluated once and its exports were cached.
    assertIdentical(result, 2);
  });

  it("falls back to index.js for a package.json without a main", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const mainless = require("mainless");
        exports.handler = async () => mainless;
      `,
        "node_modules/mainless/package.json": "{}",
        "node_modules/mainless/index.js": "module.exports = 'main fallback';",
      },
    });

    const result = await simFunction.invoke({});

    assertIdentical(result, "main fallback");
  });

  it("supports requiring JSON modules", async () => {
    // Given code requiring a bundled JSON file, as Node.js CommonJS allows.
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const config = require("./config.json");
        exports.handler = async () => config.greeting;
      `,
        "config.json": '{"greeting":"hello from json"}',
      },
    });

    const result = await simFunction.invoke({});

    assertIdentical(result, "hello from json");
  });

  it("resolves an extensionless require to a JSON module", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "index.js": `
        const config = require("./config");
        exports.handler = async () => config.greeting;
      `,
        "config.json": '{"greeting":"extensionless json"}',
      },
    });

    const result = await simFunction.invoke({});

    assertIdentical(result, "extensionless json");
  });

  it("supports a nested handler module path", async () => {
    const simFunction = simLambdaVmZipFunctionFactory.make({
      code: {
        "src/app.js": "exports.run = async () => 'nested';",
      },
      handlerName: "src/app.run",
    });

    const result = await simFunction.invoke({});

    assertIdentical(result, "nested");
  });
});
