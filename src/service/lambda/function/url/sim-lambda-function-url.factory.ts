import { MappedFactory } from "@kensio/part-factory";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimLambdaFunctionName } from "../sim-lambda-function.js";
import {
  makeSimLambdaFunctionUrlId,
  SimLambdaFunctionUrl,
} from "./sim-lambda-function-url.js";

/**
 * What a test asks for when it wants a Function URL record.
 */
export interface SimLambdaFunctionUrlInput {
  readonly functionName: string;
  readonly functionArn: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Builds a Function URL record on its own, without a simulated Lambda service
 * to hold it.
 *
 * A test that wants a Function URL a simulated Lambda knows about calls
 * CreateFunctionUrlConfig instead, as an application would.
 */
export const simLambdaFunctionUrlFactory = new MappedFactory<
  SimLambdaFunctionUrlInput,
  SimLambdaFunctionUrl
>(
  () => ({
    functionName: "greeter",
    functionArn: "arn:aws:lambda:eu-west-2:111111111111:function:greeter",
    accountRegionScope: {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    },
  }),
  (input) =>
    new SimLambdaFunctionUrl({
      urlId: makeSimLambdaFunctionUrlId(),
      functionName: input.functionName as SimLambdaFunctionName,
      functionArn: input.functionArn,
      accountRegionScope: input.accountRegionScope,
    }),
);
