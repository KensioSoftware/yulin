import type { SimSnsSubscriptionProtocol } from "../subscription/sim-sns-subscription-protocol.js";
import type {
  SimSnsDeliveryEndpoints,
  SimSnsDeliveryRequest,
} from "./sim-sns-delivery.js";

/**
 * One endpoints implementation per protocol.
 *
 * A record rather than a lookup with a fallback, so adding a protocol to
 * `SimSnsSubscriptionProtocol` without giving it somewhere to deliver fails to
 * compile.
 */
type SimSnsEndpointsByProtocol = Readonly<
  Record<SimSnsSubscriptionProtocol, SimSnsDeliveryEndpoints>
>;

interface SimSnsProtocolDeliveryEndpointsProperties {
  readonly byProtocol: SimSnsEndpointsByProtocol;
}

/**
 * Sends each delivery to the endpoints its subscription's protocol implies.
 *
 * What a destination is asked before it takes a message, and what it is handed,
 * both differ by protocol: a queue is asked about its own policy and handed a
 * body, and a function is asked about its resource policy and handed an event.
 * So each protocol has its own implementation, and this is what picks between
 * them.
 */
export class SimSnsProtocolDeliveryEndpoints implements SimSnsDeliveryEndpoints {
  private readonly byProtocol: SimSnsEndpointsByProtocol;

  constructor(properties: SimSnsProtocolDeliveryEndpointsProperties) {
    this.byProtocol = properties.byProtocol;
  }

  /**
   * Deliver one message over its subscription's protocol.
   */
  async deliver(request: SimSnsDeliveryRequest): Promise<void> {
    await this.byProtocol[request.subscription.protocol].deliver(request);
  }
}
