import type { SimElbV2Action } from "../action/sim-elbv2-action.js";
import type {
  SimElbV2ActionView,
  SimElbV2Certificate,
} from "../command/sim-elbv2-shared.command.js";
import { SimElbV2CertificateList } from "./certificate/sim-elbv2-certificate-list.js";
import {
  requireSimElbV2CertificateProtocol,
  simElbV2ListenerCertificate,
  simElbV2ListenerSslPolicy,
} from "./sim-elbv2-listener-security.js";

interface SimElbV2ListenerProperties {
  readonly loadBalancerArn: string;
  readonly id: string;
  readonly port: number;
  readonly protocol: string;
  readonly sslPolicy: string | undefined;
  /** The ARN of the certificate an HTTPS listener presents by default. */
  readonly certificateArn: string | undefined;
  readonly defaultActions: readonly SimElbV2Action[];
}

/**
 * What a request can change on an existing listener.
 */
export interface SimElbV2ListenerChanges {
  readonly port?: number | undefined;
  readonly protocol?: string | undefined;
  readonly sslPolicy?: string | undefined;
  readonly certificateArn?: string | undefined;
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

  private readonly certificateList = new SimElbV2CertificateList();
  private currentPort: number;
  private currentProtocol: string;
  private currentSslPolicy: string | undefined;
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
    this.currentDefaultActions = properties.defaultActions;

    this.holdCertificate(
      simElbV2ListenerCertificate(
        properties.protocol,
        properties.certificateArn,
      ),
    );
  }

  /** The port this listener answers on. */
  get port(): number {
    return this.currentPort;
  }

  /** The protocol this listener speaks. */
  get protocol(): string {
    return this.currentProtocol;
  }

  /**
   * Every certificate this listener carries, the default one first.
   *
   * This is what `DescribeListenerCertificates` reports, where a described
   * listener reports its default certificate alone.
   */
  get certificates(): readonly SimElbV2Certificate[] {
    return this.certificateList.list();
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
    const certificateArn = simElbV2ListenerCertificate(
      protocol,
      changes.certificateArn ?? this.certificateList.defaultArn,
    );

    this.currentPort = changes.port ?? this.currentPort;
    this.currentProtocol = protocol;
    this.currentSslPolicy = simElbV2ListenerSslPolicy(
      protocol,
      changes.sslPolicy ?? this.currentSslPolicy,
    );
    this.currentDefaultActions =
      changes.defaultActions ?? this.currentDefaultActions;

    this.holdCertificate(certificateArn);
  }

  /**
   * Carry more certificates beyond the default one.
   *
   * These are the certificates a real listener would choose between by the host
   * name a client asked for. Nothing selects one here, since no handshake
   * happens, so what a test can prove is that the listener carries them.
   */
  addCertificates(certificateArns: readonly string[]): void {
    requireSimElbV2CertificateProtocol(this.currentProtocol);
    this.certificateList.add(certificateArns);
  }

  /**
   * Stop carrying certificates, refusing to take away the default one.
   */
  removeCertificates(certificateArns: readonly string[]): void {
    this.certificateList.remove(certificateArns);
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
      Certificates: this.certificateList.defaultOnly(),
      DefaultActions: this.defaultActions.map((action) => action.view()),
    };
  }

  /**
   * Hold the default certificate, or none at all where the protocol has no use
   * for one.
   *
   * A listener left with no certificate drops its whole certificate list rather
   * than carrying certificates it would never present, which is what real ELB
   * leaves behind after the same change.
   */
  private holdCertificate(certificateArn: string | undefined): void {
    if (certificateArn === undefined) {
      this.certificateList.clear();
      return;
    }

    this.certificateList.setDefault(certificateArn);
  }
}
