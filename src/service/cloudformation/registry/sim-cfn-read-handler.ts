import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamActionAuthorizer } from "../../iam/authorize/sim-iam-action-authorizer.js";

interface SimCfnReadHandlerProperties {
  readonly resourceType: string;
  readonly arnFormat: string;
  readonly actions: readonly string[];
  readonly anyResourceActions: readonly string[];
}

/**
 * The IAM actions one Resource type's CloudFormation read handler calls as
 * the Stack's execution role, and the ARN format they are decided on.
 *
 * Only the actions in the type's own service are held. Each is decided either
 * on the Resource's own ARN or, for an action IAM scopes to no resource type
 * (`batch:DescribeJobQueues`), on `*`.
 */
export class SimCfnReadHandler {
  public readonly resourceType: string;

  /**
   * The Resource's ARN with its variables left in, as the Service
   * Authorization Reference writes it (`repository/${DomainName}/...`).
   */
  public readonly arnFormat: string;

  private readonly actions: readonly string[];
  private readonly anyResourceActions: readonly string[];

  constructor(properties: SimCfnReadHandlerProperties) {
    this.resourceType = properties.resourceType;
    this.arnFormat = properties.arnFormat;
    this.actions = properties.actions;
    this.anyResourceActions = properties.anyResourceActions;
  }

  /**
   * Ensure the caller may make every call the read handler makes on the
   * Resource with this ARN.
   */
  authorize(
    authorizer: SimIamActionAuthorizer,
    resourceArn: string,
    caller: SimAwsCaller | undefined,
  ): void {
    for (const action of this.actions) {
      authorizer.authorize(action, resourceArn, caller);
    }

    for (const action of this.anyResourceActions) {
      authorizer.authorize(action, "*", caller);
    }
  }
}
