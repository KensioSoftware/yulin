import type {
  SimDynamoDbTimeToLiveDescription,
  SimDynamoDbTimeToLiveStatus,
} from "../command/time-to-live/time-to-live.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbTimeToLiveSpecification } from "./sim-dynamodb-time-to-live-specification.js";

/**
 * Real DynamoDB takes one UpdateTimeToLive per table per hour.
 */
const updateWindowMilliseconds = 60 * 60 * 1000;

/**
 * One table's time to live setting.
 *
 * An update moves the status to ENABLING or DISABLING and the scheduled work
 * settles it on ENABLED or DISABLED, which is the same two-step the table's own
 * status goes through. Nothing here expires anything: this is what a table
 * expires items by, and `SimDynamoDbTableExpiry` is what acts on it.
 */
export class SimDynamoDbTimeToLive {
  private readonly tableName: string;
  #status: SimDynamoDbTimeToLiveStatus = "DISABLED";
  #attributeName: string | undefined;
  #updatedAt: Date | undefined;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /**
   * Where this table's time to live is now.
   */
  get status(): SimDynamoDbTimeToLiveStatus {
    return this.#status;
  }

  /**
   * The attribute items expire by, while time to live is on.
   *
   * ENABLING counts as on and DISABLING as off, since each is on its way to
   * that state and the scheduled work settles it within the same turn.
   */
  enabledAttributeName(): string | undefined {
    if (this.#status === "ENABLED" || this.#status === "ENABLING") {
      return this.#attributeName;
    }

    return undefined;
  }

  /**
   * Take an update, refusing one that comes too soon after the last.
   */
  update(specification: SimDynamoDbTimeToLiveSpecification, at: Date): void {
    this.assertUpdatable(at);

    this.#attributeName = specification.attributeName;
    this.#updatedAt = at;
    this.#status = this.statusFor(specification.enabled);
  }

  /**
   * Finish an update that was scheduled.
   *
   * A DISABLED table reports no attribute name, as real DynamoDB reports none,
   * so the attribute is forgotten rather than left describing a table that no
   * longer expires anything.
   */
  settle(): void {
    if (this.#status === "ENABLING") {
      this.#status = "ENABLED";

      return;
    }

    if (this.#status === "DISABLING") {
      this.#status = "DISABLED";
      this.#attributeName = undefined;
    }
  }

  /**
   * Describe this time to live the way DynamoDB reports it.
   */
  description(): SimDynamoDbTimeToLiveDescription {
    return {
      TimeToLiveStatus: this.#status,
      AttributeName: this.#attributeName,
    };
  }

  /**
   * Where an update is heading.
   */
  private statusFor(enabled: boolean): SimDynamoDbTimeToLiveStatus {
    if (enabled) {
      return "ENABLING";
    }

    return "DISABLING";
  }

  /**
   * Refuse a second update inside the hour.
   *
   * The hour is measured on the simulation's clock, so a test moves past it
   * with `simAws.clock().advanceBy({ hours: 1 })` rather than by waiting.
   */
  private assertUpdatable(at: Date): void {
    if (this.#updatedAt === undefined) {
      return;
    }

    const elapsed = at.getTime() - this.#updatedAt.getTime();

    if (elapsed >= updateWindowMilliseconds) {
      return;
    }

    throw new SimDynamoDbValidationException(
      `Time to live on Table ${this.tableName} was last updated at ` +
        `${this.#updatedAt.toISOString()}, and DynamoDB takes one ` +
        `UpdateTimeToLive per table per hour`,
    );
  }
}
