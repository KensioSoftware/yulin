import { SimHttpApiAccessLogSettings } from "../../api/stage/access-log/sim-http-api-access-log-settings.js";
import type { SimApiGatewayV2UnsimulatedInput } from "../sim-api-gateway-v2-unsimulated-input.js";
import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";
import type { SimCreateStageCommandInput } from "./stage.command.js";

/** The `AccessLogSettings` members an HTTP API stage takes. */
const acceptedAccessLogSettings = ["DestinationArn", "Format"];

/**
 * Reads the access log settings a CreateStage input asks for.
 *
 * Both members are required together. AWS types each as optional and a stage
 * carrying one alone has either nowhere to write or nothing to write, so the
 * pair is refused rather than half applied.
 *
 * `DestinationArn` has to name a CloudWatch Logs log group. HTTP APIs accept
 * no other destination, and a Kinesis Data Firehose delivery stream, which a
 * REST API stage may name, is refused here by the same check.
 */
export function simHttpApiAccessLogSettings(
  input: SimCreateStageCommandInput,
  unsimulated: SimApiGatewayV2UnsimulatedInput,
): SimHttpApiAccessLogSettings | undefined {
  const settings = input.AccessLogSettings;

  if (settings === undefined) {
    return undefined;
  }

  unsimulated.refuseUnaccepted(
    settings,
    acceptedAccessLogSettings,
    "AccessLogSettings.",
  );

  const { DestinationArn: destinationArn, Format: format } = settings;

  if (destinationArn === undefined || format === undefined) {
    throw new SimApiGatewayV2BadRequest(
      "CreateStage AccessLogSettings requires both DestinationArn and Format",
    );
  }

  const accessLogSettings = SimHttpApiAccessLogSettings.from(
    destinationArn,
    format,
  );

  if (accessLogSettings === undefined) {
    throw new SimApiGatewayV2BadRequest(
      `CreateStage AccessLogSettings DestinationArn '${destinationArn}' is ` +
        `not a CloudWatch Logs log group ARN. An HTTP API stage writes its ` +
        `access log to a log group and to nothing else.`,
    );
  }

  return accessLogSettings;
}
