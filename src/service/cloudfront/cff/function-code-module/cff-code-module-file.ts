import { readFileSync } from "node:fs";

/**
 * Get CloudFront Function code from a module file and replace the export of the
 * handler function.
 * This is to allow normal import of CFF JS2 functions in tests and simulations.
 * This assumes a single `export function handler(...)` convention.
 * @example
 * ```typescript
 * import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
 * import { cloudFrontFunctionSourceFromModule } from "@kensio/yulin/cloudfront";
 *
 * new cloudfront.Function(this, "FooCloudFrontFunction", {
 *   code: cloudfront.FunctionCode.fromInline(
 *     cloudFrontFunctionSourceFromModule("src/cff/foo.cff.js")
 *   ),
 * });
 * ```
 */
export function cloudFrontFunctionSourceFromModule(filePath: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const source = readFileSync(filePath, "utf8");
  const handlerPattern =
    /\b(?:export[\t ]+function|function)[\t ]+handler[\t ]*\(/;

  if (!handlerPattern.test(source)) {
    throw new Error(
      `CloudFront Function handler export pattern was not found in module: ${filePath}`,
    );
  }

  return source.replace(handlerPattern, "function handler(");
}
