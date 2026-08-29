import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import { SimAcm } from "../../acm/sim-acm.js";
import { SimApiGateway } from "../../apigateway/index.js";
import { SimApiGatewayV2 } from "../../apigatewayv2/index.js";
import {
  simAwsAcmDnsRecords,
  simAwsHttpApiJwtIssuerKeys,
  simAwsRestApiUserPools,
} from "./sim-aws-cross-account-collaborators.js";
import { SimEcr } from "../../ecr/index.js";
import { SimElbV2 } from "../../elbv2/index.js";
import { SimKms } from "../../kms/index.js";
import type { SimAwsAccountServiceCache } from "./sim-aws-account-service-cache.js";
import type { SimAwsScopedServiceProperties } from "./sim-aws-scoped-service-properties.js";
import type { SimAwsScopedServiceRegistries } from "./sim-aws-scoped-service-registries.js";

interface SimAwsRegisteredServiceBuilderProperties {
  readonly registries: SimAwsScopedServiceRegistries;
  readonly accountServices: SimAwsAccountServiceCache;
}

/**
 * Builder for the simulated services whose wiring is a simulation-wide
 * registry.
 *
 * These are the services something outside their own scope has to find by a
 * name that carries no scope: a load balancer's DNS name, an API id, the
 * registry host in an image URI, a KMS key ARN. Each registers itself as it is
 * built, or reads a registry another service registered into, and takes
 * nothing else beyond the collaborators every scoped service gets.
 *
 * That is what keeps them apart from SimAwsAccountRegionServiceBuilder, which
 * is left holding the services that reach the rest of the simulation for
 * something live rather than for a lookup. Both grow by one method per
 * simulated service, and that file has twice now been at its line limit with a
 * service waiting to go into it.
 */
export class SimAwsRegisteredServiceBuilder {
  private readonly registries: SimAwsScopedServiceRegistries;
  private readonly accountServices: SimAwsAccountServiceCache;

  constructor(properties: SimAwsRegisteredServiceBuilderProperties) {
    this.registries = properties.registries;
    this.accountServices = properties.accountServices;
  }

  createAcm(scope: SimAwsAccountRegionContainer): SimAcm {
    const acm = new SimAcm({
      ...this.scoped(scope),
      dnsRecords: simAwsAcmDnsRecords(this.registries),
    });
    this.registries.acm.register(scope.accountRegionScope, acm);

    return acm;
  }

  /**
   * Create simulated API Gateway REST APIs for an Account Region scope.
   *
   * REST APIs are Region-scoped on real AWS: the endpoint API Gateway
   * generates names the Region, and an API cannot be reached from another one.
   */
  createApiGateway(scope: SimAwsAccountRegionContainer): SimApiGateway {
    return new SimApiGateway({
      ...this.scoped(scope),
      // API ids are unique across the simulation, and an API is reachable by
      // id alone from the serving layer, whichever scope created it.
      registry: this.registries.restApi,
      userPools: simAwsRestApiUserPools(this.registries),
      // A web ACL protecting a stage is in the same Account and Region as the
      // API, as it is on AWS, so this scope's own WAFv2 is the one to ask.
      webAcls: scope.wafV2().protection(),
    });
  }

  /**
   * Create simulated API Gateway v2 for an Account Region scope.
   *
   * HTTP APIs are Region-scoped on real AWS: the endpoint API Gateway
   * generates names the Region, and an API cannot be reached from another one.
   */
  createApiGatewayV2(scope: SimAwsAccountRegionContainer): SimApiGatewayV2 {
    return new SimApiGatewayV2({
      ...this.scoped(scope),
      // API ids are unique across the simulation, and an API is reachable by
      // id alone from the serving layer, whichever scope created it.
      registry: this.registries.httpApi,
      // A custom domain name is unique across the simulation, and a request to
      // one carries only its hostname, so the domains are registered where
      // resolution can find them.
      domainRegistry: this.registries.httpApiDomains,
      jwtIssuerKeys: simAwsHttpApiJwtIssuerKeys(this.registries),
    });
  }

  /**
   * Create simulated ECR for an Account Region scope.
   *
   * Repositories are Region-scoped on real AWS: a repository ARN names the
   * Region, and the registry host in an image URI carries the Account and the
   * Region both. It is registered because a container image function holds
   * nothing but that URI, and the function need not be in this scope.
   */
  createEcr(scope: SimAwsAccountRegionContainer): SimEcr {
    const { accountRegionScope, iam } = this.scoped(scope);

    return new SimEcr({
      accountRegionScope,
      iam,
      registry: this.registries.ecr,
    });
  }

  /**
   * Create simulated Elastic Load Balancing v2 for an Account Region scope.
   *
   * The registries are the hops from a name to a scope: a load balancer's DNS
   * name to the Account holding it, and a listener's certificate ARN to ACM.
   */
  createElbV2(scope: SimAwsAccountRegionContainer): SimElbV2 {
    const { elbV2: registry, acm: acmRegistry } = this.registries;

    return new SimElbV2({ ...this.scoped(scope), registry, acmRegistry });
  }

  /**
   * Create simulated KMS for an Account Region scope.
   *
   * KMS keys are Region-scoped on real AWS: a key ARN names its Region, and a
   * ciphertext produced in one Region cannot be decrypted in another. That is
   * why it is registered: a key ARN carries the Region another service needs.
   */
  createKms(scope: SimAwsAccountRegionContainer): SimKms {
    const kms = new SimKms(this.scoped(scope));
    this.registries.kms.register(scope.accountRegionScope, kms);
    return kms;
  }

  /**
   * The collaborators every service built here takes.
   */
  private scoped(
    scope: SimAwsAccountRegionContainer,
  ): SimAwsScopedServiceProperties {
    return this.accountServices.scopedServiceProperties(scope);
  }
}
