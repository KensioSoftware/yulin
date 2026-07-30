import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoSignInPolicyType } from "../../user-pool/sim-cognito-password-policy.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The `SignInPolicy` fields, which reach CreateUserPool to be refused there.
 */
const modelledFields = ["AllowedFirstAuthFactors"];

interface SimCfnCognitoSignInPolicyProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `Policies SignInPolicy` of an AWS::Cognito::UserPool Resource.
 *
 * Nothing here chooses a first authentication factor, so this is read only so
 * that CreateUserPool receives it and refuses it in the words that say why.
 */
export class SimCfnCognitoSignInPolicy {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoSignInPolicyProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The sign-in policy, or undefined when the template names none.
   */
  parse(
    value: SimCfnTemplateValue | undefined,
  ): SimCognitoSignInPolicyType | undefined {
    const policy = this.propertyParser.optionalRecord(
      this.resource,
      value,
      "Policies SignInPolicy",
    );

    if (policy === undefined) {
      return undefined;
    }

    this.propertyParser.requireOnlyKeys(
      this.resource,
      policy,
      modelledFields,
      "Policies SignInPolicy ",
    );

    return {
      AllowedFirstAuthFactors: this.propertyParser.optionalStringArray(
        this.resource,
        policy["AllowedFirstAuthFactors"],
        "Policies SignInPolicy AllowedFirstAuthFactors",
      ),
    };
  }
}
