/**
 * The AWS::SES::ConfigurationSet properties this simulation has nothing to act
 * on, and why.
 *
 * They are recorded as ignored rather than refused, for the reason the
 * identity properties are: a set without either of them still does what a set
 * does here, and refusing would take a whole stack down over something no test
 * is checking.
 *
 * The SDK path is stricter, and deliberately so. `CreateConfigurationSet`
 * refuses both outright, because a caller reaching for one directly is asking
 * for that behaviour and should be told it is not there.
 */
export const unsimulatedConfigurationSetPropertyReasons: ReadonlyMap<
  string,
  string
> = new Map([
  [
    "TrackingOptions",
    "open and click tracking is not simulated, so no message here has its " +
      "links rewritten through a redirect domain",
  ],
  [
    "VdmOptions",
    "the Virtual Deliverability Manager is not simulated, because nothing " +
      "here measures engagement or deliverability",
  ],
]);

/** The properties an AWS::SES::ConfigurationSet Resource is created from. */
export const actedOnConfigurationSetProperties: ReadonlySet<string> = new Set([
  "Name",
  "SuppressionOptions",
  "SendingOptions",
  "DeliveryOptions",
  "ReputationOptions",
]);
