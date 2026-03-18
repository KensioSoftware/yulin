import {
  type BackgroundCompleter,
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import { SimDynamoDb } from "../dynamodb/dynamodb.js";
import { Memo } from "../../util/memo/memo.js";

/**
 * Container for simulated AWS services.
 */
export class SimAwsAccount {
  private readonly memo = new Memo<object>();

  constructor(
    private readonly background: BackgroundScheduler &
      BackgroundCompleter = new BackgroundTasks(),
  ) {}

  /**
   * Wait for all outstanding background tasks in this Account to complete.
   */
  async backgroundTasksComplete(): Promise<void> {
    await this.background.complete();
  }

  /**
   * Get the simulated DynamoDB service in this simulated Account.
   */
  getDynamoDb(): SimDynamoDb {
    return this.memo.getOrCreate(
      "DynamoDB",
      () => new SimDynamoDb(this.background),
    );
  }
}
