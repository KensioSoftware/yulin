const tagsReason =
  "delivery resource tags are not simulated, so nothing reads them back and " +
  "nothing is billed or grouped by them";

/**
 * The AWS::Logs::DeliverySource properties this simulation has nothing to act
 * on, and why.
 */
export const deliverySourceUnsimulatedReasons: ReadonlyMap<string, string> =
  new Map([["Tags", tagsReason]]);

/**
 * The AWS::Logs::DeliveryDestination properties this simulation has nothing to
 * act on, and why.
 */
export const deliveryDestinationUnsimulatedReasons: ReadonlyMap<
  string,
  string
> = new Map([
  ["Tags", tagsReason],
  [
    "DeliveryDestinationPolicy",
    "the policy only decides which other accounts may deliver here, and " +
      "cross-account delivery is not simulated",
  ],
]);

/**
 * The AWS::Logs::Delivery properties this simulation has nothing to act on,
 * and why.
 */
export const deliveryUnsimulatedReasons: ReadonlyMap<string, string> = new Map([
  ["Tags", tagsReason],
]);
