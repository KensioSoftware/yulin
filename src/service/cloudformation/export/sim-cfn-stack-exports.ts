import type { SimCfnStackOutput } from "../stack/output/sim-cfn-stack-output.js";
import type { SimCfnExport } from "./sim-cfn-exports.js";

/**
 * The exports a Stack's resolved Outputs publish.
 *
 * An Output carries an export name only where the template gave it an
 * `Export.Name`, and the rest of the Outputs are readable through
 * DescribeStacks without being importable.
 */
export function simCfnStackExports(
  outputs: ReadonlyMap<string, SimCfnStackOutput>,
): SimCfnExport[] {
  const exports: SimCfnExport[] = [];

  for (const output of outputs.values()) {
    const name = output.exportName;

    if (name === undefined) {
      continue;
    }

    if (typeof name !== "string") {
      throw new TypeError(
        `Sim CloudFormation Output ${output.outputKey} Export Name must ` +
          `resolve to a string, got ${typeof name}`,
      );
    }

    exports.push({ name, value: output.value });
  }

  return exports;
}
