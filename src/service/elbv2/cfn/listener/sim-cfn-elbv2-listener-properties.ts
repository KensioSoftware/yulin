import type { SimCreateListenerCommandInput } from "../../command/listener/listener.command.js";
import type {
  SimElbV2ActionInput,
  SimElbV2Certificate,
  SimElbV2Tag,
} from "../../command/sim-elbv2-shared.command.js";
import type { SimCfnElbV2DeclaredResource } from "../property/sim-cfn-elbv2-declared-resource.js";
import { SimCfnElbV2PropertyReader } from "../property/sim-cfn-elbv2-property-reader.js";
import { SimCfnElbV2PropertyRules } from "../property/sim-cfn-elbv2-property-rules.js";

/**
 * The properties a listener is created with.
 */
const actedOnProperties: ReadonlySet<string> = new Set([
  "LoadBalancerArn",
  "Protocol",
  "Port",
  "SslPolicy",
  "Certificates",
  "DefaultActions",
  "Tags",
]);

/**
 * The real AWS::ElasticLoadBalancingV2::Listener properties this simulation
 * has nothing to act on, and why.
 *
 * All three are about the TLS handshake or the connection under it, and no
 * handshake happens here: a listener's protocol says how a request is treated
 * rather than how it arrived.
 */
const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "AlpnPolicy",
    "no TLS handshake happens here, so nothing negotiates a protocol with a " +
      "client",
  ],
  [
    "MutualAuthentication",
    "no TLS handshake happens here, so no client certificate is asked for " +
      "or verified",
  ],
  [
    "ListenerAttributes",
    "the attributes change how a real listener handles connections, and " +
      "there are no connections here to handle",
  ],
]);

/**
 * Reads AWS::ElasticLoadBalancingV2::Listener properties into CreateListener
 * input.
 *
 * `DefaultActions` and `Certificates` are handed on in the shape the template
 * wrote them, which is the shape the API takes, so a template's default action
 * is read by the same model an SDK caller's is and refused for the same
 * reasons.
 */
export class SimCfnElbV2ListenerProperties {
  private readonly reader: SimCfnElbV2PropertyReader;
  private readonly rules: SimCfnElbV2PropertyRules;

  constructor(declared: SimCfnElbV2DeclaredResource) {
    const { resource, properties } = declared;

    this.reader = new SimCfnElbV2PropertyReader({ resource, properties });
    this.rules = new SimCfnElbV2PropertyRules({
      resourceTypeName: "Listener",
      described: "listener",
      properties,
      ignorer: resource,
      actedOn: actedOnProperties,
      unsimulated: unsimulatedPropertyReasons,
    });
  }

  /**
   * The CreateListener input this Resource declares.
   */
  createListenerInput(): SimCreateListenerCommandInput {
    return {
      LoadBalancerArn: this.reader.text("LoadBalancerArn"),
      Protocol: this.reader.text("Protocol"),
      Port: this.reader.number("Port"),
      SslPolicy: this.reader.text("SslPolicy"),
      Certificates: this.reader.structures<SimElbV2Certificate>("Certificates"),
      DefaultActions:
        this.reader.structures<SimElbV2ActionInput>("DefaultActions"),
      Tags: this.reader.structures<SimElbV2Tag>("Tags"),
    };
  }

  /**
   * Record the properties the listener is created without acting on.
   */
  recordIgnoredProperties(): void {
    this.rules.apply();
  }
}
