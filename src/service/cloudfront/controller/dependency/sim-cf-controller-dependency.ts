import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCloudFrontRegistry } from "../../registry/sim-cloud-front-registry.js";
import type { SimCloudFrontDistroRouter } from "../../router/sim-cloud-front-distro-router.js";
import { SimCloudFrontDistroRouter as DefaultSimCloudFrontDistroRouter } from "../../router/sim-cloud-front-distro-router.js";
import type { SimCloudFrontBehaviorResolver } from "../../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCloudFrontBehaviorResolver as DefaultSimCloudFrontBehaviorResolver } from "../../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCffApplicator } from "../cff/sim-cff-applicator.js";
import { SimCloudFrontOriginFetcher } from "../origin/sim-cloudfront-origin-fetcher.js";

export interface SimCloudFrontServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly cloudFrontRegistry?: SimCloudFrontRegistry;
  readonly distroRouter?: SimCloudFrontDistroRouter;
  readonly behaviourResolver?: SimCloudFrontBehaviorResolver;
  readonly cffApplicator?: SimCffApplicator;
  readonly originFetcher?: SimCloudFrontOriginFetcher;
}

export interface SimCloudFrontControllerDependencies {
  readonly distroRouter: SimCloudFrontDistroRouter;
  readonly behaviourResolver: SimCloudFrontBehaviorResolver;
  readonly cffApplicator: SimCffApplicator;
  readonly originFetcher: SimCloudFrontOriginFetcher;
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

    return {
      distroRouter:
        properties.distroRouter ??
        new DefaultSimCloudFrontDistroRouter({
          simAws,
          cloudFrontRegistry,
        }),
      behaviourResolver:
        properties.behaviourResolver ??
        new DefaultSimCloudFrontBehaviorResolver(),
      cffApplicator: properties.cffApplicator ?? new SimCffApplicator(),
      originFetcher:
        properties.originFetcher ?? new SimCloudFrontOriginFetcher(),
    };
  }
}
