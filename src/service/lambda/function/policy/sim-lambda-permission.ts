import type {
  SimIamConditionValue,
  SimIamPolicyDocumentCondition,
  SimIamPolicyDocumentStatement,
} from "../../../iam/policy/sim-iam-policy.js";
import { simLambdaPermissionPrincipal } from "./sim-lambda-permission-principal.js";

/**
 * The condition key a Function URL grant is conditioned on, so a permission
 * granting `lambda:InvokeFunctionUrl` applies to the auth type it was granted
 * for and not to another.
 */
export const simLambdaFunctionUrlAuthTypeConditionKey =
  "lambda:FunctionUrlAuthType";

/**
 * The condition key restricting an `lambda:InvokeFunction` grant to requests
 * that arrived through the function's own URL.
 *
 * Nothing supplies a value for it, so a statement carrying it never matches.
 * That is deliberate and is the safe direction: the simulator does not model
 * the distinction, and refusing is better than granting the plain Invoke API
 * something real AWS would only allow through the URL.
 */
export const simLambdaInvokedViaFunctionUrlConditionKey =
  "lambda:InvokedViaFunctionUrl";

interface SimLambdaPermissionProperties {
  readonly statementId: string;
  readonly action: string;
  readonly principal: string;
  readonly resourceArn: string;
  readonly functionUrlAuthType?: string | undefined;
  readonly sourceArn?: string | undefined;
  readonly sourceAccount?: string | undefined;
  readonly principalOrgId?: string | undefined;
  readonly invokedViaFunctionUrl?: boolean | undefined;
}

/**
 * One statement of a simulated Lambda function's resource-based policy.
 *
 * `AddPermission` is a shorthand for writing a policy statement: it takes the
 * parts and Lambda assembles the statement, which is what `GetPolicy` hands
 * back. Modelling it as the permission rather than as a raw statement keeps
 * that relationship, and keeps `RemovePermission` able to find a statement by
 * its id.
 */
export class SimLambdaPermission {
  public readonly statementId: string;
  public readonly action: string;
  public readonly principal: string;
  public readonly resourceArn: string;

  private readonly functionUrlAuthType?: string | undefined;
  private readonly sourceArn?: string | undefined;
  private readonly sourceAccount?: string | undefined;
  private readonly principalOrgId?: string | undefined;
  private readonly invokedViaFunctionUrl?: boolean | undefined;

  constructor(properties: SimLambdaPermissionProperties) {
    this.statementId = properties.statementId;
    this.action = properties.action;
    this.principal = properties.principal;
    this.resourceArn = properties.resourceArn;
    this.functionUrlAuthType = properties.functionUrlAuthType;
    this.sourceArn = properties.sourceArn;
    this.sourceAccount = properties.sourceAccount;
    this.principalOrgId = properties.principalOrgId;
    this.invokedViaFunctionUrl = properties.invokedViaFunctionUrl;
  }

  /**
   * The policy statement this permission expands into.
   */
  toStatement(): SimIamPolicyDocumentStatement {
    const condition = this.condition();

    return {
      Sid: this.statementId,
      Effect: "Allow",
      Principal: simLambdaPermissionPrincipal(this.principal),
      Action: this.action,
      Resource: this.resourceArn,
      ...(condition !== undefined && { Condition: condition }),
    };
  }

  /**
   * The condition block the qualifying properties expand into.
   *
   * `lambda:FunctionUrlAuthType` is given a value when a Function URL is
   * invoked, and `AWS:SourceArn` when an API Gateway HTTP API integration
   * invokes the function. The rest are still written into the statement,
   * because `GetPolicy` should report the permission that was granted; a
   * statement carrying one of them simply never matches, which is the safe
   * direction for a condition the simulator cannot evaluate.
   */
  private condition(): SimIamPolicyDocumentCondition | undefined {
    const stringEquals = this.stringEqualsConditions();
    const condition: Record<string, Record<string, SimIamConditionValue>> = {};

    if (Object.keys(stringEquals).length > 0) {
      condition["StringEquals"] = stringEquals;
    }

    if (this.sourceArn !== undefined) {
      condition["ArnLike"] = { "AWS:SourceArn": this.sourceArn };
    }

    if (this.invokedViaFunctionUrl !== undefined) {
      condition["Bool"] = {
        [simLambdaInvokedViaFunctionUrlConditionKey]:
          this.invokedViaFunctionUrl,
      };
    }

    return Object.keys(condition).length === 0 ? undefined : condition;
  }

  private stringEqualsConditions(): Record<string, SimIamConditionValue> {
    return {
      ...(this.functionUrlAuthType !== undefined && {
        [simLambdaFunctionUrlAuthTypeConditionKey]: this.functionUrlAuthType,
      }),
      ...(this.sourceAccount !== undefined && {
        "AWS:SourceAccount": this.sourceAccount,
      }),
      ...(this.principalOrgId !== undefined && {
        "aws:PrincipalOrgID": this.principalOrgId,
      }),
    };
  }
}
