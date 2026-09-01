import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimIamActionAuthorizer } from "../../iam/authorize/sim-iam-action-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";

interface SimCloudFormationAuthorizationProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Who may do what to a simulated CloudFormation Stack.
 *
 * Every Stack command authorizes the same way: one IAM action against the ARN
 * of the Stack it names. Keeping the action names and the ARN together here
 * leaves the service class with the commands themselves, and means a command
 * says which action it is rather than assembling an ARN to ask about.
 */
export class SimCloudFormationAuthorization {
  private readonly authorizer: SimIamActionAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimCloudFormationAuthorizationProperties) {
    this.authorizer = new SimIamActionAuthorizer({ iam: properties.iam });
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may create the named Stack.
   */
  createStack(stackName: string | undefined, caller?: SimAwsCaller): void {
    this.authorize("cloudformation:CreateStack", stackName, caller);
  }

  /**
   * Ensure the caller may describe the named Stack.
   */
  describeStacks(stackName: string | undefined, caller?: SimAwsCaller): void {
    this.authorize("cloudformation:DescribeStacks", stackName, caller);
  }

  /**
   * Ensure the caller may update the named Stack.
   */
  updateStack(stackName: string | undefined, caller?: SimAwsCaller): void {
    this.authorize("cloudformation:UpdateStack", stackName, caller);
  }

  /**
   * Ensure the caller may delete the named Stack.
   */
  deleteStack(stackName: string | undefined, caller?: SimAwsCaller): void {
    this.authorize("cloudformation:DeleteStack", stackName, caller);
  }

  /**
   * Ensure the caller may create a change set against the named Stack.
   */
  createChangeSet(stackName: string | undefined, caller?: SimAwsCaller): void {
    this.authorize("cloudformation:CreateChangeSet", stackName, caller);
  }

  /**
   * Ensure the caller may describe a change set against the named Stack.
   */
  describeChangeSet(
    stackName: string | undefined,
    caller?: SimAwsCaller,
  ): void {
    this.authorize("cloudformation:DescribeChangeSet", stackName, caller);
  }

  /**
   * Ensure the caller may execute a change set against the named Stack.
   */
  executeChangeSet(stackName: string | undefined, caller?: SimAwsCaller): void {
    this.authorize("cloudformation:ExecuteChangeSet", stackName, caller);
  }

  /**
   * Ensure the caller may delete a change set against the named Stack.
   */
  deleteChangeSet(stackName: string | undefined, caller?: SimAwsCaller): void {
    this.authorize("cloudformation:DeleteChangeSet", stackName, caller);
  }

  /**
   * Ensure the caller may list the change sets against the named Stack.
   */
  listChangeSets(stackName: string | undefined, caller?: SimAwsCaller): void {
    this.authorize("cloudformation:ListChangeSets", stackName, caller);
  }

  private authorize(
    action: string,
    stackName: string | undefined,
    caller?: SimAwsCaller,
  ): void {
    this.authorizer.authorize(action, this.stackArn(stackName), caller);
  }

  /**
   * The Stack ARN a command operates on. A command naming no Stack, which
   * DescribeStacks allows, is asking about every Stack in the scope.
   */
  private stackArn(stackName: string | undefined): string {
    const { accountId, regionName } = this.accountRegionScope;

    return `arn:aws:cloudformation:${regionName}:${accountId}:stack/${stackName ?? "*"}/*`;
  }
}
