import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSetUserPoolMfaConfigCommandInput } from "../../command/user-pool/user-pool-mfa.command.js";
import type { SimCreateUserPoolCommandInput } from "../../command/user-pool/user-pool.command.js";
import { SimCfnCognitoGeneratedName } from "../sim-cfn-cognito-generated-name.js";
import { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";
import { SimCfnCognitoAccountRecovery } from "./sim-cfn-cognito-account-recovery.js";
import { SimCfnCognitoAdminCreateUserConfig } from "./sim-cfn-cognito-admin-create-user-config.js";
import { SimCfnCognitoUserPoolMfa } from "./sim-cfn-cognito-user-pool-mfa.js";
import { SimCfnCognitoUserPoolSchema } from "./sim-cfn-cognito-user-pool-schema.js";
import { SimCfnCognitoPolicies } from "./sim-cfn-cognito-policies.js";

/**
 * The AWS::Cognito::UserPool properties this simulation deploys.
 *
 * `MfaConfiguration` and `EnabledMfas` are here because a pool records what it
 * was asked for and reports it back. They do not reach CreateUserPool: real
 * CloudFormation sets a pool's MFA in a SetUserPoolMfaConfig call after the
 * pool exists, and this deploys them the same way.
 *
 * `WebAuthnRelyingPartyID` and `WebAuthnUserVerification` reach the pool
 * through that same second call, which is where the Cognito API takes them.
 * They decide which hosts a passkey authenticates for and whether an
 * authenticator that checks nobody may register one, and a pool that reports
 * them describes itself the way the deployed pool does. No passkey is
 * registered or presented here.
 *
 * `UserPoolTier` is here because CreateUserPool accepts it at its AWS default
 * and refuses it otherwise, in words that say why. A CDK stack states it
 * routinely, and a pool created without it would be reported as behaving
 * differently when it does not.
 *
 * `AdminCreateUserConfig` and `AutoVerifiedAttributes` are the two a
 * `selfSignUpEnabled` CDK pool turns on, and both are acted on: the first
 * decides whether `SignUp` is allowed at all, and the second decides which
 * attributes confirming a sign-up marks as verified.
 *
 * `UsernameAttributes` is here because the pool signs its users in by what it
 * names, and stores the generated UUID username that comes with that. A CDK
 * `UserPool` with `signInAliases: { email: true }` emits it, so a stack built
 * that way deploys a pool identifying its users the way a deployed one would.
 *
 * `Schema` is here because the pool holds the attributes it declares. A CDK
 * `UserPool` emits one for its `customAttributes` and for any
 * `standardAttributes` entry, so a stack keying its own data on a `custom:`
 * attribute deploys and the sign-up it was built for works.
 *
 * `LambdaConfig` is here because the pool runs the triggers it names.
 * CreateUserPool reads it a key at a time, so a template asking for a trigger
 * this simulation fires deploys and one asking for a trigger it does not fails
 * the stack, rather than the two being decided together.
 *
 * `AccountRecoverySetting` is here because the pool records the mechanisms it
 * names and reports them back. Nothing here starts a recovery, so a template
 * declaring email-only recovery deploys, and CreateUserPool refuses a setting
 * outside the shape Cognito states for it.
 *
 * The four from `EmailVerificationMessage` down are here because a CDK
 * `UserPool` construct emits them when it was asked for nothing in
 * particular. They are the wording of the messages the pool records, and
 * `VerificationMessageTemplate` is refused where it asks for verification by
 * following a link.
 */
const simulatedProperties = [
  "UserPoolName",
  "Policies",
  "DeletionProtection",
  "LambdaConfig",
  "MfaConfiguration",
  "EnabledMfas",
  "WebAuthnRelyingPartyID",
  "WebAuthnUserVerification",
  "UserPoolTier",
  "AdminCreateUserConfig",
  "AutoVerifiedAttributes",
  "UsernameAttributes",
  "Schema",
  "AccountRecoverySetting",
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
      LambdaConfig: this.record(
        this.properties["LambdaConfig"],
        "LambdaConfig",
      ),
      UserPoolTier: this.string(
        this.properties["UserPoolTier"],
        "UserPoolTier",
      ),
      AccountRecoverySetting: new SimCfnCognitoAccountRecovery({
        resource: this.resource,
        propertyParser: this.propertyParser,
      }).parse(this.properties["AccountRecoverySetting"]),
      AdminCreateUserConfig: new SimCfnCognitoAdminCreateUserConfig({
        resource: this.resource,
        propertyParser: this.propertyParser,
      }).parse(this.properties["AdminCreateUserConfig"]),
      AutoVerifiedAttributes: this.propertyParser.optionalStringArray(
        this.resource,
        this.properties["AutoVerifiedAttributes"],
        "AutoVerifiedAttributes",
      ),
      UsernameAttributes: this.propertyParser.optionalStringArray(
        this.resource,
        this.properties["UsernameAttributes"],
        "UsernameAttributes",
      ),
      Schema: new SimCfnCognitoUserPoolSchema({
        resource: this.resource,
        propertyParser: this.propertyParser,
      }).parse(this.properties["Schema"]),
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
   * The SetUserPoolMfaConfig input this Resource asks for, or nothing where
   * the template says nothing about MFA. That call is a second one after the
   * pool exists, as it is on real CloudFormation.
   */
  setUserPoolMfaConfigInput(
    userPoolId: string,
  ): SimSetUserPoolMfaConfigCommandInput | undefined {
    return new SimCfnCognitoUserPoolMfa({
      resource: this.resource,
      propertyParser: this.propertyParser,
    }).parse(userPoolId, this.properties);
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
   * The keys inside are not checked here. CreateUserPool reads them itself, a
   * key at a time, so the value is judged in one place rather than two.
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
