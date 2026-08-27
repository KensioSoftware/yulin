import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import {
  makeSimHttpApiDomainId,
  type SimHttpApiDomainEndpointParts,
  simHttpApiDomainEndpointHost,
  simHttpApiDomainEndpointLogicalHost,
  type SimHttpApiDomainId,
} from "./sim-http-api-domain-endpoint.js";
import { SimApiMappingStore } from "./sim-api-mapping-store.js";

/**
 * The expression API Gateway selects an API mapping with, which is the request
 * base path and is the only value the v2 API reports.
 */
export const simApiMappingSelectionExpression = "$request.basepath";

/**
 * The Route53 Hosted Zone the regional endpoint of every custom domain sits
 * in, which is what an alias record pointing at one names.
 *
 * Real API Gateway publishes a different id per Region. One fixed value stands
 * for all of them here, the way `simElbV2CanonicalHostedZoneId` does for a
 * load balancer: nothing resolves through it, and an alias record reaches the
 * domain by the regional endpoint name it points at.
 */
export const simHttpApiRegionalHostedZoneId = "Z0000000000001";

/**
 * One entry of a domain's `DomainNameConfigurations`, as it was written.
 *
 * Nothing here is applied. A simulated request arrives over plain HTTP on
 * localhost, so a certificate and a TLS security policy have nothing to decide.
 * They are kept so a test can assert the domain was configured with the
 * certificate the stack meant to give it.
 */
export interface SimHttpApiDomainNameConfiguration {
  CertificateArn?: string | undefined;
  CertificateName?: string | undefined;
  EndpointType?: string | undefined;
  SecurityPolicy?: string | undefined;
}

/**
 * One entry of a domain's `DomainNameConfigurations` as a command reports it,
 * which is what was written plus the endpoint API Gateway made for it.
 */
export interface SimHttpApiDomainNameConfigurationView extends SimHttpApiDomainNameConfiguration {
  ApiGatewayDomainName: string;
  HostedZoneId: string;
}

/**
 * Minimal structural domain name view, as the Create and Get commands return.
 */
export interface SimHttpApiDomainNameView {
  DomainName: string;
  ApiMappingSelectionExpression: string;
  DomainNameConfigurations: readonly SimHttpApiDomainNameConfigurationView[];
}

interface SimHttpApiDomainNameProperties {
  readonly domainName: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly configurations: readonly SimHttpApiDomainNameConfiguration[];
}

/**
 * A simulated API Gateway custom domain name.
 *
 * The domain has the two names real API Gateway gives it. One is the hostname
 * the project owns, which is how an HTTP API is reached under a name of its
 * own. The other is the regional endpoint API Gateway issues alongside it,
 * which a record for the custom domain name points at. The domain answers on
 * both. It owns its API mappings, because a mapping is addressed by domain on
 * real AWS and none of them outlives the domain.
 *
 * A domain and the APIs it maps live in one Account and Region, as they do on
 * real AWS, so a mapping names an API id and nothing more.
 */
export class SimHttpApiDomainName {
  public readonly domainName: string;
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly configurations: readonly SimHttpApiDomainNameConfiguration[];
  public readonly apiMappings = new SimApiMappingStore();

  /**
   * The id API Gateway allocated this domain's regional endpoint.
   */
  public readonly domainId: SimHttpApiDomainId = makeSimHttpApiDomainId();

  constructor(properties: SimHttpApiDomainNameProperties) {
    this.domainName = properties.domainName;
    this.accountRegionScope = properties.accountRegionScope;
    this.configurations = properties.configurations;
  }

  /**
   * The hostname this domain answers requests on.
   */
  get hostname(): string {
    return this.domainName;
  }

  /**
   * The hostname a DNS record pointing at this domain names, which is what
   * `Fn::GetAtt RegionalDomainName` answers with.
   *
   * This is the domain's published address. A CloudFront Origin points at it
   * directly, and a record for the custom domain name points at it. The custom
   * domain name is reached through that record.
   */
  get regionalDomainName(): string {
    return simHttpApiDomainEndpointHost(this.endpointParts);
  }

  /**
   * The hostnames a request can reach this domain by. They are the custom
   * domain name and the regional endpoint, the second without the AWS domain
   * the local URL rewriting drops.
   */
  get hostnames(): readonly string[] {
    return [
      this.hostname,
      simHttpApiDomainEndpointLogicalHost(this.endpointParts),
    ];
  }

  /**
   * The ARN of this domain, which `Fn::GetAtt DomainNameArn` answers with.
   *
   * API Gateway control-plane ARNs leave the Account segment empty and name
   * the resource by its request path, as the ARNs commands are authorized
   * against do.
   */
  get arn(): string {
    return `arn:aws:apigateway:${this.accountRegionScope.regionName}::/domainnames/${this.domainName}`;
  }

  /**
   * Get the AWS-like view of this domain name.
   */
  view(): SimHttpApiDomainNameView {
    return {
      DomainName: this.domainName,
      ApiMappingSelectionExpression: simApiMappingSelectionExpression,
      DomainNameConfigurations: this.configurationViews(),
    };
  }

  /**
   * What this domain's regional endpoint hostname is built from.
   */
  private get endpointParts(): SimHttpApiDomainEndpointParts {
    return {
      domainId: this.domainId,
      regionName: this.accountRegionScope.regionName,
    };
  }

  /**
   * The domain's configurations as a command reports them.
   *
   * Each one is what was written plus the endpoint API Gateway made for it. A
   * domain created without a configuration still reports one, because the
   * endpoint exists whether or not anything was written about the certificate
   * in front of it, and real API Gateway reports it there.
   */
  private configurationViews(): readonly SimHttpApiDomainNameConfigurationView[] {
    const endpoint = {
      ApiGatewayDomainName: this.regionalDomainName,
      HostedZoneId: simHttpApiRegionalHostedZoneId,
    };

    if (this.configurations.length === 0) {
      return [endpoint];
    }

    return this.configurations.map((configuration) => ({
      ...configuration,
      ...endpoint,
    }));
  }
}
