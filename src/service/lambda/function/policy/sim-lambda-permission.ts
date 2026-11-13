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
 * A Function URL request supplies it as true. The Invoke API supplies nothing,
 * so a statement carrying it allows the URL and never the plain Invoke API.
 */
export const simLambdaInvokedViaFunctionUrlConditionKey =
  "lambda:InvokedViaFunctionUrl";

/**
 * The condition key restricting a grant to Alexa to one skill.
 *
 * No simulated service invokes a function as Alexa, so nothing supplies it.
 */
export const simLambdaEventSourceTokenConditionKey = "lambda:EventSourceToken";

/**
 * The condition key naming what a simulated service is invoking the function
 * for, such as the API Gateway route a request matched.
 */
export const simLambdaSourceArnConditionKey = "AWS:SourceArn";

/**
 * The condition key naming the Account the invoking simulated service resource
 * belongs to.
 */
export const simLambdaSourceAccountConditionKey = "AWS:SourceAccount";

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
  readonly eventSourceToken?: string | undefined;
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
  private readonly eventSourceToken?: string | undefined;

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
    this.eventSourceToken = properties.eventSourceToken;
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
   * `lambda:FunctionUrlAuthType` and `lambda:InvokedViaFunctionUrl` are given
   * values when a Function URL is invoked, and `AWS:SourceArn` and
   * `AWS:SourceAccount` when a simulated service invokes the function.
   * Simulated IAM supplies `aws:PrincipalOrgID` for a caller whose Account is
   * in the simulated organization.
   */
  private condition(): SimIamPolicyDocumentCondition | undefined {
    const stringEquals = this.stringEqualsConditions();
    const condition: Record<string, Record<string, SimIamConditionValue>> = {
      ...(Object.keys(stringEquals).length > 0 && {
        StringEquals: stringEquals,
      }),
      ...(this.sourceArn !== undefined && {
        ArnLike: {
          [simLambdaSourceArnConditionKey]: this.sourceArn,
        },
      }),
      ...(this.invokedViaFunctionUrl !== undefined && {
        Bool: {
          [simLambdaInvokedViaFunctionUrlConditionKey]:
            this.invokedViaFunctionUrl,
        },
      }),
    };

    return Object.keys(condition).length === 0 ? undefined : condition;
  }

  private stringEqualsConditions(): Record<string, SimIamConditionValue> {
    return {
      ...(this.functionUrlAuthType !== undefined && {
        [simLambdaFunctionUrlAuthTypeConditionKey]: this.functionUrlAuthType,
      }),
      ...(this.sourceAccount !== undefined && {
        [simLambdaSourceAccountConditionKey]: this.sourceAccount,
      }),
      ...(this.principalOrgId !== undefined && {
        "aws:PrincipalOrgID": this.principalOrgId,
      }),
      ...(this.eventSourceToken !== undefined && {
        [simLambdaEventSourceTokenConditionKey]: this.eventSourceToken,
      }),
    };
  }
}
