import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertIdentical,
  assertObjectEquals,
  assertThrowsError,
} from "@kensio/smartass";
import { SimCfnFnImportValue as SimCfnFunctionImportValue } from "./sim-cfn-fn-import-value.js";
import { SimCfnLiteral } from "../../sim-cfn-literal.js";
import { SimCfnRef as SimCfnReference } from "../../sim-cfn-ref.js";
import { SimCfnResolveContext } from "../../../resolve/sim-cfn-resolve-context.js";
import { SimCfnParameters } from "../../../../parameters/sim-cfn-parameters.js";
import { SimCfnExports } from "../../../../export/sim-cfn-exports.js";
import { parseSimCfnNode } from "../../../parse/node/sim-cfn-node-parser.js";

const contextWith = (exports: SimCfnExports): SimCfnResolveContext =>
  new SimCfnResolveContext({ parameters: new SimCfnParameters(), exports });

describe("SimCfnFnImportValue", () => {
  it("resolves to the value published under the export name", () => {
    // Given a published export.
    const exports = new SimCfnExports();
    exports.publish("ProducerStack", [
      { name: "SharedQueueUrl", value: "https://example.invalid/queue" },
    ]);

    // When an import names it.
    const resolved = new SimCfnFunctionImportValue(
      new SimCfnLiteral("SharedQueueUrl"),
    ).resolve(contextWith(exports));

    // Then the published value comes back.
    assertIdentical(resolved, "https://example.invalid/queue");
  });

  it("re-emits itself while the export name is an unresolved expression", () => {
    // Given an import whose name is built from a Resource that has yet to
    // exist, so the first resolution pass cannot finish it.
    const importValue = new SimCfnFunctionImportValue(
      new SimCfnReference("SomeResource"),
    );

    // When it resolves without that Resource.
    const resolved = importValue.resolve(contextWith(new SimCfnExports()));

    // Then it comes back in template form for a later pass to finish.
    assertObjectEquals(resolved, {
      "Fn::ImportValue": { Ref: "SomeResource" },
    });
  });

  it("reports the names its export name references", () => {
    const importValue = new SimCfnFunctionImportValue(
      new SimCfnReference("EnvironmentName"),
    );

    assertArrayEquals(importValue.referencedNames(), ["EnvironmentName"]);
  });

  it("refuses an export name that resolves to something other than a string", () => {
    const error = assertThrowsError(() => {
      new SimCfnFunctionImportValue(new SimCfnLiteral(42)).resolve(
        contextWith(new SimCfnExports()),
      );
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::ImportValue export name must resolve to a " +
        "string, got number",
    );
  });

  it("refuses a Fn::ImportValue written as a list", () => {
    const error = assertThrowsError(() => {
      parseSimCfnNode({ "Fn::ImportValue": ["SharedQueueUrl"] });
    });

    assertIdentical(
      error.message,
      "Sim CloudFormation Fn::ImportValue value must be an export name",
    );
  });
});
