import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateUserPoolCommandInput } from "../../command/user-pool/user-pool.command.js";
import { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";
import { SimCfnCognitoPolicies } from "./sim-cfn-cognito-policies.js";

/**
 * The AWS::Cognito::UserPool properties this simulation deploys.
 *
 * `MfaConfiguration` and `UserPoolTier` are here because CreateUserPool
 * accepts each at its AWS default and refuses it otherwise, in words that say
 * why. A CDK stack states both routinely, so refusing them outright would
 * refuse templates that ask for nothing unsimulated.
 */
const simulatedProperties = [
  "UserPoolName",
  "Policies",
  "DeletionProtection",
  "MfaConfiguration",
  "UserPoolTier",
];

interface SimCfnCognitoUserPoolPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Cognito::UserPool CloudFormation properties into the CreateUserPool
 * input the pool creator needs.
 *
 * The refusal of unsimulated properties runs on construction rather than when
 * a property is read, so a Resource asking for something unmodelled cannot get
 * as far as creating a pool that would then be wrong.
 */
export class SimCfnCognitoUserPoolProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;
  private readonly propertyParser = new SimCfnCognitoPropertyParser({
    resourceType: "AWS::Cognito::UserPool",
    simulated: simulatedProperties,
  });

  constructor(properties: SimCfnCognitoUserPoolPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = properties.properties;

    this.propertyParser.requireOnlySimulated(this.resource, this.properties);
  }

  /**
   * The CreateUserPool input this Resource asks for.
   *
   * `UserPoolName` is CloudFormation's name for what the API calls `PoolName`,
   * and it is the one property whose name differs between them.
   */
  createUserPoolInput(): SimCreateUserPoolCommandInput {
    return {
      PoolName: this.string(this.properties["UserPoolName"], "UserPoolName"),
      Policies: new SimCfnCognitoPolicies({
        resource: this.resource,
        propertyParser: this.propertyParser,
      }).parse(this.properties["Policies"]),
      DeletionProtection: this.string(
        this.properties["DeletionProtection"],
        "DeletionProtection",
      ),
      MfaConfiguration: this.string(
        this.properties["MfaConfiguration"],
        "MfaConfiguration",
      ),
      UserPoolTier: this.string(
        this.properties["UserPoolTier"],
        "UserPoolTier",
      ),
    };
  }

  private string(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string | undefined {
    return this.propertyParser.optionalString(this.resource, value, label);
  }
}
