import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimLambdaCodeSource } from "./lambda-code-source.js";
import {
  type SimLambdaExecutableCode,
  SimLambdaHandlerReferenceCode,
} from "./sim-lambda-executable-code.js";
import { SimLambdaVmZipCodeFactory } from "./sim-lambda-vm-zip-code-factory.js";
import {
  type SimLambdaCodeStore,
  SimLambdaNoCodeStore,
} from "./store/sim-lambda-code-store.js";
import type { SimLambdaVmSdkModuleProvider } from "./vm/sdk/sim-lambda-vm-sdk-module-provider.js";

interface SimLambdaCodeResolverProperties {
  readonly codeStore?: SimLambdaCodeStore | undefined;
  readonly vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider | undefined;
}

/**
 * The function details a code source is resolved for: the handler identifier
 * selecting the module and export, the AWS-like execution environment for vm
 * code, and the creating caller for S3 code fetch authorization.
 */
export interface SimLambdaCodeResolveContext {
  readonly handlerName: string | undefined;
  readonly functionName: string;
  readonly regionName: string;
  readonly memorySizeMb: number;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Resolves a validated CreateFunction code source into executable sim Lambda
 * code.
 *
 * As on real AWS, S3-located code is fetched and zip validity is checked at
 * function creation, while module import and handler lookup problems only
 * surface later, at invocation cold start.
 */
export class SimLambdaCodeResolver {
  private readonly codeStore: SimLambdaCodeStore;
  private readonly vmZipCodeFactory: SimLambdaVmZipCodeFactory;

  constructor(properties: SimLambdaCodeResolverProperties) {
    this.codeStore = properties.codeStore ?? new SimLambdaNoCodeStore();
    this.vmZipCodeFactory = new SimLambdaVmZipCodeFactory({
      vmSdkModuleProvider: properties.vmSdkModuleProvider,
    });
  }

  /**
   * Resolve the code source into executable code.
   */
  async resolve(
    source: SimLambdaCodeSource,
    context: SimLambdaCodeResolveContext,
  ): Promise<SimLambdaExecutableCode> {
    switch (source.kind) {
      case "handler-reference": {
        return new SimLambdaHandlerReferenceCode(source.handlerFunction);
      }
      case "zip-bytes": {
        return this.vmZipCodeFactory.make(source.zipBytes, context);
      }
      case "s3-location": {
        const zipBytes = await this.codeStore.getZipBytes({
          bucketName: source.bucketName,
          objectKey: source.objectKey,
          caller: context.caller,
        });
        return this.vmZipCodeFactory.make(zipBytes, context);
      }
    }
  }
}
