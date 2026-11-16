import { SimDynamoDbCapacityTally } from "./sim-dynamodb-capacity-tally.js";

/**
 * One tally for each table a request reached, in the order it reached them.
 */
export class SimDynamoDbCapacityTallies {
  private readonly tallies = new Map<string, SimDynamoDbCapacityTally>();

  /**
   * The tallies a list of charges adds up to.
   */
  static of(
    charges: readonly ((tallies: SimDynamoDbCapacityTallies) => void)[],
  ): readonly SimDynamoDbCapacityTally[] {
    const tallies = new this();

    for (const charge of charges) {
      charge(tallies);
    }

    return tallies.all();
  }

  /**
   * The tally for one table, named as the request named it.
   */
  for(reference: string): SimDynamoDbCapacityTally {
    const tally =
      this.tallies.get(reference) ?? new SimDynamoDbCapacityTally(reference);
    this.tallies.set(reference, tally);

    return tally;
  }

  /**
   * Every tally, one for each table.
   */
  all(): readonly SimDynamoDbCapacityTally[] {
    return this.tallies.values().toArray();
  }
}
