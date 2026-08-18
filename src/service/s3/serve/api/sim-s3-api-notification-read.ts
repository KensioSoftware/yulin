import {
  xmlChild,
  xmlChildren,
  xmlText,
  parseXmlDocument,
  type XmlElement,
} from "../../../../util/xml/xml-document.js";

/**
 * Read an event notification configuration.
 *
 * The three destinations differ only in which ARN element they carry, so they
 * are read the same way and told apart by that element's name.
 */
export function readSimS3NotificationConfiguration(body: string): object {
  const root = parseXmlDocument(body);

  return {
    ...destinations(root, "LambdaFunctionConfiguration", "LambdaFunctionArn"),
    ...destinations(root, "QueueConfiguration", "QueueArn"),
    ...destinations(root, "TopicConfiguration", "TopicArn"),
    ...defined(
      "EventBridgeConfiguration",
      xmlChild(root, "EventBridgeConfiguration") === undefined ? undefined : {},
    ),
  };
}

/**
 * Read every notification configuration of one destination kind.
 */
function destinations(
  root: XmlElement | undefined,
  elementName: string,
  arnName: string,
): Record<string, object[]> {
  const configurations = xmlChildren(root, elementName).map(
    (configuration) => ({
      ...defined("Id", xmlText(configuration, "Id")),
      ...defined(arnName, xmlText(configuration, arnName)),
      Events: xmlChildren(configuration, "Event").map((event) =>
        event.text.trim(),
      ),
      ...defined("Filter", readNotificationFilter(configuration)),
    }),
  );

  return configurations.length === 0
    ? {}
    : { [`${elementName}s`]: configurations };
}

/**
 * Read the key filter a notification configuration states, if it has one.
 */
function readNotificationFilter(configuration: XmlElement): object | undefined {
  const key = xmlChild(xmlChild(configuration, "Filter"), "S3Key");
  if (key === undefined) {
    return undefined;
  }

  return {
    Key: {
      FilterRules: xmlChildren(key, "FilterRule").map((rule) => ({
        ...defined("Name", xmlText(rule, "Name")),
        ...defined("Value", xmlText(rule, "Value")),
      })),
    },
  };
}

/**
 * Include a member only when the document stated it.
 */
function defined<T>(name: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [name]: value };
}
