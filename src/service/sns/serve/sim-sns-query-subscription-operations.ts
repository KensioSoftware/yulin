import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import type { SimQueryOutput } from "../../../serve/http/api/query/sim-query-result.js";
import {
  queryList,
  queryMap,
  queryMembers,
} from "../../../serve/http/api/query/sim-query-result.js";

/**
 * The members SNS describes one subscription with in a listing.
 */
const listedSubscriptionMembers = [
  "SubscriptionArn",
  "Owner",
  "Protocol",
  "Endpoint",
  "TopicArn",
];

/**
 * The subscription operations simulated SNS serves over the Query protocol.
 */
export function simSnsQuerySubscriptionOperations(): SimQueryOperations {
  return new Map([
    [
      "Subscribe",
      {
        input: (fields): Record<string, unknown> => ({
          TopicArn: fields.text("TopicArn"),
          Protocol: fields.text("Protocol"),
          Endpoint: fields.text("Endpoint"),
          Attributes: fields.attributes("Attributes"),
          ReturnSubscriptionArn: fields.flag("ReturnSubscriptionArn"),
        }),
        result: (output): string => queryMembers(output, ["SubscriptionArn"]),
      },
    ],
    [
      "Unsubscribe",
      {
        input: (fields): Record<string, unknown> => ({
          SubscriptionArn: fields.text("SubscriptionArn"),
        }),
        result: (): string => "",
      },
    ],
    [
      "ListSubscriptions",
      {
        input: (fields): Record<string, unknown> => ({
          NextToken: fields.text("NextToken"),
        }),
        result: subscriptionListing,
      },
    ],
    [
      "ListSubscriptionsByTopic",
      {
        input: (fields): Record<string, unknown> => ({
          TopicArn: fields.text("TopicArn"),
          NextToken: fields.text("NextToken"),
        }),
        result: subscriptionListing,
      },
    ],
    [
      "GetSubscriptionAttributes",
      {
        input: (fields): Record<string, unknown> => ({
          SubscriptionArn: fields.text("SubscriptionArn"),
        }),
        result: (output): string => queryMap(output, "Attributes"),
      },
    ],
    [
      "SetSubscriptionAttributes",
      {
        input: (fields): Record<string, unknown> => ({
          SubscriptionArn: fields.text("SubscriptionArn"),
          AttributeName: fields.text("AttributeName"),
          AttributeValue: fields.text("AttributeValue"),
        }),
        result: (): string => "",
      },
    ],
  ]);
}

function subscriptionListing(output: SimQueryOutput): string {
  return (
    queryList(output, "Subscriptions", (subscription) =>
      queryMembers(subscription, listedSubscriptionMembers),
    ) + queryMembers(output, ["NextToken"])
  );
}
