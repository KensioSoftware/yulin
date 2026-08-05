import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateGroupCommandInput } from "../../command/group/group.command.js";
import { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The AWS::Cognito::UserPoolGroup properties this simulation deploys, which
 * are all of them.
 */
const simulatedProperties = [
  "UserPoolId",
  "GroupName",
  "Description",
  "Precedence",
  "RoleArn",
];

interface SimCfnCognitoGroupPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Cognito::UserPoolGroup CloudFormation properties into the
 * CreateGroup input the group creator needs.
 */
export class SimCfnCognitoGroupProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnCognitoPropertyParser({
    resourceType: "AWS::Cognito::UserPoolGroup",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnCognitoGroupPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The pool this group belongs to, which a template reaches with a `Ref` on
   * its AWS::Cognito::UserPool.
   */
  userPoolId(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["UserPoolId"],
      "UserPoolId",
    );
  }

  /**
   * The group's name, which is also what a `Ref` on this Resource returns.
   */
  groupName(): string {
    return this.propertyParser.requiredString(
      this.resource,
      this.properties["GroupName"],
      "GroupName",
    );
  }

  /**
   * The CreateGroup input this Resource asks for.
   */
  createGroupInput(): SimCreateGroupCommandInput {
    return {
      UserPoolId: this.userPoolId(),
      GroupName: this.groupName(),
      Description: this.propertyParser.optionalString(
        this.resource,
        this.properties["Description"],
        "Description",
      ),
      Precedence: this.propertyParser.optionalNumber(
        this.resource,
        this.properties["Precedence"],
        "Precedence",
      ),
      RoleArn: this.propertyParser.optionalString(
        this.resource,
        this.properties["RoleArn"],
        "RoleArn",
      ),
    };
  }
}
