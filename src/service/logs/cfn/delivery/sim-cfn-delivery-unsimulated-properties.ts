const tagsReason =
  "delivery resource tags are not simulated, so nothing reads them back and " +
  "nothing is billed or grouped by them";

/**
 * The AWS::Logs::DeliverySource properties this simulation has nothing to act
 * on, and why.
 */
export const deliverySourceUnsimulatedReasons: ReadonlyMap<string, string> =
  new Map([
    ["Tags", tagsReason],
    [
      "DeliverySourceConfiguration",
      "the configuration map only matters to the services whose delivery " +
        "takes one, and CloudFront is the only source modelled here",
    ],
  ]);

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
    "DeliveryDestinationType",
    "the kind of destination is read off DestinationResourceArn here, as " +
      "CloudWatch Logs reads it, so a declared one would be ignored or wrong",
  ],
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
