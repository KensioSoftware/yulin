import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import {
  queryList,
  queryMap,
  queryMembers,
} from "../../../serve/http/api/query/sim-query-result.js";

/**
 * The topic operations simulated SNS serves over the Query protocol.
 */
export function simSnsQueryTopicOperations(): SimQueryOperations {
  return new Map([
    [
      "CreateTopic",
      {
        input: (fields): Record<string, unknown> => ({
          Name: fields.text("Name"),
          Attributes: fields.attributes("Attributes"),
          Tags: fields.list("Tags", (tag) => ({
            Key: tag.text("Key"),
            Value: tag.text("Value"),
          })),
          DataProtectionPolicy: fields.text("DataProtectionPolicy"),
        }),
        result: (output): string => queryMembers(output, ["TopicArn"]),
      },
    ],
    [
      "DeleteTopic",
      {
        input: (fields): Record<string, unknown> => ({
          TopicArn: fields.text("TopicArn"),
        }),
        result: (): string => "",
      },
    ],
    [
      "ListTopics",
      {
        input: (fields): Record<string, unknown> => ({
          NextToken: fields.text("NextToken"),
        }),
        result: (output): string =>
          queryList(output, "Topics", (topic) =>
            queryMembers(topic, ["TopicArn"]),
          ) + queryMembers(output, ["NextToken"]),
      },
    ],
    [
      "GetTopicAttributes",
      {
        input: (fields): Record<string, unknown> => ({
          TopicArn: fields.text("TopicArn"),
        }),
        result: (output): string => queryMap(output, "Attributes"),
      },
    ],
    [
      "SetTopicAttributes",
      {
        input: (fields): Record<string, unknown> => ({
          TopicArn: fields.text("TopicArn"),
          AttributeName: fields.text("AttributeName"),
          AttributeValue: fields.text("AttributeValue"),
        }),
        result: (): string => "",
      },
    ],
  ]);
}
