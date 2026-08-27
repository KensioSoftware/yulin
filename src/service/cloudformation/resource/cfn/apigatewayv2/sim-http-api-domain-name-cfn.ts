import {
  type SimHttpApiDomainName,
  simHttpApiRegionalHostedZoneId,
} from "../../../../apigatewayv2/domain/sim-http-api-domain-name.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimHttpApiDomainNameCfnProperties {
  readonly domain: SimHttpApiDomainName;
}

/**
 * CloudFormation-facing values for a simulated HTTP API custom domain name.
 */
export class SimHttpApiDomainNameCfn implements SimCfnResourceValueAdapter {
  private readonly domain: SimHttpApiDomainName;

  constructor(properties: SimHttpApiDomainNameCfnProperties) {
    this.domain = properties.domain;
  }

  /**
   * AWS::ApiGatewayV2::DomainName Ref returns the domain name, which is what
   * an API mapping names its domain by.
   */
  refValue(): SimCfnTemplateValue {
    return this.domain.domainName;
  }

  /**
   * AWS::ApiGatewayV2::DomainName publishes RegionalDomainName,
   * RegionalHostedZoneId and DomainNameArn.
   *
   * `RegionalDomainName` is the hostname the domain answers on, so a
   * CloudFront Origin or a Route53 alias built on it reaches the domain. Real
   * API Gateway answers with a separate `d-<id>.execute-api.<region>` name and
   * expects DNS to point the custom domain at it.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    if (attributeName === "RegionalDomainName") {
      return this.domain.regionalDomainName;
    }

    if (attributeName === "RegionalHostedZoneId") {
      return simHttpApiRegionalHostedZoneId;
    }

    if (attributeName === "DomainNameArn") {
      return this.domain.arn;
    }

    throw new Error(
      `Unsupported AWS::ApiGatewayV2::DomainName attribute ${attributeName}`,
    );
  }
}
