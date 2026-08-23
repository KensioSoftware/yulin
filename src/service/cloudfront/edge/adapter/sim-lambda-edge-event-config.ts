import { randomUUID } from "node:crypto";

import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";

/**
 * Which Distribution an edge function is told it is running for.
 */
export interface SimLambdaEdgeDistributionConfig {
  readonly distributionId: string;
  readonly distributionDomainName: string;
}

/**
 * The `config` every edge event carries, naming the Distribution and the event
 * the function is running at.
 */
export function edgeEventConfig<TEvent extends LambdaAtEdge.EventType>(
  distribution: SimLambdaEdgeDistributionConfig,
  eventType: TEvent,
): LambdaAtEdge.Config & { eventType: TEvent } {
  return {
    distributionId: distribution.distributionId,
    distributionDomainName: distribution.distributionDomainName,
    eventType,
    requestId: randomUUID(),
  };
}
