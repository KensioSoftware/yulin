import type { SimCreateDeliveryCommandInput } from "../../command/delivery/delivery.command.js";
import type { SimCfnDeliveryProperties } from "./sim-cfn-delivery-properties.js";

/**
 * The CreateDelivery request an AWS::Logs::Delivery Resource asks for.
 *
 * The template carries the S3 layout as two flat properties, and the API takes
 * them nested. Neither is passed on unless the template set one of them, so a
 * delivery to a log group or a Firehose stream is created without the S3
 * configuration the API would refuse.
 */
export function simCfnDeliveryInput(
  reader: SimCfnDeliveryProperties,
): SimCreateDeliveryCommandInput {
  const suffixPath = reader.optionalString("S3SuffixPath");
  const enableHiveCompatiblePath = reader.optionalBoolean(
    "S3EnableHiveCompatiblePath",
  );
  const laidOut =
    suffixPath !== undefined || enableHiveCompatiblePath !== undefined;

  return {
    deliverySourceName: reader.requiredString("DeliverySourceName"),
    deliveryDestinationArn: reader.requiredString("DeliveryDestinationArn"),
    recordFields: reader.optionalStringList("RecordFields"),
    fieldDelimiter: reader.optionalString("FieldDelimiter"),
    s3DeliveryConfiguration: laidOut
      ? { suffixPath, enableHiveCompatiblePath }
      : undefined,
  };
}
