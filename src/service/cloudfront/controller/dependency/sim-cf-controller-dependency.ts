import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCloudFrontRegistry } from "../../registry/sim-cloud-front-registry.js";
import type { SimCloudFrontDistroRouter } from "../../router/sim-cloud-front-distro-router.js";
import { SimCloudFrontDistroRouter as DefaultSimCloudFrontDistroRouter } from "../../router/sim-cloud-front-distro-router.js";
import type { SimCloudFrontBehaviorResolver } from "../../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCloudFrontBehaviorResolver as DefaultSimCloudFrontBehaviorResolver } from "../../resolver/sim-cloud-front-behavior-resolver.js";
import { SimCffApplicator } from "../cff/sim-cff-applicator.js";
import { SimCloudFrontOriginFetcher } from "../origin/sim-cloudfront-origin-fetcher.js";

export interface SimCloudFrontServiceControllerProps {
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
    props: SimCloudFrontServiceControllerProps = {},
  ): SimCloudFrontControllerDependencies {
    const simAws = props.simAws ?? new SimAws();
    const cloudFrontRegistry =
      props.cloudFrontRegistry ?? simAws.cloudFrontRegistry();

    return {
      distroRouter:
        props.distroRouter ??
        new DefaultSimCloudFrontDistroRouter({
          simAws,
          cloudFrontRegistry,
        }),
      behaviourResolver:
        props.behaviourResolver ?? new DefaultSimCloudFrontBehaviorResolver(),
      cffApplicator: props.cffApplicator ?? new SimCffApplicator(),
      originFetcher: props.originFetcher ?? new SimCloudFrontOriginFetcher(),
    };
  }
}
