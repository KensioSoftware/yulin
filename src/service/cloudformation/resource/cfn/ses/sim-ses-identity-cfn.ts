import { assertDefined } from "../../../../../util/type-guard/defined.js";
import type { SimSesIdentity } from "../../../../ses/identity/sim-ses-identity.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";
import {
  simSesDkimTokenName,
  simSesDkimTokens,
  simSesDkimTokenValue,
} from "./sim-ses-dkim-tokens.js";

/**
 * The DKIM token attributes, and which of the three tokens each one reads.
 */
const dkimTokenAttribute = /^DkimDNSToken(?<part>Name|Value)(?<index>[123])$/;

interface SimSesIdentityCfnProperties {
  readonly identity: SimSesIdentity;
}

/**
 * CloudFormation-facing values for a simulated SES email identity.
 */
export class SimSesIdentityCfn implements SimCfnResourceValueAdapter {
  readonly #identity: SimSesIdentity;

  constructor(properties: SimSesIdentityCfnProperties) {
    this.#identity = properties.identity;
  }

  /**
   * AWS::SES::EmailIdentity Ref returns the address or domain itself.
   *
   * SES has no identifier for an identity other than what it names, so a Ref
   * is directly usable as the `FromEmailAddress` of a send or as the identity
   * an IAM policy names.
   */
  refValue(): SimCfnTemplateValue {
    return this.#identity.emailIdentity;
  }

  /**
   * AWS::SES::EmailIdentity attributes, all six of which are DKIM tokens.
   *
   * The tokens are made up, deterministically, because nothing here signs a
   * message and there is no key to derive a real one from. They exist so that
   * the Route53 records CDK writes alongside an identity can be deployed: what
   * a test gets is records of the right shape pointing at nothing, rather than
   * a stack that will not deploy.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    const groups = dkimTokenAttribute.exec(attributeName)?.groups;

    if (!groups) {
      throw new Error(
        `Unsupported AWS::SES::EmailIdentity attribute ${attributeName}`,
      );
    }

    const index = groups["index"];

    assertDefined(index, `DKIM token index in ${attributeName}`);

    const token = simSesDkimTokens(this.#identity.emailIdentity)[
      Number(index) - 1
    ];

    assertDefined(token, `DKIM token ${index} for ${attributeName}`);

    return groups["part"] === "Name"
      ? simSesDkimTokenName(this.#identity.emailIdentity, token)
      : simSesDkimTokenValue(token);
  }
}
