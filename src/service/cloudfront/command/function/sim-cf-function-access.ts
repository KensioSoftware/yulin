import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimCloudFrontFunctionStage } from "../../cff/sim-cff-stage.js";
import type { SimCloudFrontFunction } from "../../cff/sim-cloudfront-function.js";
import { simCfAuthorize } from "../../sim-cf-authorize.js";
import type { SimCloudFrontFunctionMap } from "../create-function/create-function.handler.js";
import { simCfFunctionInStage } from "./sim-cf-function-lookup.js";

interface SimCfFunctionAccessProperties {
  readonly accountId: SimAwsAccountId;
  readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * What every command reading a Function back needs: the Functions, IAM, and
 * the clock.
 *
 * ListFunctions, DescribeFunction and GetFunction authorize the same way and
 * resolve a Function the same way, so the wiring is here once rather than in
 * each of them. Each command class is then only its own AWS behaviour.
 */
export class SimCfFunctionAccess {
  public readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  public readonly background: BackgroundScheduler;

  private readonly accountId: SimAwsAccountId;
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimCfFunctionAccessProperties) {
    this.accountId = properties.accountId;
    this.cloudFrontFunctions = properties.cloudFrontFunctions;
    this.iam = properties.iam;
    this.background = properties.background;
  }

  /**
   * Ensure the caller may take an action on a Function ARN.
   */
  authorize(action: string, resource: string, caller?: SimAwsCaller): void {
    simCfAuthorize({ iam: this.iam, action, resource, caller });
  }

  /**
   * Ensure the caller may take an action on any Function in the Account.
   *
   * ListFunctions names no Function, so a policy granting it has to use the
   * wildcard, and this is what it is authorized against.
   */
  authorizeAnyFunction(action: string, caller?: SimAwsCaller): void {
    this.authorize(
      action,
      `arn:aws:cloudfront::${this.accountId}:function/*`,
      caller,
    );
  }

  /**
   * Resolve a Function in a stage, having authorized the action against it.
   *
   * The ARN is built from the name the caller gave, so authorization happens
   * before the Function map is read and an unauthorized caller is refused
   * whether or not the name resolves.
   */
  authorizedByName(
    action: string,
    functionName: string,
    stage: SimCloudFrontFunctionStage,
    caller?: SimAwsCaller,
  ): SimCloudFrontFunction {
    this.authorize(
      action,
      `arn:aws:cloudfront::${this.accountId}:function/${functionName}`,
      caller,
    );

    return simCfFunctionInStage(this.cloudFrontFunctions, functionName, stage);
  }
}
