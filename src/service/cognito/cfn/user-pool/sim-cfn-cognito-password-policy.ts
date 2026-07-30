import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoPasswordPolicyType } from "../../user-pool/sim-cognito-password-policy.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

interface SimCfnCognitoPasswordPolicyProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `Policies PasswordPolicy` of an AWS::Cognito::UserPool Resource.
 *
 * `PasswordHistorySize` is read along with the rest rather than dropped, so a
 * template asking for it reaches CreateUserPool and is refused there, in the
 * words that say why.
 */
export class SimCfnCognitoPasswordPolicy {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoPasswordPolicyProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The password policy, or undefined when the template names none.
   */
  parse(
    value: SimCfnTemplateValue | undefined,
  ): SimCognitoPasswordPolicyType | undefined {
    const policy = this.propertyParser.optionalRecord(
      this.resource,
      value,
      "Policies PasswordPolicy",
    );

    if (policy === undefined) {
      return undefined;
    }

    return {
      MinimumLength: this.number(policy["MinimumLength"], "MinimumLength"),
      RequireUppercase: this.boolean(
        policy["RequireUppercase"],
        "RequireUppercase",
      ),
      RequireLowercase: this.boolean(
        policy["RequireLowercase"],
        "RequireLowercase",
      ),
      RequireNumbers: this.boolean(policy["RequireNumbers"], "RequireNumbers"),
      RequireSymbols: this.boolean(policy["RequireSymbols"], "RequireSymbols"),
      TemporaryPasswordValidityDays: this.number(
        policy["TemporaryPasswordValidityDays"],
        "TemporaryPasswordValidityDays",
      ),
      PasswordHistorySize: this.number(
        policy["PasswordHistorySize"],
        "PasswordHistorySize",
      ),
    };
  }

  private number(
    value: SimCfnTemplateValue | undefined,
    field: string,
  ): number | undefined {
    return this.propertyParser.optionalNumber(
      this.resource,
      value,
      `Policies PasswordPolicy ${field}`,
    );
  }

  private boolean(
    value: SimCfnTemplateValue | undefined,
    field: string,
  ): boolean | undefined {
    return this.propertyParser.optionalBoolean(
      this.resource,
      value,
      `Policies PasswordPolicy ${field}`,
    );
  }
}
