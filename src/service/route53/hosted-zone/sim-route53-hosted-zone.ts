import { normaliseSimRoute53Name } from "../local-name/sim-route53-local-name.js";
import type { SimRoute53HostedZoneConfig } from "../command/create-hosted-zone/create-hosted-zone.cmd.js";
import { SimRoute53HostedZoneRecords } from "./sim-route53-hosted-zone-records.js";

interface SimRoute53HostedZoneProps {
  readonly id: string;
  readonly name: string;
  // Route53 Hosted Zone caller reference is like an idempotency key.
  readonly callerReference: string;
  readonly config?: SimRoute53HostedZoneConfig | undefined;
}

/**
 * Simulated Route53 Hosted Zone.
 *
 * This is the single source of truth for hosted-zone metadata and records.
 */
export class SimRoute53HostedZone {
  /* @internal */
  public readonly records = new SimRoute53HostedZoneRecords();
  private readonly hostedZoneId: string;
  private readonly hostedZoneName: string;
  // Route53 Hosted Zone caller reference is like an idempotency key.
  private readonly hostedZoneCallerReference: string;
  private readonly hostedZoneConfig: SimRoute53HostedZoneConfig | undefined;

  constructor(props: SimRoute53HostedZoneProps) {
    this.hostedZoneId = props.id;
    this.hostedZoneName = `${normaliseSimRoute53Name(props.name)}.`;
    this.hostedZoneCallerReference = props.callerReference;
    this.hostedZoneConfig =
      props.config === undefined ? undefined : { ...props.config };
  }

  /**
   * AWS Route53 Hosted Zone ID.
   */
  get id(): string {
    return this.hostedZoneId;
  }

  /**
   * Normalised Route53 Hosted Zone name.
   */
  get name(): string {
    return this.hostedZoneName;
  }

  /**
   * Caller reference supplied when the hosted zone was created.
   * A Route53 Hosted Zone caller reference is like an idempotency key.
   */
  get callerReference(): string {
    return this.hostedZoneCallerReference;
  }

  /**
   * Hosted zone config supplied when the hosted zone was created.
   */
  get config(): SimRoute53HostedZoneConfig | undefined {
    return this.hostedZoneConfig === undefined
      ? undefined
      : { ...this.hostedZoneConfig };
  }
}
