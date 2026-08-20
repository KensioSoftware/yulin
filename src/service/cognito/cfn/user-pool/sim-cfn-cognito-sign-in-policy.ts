import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCognitoSignInPolicyType } from "../../user-pool/sim-cognito-sign-in-policy.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";

/**
 * The `SignInPolicy` fields this simulation reads, which are all of them.
 */
const modelledFields = ["AllowedFirstAuthFactors"];

interface SimCfnCognitoSignInPolicyProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `Policies SignInPolicy` of an AWS::Cognito::UserPool Resource
 * into the shape CreateUserPool takes.
 *
 * The factor names are checked by the pool rather than here, so a template and
 * an SDK caller are held to the same rule in the same words.
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

    this.propertyParser.ignoreUnmodelledKeys(
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
