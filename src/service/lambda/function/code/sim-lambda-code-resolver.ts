import { SimZipArchive } from "../../../../util/zip/zip-archive.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimLambdaCodeSource } from "./lambda-code-source.js";
import {
  type SimLambdaExecutableCode,
  SimLambdaHandlerReferenceCode,
} from "./sim-lambda-executable-code.js";
import { SimLambdaVmZipCode } from "./sim-lambda-vm-zip-code.js";
import {
  type SimLambdaCodeStore,
  SimLambdaNoCodeStore,
} from "./store/sim-lambda-code-store.js";

interface SimLambdaCodeResolverProperties {
  readonly codeStore?: SimLambdaCodeStore | undefined;
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

  constructor(properties: SimLambdaCodeResolverProperties) {
    this.codeStore = properties.codeStore ?? new SimLambdaNoCodeStore();
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
        return this.vmZipCode(source.zipBytes, context);
      }
      case "s3-location": {
        const zipBytes = await this.codeStore.getZipBytes({
          bucketName: source.bucketName,
          objectKey: source.objectKey,
          caller: context.caller,
        });
        return this.vmZipCode(zipBytes, context);
      }
    }
  }

  private vmZipCode(
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
