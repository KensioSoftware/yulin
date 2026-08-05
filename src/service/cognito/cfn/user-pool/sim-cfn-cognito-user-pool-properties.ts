import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateUserPoolCommandInput } from "../../command/user-pool/user-pool.command.js";
import { SimCfnCognitoGeneratedName } from "../sim-cfn-cognito-generated-name.js";
import { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";
import { SimCfnCognitoPolicies } from "./sim-cfn-cognito-policies.js";

/**
 * The AWS::Cognito::UserPool properties this simulation deploys.
 *
 * `MfaConfiguration` and `UserPoolTier` are here because CreateUserPool
 * accepts each at its AWS default and refuses it otherwise, in words that say
 * why. A CDK stack states both routinely, and a pool created without either
 * would be reported as behaving differently when it does not.
 *
 * The six from `AccountRecoverySetting` down are here for the same reason,
 * and are the six a CDK `UserPool` construct emits when it was asked for
 * nothing in particular. Each configures message delivery, verification
 * wording or account recovery, none of which is simulated, so CreateUserPool
 * accepts each at the one value that asks for nothing this simulation does
 * not already do and refuses it at every other.
 */
const simulatedProperties = [
  "UserPoolName",
  "Policies",
  "DeletionProtection",
  "MfaConfiguration",
  "UserPoolTier",
  "AccountRecoverySetting",
  "AdminCreateUserConfig",
  "EmailVerificationMessage",
  "EmailVerificationSubject",
  "SmsVerificationMessage",
  "VerificationMessageTemplate",
];

interface SimCfnCognitoUserPoolPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Cognito::UserPool CloudFormation properties into the CreateUserPool
 * input the pool creator needs.
 *
 * The recording of unsimulated properties runs on construction rather than
 * when a property is read, so the report of what the pool was created without
 * is complete whichever properties the creator goes on to ask for.
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

    this.propertyParser.ignoreUnsimulated(this.resource, this.properties);
  }

  /**
   * The CreateUserPool input this Resource asks for.
   *
   * `UserPoolName` is CloudFormation's name for what the API calls `PoolName`,
   * and it is the one property whose name differs between them.
   */
  createUserPoolInput(): SimCreateUserPoolCommandInput {
    return {
      PoolName: this.poolName(),
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
      AccountRecoverySetting: this.record(
        this.properties["AccountRecoverySetting"],
        "AccountRecoverySetting",
      ),
      AdminCreateUserConfig: this.record(
        this.properties["AdminCreateUserConfig"],
        "AdminCreateUserConfig",
      ),
      VerificationMessageTemplate: this.record(
        this.properties["VerificationMessageTemplate"],
        "VerificationMessageTemplate",
      ),
      EmailVerificationMessage: this.string(
        this.properties["EmailVerificationMessage"],
        "EmailVerificationMessage",
      ),
      EmailVerificationSubject: this.string(
        this.properties["EmailVerificationSubject"],
        "EmailVerificationSubject",
      ),
      SmsVerificationMessage: this.string(
        this.properties["SmsVerificationMessage"],
        "SmsVerificationMessage",
      ),
    };
  }

  /**
   * The pool's name, generated from the stack and the logical ID when the
   * template names none, as real CloudFormation generates one.
   */
  private poolName(): string {
    const named = this.string(this.properties["UserPoolName"], "UserPoolName");

    if (named !== undefined) {
      return named;
    }

    return new SimCfnCognitoGeneratedName({
      stackName: this.resource.stackName,
      logicalId: this.resource.logicalId,
    }).value;
  }

  /**
   * A property carried as an object, passed on to CreateUserPool as written.
   *
   * The keys inside are not checked here. CreateUserPool compares the whole
   * object against the one value it accepts, which refuses an unknown key
   * along with everything else that differs.
   */
  private record(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): object | undefined {
    return this.propertyParser.optionalRecord(this.resource, value, label);
  }

  private string(
    value: SimCfnTemplateValue | undefined,
    label: string,
  ): string | undefined {
    return this.propertyParser.optionalString(this.resource, value, label);
  }
}
