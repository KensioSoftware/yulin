import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimDynamoDbSecondaryIndex } from "../secondary-index/sim-dynamodb-secondary-index.js";

/**
 * How often DynamoDB refreshes the figures it reports for a table's size.
 */
const refreshMilliseconds = 6 * 60 * 60 * 1000;

/**
 * The number of items in a table or an index, and the bytes they take.
 */
export interface SimDynamoDbStoredFigures {
  readonly itemCount: number;
  readonly sizeBytes: number;
}

/**
 * The figures for a table and each of its indexes.
 *
 * An index is keyed by itself rather than by its name, so an index deleted and
 * added back under the same name reports nothing until the next refresh.
 */
export interface SimDynamoDbTableFigures extends SimDynamoDbStoredFigures {
  readonly indexes: ReadonlyMap<
    SimDynamoDbSecondaryIndex,
    SimDynamoDbStoredFigures
  >;
}

/**
 * The figures of a table that holds nothing.
 */
export const simDynamoDbNoFigures: SimDynamoDbTableFigures = {
  itemCount: 0,
  sizeBytes: 0,
  indexes: new Map(),
};

interface SimDynamoDbTableStatisticsProperties {
  readonly clock: SimClock;
  readonly measure: () => SimDynamoDbTableFigures;
}

/**
 * The `ItemCount` and size figures a table reports, as of the last refresh.
 *
 * DynamoDB refreshes these about every six hours, so they lag behind the items.
 * Here a refresh falls every six hours of simulated time after the table was
 * created, and reports the items as they stood at that instant.
 *
 * Nothing is scheduled. The figures are measured when something next looks at
 * the table after a refresh fell due, which is either a description or a
 * change to an item. A change catches up before it lands, so the items it sees
 * are the items as they stood at the refresh.
 */
export class SimDynamoDbTableStatistics {
  readonly #clock: SimClock;
  readonly #measure: () => SimDynamoDbTableFigures;
  #refreshedAt: number;
  #figures = simDynamoDbNoFigures;

  constructor(properties: SimDynamoDbTableStatisticsProperties) {
    this.#clock = properties.clock;
    this.#measure = properties.measure;
    this.#refreshedAt = this.#clock.now().getTime();
  }

  /**
   * The figures as of the last refresh.
   */
  get figures(): SimDynamoDbTableFigures {
    this.catchUp();

    return this.#figures;
  }

  /**
   * Measure the table if a refresh has fallen due since the last one.
   */
  catchUp(): void {
    const elapsed = this.#clock.now().getTime() - this.#refreshedAt;

    if (elapsed < refreshMilliseconds) {
      return;
    }

    this.#figures = this.#measure();
    this.#refreshedAt += elapsed - (elapsed % refreshMilliseconds);
  }
}
