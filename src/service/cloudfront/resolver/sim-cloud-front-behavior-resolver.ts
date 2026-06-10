import type { SimCloudFrontBehavior } from "../behaviour/sim-cloud-front-behavior.js";
import type { SimCloudFrontDistribution } from "../distribution/sim-cloudfront-distribution.js";
import { assertDefined } from "../../../util/defined/defined.js";
import { SimCloudFrontPathPattern } from "./sim-cloudfront-path-pattern.js";

/**
 * Selects the appropriate sim CloudFront Behavior within a sim CloudFront
 * Distribution for a request.
 */
export class SimCloudFrontBehaviorResolver {
  /**
   * Resolve the Behavior in the selected Distribution which best matches this
   * request.
   */
  resolve(
    req: Request,
    simDistribution: SimCloudFrontDistribution,
  ): SimCloudFrontBehavior {
    const requestPath = new URL(req.url).pathname;

    const explicitMatch = simDistribution.behaviors
      .filter((behaviour) => this.behaviourMatchesPath(behaviour, requestPath))
      .toSorted(
        (a, b) =>
          this.pathPatternSpecificity(b.pathPattern) -
          this.pathPatternSpecificity(a.pathPattern),
      )[0];

    if (explicitMatch !== undefined) {
      return explicitMatch;
    }

    const defaultBehaviour = simDistribution.behaviors.find((behaviour) =>
      this.isDefaultBehaviour(behaviour),
    );

    assertDefined(
      defaultBehaviour,
      `Default CloudFront Behavior for Distribution ${simDistribution.distributionId}`,
    );

    return defaultBehaviour;
  }

  private behaviourMatchesPath(
    behaviour: SimCloudFrontBehavior,
    requestPath: string,
  ): boolean {
    if (this.isDefaultBehaviour(behaviour)) {
      return false;
    }

    const pathPattern = behaviour.pathPattern;
    assertDefined(pathPattern, "CloudFront Behavior path pattern");

    return new SimCloudFrontPathPattern({ pathPattern }).matches(requestPath);
  }

  private isDefaultBehaviour(behaviour: SimCloudFrontBehavior): boolean {
    return behaviour.pathPattern === undefined || behaviour.pathPattern === "*";
  }

  private pathPatternSpecificity(pathPattern: string | undefined): number {
    /* v8 ignore if -- redundant fallback */
    if (pathPattern === undefined || pathPattern === "*") {
      return 0;
    }

    return new SimCloudFrontPathPattern({ pathPattern }).specificity();
  }
}
