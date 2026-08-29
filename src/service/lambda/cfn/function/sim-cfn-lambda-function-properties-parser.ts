import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { makeSimRoleArn } from "../../../iam/role/arn/sim-iam-role-arn.js";
import type { SimIamRoleName } from "../../../iam/role/sim-iam-role.js";
import type { SimLambdaDeadLetterConfigInput } from "../../function/event-invoke/lambda-dead-letter-target.js";
import type {
  SimCreateFunctionCommandInput,
  SimLambdaFunctionCode,
  SimLambdaFunctionEnvironment,
} from "../../command/create-function/create-function.command.js";
import { SimCfnLambdaDeadLetterParser } from "./sim-cfn-lambda-dead-letter-parser.js";
import { SimCfnLambdaEnvironmentParser } from "./sim-cfn-lambda-environment-parser.js";
import { SimCfnLambdaFunctionCodeParser } from "./sim-cfn-lambda-function-code-parser.js";
import { SimCfnLambdaPropertyParser } from "./sim-cfn-lambda-property-parser.js";
import { simCfnLambdaGeneratedFunctionName } from "./sim-cfn-lambda-generated-function-name.js";

export interface SimCfnLambdaFunctionProperties {
  readonly functionName: string;
  readonly roleArn: string;
  readonly code: SimLambdaFunctionCode | undefined;
  readonly imageUri: string | undefined;
  readonly packageType: string | undefined;
  readonly handlerName: string | undefined;
  readonly runtimeName: string | undefined;
  readonly description: string | undefined;
  readonly timeoutSeconds: number | undefined;
  readonly memorySizeMb: number | undefined;
  readonly environment: SimLambdaFunctionEnvironment | undefined;
  readonly deadLetterConfig: SimLambdaDeadLetterConfigInput | undefined;
}

/**
 * Map parsed AWS::Lambda::Function properties onto the sim Lambda
 * CreateFunction command input, with the code input resolved separately so
 * executable bindings can replace template code.
 */
export function simCfnLambdaCreateFunctionInput(
  functionProperties: SimCfnLambdaFunctionProperties,
  code: SimLambdaFunctionCode | undefined,
): SimCreateFunctionCommandInput {
  return {
    FunctionName: functionProperties.functionName,
    Role: functionProperties.roleArn,
    Code: code,
    Handler: functionProperties.handlerName,
    Runtime: functionProperties.runtimeName,
    Description: functionProperties.description,
    Timeout: functionProperties.timeoutSeconds,
    MemorySize: functionProperties.memorySizeMb,
    Environment: functionProperties.environment,
    DeadLetterConfig: functionProperties.deadLetterConfig,
  };
}

/**
 * Parses and validates AWS::Lambda::Function CloudFormation properties into
 * the shape the sim Lambda function creator needs.
 *
 * Keeping the property-shape validation here keeps the creator focused on
 * orchestrating Lambda command calls.
 */
export class SimCfnLambdaFunctionPropertiesParser {
  private readonly propertyParser = new SimCfnLambdaPropertyParser();
  private readonly codeParser = new SimCfnLambdaFunctionCodeParser();
  private readonly environmentParser = new SimCfnLambdaEnvironmentParser();
  private readonly deadLetterParser = new SimCfnLambdaDeadLetterParser();

  /**
   * Parse the resolved CloudFormation properties for an AWS::Lambda::Function.
   */
  parse(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): SimCfnLambdaFunctionProperties {
    const parsedCode = this.codeParser.parse(resource, properties["Code"]);

    return {
      functionName: this.functionName(resource, properties),
      roleArn: this.roleArn(resource, properties),
      code: parsedCode.code,
      imageUri: parsedCode.imageUri,
      packageType: this.propertyParser.optionalString(
        resource,
        properties["PackageType"],
        "PackageType",
      ),
      handlerName: this.propertyParser.optionalString(
        resource,
        properties["Handler"],
        "Handler",
      ),
      runtimeName: this.propertyParser.optionalString(
        resource,
        properties["Runtime"],
        "Runtime",
      ),
      description: this.propertyParser.optionalString(
        resource,
        properties["Description"],
        "Description",
      ),
      timeoutSeconds: this.propertyParser.optionalNumber(
        resource,
        properties["Timeout"],
        "Timeout",
      ),
      memorySizeMb: this.propertyParser.optionalNumber(
        resource,
        properties["MemorySize"],
        "MemorySize",
      ),
      environment: this.environmentParser.parse(
        resource,
        properties["Environment"],
      ),
      deadLetterConfig: this.deadLetterParser.parse(
        resource,
        properties["DeadLetterConfig"],
      ),
    };
  }

  /**
   * The execution Role, resolved to an ARN.
   *
   * A Ref to a same-stack AWS::IAM::Role resolves to the role name, so a
   * plain name is mapped to the role's default-path ARN, equivalent to what
   * Fn::GetAtt Role.Arn resolves to, keeping execution-role attribution
   * correct. Direct ARN strings pass through unchanged.
   */
  private roleArn(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    const role = this.propertyParser.requiredString(
      resource,
      properties["Role"],
      "Role",
    );

    if (role.startsWith("arn:")) {
      return role;
    }

    return makeSimRoleArn({
      accountId: resource.accountRegionScope.accountId,
      path: "/",
      roleName: role as SimIamRoleName,
    });
  }

  /**
   * An unnamed function gets the name CloudFormation generates for it, from
   * the stack name and the logical ID.
   */
  private functionName(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): string {
    return (
      this.propertyParser.optionalString(
        resource,
        properties["FunctionName"],
        "FunctionName",
      ) ?? simCfnLambdaGeneratedFunctionName(resource)
    );
  }
}
