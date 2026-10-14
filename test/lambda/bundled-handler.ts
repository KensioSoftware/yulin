import { assertNonNullable } from "@kensio/smartass";
import { build } from "esbuild";

/**
 * Bundle a handler into one CommonJS module with its dependencies inlined, as
 * a deployment package build with no external modules produces.
 */
export async function bundleHandler(source: string): Promise<string> {
  const bundled = await build({
    stdin: {
      contents: source,
      loader: "ts",
      resolveDir: import.meta.dirname,
      sourcefile: "index.ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    target: "node24",
    format: "cjs",
  });

  const output = bundled.outputFiles[0];
  assertNonNullable(output);

  return output.text;
}
