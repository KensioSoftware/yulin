import {
  xmlDocument,
  xmlElement,
  xmlValue,
} from "../../../../util/xml/xml-writer.js";

/**
 * Writing the S3 configuration documents and the removal result.
 *
 * These are the responses that are neither a listing nor an Object, and each
 * one is the XML form of a configuration a Bucket holds.
 */

/**
 * Write a Block Public Access configuration.
 */
export function publicAccessBlockXml(output: Record<string, unknown>): string {
  const configuration = (output["PublicAccessBlockConfiguration"] ??
    {}) as Record<string, boolean | undefined>;

  return xmlDocument(
    "PublicAccessBlockConfiguration",
    xmlValue("BlockPublicAcls", configuration["BlockPublicAcls"]) +
      xmlValue("IgnorePublicAcls", configuration["IgnorePublicAcls"]) +
      xmlValue("BlockPublicPolicy", configuration["BlockPublicPolicy"]) +
      xmlValue("RestrictPublicBuckets", configuration["RestrictPublicBuckets"]),
  );
}

interface NotificationEntry {
  readonly Id?: string | undefined;
  readonly Events?: readonly string[] | undefined;
  readonly LambdaFunctionArn?: string | undefined;
  readonly QueueArn?: string | undefined;
  readonly TopicArn?: string | undefined;
}

/**
 * Write an event notification configuration.
 */
export function notificationConfigurationXml(
  output: Record<string, unknown>,
): string {
  // Each destination kind is written the same way and differs only in which
  // ARN element it carries, so the reader for that element is what varies.
  const kinds: readonly {
    readonly member: string;
    readonly element: string;
    readonly arnName: string;
    readonly arn: (entry: NotificationEntry) => string | undefined;
  }[] = [
    {
      member: "LambdaFunctionConfigurations",
      element: "LambdaFunctionConfiguration",
      arnName: "LambdaFunctionArn",
      arn: (entry) => entry.LambdaFunctionArn,
    },
    {
      member: "QueueConfigurations",
      element: "QueueConfiguration",
      arnName: "QueueArn",
      arn: (entry) => entry.QueueArn,
    },
    {
      member: "TopicConfigurations",
      element: "TopicConfiguration",
      arnName: "TopicArn",
      arn: (entry) => entry.TopicArn,
    },
  ];

  const content = kinds
    .map((kind) =>
      notificationEntries(output, kind.member)
        .map((entry) =>
          xmlElement(
            kind.element,
            xmlValue("Id", entry.Id) +
              xmlValue(kind.arnName, kind.arn(entry)) +
              (entry.Events ?? [])
                .map((event) => xmlValue("Event", event))
                .join(""),
          ),
        )
        .join(""),
    )
    .join("");

  return xmlDocument("NotificationConfiguration", content);
}

/**
 * The configurations of one destination kind an output carries.
 */
function notificationEntries(
  output: Record<string, unknown>,
  member: string,
): readonly NotificationEntry[] {
  // oxlint-disable-next-line security/detect-object-injection -- this module's own fixed member names.
  const entries = output[member];

  return Array.isArray(entries) ? (entries as NotificationEntry[]) : [];
}

interface DeletedObject {
  readonly Key?: string | undefined;
}

interface DeleteError {
  readonly Key?: string | undefined;
  readonly Code?: string | undefined;
  readonly Message?: string | undefined;
}

/**
 * Write the result of a multi-Object removal.
 */
export function deleteResultXml(output: Record<string, unknown>): string {
  const deleted = ((output["Deleted"] ?? []) as readonly DeletedObject[])
    .map((object) => xmlElement("Deleted", xmlValue("Key", object.Key)))
    .join("");

  const errors = ((output["Errors"] ?? []) as readonly DeleteError[])
    .map((error) =>
      xmlElement(
        "Error",
        xmlValue("Key", error.Key) +
          xmlValue("Code", error.Code) +
          xmlValue("Message", error.Message),
      ),
    )
    .join("");

  return xmlDocument("DeleteResult", deleted + errors);
}
