import type { SimCognitoUserPoolDomain } from "../../../../cognito/user-pool/domain/sim-cognito-user-pool-domain.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimCognitoUserPoolDomainCfnProperties {
  readonly domain: SimCognitoUserPoolDomain;
}

/**
 * CloudFormation-facing values for a simulated Cognito user pool domain.
 */
export class SimCognitoUserPoolDomainCfn implements SimCfnResourceValueAdapter {
  private readonly domain: SimCognitoUserPoolDomain;

  constructor(properties: SimCognitoUserPoolDomainCfnProperties) {
    this.domain = properties.domain;
  }

  /**
   * AWS::Cognito::UserPoolDomain Ref returns the domain string, which is what
   * `DescribeUserPoolDomain` names a domain by and what a hosted URL is built
   * from.
   */
  refValue(): SimCfnTemplateValue {
    return this.domain.value;
  }

  /**
   * AWS::Cognito::UserPoolDomain publishes the CloudFront distribution real
   * Cognito puts in front of a custom domain.
   *
   * A template reads it to point its own DNS at the domain. Nothing here
   * serves that distribution, because the simulation answers on the custom
   * hostname itself, so a prefix domain has none at all rather than one that
   * would mislead.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "CloudFrontDistribution") {
      return this.domain.cloudFrontDistribution ?? "";
    }

    throw new Error(
      `Unsupported AWS::Cognito::UserPoolDomain attribute ${attributeName}`,
    );
  }
}
