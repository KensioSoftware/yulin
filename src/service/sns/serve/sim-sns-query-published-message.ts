import type { SimQueryFields } from "../../../serve/http/api/query/sim-query-request.js";
import type { SimSnsMessageAttributeInput } from "../message/sim-sns-message-attribute-value.js";

/**
 * Read the message fields Publish and one PublishBatch entry share.
 *
 * A batch entry carries the same members as a whole Publish request, under the
 * entry's own prefix, so both are read from whichever fields they are scoped
 * to.
 */
export function simSnsQueryPublishedFields(
  fields: SimQueryFields,
): Record<string, unknown> {
  return {
    Message: fields.text("Message"),
    Subject: fields.text("Subject"),
    MessageStructure: fields.text("MessageStructure"),
    MessageAttributes: simSnsQueryMessageAttributes(fields),
    MessageDeduplicationId: fields.text("MessageDeduplicationId"),
    MessageGroupId: fields.text("MessageGroupId"),
  };
}

/**
 * Read the message attributes a publish request carries.
 *
 * Query states each attribute as a named entry holding a typed value, so the
 * name and the value arrive as separate fields under one subscript. A binary
 * value travels as base64, which is the one place a Query field is not text.
 */
function simSnsQueryMessageAttributes(
  fields: SimQueryFields,
): SimSnsMessageAttributeInput | undefined {
  const entries = fields.entries("MessageAttributes");
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    entries.map((entry) => [
      entry.text("Name") ?? "",
      {
        DataType: entry.text("Value.DataType"),
        StringValue: entry.text("Value.StringValue"),
        BinaryValue: entry.binary("Value.BinaryValue"),
      },
    ]),
  );
}
