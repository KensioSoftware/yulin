/**
 * The envelope version every EventBridge event carries.
 *
 * Real EventBridge documents this as "Currently 0 (zero) for all events", and
 * says it is an envelope field rather than a schema version for the detail.
 */
export const simEventBridgeEnvelopeVersion = "0";

/**
 * One event as EventBridge presents it to a rule and to a target.
 *
 * The shape is the envelope AWS wraps around whatever was put: the fields a
 * rule's event pattern matches against, and the JSON a target receives. The
 * key is `detail-type` rather than `detailType`, which is why this is a
 * separate shape from the PutEvents entry that produced it.
 */
export interface SimEventBridgeEnvelope {
  readonly version: string;
  readonly id: string;
  readonly "detail-type": string;
  readonly source: string;
  readonly account: string;
  readonly time: string;
  readonly region: string;
  readonly resources: readonly string[];
  readonly detail: Record<string, unknown>;
}

interface SimEventBridgeEventProperties {
  readonly id: string;
  readonly detailType: string;
  readonly source: string;
  readonly account: string;
  readonly time: Date;
  readonly region: string;
  readonly resources: readonly string[];
  readonly detail: Record<string, unknown>;
}

/**
 * One event a simulated event bus received.
 *
 * An event is immutable once EventBridge has built it. What a rule matches and
 * what a target receives are both this, so building it in one place is what
 * keeps the two from drifting apart.
 */
export class SimEventBridgeEvent {
  public readonly id: string;
  public readonly detailType: string;
  public readonly source: string;
  public readonly account: string;
  public readonly time: Date;
  public readonly region: string;
  public readonly resources: readonly string[];
  public readonly detail: Record<string, unknown>;

  constructor(properties: SimEventBridgeEventProperties) {
    this.id = properties.id;
    this.detailType = properties.detailType;
    this.source = properties.source;
    this.account = properties.account;
    this.time = properties.time;
    this.region = properties.region;
    this.resources = properties.resources;
    this.detail = properties.detail;
  }

  /**
   * This event as the JSON a rule matches and a target receives.
   *
   * The timestamp is to the second, with no milliseconds, which is how real
   * EventBridge writes it. A target asserting on the time gets the same string
   * it would get from AWS rather than one with three more digits in it.
   */
  toEnvelope(): SimEventBridgeEnvelope {
    return {
      version: simEventBridgeEnvelopeVersion,
      id: this.id,
      "detail-type": this.detailType,
      source: this.source,
      account: this.account,
      time: simEventBridgeEventTime(this.time),
      region: this.region,
      resources: this.resources,
      detail: this.detail,
    };
  }
}

/**
 * Write an instant the way an EventBridge event carries it: RFC3339, to the
 * second.
 */
export function simEventBridgeEventTime(instant: Date): string {
  return `${instant.toISOString().slice(0, "yyyy-mm-ddThh:mm:ss".length)}Z`;
}
