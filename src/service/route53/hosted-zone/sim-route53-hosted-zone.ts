import { normaliseSimRoute53Name } from "../local-name/sim-route53-local-name.js";
import type { SimRoute53HostedZoneConfig } from "../command/create-hosted-zone/create-hosted-zone.cmd.js";
import { SimRoute53HostedZoneRecords } from "./sim-route53-hosted-zone-records.js";
import {
  assertIsSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../command/create-hosted-zone/sim-route53-zone-id.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";

export type SimRoute53HostedZoneStatus = "PENDING" | "INSYNC";

interface SimRoute53HostedZoneProps {
  readonly id: SimRoute53HostedZoneId | string;
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
  private readonly hostedZoneId: SimRoute53HostedZoneId;
  private readonly hostedZoneName: string;
  // Route53 Hosted Zone caller reference is like an idempotency key.
  private readonly hostedZoneCallerReference: string;
  private readonly hostedZoneConfig: SimRoute53HostedZoneConfig | undefined;
  #status: SimRoute53HostedZoneStatus = "PENDING";
  private synchronizationComplete: Promise<void> | undefined;

  constructor(props: SimRoute53HostedZoneProps) {
    assertIsSimRoute53HostedZoneId(props.id);
    this.hostedZoneId = props.id;
    this.hostedZoneName = `${normaliseSimRoute53Name(props.name)}.`;
    this.hostedZoneCallerReference = props.callerReference;
    this.hostedZoneConfig =
      props.config === undefined ? undefined : { ...props.config };
  }

  /**
   * AWS Route53 Hosted Zone ID.
   */
  get id(): SimRoute53HostedZoneId {
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

  /**
   * Get the current creation status of this sim Hosted Zone.
   */
  get status(): SimRoute53HostedZoneStatus {
    return this.#status;
  }

  /**
   * Move the sim Hosted Zone into PENDING status.
   */
  beginSynchronization(): Promise<void> {
    this.#status = "PENDING";
    return Promise.resolve();
  }

  /**
   * Schedule Hosted Zone synchronization work and remember its completion.
   */
  scheduleSynchronization(
    background: BackgroundScheduler,
    synchronize: () => Promise<void>,
  ): void {
    const synchronizationComplete = new Promise<void>((resolve, reject) => {
      background.schedule(async () => {
        try {
          await synchronize();
          resolve();
        } catch (error) {
          /* v8 ignore start */
          reject(error instanceof Error ? error : new Error(String(error)));
          throw error;
          /* v8 ignore stop */
        }
      });
    });

    this.synchronizationComplete =
      this.synchronizationComplete === undefined
        ? synchronizationComplete
        : (async (): Promise<void> => {
            await Promise.all([
              this.synchronizationComplete,
              synchronizationComplete,
            ]);
          })();
  }

  /**
   * Wait for outstanding Hosted Zone synchronization operations.
   */
  async waitForSynchronizationComplete(): Promise<void> {
    if (this.synchronizationComplete !== undefined) {
      await this.synchronizationComplete;
    }
  }

  /**
   * Move the sim Hosted Zone into INSYNC status.
   */
  completeSynchronization(): Promise<void> {
    this.#status = "INSYNC";
    return Promise.resolve();
  }
}
