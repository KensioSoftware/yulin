const deliveryIdDigits = 16;

/**
 * Source of the identifiers deliveries are reported under.
 *
 * Real CloudWatch Logs issues an opaque identifier here rather than taking a
 * name from the caller, so a delivery is the one resource of the three a
 * template cannot predict the physical name of. A counter is enough: unique
 * within the service is all a caller can rely on about the real one.
 */
export class SimLogsDeliveryIds {
  #issued = 0;

  /**
   * The next delivery identifier.
   */
  next(): string {
    this.#issued += 1;

    return String(this.#issued).padStart(deliveryIdDigits, "0");
  }
}
