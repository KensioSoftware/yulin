import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSetUserPoolMfaConfigCommandInput } from "../../command/user-pool/user-pool-mfa.command.js";
import type { SimCognitoWebAuthnConfigurationType } from "../../user-pool/mfa/sim-cognito-web-authn-configuration.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The second factors CloudFormation can name in `EnabledMfas`.
 */
const enabledMfaValues = ["SMS_MFA", "SOFTWARE_TOKEN_MFA", "EMAIL_OTP"];

/**
 * The factor configurations an `EnabledMfas` list turns into.
 */
type SimCfnCognitoMfaFactors = Omit<
  SimSetUserPoolMfaConfigCommandInput,
  "UserPoolId" | "MfaConfiguration" | "WebAuthnConfiguration"
>;

interface SimCfnCognitoUserPoolMfaProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the MFA properties of an AWS::Cognito::UserPool Resource into the
 * SetUserPoolMfaConfig input they are deployed with.
 *
 * Neither reaches `CreateUserPool`. Real CloudFormation configures a pool's
 * MFA in a second call once the pool exists, which is why a stack deploying
 * one needs `cognito-idp:SetUserPoolMfaConfig` as well as
 * `cognito-idp:CreateUserPool`.
 *
 * `EnabledMfas` is a CloudFormation property with no equivalent on the Cognito
 * API, which names each factor by its own configuration instead. Turning the
 * list into those configurations is what lets `SetUserPoolMfaConfig` decide
 * which of them are simulated, so the two factors this simulation cannot
 * deliver a message for are refused in one place rather than two.
 *
 * `WebAuthnRelyingPartyID` and `WebAuthnUserVerification` travel the same
 * way. CloudFormation carries them as two flat properties of the pool and the
 * Cognito API takes them as one `WebAuthnConfiguration`, so they are gathered
 * here into the call that configures them.
 */
export class SimCfnCognitoUserPoolMfa {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoUserPoolMfaProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The call the pool's MFA is configured in, or nothing where the template
   * says nothing about MFA. A template asking for none makes no such call,
   * here or on real AWS.
   */
  parse(
    userPoolId: string,
    properties: SimCfnTemplateValueRecord,
  ): SimSetUserPoolMfaConfigCommandInput | undefined {
    const configuration = this.propertyParser.optionalString(
      this.resource,
      properties["MfaConfiguration"],
      "MfaConfiguration",
    );
    const factors = this.factors(properties["EnabledMfas"]);
    const webAuthn = this.webAuthn(properties);

    if (
      configuration === undefined &&
      webAuthn === undefined &&
      Object.keys(factors).length === 0
    ) {
      return undefined;
    }

    return {
      UserPoolId: userPoolId,
      ...(configuration !== undefined && { MfaConfiguration: configuration }),
      ...factors,
      ...(webAuthn !== undefined && { WebAuthnConfiguration: webAuthn }),
    };
  }

  /**
   * How the template asks for passkeys to be registered, or nothing where it
   * names neither property.
   *
   * The user verification value is checked by the pool rather than here, so a
   * template and an SDK caller are refused in the same words.
   */
  private webAuthn(
    properties: SimCfnTemplateValueRecord,
  ): SimCognitoWebAuthnConfigurationType | undefined {
    const relyingPartyId = this.propertyParser.optionalString(
      this.resource,
      properties["WebAuthnRelyingPartyID"],
      "WebAuthnRelyingPartyID",
    );
    const userVerification = this.propertyParser.optionalString(
      this.resource,
      properties["WebAuthnUserVerification"],
      "WebAuthnUserVerification",
    );

    if (relyingPartyId === undefined && userVerification === undefined) {
      return undefined;
    }

    return {
      ...(relyingPartyId !== undefined && { RelyingPartyId: relyingPartyId }),
      ...(userVerification !== undefined && {
        UserVerification: userVerification,
      }),
    };
  }

  /**
   * The factors the template asks for, or nothing where it names none.
   */
  private factors(
    value: SimCfnTemplateValue | undefined,
  ): SimCfnCognitoMfaFactors {
    const names = this.propertyParser.optionalStringArray(
      this.resource,
      value,
      "EnabledMfas",
    );

    if (names === undefined) {
      return {};
    }

    this.requireKnownFactors(names);

    return {
      ...(names.includes("SOFTWARE_TOKEN_MFA") && {
        SoftwareTokenMfaConfiguration: { Enabled: true },
      }),
      ...(names.includes("SMS_MFA") && { SmsMfaConfiguration: {} }),
      ...(names.includes("EMAIL_OTP") && { EmailMfaConfiguration: {} }),
    };
  }

  /**
   * Refuse a factor name Cognito does not have, before the pool is created
   * with a factor list that means nothing.
   */
  private requireKnownFactors(names: readonly string[]): void {
    for (const [index, name] of names.entries()) {
      if (!enabledMfaValues.includes(name)) {
        throw this.propertyParser.invalidPropertyError(
          this.resource,
          `EnabledMfas[${String(index)}]`,
          `one of ${enabledMfaValues.join(", ")}`,
        );
      }
    }
  }
}
