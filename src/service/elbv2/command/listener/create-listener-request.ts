import { SimElbV2Action } from "../../action/sim-elbv2-action.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2Listener } from "../../listener/sim-elbv2-listener.js";
import { simElbV2Port, simElbV2Protocol } from "../../sim-elbv2-protocol.js";
import type { SimElbV2Certificate } from "../sim-elbv2-shared.command.js";
import type { SimCreateListenerCommandInput } from "./listener.command.js";

/**
 * What building a listener needs that the request itself does not carry.
 */
interface SimElbV2NewListenerProperties {
  readonly loadBalancerArn: string;
  readonly id: string;
  readonly certificateArn: string | undefined;
}

/**
 * What a CreateListener request asks for, read once and checked.
 *
 * Reading the request is held apart from carrying it out because the two answer
 * to different things: this is the shape of the input real ELB takes, and the
 * handler is the order the simulation does the work in. It also leaves the
 * handler short enough to read in one go.
 */
export class SimElbV2CreateListenerRequest {
  public readonly loadBalancerArn: string;
  public readonly port: number;
  public readonly protocol: string;
  public readonly certificates: readonly SimElbV2Certificate[] | undefined;
  public readonly defaultActions: readonly SimElbV2Action[];

  private readonly sslPolicy: string | undefined;

  constructor(input: SimCreateListenerCommandInput) {
    if (input.LoadBalancerArn === undefined) {
      throw new SimElbV2ValidationError("LoadBalancerArn is required");
    }

    if (input.Protocol === undefined || input.Port === undefined) {
      throw new SimElbV2ValidationError(
        "A listener requires a Protocol and a Port",
      );
    }

    this.loadBalancerArn = input.LoadBalancerArn;
    this.protocol = simElbV2Protocol("Protocol", input.Protocol);
    this.port = simElbV2Port("Port", input.Port);
    this.sslPolicy = input.SslPolicy;
    this.certificates = input.Certificates;
    this.defaultActions = SimElbV2Action.readAll(
      input.DefaultActions,
      "DefaultActions",
    );
  }

  /**
   * Build the listener this request asks for, once everything it names has been
   * resolved.
   */
  listener(properties: SimElbV2NewListenerProperties): SimElbV2Listener {
    return new SimElbV2Listener({
      loadBalancerArn: properties.loadBalancerArn,
      id: properties.id,
      port: this.port,
      protocol: this.protocol,
      sslPolicy: this.sslPolicy,
      certificateArn: properties.certificateArn,
      defaultActions: this.defaultActions,
    });
  }
}
