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
   * `RegionalDomainName` is the `d-<id>.execute-api.<region>` endpoint API
   * Gateway issued the domain, which is the published address a CloudFront
   * Origin reaches directly and a Route53 alias points the custom domain name
   * at.
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
