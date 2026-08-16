import { SimLogsError } from "./sim-logs.error.js";

/**
 * A subscription filter's destination would not take the delivery.
 *
 * Real CloudWatch Logs reports this at `PutSubscriptionFilter`, where it
 * refuses a destination it cannot invoke. A permission taken away after the
 * filter was put fails the delivery instead, which nothing in an account ever
 * sees: it is recorded here as a delivery failure a test can read.
 */
export class SimLogsDeliveryNotPermitted extends SimLogsError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}
