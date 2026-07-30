import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimCognitoSignInPolicyType,
  SimCognitoUserPoolPoliciesType,
} from "../../user-pool/sim-cognito-password-policy.js";
import type { SimCfnCognitoPropertyParser } from "../sim-cfn-cognito-property-parser.js";
import { SimCfnCognitoPasswordPolicy } from "./sim-cfn-cognito-password-policy.js";

interface SimCfnCognitoPoliciesProperties {
  readonly resource: SimCfnResource;
  readonly propertyParser: SimCfnCognitoPropertyParser;
}

/**
 * Reads the `Policies` property of an AWS::Cognito::UserPool Resource into the
 * shape CreateUserPool takes.
 *
 * The sign-in policy is read rather than dropped, so a template asking for one
 * reaches CreateUserPool and is refused there, in the words that say why.
 */
export class SimCfnCognitoPolicies {
  private readonly resource: SimCfnResource;
  private readonly propertyParser: SimCfnCognitoPropertyParser;

  constructor(properties: SimCfnCognitoPoliciesProperties) {
    this.resource = properties.resource;
    this.propertyParser = properties.propertyParser;
  }

  /**
   * The pool's policies, or undefined when the template names none.
   */
  parse(
    value: SimCfnTemplateValue | undefined,
  ): SimCognitoUserPoolPoliciesType | undefined {
    const policies = this.propertyParser.optionalRecord(
      this.resource,
      value,
      "Policies",
    );

    if (policies === undefined) {
      return undefined;
    }

    return {
      PasswordPolicy: new SimCfnCognitoPasswordPolicy({
        resource: this.resource,
        propertyParser: this.propertyParser,
      }).parse(policies["PasswordPolicy"]),
      SignInPolicy: this.signInPolicy(policies["SignInPolicy"]),
    };
  }

  private signInPolicy(
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

    return {
      AllowedFirstAuthFactors: this.propertyParser.optionalStringArray(
        this.resource,
        policy["AllowedFirstAuthFactors"],
        "Policies SignInPolicy AllowedFirstAuthFactors",
      ),
    };
  }
}
