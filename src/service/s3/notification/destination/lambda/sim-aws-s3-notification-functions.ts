import type { SimAws } from "../../../../aws/sim-aws.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import type { SimLambdaFunction } from "../../../../lambda/function/sim-lambda-function.js";
import type { SimIamInterServiceAuthZ } from "../../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimS3NotificationDestinationRequest } from "../sim-s3-notification-destination.js";
import { simS3ServicePrincipal } from "../sim-s3-service-principal.js";
import { SimS3NotificationFunctionArn } from "./sim-s3-notification-function-arn.js";
import type { SimS3NotificationFunctions } from "./sim-s3-notification-functions.js";

interface SimAwsS3NotificationFunctionsProperties {
  readonly simAws: SimAws;
}

/**
 * The simulated Lambda functions of one simulated AWS instance, as S3
 * notification destinations.
 *
 * Functions are looked up when a configuration is applied or an event is
 * delivered, never when this is built. Simulated Lambda already reaches
 * simulated S3 while it is being constructed, for function code in a Bucket, so
 * reaching back the other way at construction time would be a cycle with no
 * bottom to it.
 */
export class SimAwsS3NotificationFunctions implements SimS3NotificationFunctions {
  private readonly simAws: SimAws;

  constructor(properties: SimAwsS3NotificationFunctionsProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Why S3 may not invoke the function, or nothing when it may.
   *
   * Whether a service may invoke a function is Lambda's own rule, so the
   * decision is made there. What S3 adds is which Bucket is calling, supplied
   * as the source ARN and source Account, so a permission granted for one
   * Bucket does not open the function to another.
   */
  invokeRefusal(
    request: SimS3NotificationDestinationRequest,
  ): string | undefined {
    const arn = SimS3NotificationFunctionArn.parse(request.destinationArn);
    const simFunction = this.findFunction(arn);

    if (simFunction === undefined) {
      return `${request.destinationArn} is not a simulated Lambda function.`;
    }

    const decision = new SimLambdaServiceInvokeAuthorizer({
      iam: this.iam(arn),
    }).authorize({
      simFunction,
      servicePrincipal: simS3ServicePrincipal,
      sourceArn: request.bucketArn,
      sourceAccount: request.bucketOwnerAccountId,
    });

    if (decision.isDenied) {
      return (
        `The resource policy of ${request.destinationArn} does not allow ` +
        `${simS3ServicePrincipal} to invoke it for ${request.bucketArn}. ` +
        "Grant it with AddPermission."
      );
    }

    return undefined;
  }

  /**
   * Invoke the function with the event document.
   *
   * The function is invoked directly rather than through an Invoke command,
   * because S3 is already inside the background task that stands for the
   * asynchronous invocation real S3 makes, and because a handler failure has
   * to reach the delivery outcome rather than being swallowed as an
   * asynchronous invocation error.
   */
  async invoke(
    request: SimS3NotificationDestinationRequest,
    event: object,
  ): Promise<void> {
    const arn = SimS3NotificationFunctionArn.parse(request.destinationArn);
    const simFunction = this.findFunction(arn);

    // oxlint-disable-next-line yulin/assert-defined-guard -- `assertDefined` is denser per line, and this file is close enough to the FTA threshold that the guard costs less kept as it is
    if (simFunction === undefined) {
      throw new Error(
        `${request.destinationArn} is not a simulated Lambda function.`,
      );
    }

    await simFunction.invoke(event);
  }

  private findFunction(
    arn: SimS3NotificationFunctionArn,
  ): SimLambdaFunction | undefined {
    return this.scope(arn).lambda().getSimFunctionByName(arn.functionName);
  }

  private iam(arn: SimS3NotificationFunctionArn): SimIamInterServiceAuthZ {
    return this.scope(arn).iam();
  }

  private scope(
    arn: SimS3NotificationFunctionArn,
  ): ReturnType<SimAws["accountRegionScope"]> {
    return this.simAws.accountRegionScope(arn.accountId, arn.regionName);
  }
}
