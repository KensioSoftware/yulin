import type { SimElbV2Action } from "../action/sim-elbv2-action.js";
import type {
  SimElbV2ActionView,
  SimElbV2Certificate,
} from "../command/sim-elbv2-shared.command.js";
import {
  requireSimElbV2ListenerCertificate,
  simElbV2ListenerSslPolicy,
} from "./sim-elbv2-listener-security.js";

interface SimElbV2ListenerProperties {
  readonly loadBalancerArn: string;
  readonly id: string;
  readonly port: number;
  readonly protocol: string;
  readonly sslPolicy: string | undefined;
  readonly certificates: readonly SimElbV2Certificate[];
  readonly defaultActions: readonly SimElbV2Action[];
}

/**
 * What a request can change on an existing listener.
 */
export interface SimElbV2ListenerChanges {
  readonly port?: number | undefined;
  readonly protocol?: string | undefined;
  readonly sslPolicy?: string | undefined;
  readonly certificates?: readonly SimElbV2Certificate[] | undefined;
  readonly defaultActions?: readonly SimElbV2Action[] | undefined;
}

/**
 * A simulated listener as the SDK reads it back.
 */
export interface SimElbV2ListenerView {
  readonly ListenerArn: string;
  readonly LoadBalancerArn: string;
  readonly Port: number;
  readonly Protocol: string;
  readonly SslPolicy?: string | undefined;
  readonly Certificates: readonly SimElbV2Certificate[];
  readonly DefaultActions: readonly SimElbV2ActionView[];
}

/**
 * One simulated listener on an Application Load Balancer.
 *
 * A listener's ARN is built from its load balancer's rather than from the
 * scope, which is what makes the load balancer's name and id appear in it the
 * way real ELB has them, and what makes a listener ARN say which load balancer
 * it belongs to without anything having to look it up.
 */
export class SimElbV2Listener {
  public readonly arn: string;
  public readonly loadBalancerArn: string;

  private currentPort: number;
  private currentProtocol: string;
  private currentSslPolicy: string | undefined;
  private currentCertificates: readonly SimElbV2Certificate[];
  private currentDefaultActions: readonly SimElbV2Action[];

  constructor(properties: SimElbV2ListenerProperties) {
    this.loadBalancerArn = properties.loadBalancerArn;
    this.arn = `${properties.loadBalancerArn.replace(
      ":loadbalancer/",
      ":listener/",
    )}/${properties.id}`;
    this.currentPort = properties.port;
    this.currentProtocol = properties.protocol;
    this.currentSslPolicy = simElbV2ListenerSslPolicy(
      properties.protocol,
      properties.sslPolicy,
    );
    // Copied for the same reason an action's input is: what a listener
    // presents cannot change because a caller reused the array it sent.
    this.currentCertificates = structuredClone(properties.certificates);
    this.currentDefaultActions = properties.defaultActions;

    requireSimElbV2ListenerCertificate(properties.protocol, this.certificates);
  }

  /** The port this listener answers on. */
  get port(): number {
    return this.currentPort;
  }

  /** The protocol this listener speaks. */
  get protocol(): string {
    return this.currentProtocol;
  }

  /** The certificates an HTTPS listener presents. */
  get certificates(): readonly SimElbV2Certificate[] {
    return this.currentCertificates;
  }

  /** What this listener does with a request no rule claims. */
  get defaultActions(): readonly SimElbV2Action[] {
    return this.currentDefaultActions;
  }

  /**
   * Change what a request names, leaving the rest as it was.
   *
   * The certificate rule is checked against the listener as it would be after
   * the change rather than against the request, so switching a listener to
   * HTTPS and giving it a certificate in one request is allowed and switching
   * it without one is not.
   */
  modify(changes: SimElbV2ListenerChanges): void {
    const protocol = changes.protocol ?? this.currentProtocol;
    const certificates = changes.certificates ?? this.currentCertificates;

    requireSimElbV2ListenerCertificate(protocol, certificates);

    this.currentPort = changes.port ?? this.currentPort;
    this.currentProtocol = protocol;
    this.currentCertificates = structuredClone(certificates);
    this.currentSslPolicy = simElbV2ListenerSslPolicy(
      protocol,
      changes.sslPolicy ?? this.currentSslPolicy,
    );
    this.currentDefaultActions =
      changes.defaultActions ?? this.currentDefaultActions;
  }

  /**
   * Report this listener in the shape the SDK reads it back in.
   */
  view(): SimElbV2ListenerView {
    return {
      ListenerArn: this.arn,
      LoadBalancerArn: this.loadBalancerArn,
      Port: this.port,
      Protocol: this.protocol,
      SslPolicy: this.currentSslPolicy,
      Certificates: this.certificates,
      DefaultActions: this.defaultActions.map((action) => action.view()),
    };
  }
}
