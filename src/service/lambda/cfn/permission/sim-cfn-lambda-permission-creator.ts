import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaPermission } from "../../function/policy/sim-lambda-permission.js";
import type { SimLambda } from "../../sim-lambda.js";
import { SimCfnLambdaPropertyParser } from "../function/sim-cfn-lambda-property-parser.js";
import { simCfnLambdaTargetFunctionName } from "../function/sim-cfn-lambda-target-function.js";

interface SimCfnLambdaPermissionCreatorProperties {
  readonly lambda: SimLambda;
}

/**
 * Creates simulated Lambda resource-policy permissions from CloudFormation
 * Resources.
 *
 * This is what CDK emits for every `grantInvoke` and `grantInvokeUrl`, so a
 * synthesized template reaches it whether or not the app mentions permissions
 * itself. A template that declares one and a test that calls `AddPermission`
 * produce the same statement, because both end up on the same function policy.
 */
export class SimCfnLambdaPermissionCreator {
  private readonly lambda: SimLambda;
  private readonly propertyParser = new SimCfnLambdaPropertyParser();

  constructor(properties: SimCfnLambdaPermissionCreatorProperties) {
    this.lambda = properties.lambda;
  }

  /**
   * Create a simulated permission from an AWS::Lambda::Permission Resource.
   *
   * The Resource has no `StatementId` property: CloudFormation names the
   * statement after the logical ID, so that is what the permission is
   * addressed by afterwards, including by a later `RemovePermission`.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimLambdaPermission> {
    const functionName = simCfnLambdaTargetFunctionName(
      this.propertyParser.requiredString(
        resource,
        properties["FunctionName"],
        "FunctionName",
      ),
    );

    await this.lambda.addPermission({
      input: {
        FunctionName: functionName,
        StatementId: resource.logicalId,
        Action: this.propertyParser.requiredString(
          resource,
          properties["Action"],
          "Action",
        ),
        Principal: this.propertyParser.requiredString(
          resource,
          properties["Principal"],
          "Principal",
        ),
        FunctionUrlAuthType: this.propertyParser.optionalString(
          resource,
          properties["FunctionUrlAuthType"],
          "FunctionUrlAuthType",
        ),
        SourceArn: this.propertyParser.optionalString(
          resource,
          properties["SourceArn"],
          "SourceArn",
        ),
        SourceAccount: this.propertyParser.optionalString(
          resource,
          properties["SourceAccount"],
          "SourceAccount",
        ),
        PrincipalOrgID: this.propertyParser.optionalString(
          resource,
          properties["PrincipalOrgID"],
          "PrincipalOrgID",
        ),
        InvokedViaFunctionUrl: this.propertyParser.optionalBoolean(
          resource,
          properties["InvokedViaFunctionUrl"],
          "InvokedViaFunctionUrl",
        ),
      },
    });

    const permission = this.lambda
      .getSimFunctionByName(functionName)
      ?.resourcePolicy.get(resource.logicalId);

    assertDefined(
      permission,
      `Sim Lambda permission ${resource.logicalId} after CloudFormation creation`,
    );

    return permission;
  }
}
