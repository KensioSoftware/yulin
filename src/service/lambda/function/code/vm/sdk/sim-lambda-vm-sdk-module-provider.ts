import { SimLambdaRuntimeError } from "../../../../error/sim-lambda-runtime.error.js";

/**
 * The package scope the real Lambda Node.js runtime provides without
 * bundling: AWS SDK v3 client packages.
 */
export const awsSdkPackagePrefix = "@aws-sdk/";

/**
 * Provides host-backed modules to sim Lambda vm function code.
 *
 * The vm module system asks a provider for bare specifiers the code archive
 * cannot resolve, mirroring how the real Lambda Node.js runtime provides the
 * AWS SDK without it being bundled in the deployment package. A provider
 * returns undefined for specifiers it does not serve, so the original
 * archive resolution error is reported.
 */
export interface SimLambdaVmSdkModuleProvider {
  provideModule(specifier: string): unknown;
}

/**
 * Module provider used when no simulated AWS environment is wired up, such
 * as for a standalone SimLambda constructed outside SimAws.
 */
export class SimLambdaNoVmSdkModuleProvider implements SimLambdaVmSdkModuleProvider {
  /**
   * Fail AWS SDK requires with an explanation of how to wire the provider.
   */
  provideModule(specifier: string): unknown {
    if (!specifier.startsWith(awsSdkPackagePrefix)) {
      return undefined;
    }

    throw new SimLambdaRuntimeError(
      "Runtime.ImportModuleError",
      `Cannot provide ${specifier} to sim Lambda function code: this ` +
        "SimLambda has no simulated SDK module provider. Create the " +
        "function through SimAws, construct SimLambda with a " +
        "vmSdkModuleProvider, or bundle the package into the function code " +
        "archive.",
    );
  }
}
