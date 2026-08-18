import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import {
  queryMembers,
  queryScalarList,
} from "../../../serve/http/api/query/sim-query-result.js";

/**
 * The SMS operations simulated SNS serves over the Query protocol.
 *
 * These name their fields in camel case, unlike every other SNS operation.
 * That is how the SNS API has them, on the wire as much as in the SDK.
 */
export function simSnsQuerySmsOperations(): SimQueryOperations {
  return new Map([
    [
      "CheckIfPhoneNumberIsOptedOut",
      {
        input: (fields): Record<string, unknown> => ({
          phoneNumber: fields.text("phoneNumber"),
        }),
        result: (output): string => queryMembers(output, ["isOptedOut"]),
      },
    ],
    [
      "ListPhoneNumbersOptedOut",
      {
        input: (fields): Record<string, unknown> => ({
          nextToken: fields.text("nextToken"),
        }),
        result: (output): string =>
          queryScalarList(output, "phoneNumbers") +
          queryMembers(output, ["nextToken"]),
      },
    ],
    [
      "OptInPhoneNumber",
      {
        input: (fields): Record<string, unknown> => ({
          phoneNumber: fields.text("phoneNumber"),
        }),
        result: (): string => "",
      },
    ],
  ]);
}
