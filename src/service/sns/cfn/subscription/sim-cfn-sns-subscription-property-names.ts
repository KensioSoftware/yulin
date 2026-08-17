/**
 * The topic the subscription belongs to, as an ARN.
 */
export const subscriptionTopicArnPropertyName = "TopicArn";

/**
 * How the subscription is delivered to.
 */
export const subscriptionProtocolPropertyName = "Protocol";

/**
 * What the subscription is delivered to, which is a queue ARN, a function ARN
 * or a phone number for the three protocols simulated.
 */
export const subscriptionEndpointPropertyName = "Endpoint";

/**
 * The three properties naming the subscription itself, which the
 * CloudFormation layer reads rather than handing on as attributes.
 */
export const subscriptionPropertyNames: ReadonlySet<string> = new Set([
  subscriptionTopicArnPropertyName,
  subscriptionProtocolPropertyName,
  subscriptionEndpointPropertyName,
]);

/**
 * The AWS::SNS::Subscription properties carrying a subscription attribute of
 * the same name.
 *
 * CloudFormation names these exactly as the SNS API names the attributes, so
 * they are handed to Subscribe rather than read here. `RawMessageDelivery`, the
 * filter policy and the scope it is read under are the three simulated SNS
 * acts on, and a template setting them gets the same validation an SDK caller
 * setting them gets. The rest are refused by SNS with the reason each one is
 * missing.
 */
export const attributePropertyNames: ReadonlySet<string> = new Set([
  "DeliveryPolicy",
  "FilterPolicy",
  "FilterPolicyScope",
  "RawMessageDelivery",
  "RedrivePolicy",
  "ReplayPolicy",
  "SubscriptionRoleArn",
]);

/**
 * The real AWS::SNS::Subscription properties this simulation has no behaviour
 * for and no subscription attribute to hand them to.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "Region",
    "a subscription is created in the Region its topic ARN names, and " +
      "simulated SNS refuses a topic ARN naming another Region, so there is " +
      "nothing for this to change",
  ],
]);
