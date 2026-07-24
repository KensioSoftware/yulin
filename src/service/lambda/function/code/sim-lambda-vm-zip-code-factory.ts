import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimZipArchive } from "../../../../util/zip/zip-archive.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimLambdaCodeResolveContext } from "./sim-lambda-code-resolver.js";
import { SimLambdaVmZipCode } from "./sim-lambda-vm-zip-code.js";
import type { SimLambdaVmSdkModuleProvider } from "./vm/sdk/sim-lambda-vm-sdk-module-provider.js";

interface SimLambdaVmZipCodeFactoryProperties {
  readonly vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider | undefined;
}

/**
 * Builds executable vm zip code from code zip bytes.
 *
 * Zip validity is checked here, at function creation time, as real AWS
 * validates the uploaded archive; import and handler problems surface later
 * at invocation cold start.
 */
export class SimLambdaVmZipCodeFactory {
  private readonly vmSdkModuleProvider:
    SimLambdaVmSdkModuleProvider | undefined;

  constructor(properties: SimLambdaVmZipCodeFactoryProperties) {
    this.vmSdkModuleProvider = properties.vmSdkModuleProvider;
  }

  /**
   * Build vm zip code for a function from its code zip bytes.
   */
  make(
    zipBytes: Uint8Array,
    context: SimLambdaCodeResolveContext,
  ): SimLambdaVmZipCode {
    assertDefined(
      context.handlerName,
      "CreateFunctionCommand.input.Handler required for zip function code",
    );

    return new SimLambdaVmZipCode({
      archive: this.unzip(zipBytes),
      handlerName: context.handlerName,
      environment: {
        functionName: context.functionName,
        regionName: context.regionName,
        memorySizeMb: context.memorySizeMb,
      },
      sdkModuleProvider: this.vmSdkModuleProvider,
    });
  }

  private unzip(zipBytes: Uint8Array): SimZipArchive {
    try {
      return SimZipArchive.fromBytes(zipBytes);
    } catch (error) {
      throw new SimLambdaInvalidParameterValueException(
        "Could not unzip uploaded file. Please check your file, " +
          "then try to upload again.",
        { cause: error },
      );
    }
  }
}
