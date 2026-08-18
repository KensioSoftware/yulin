import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import {
  queryList,
  queryMembers,
} from "../../../serve/http/api/query/sim-query-result.js";
import { simSnsQueryPublishedFields } from "./sim-sns-query-published-message.js";

/**
 * The publish operations simulated SNS serves over the Query protocol.
 */
export function simSnsQueryPublishOperations(): SimQueryOperations {
  return new Map([
    [
      "Publish",
      {
        input: (fields): Record<string, unknown> => ({
          TopicArn: fields.text("TopicArn"),
          TargetArn: fields.text("TargetArn"),
          PhoneNumber: fields.text("PhoneNumber"),
          ...simSnsQueryPublishedFields(fields),
        }),
        result: (output): string => queryMembers(output, ["MessageId"]),
      },
    ],
    [
      "PublishBatch",
      {
        input: (fields): Record<string, unknown> => ({
          TopicArn: fields.text("TopicArn"),
          PublishBatchRequestEntries: fields.list(
            "PublishBatchRequestEntries",
            (entry) => ({
              Id: entry.text("Id"),
              ...simSnsQueryPublishedFields(entry),
            }),
          ),
        }),
        result: (output): string =>
          queryList(output, "Successful", (entry) =>
            queryMembers(entry, ["Id", "MessageId"]),
          ) +
          queryList(output, "Failed", (entry) =>
            queryMembers(entry, ["Id", "Code", "Message", "SenderFault"]),
          ),
      },
    ],
  ]);
}
