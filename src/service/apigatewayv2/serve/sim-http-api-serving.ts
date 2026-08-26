import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import { simRoute53LogicalHostname } from "../../route53/local-name/sim-route53-local-name.js";
import { simHttpApiPathSegments } from "../api/route/path/sim-http-api-path-segments.js";
import type { SimHttpApiMatch } from "../api/sim-http-api-match.js";
import { SimHttpApiRequest } from "../api/sim-http-api-request.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import type { SimApiGatewayV2Router } from "./sim-api-gateway-v2-router.js";
import { SimHttpApiDomainRouter } from "./sim-http-api-domain-router.js";

/**
 * What serves one request: the API, what it matched, and the hostname the
 * request arrived on.
 *
 * The hostname is carried through because the event a handler receives names
 * it, and a request through a custom domain names that domain rather than the
 * endpoint API Gateway generated.
 */
export interface SimHttpApiServing {
  readonly api: SimHttpApi;
  readonly match: SimHttpApiMatch;
  readonly domainName: string;
}

/**
 * What an HTTP API endpoint decided about one request before any of it ran.
 *
 * `refusedHost` is a request carrying a `Host` the API neither generated nor
 * has mapped, which real API Gateway answers 403 before the route's authorizer
 * sees it. It is what a viewer reaches through a CloudFront behaviour whose
 * cache key holds `host`, and what an API with `DisableExecuteApiEndpoint`
 * answers on its generated endpoint.
 */
export type SimHttpApiResolution =
  | { readonly kind: "served"; readonly serving: SimHttpApiServing }
  | { readonly kind: "notFound" }
  | { readonly kind: "refusedHost" };

const notFound: SimHttpApiResolution = { kind: "notFound" };
const refusedHost: SimHttpApiResolution = { kind: "refusedHost" };

interface SimHttpApiServingResolverProperties {
  readonly router: SimApiGatewayV2Router;
}

/**
 * Decides what serves one request that reached an HTTP API endpoint.
 *
 * There are two ways in, and they differ in where the stage comes from. A
 * request to the generated endpoint carries the stage as its first path
 * segment, or is served by the `$default` stage. A request to a custom domain
 * is matched to an API mapping, and the mapping names the stage outright, so
 * what comes off the front of the path is the mapping's base path instead.
 *
 * Either way the hostname decides first. An API serves the endpoint API
 * Gateway generated for it and the domains mapped to it, and refuses anything
 * else with a 403 before a route or an authorizer is asked about the request.
 */
export class SimHttpApiServingResolver {
  private readonly router: SimApiGatewayV2Router;
  private readonly domains: SimHttpApiDomainRouter;

  constructor(properties: SimHttpApiServingResolverProperties) {
    this.router = properties.router;
    this.domains = new SimHttpApiDomainRouter(properties.router.simAws);
  }

  /**
   * Resolve one request routed to an HTTP API endpoint.
   */
  resolve(target: SimAwsServiceTarget, request: Request): SimHttpApiResolution {
    const url = new URL(request.url);
    const hostname = simRoute53LogicalHostname(url.hostname);

    if (target.service === "apiGatewayDomain") {
      return this.mapped(target, request.method, url.pathname);
    }

    return this.generated(target, request.method, url.pathname, hostname);
  }

  /**
   * Resolve a request that reached the endpoint API Gateway generated.
   */
  private generated(
    target: SimAwsServiceTarget,
    method: string,
    path: string,
    hostname: string | undefined,
  ): SimHttpApiResolution {
    const httpApi = this.router.route(target);

    if (httpApi === undefined) {
      return notFound;
    }

    // An API answers on the endpoint API Gateway generated for it and on the
    // domains mapped to it, and a mapped domain resolved to the other target.
    // `DisableExecuteApiEndpoint` takes the generated hostname out of that
    // set, which is why it produces the same refusal.
    if (
      httpApi.disableExecuteApiEndpoint ||
      hostname !== httpApi.logicalHostname
    ) {
      return refusedHost;
    }

    // The whole request path, stage segment and all: the stage takes its own
    // segment off, and `rawPath` reports the path as the client sent it.
    const match = httpApi.match(new SimHttpApiRequest({ method, path }));

    if (match === undefined) {
      return notFound;
    }

    return {
      kind: "served",
      serving: { api: httpApi, match, domainName: httpApi.hostname },
    };
  }

  /**
   * Resolve a request that reached a custom domain name.
   *
   * Nothing here is a 403. The domain answers on its own hostname by
   * definition, so a path no mapping claims, a mapping whose API or stage has
   * since gone, and a path no route matches are all the one 404.
   */
  private mapped(
    target: SimAwsServiceTarget,
    method: string,
    path: string,
  ): SimHttpApiResolution {
    const domain = this.domains.route(target);

    /* v8 ignore if -- a domain target only resolves from a registered domain */
    if (domain === undefined) {
      return notFound;
    }

    const segments = simHttpApiPathSegments(path);
    const mapping = domain.apiMappings.select(segments);

    if (mapping === undefined) {
      return notFound;
    }

    const httpApi = this.domains.mappedApi(domain, mapping.apiId);
    const stage = httpApi?.stages.find(mapping.stage);

    if (httpApi === undefined || stage === undefined) {
      return notFound;
    }

    const match = httpApi.matchInStage({
      stage,
      method,
      segments: mapping.apiMappingKey.remainder(segments),
    });

    if (match === undefined) {
      return notFound;
    }

    return {
      kind: "served",
      serving: { api: httpApi, match, domainName: domain.domainName },
    };
  }
}
