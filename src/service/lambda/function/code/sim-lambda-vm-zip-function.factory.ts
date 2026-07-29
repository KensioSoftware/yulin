import { MappedFactory } from "@kensio/part-factory";
import { SimZipArchive } from "../../../../util/zip/zip-archive.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { simLambdaEnvironmentFactory } from "../environment/sim-lambda-environment.factory.js";
import { SimLambdaFunction } from "../sim-lambda-function.js";
import {
  type LambdaCodeZipFiles,
  makeLambdaCodeZip,
} from "./make-lambda-code-zip.js";
import { SimLambdaVmZipCode } from "./sim-lambda-vm-zip-code.js";

/**
 * What a test asks for when it wants a function backed by zip code running in
 * a vm sandbox.
 *
 * The code is either source for a single index.js module or a map of archive
 * paths, as `makeLambdaCodeZip` accepts.
 */
export interface SimLambdaVmZipFunctionInput {
  readonly name: string;
  readonly roleArn: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly code: string | LambdaCodeZipFiles;
  readonly handlerName: string;
  readonly memorySizeMb: number;
}

/**
 * Builds a simulated Lambda function whose code is a real zip archive run in a
 * vm sandbox, without a simulated Lambda service to hold it.
 *
 * ```typescript
 * const simFunction = simLambdaVmZipFunctionFactory.make({
 *   code: "exports.handler = async () => null;",
 * });
 * ```
 */
export const simLambdaVmZipFunctionFactory = new MappedFactory<
  SimLambdaVmZipFunctionInput,
  SimLambdaFunction
>(
  () => ({
    name: "vm-test",
    roleArn: "arn:aws:iam::111111111111:role/VmRole",
    accountRegionScope: {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    },
    code: "exports.handler = async () => null;",
    handlerName: "index.handler",
    memorySizeMb: 128,
  }),
  (input) => {
    const archive = SimZipArchive.fromBytes(makeLambdaCodeZip(input.code));
    const environment = simLambdaEnvironmentFactory.make({
      functionName: input.name,
      regionName: input.accountRegionScope.regionName,
      memorySizeMb: input.memorySizeMb,
    });

    return new SimLambdaFunction({
      name: input.name,
      roleArn: input.roleArn,
      accountRegionScope: input.accountRegionScope,
      code: new SimLambdaVmZipCode({
        archive,
        handlerName: input.handlerName,
        environment,
      }),
    });
  },
);
