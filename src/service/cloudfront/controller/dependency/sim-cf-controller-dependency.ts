import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCloudFrontRegistry } from "../../registry/sim-cloud-front-registry.js";
import type { SimCloudFrontDistroRouter } from "../../router/sim-cloud-front-distro-router.js";
import { SimCloudFrontDistroRouter as DefaultSimCloudFrontDistroRouter } from "../../router/sim-cloud-front-distro-router.js";
import type { SimCloudFrontBehaviorResolver } from "../../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCloudFrontBehaviorResolver as DefaultSimCloudFrontBehaviorResolver } from "../../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCffApplicator } from "../cff/sim-cff-applicator.js";
import { SimLambdaEdgeApplicator } from "../edge/sim-lambda-edge-applicator.js";
import { SimAwsCfEdgeFunctions } from "../../edge/sim-aws-cf-edge-functions.js";
import { SimCloudFrontOriginFetcher } from "../origin/sim-cloudfront-origin-fetcher.js";
import { SimCfCustomErrorResponder } from "../error/sim-cf-custom-error-responder.js";
import { SimCfResponseHeadersApplicator } from "../response-headers/sim-cf-response-headers-applicator.js";
import { SimCfWebAclGuard } from "../web-acl/sim-cf-web-acl-guard.js";
import { makeSimCfWebAclResolver } from "../../web-acl/sim-cf-web-acl-resolver.factory.js";

export interface SimCloudFrontServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly cloudFrontRegistry?: SimCloudFrontRegistry;
  readonly distroRouter?: SimCloudFrontDistroRouter;
  readonly webAclGuard?: SimCfWebAclGuard;
  readonly behaviourResolver?: SimCloudFrontBehaviorResolver;
  readonly cffApplicator?: SimCffApplicator;
  readonly edgeApplicator?: SimLambdaEdgeApplicator;
  readonly originFetcher?: SimCloudFrontOriginFetcher;
  readonly customErrorResponder?: SimCfCustomErrorResponder;
  readonly responseHeadersApplicator?: SimCfResponseHeadersApplicator;
}

export interface SimCloudFrontControllerDependencies {
  readonly distroRouter: SimCloudFrontDistroRouter;
  readonly webAclGuard: SimCfWebAclGuard;
  readonly behaviourResolver: SimCloudFrontBehaviorResolver;
  readonly cffApplicator: SimCffApplicator;
  readonly edgeApplicator: SimLambdaEdgeApplicator;
  readonly originFetcher: SimCloudFrontOriginFetcher;
  readonly customErrorResponder: SimCfCustomErrorResponder;
  readonly responseHeadersApplicator: SimCfResponseHeadersApplicator;
}

/**
 * Builds the collaborators used by the CloudFront service controller.
 */
export class SimCloudFrontControllerDependenciesFactory {
  /**
   * Build controller dependencies from optional constructor props.
   */
  make(
    properties: SimCloudFrontServiceControllerProperties = {},
  ): SimCloudFrontControllerDependencies {
    const simAws = properties.simAws ?? new SimAws();
    const cloudFrontRegistry =
      properties.cloudFrontRegistry ?? simAws.serviceFactory.cloudFrontRegistry;

    // The custom error responder fetches its response page through the same
    // Behavior resolution and Origin fetching as any other request, so it is
    // built from whichever of those the caller supplied.
    const behaviourResolver =
      properties.behaviourResolver ??
      new DefaultSimCloudFrontBehaviorResolver();
    const originFetcher =
      properties.originFetcher ?? new SimCloudFrontOriginFetcher();

    return {
      distroRouter:
        properties.distroRouter ??
        new DefaultSimCloudFrontDistroRouter({
          simAws,
          cloudFrontRegistry,
        }),
      webAclGuard:
        properties.webAclGuard ??
        new SimCfWebAclGuard(makeSimCfWebAclResolver(simAws)),
      behaviourResolver,
      cffApplicator: properties.cffApplicator ?? new SimCffApplicator(),
      edgeApplicator:
        properties.edgeApplicator ??
        new SimLambdaEdgeApplicator({
          edgeFunctions: new SimAwsCfEdgeFunctions(simAws),
        }),
      originFetcher,
      customErrorResponder:
        properties.customErrorResponder ??
        new SimCfCustomErrorResponder({ behaviourResolver, originFetcher }),
      responseHeadersApplicator:
        properties.responseHeadersApplicator ??
        new SimCfResponseHeadersApplicator(),
    };
  }
}
