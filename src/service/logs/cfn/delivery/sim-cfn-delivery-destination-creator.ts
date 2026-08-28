import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLogsDeliveryDestination } from "../../delivery/sim-logs-delivery-destination.js";
import type { SimLogs } from "../../sim-logs.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import { SimCfnDeliveryProperties } from "./sim-cfn-delivery-properties.js";
import { deliveryDestinationUnsimulatedReasons } from "./sim-cfn-delivery-unsimulated-properties.js";

const resourceType = "AWS::Logs::DeliveryDestination";
const actedOnProperties = new Set([
  "Name",
  "DestinationResourceArn",
  "OutputFormat",
]);

interface SimCfnDeliveryDestinationCreatorProperties {
  readonly logs: SimLogs;
}

/**
 * Creates simulated delivery destinations from AWS::Logs::DeliveryDestination
 * Resources.
 *
 * The output format is fixed once the destination is there, so a template that
 * changes it replaces the Resource. Sim CloudFormation replaces a Resource
 * whose template entry changed at all, which lands on the same behaviour
 * without the destination having to say so.
 */
export class SimCfnDeliveryDestinationCreator {
  readonly #logs: SimLogs;

  constructor(properties: SimCfnDeliveryDestinationCreatorProperties) {
    this.#logs = properties.logs;
  }

  /**
   * Create a delivery destination from a CloudFormation Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimLogsDeliveryDestination> {
    const reader = new SimCfnDeliveryProperties({
      resource,
      properties,
      resourceType,
      actedOnProperties,
      unsimulatedReasons: deliveryDestinationUnsimulatedReasons,
    });
    const name = reader.requiredString("Name");

    reader.recordIgnoredProperties();

    await this.#logs.putDeliveryDestination(
      {
        input: {
          name,
          outputFormat: reader.optionalString("OutputFormat"),
          deliveryDestinationConfiguration: {
            destinationResourceArn: reader.requiredString(
              "DestinationResourceArn",
            ),
          },
        },
      },
      options,
    );

    const destination = this.#logs.findDeliveryDestination(name);

    assertDefined(
      destination,
      `sim CloudWatch Logs delivery destination for CloudFormation Resource ${resource.logicalId}`,
    );

    return destination;
  }

  /**
   * Delete a delivery destination created from a CloudFormation Resource.
   */
  async delete(
    destination: SimLogsDeliveryDestination,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#logs.deleteDeliveryDestination(
      { input: { name: destination.name } },
      options,
    );
  }
}
