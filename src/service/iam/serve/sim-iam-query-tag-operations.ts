import type { SimQueryOperations } from "../../../serve/http/api/query/sim-query-operation.js";
import type { SimQueryFields } from "../../../serve/http/api/query/sim-query-request.js";
import {
  queryList,
  queryMembers,
  type SimQueryOutput,
} from "../../../serve/http/api/query/sim-query-result.js";

/**
 * Read the `Tags` list of a request, as `Tags.member.N.Key` and
 * `Tags.member.N.Value`.
 */
export function iamQueryTagsInput(
  fields: SimQueryFields,
): readonly Record<string, unknown>[] | undefined {
  return fields.list("Tags", (tag) => ({
    Key: tag.text("Key"),
    Value: tag.text("Value"),
  }));
}

/**
 * Write the `Tags` list of an answer, which an untagged entity leaves out.
 */
export function iamQueryTags(output: SimQueryOutput): string {
  return queryList(output, "Tags", (tag) =>
    queryMembers(tag, ["Key", "Value"]),
  );
}

/**
 * The tagging operations for one kind of identity, `Role` or `User`.
 */
function tagOperations(entity: "Role" | "User"): SimQueryOperations {
  const nameField = `${entity}Name`;

  return new Map([
    [
      `Tag${entity}`,
      {
        input: (fields): Record<string, unknown> => ({
          [nameField]: fields.text(nameField),
          Tags: iamQueryTagsInput(fields),
        }),
        result: (): string => "",
      },
    ],
    [
      `Untag${entity}`,
      {
        input: (fields): Record<string, unknown> => ({
          [nameField]: fields.text(nameField),
          TagKeys: fields.texts("TagKeys"),
        }),
        result: (): string => "",
      },
    ],
    [
      `List${entity}Tags`,
      {
        input: (fields): Record<string, unknown> => ({
          [nameField]: fields.text(nameField),
        }),
        result: (output): string =>
          iamQueryTags(output) + queryMembers(output, ["IsTruncated"]),
      },
    ],
  ]);
}

/**
 * The Role and User tagging operations simulated IAM serves over the Query
 * protocol.
 */
export function simIamQueryTagOperations(): SimQueryOperations {
  return new Map([...tagOperations("Role"), ...tagOperations("User")]);
}
