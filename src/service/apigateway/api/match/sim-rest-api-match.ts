import { simRestApiAnyMethod } from "../method/sim-rest-api-method.js";
import type { SimRestApiMethod } from "../method/sim-rest-api-method.js";
import type { SimRestApiResource } from "../resource/sim-rest-api-resource.js";
import type { SimRestApiStage } from "../stage/sim-rest-api-stage.js";
import type { SimRestApi } from "../sim-rest-api.js";
import type { SimRestApiRequest } from "./sim-rest-api-request.js";
import {
  type SimRestApiResourceMatch,
  SimRestApiResourceWalk,
} from "./sim-rest-api-resource-walk.js";

/**
 * What a simulated REST API found for one request.
 */
export interface SimRestApiMatch {
  readonly stage: SimRestApiStage;
  readonly resource: SimRestApiResource;
  readonly method: SimRestApiMethod;
  readonly pathParameters: Readonly<Record<string, string>>;
  /**
   * The request path with the stage segment taken off and no leading
   * separator, such as `orders/6`. A request to the stage root leaves it
   * empty.
   *
   * This is the path a Lambda authorizer's `methodArn` names, which is the
   * path the client asked for rather than the resource template it matched.
   */
  readonly pathAfterStage: string;
}

/**
 * Why a request reached nothing.
 *
 * The two are told apart because real API Gateway answers them differently. A
 * stage that is not there is a plain `Forbidden`, while a request that reached
 * the stage and matched no method gets the `Missing Authentication Token`
 * message API Gateway is well known for.
 */
export type SimRestApiMiss = "stage" | "route";

/**
 * Matches a request to a stage, a resource and a method of one REST API.
 *
 * The stage goes first, because every REST API request carries its stage as
 * the first path segment and the resource tree knows nothing about it. A
 * request to `/prod/orders/6` on stage `prod` reaches the tree as the segments
 * `orders` and `6`.
 */
export class SimRestApiMatcher {
  private readonly walk = new SimRestApiResourceWalk();

  /**
   * Find what should handle one request, or why nothing does.
   */
  match(
    restApi: SimRestApi,
    request: SimRestApiRequest,
  ): SimRestApiMatch | SimRestApiMiss {
    const [stageName, ...segments] = request.segments;
    const stage = restApi.stages.find(stageName ?? "");

    if (stage === undefined) {
      return "stage";
    }

    const reached = this.walk.walk(restApi.resources, segments);

    if (reached === undefined) {
      return "route";
    }

    return this.matched(stage, reached, request, segments.join("/")) ?? "route";
  }

  /**
   * The method of the reached resource that answers this request.
   *
   * An explicit method wins over `ANY`, which is the catch-all for whatever
   * the resource declares no method of its own for.
   */
  private matched(
    stage: SimRestApiStage,
    reached: SimRestApiResourceMatch,
    request: SimRestApiRequest,
    pathAfterStage: string,
  ): SimRestApiMatch | undefined {
    const method =
      reached.resource.findMethod(request.method) ??
      reached.resource.findMethod(simRestApiAnyMethod);

    return method === undefined
      ? undefined
      : { stage, method, pathAfterStage, ...reached };
  }
}

/**
 * Whether matching found something to invoke.
 */
export function isSimRestApiMatch(
  match: SimRestApiMatch | SimRestApiMiss,
): match is SimRestApiMatch {
  return typeof match !== "string";
}
