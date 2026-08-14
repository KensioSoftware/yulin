import { normaliseSimRoute53Name } from "../local-name/sim-route53-local-name.js";
import type { SimRoute53HostedZoneConfig } from "../command/create-hosted-zone/create-hosted-zone.command.js";
import { SimRoute53HostedZoneRecords } from "./sim-route53-hosted-zone-records.js";
import {
  assertIsSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../command/create-hosted-zone/sim-route53-zone-id.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import { SimRoute53ZoneSynchronization } from "./sim-route53-zone-synchronization.js";
import { SimRoute53HostedZoneNotEmpty } from "../error/sim-route53.error.js";
import { widenSimRoute53ZoneName } from "./sim-route53-zone-name-widening.js";
import { SimRoute53ZoneDnssec } from "../dnssec/sim-route53-zone-dnssec.js";

export type SimRoute53HostedZoneStatus = "PENDING" | "INSYNC";

interface SimRoute53HostedZoneProperties {
  readonly id: SimRoute53HostedZoneId | string;
  readonly name: string;
  // Route53 Hosted Zone caller reference is like an idempotency key.
  readonly callerReference: string;
  readonly config?: SimRoute53HostedZoneConfig | undefined;
  /**
   * Whether the name is a guess drawn from the records the zone holds, rather
   * than something the simulation was told. Only the CloudFormation looked-up
   * zone sets this; see `SimCfnRoute53LookedUpZone`.
   */
  readonly nameInferred?: boolean | undefined;
}

/**
 * Simulated Route53 Hosted Zone.
 *
 * This is the single source of truth for hosted-zone metadata and records.
 */
export class SimRoute53HostedZone {
  /* @internal */
  public readonly records = new SimRoute53HostedZoneRecords();
  /**
   * This zone's key-signing keys and whether it is being signed.
   *
   * DNSSEC state belongs to the zone rather than to the account-scoped
   * service, in the same way its records do, so a zone reached through the
   * shared registry carries it too.
   * @internal
   */
  public readonly dnssec = new SimRoute53ZoneDnssec();
  /**
   * AWS Route53 Hosted Zone ID.
   */
  public readonly id: SimRoute53HostedZoneId;
  /**
   * Caller reference supplied when the Hosted Zone was created, which Route53
   * treats like an idempotency key.
   */
  public readonly callerReference: string;
  private readonly nameInferred: boolean;
  private readonly hostedZoneConfig: SimRoute53HostedZoneConfig | undefined;
  #name: string;
  #status: SimRoute53HostedZoneStatus = "PENDING";
  private readonly synchronization = new SimRoute53ZoneSynchronization();

  constructor(properties: SimRoute53HostedZoneProperties) {
    assertIsSimRoute53HostedZoneId(properties.id);
    this.id = properties.id;
    this.#name = `${normaliseSimRoute53Name(properties.name)}.`;
    this.nameInferred = properties.nameInferred ?? false;
    this.callerReference = properties.callerReference;
    this.hostedZoneConfig =
      properties.config === undefined ? undefined : { ...properties.config };
  }

  /**
   * Normalised Route53 Hosted Zone name.
   */
  get name(): string {
    return this.#name;
  }

  /**
   * Widen an inferred zone name so that it contains a record name.
   *
   * A zone whose name was inferred from one record can be told about another,
   * and the two together say more about where the zone sits than either does
   * alone. A zone that was named rather than inferred keeps its name, since
   * nothing about it was a guess in the first place.
   */
  widenInferredName(recordName: string): void {
    if (!this.nameInferred) {
      return;
    }

    this.#name = `${widenSimRoute53ZoneName(this.#name, recordName)}.`;
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
  beginSynchronization(): void {
    this.#status = "PENDING";
  }

  /**
   * Schedule Hosted Zone synchronization work and remember its completion.
   */
  scheduleSynchronization(
    background: BackgroundScheduler,
    synchronize: () => Promise<void>,
  ): void {
    this.synchronization.schedule(background, synchronize);
  }

  /**
   * Wait for outstanding Hosted Zone synchronization operations.
   */
  async waitForSynchronizationComplete(): Promise<void> {
    await this.synchronization.waitForComplete();
  }

  /**
   * Refuse deletion while this Hosted Zone still holds records.
   *
   * Real Route53 counts everything except the NS and SOA records it creates
   * with the zone. A simulated zone is created without those two, so every
   * record left here counts.
   */
  assertDeletable(): void {
    if (this.records.count > 0) {
      throw new SimRoute53HostedZoneNotEmpty(
        `Sim Route53 Hosted Zone ${this.id} still holds ` +
          `${String(this.records.count)} records`,
      );
    }
  }

  /**
   * Put the sim Hosted Zone into INSYNC status.
   *
   * Neither this nor `beginSynchronization` awaits anything. Both used to
   * answer with a resolved promise, which said the status change was
   * asynchronous when it never was: the waiting is what
   * `scheduleSynchronization` arranges, and it is separate.
   */
  markSynchronized(): void {
    this.#status = "INSYNC";
  }
}
