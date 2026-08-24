import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLogsDeliverySource } from "../../delivery/sim-logs-delivery-source.js";
import type { SimLogs } from "../../sim-logs.js";
import { SimCfnDeliveryProperties } from "./sim-cfn-delivery-properties.js";
import { deliverySourceUnsimulatedReasons } from "./sim-cfn-delivery-unsimulated-properties.js";

const resourceType = "AWS::Logs::DeliverySource";
const actedOnProperties = new Set(["Name", "ResourceArn", "LogType"]);

interface SimCfnDeliverySourceCreatorProperties {
  readonly logs: SimLogs;
}

/**
 * Creates simulated delivery sources from AWS::Logs::DeliverySource Resources.
 *
 * Creation goes through the ordinary command rather than straight to the
 * store, so a template hits the same refusals an SDK caller would: a
 * distribution that already has a delivery source, and a CloudFront source
 * declared in a stack outside us-east-1.
 */
export class SimCfnDeliverySourceCreator {
  readonly #logs: SimLogs;

  constructor(properties: SimCfnDeliverySourceCreatorProperties) {
    this.#logs = properties.logs;
  }

  /**
   * Create a delivery source from an AWS::Logs::DeliverySource Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimLogsDeliverySource> {
    const reader = new SimCfnDeliveryProperties({
      resource,
      properties,
      resourceType,
      actedOnProperties,
      unsimulatedReasons: deliverySourceUnsimulatedReasons,
    });
    const name = reader.requiredString("Name");

    reader.recordIgnoredProperties();

    await this.#logs.putDeliverySource({
      input: {
        name,
        resourceArn: reader.requiredString("ResourceArn"),
        logType: reader.requiredString("LogType"),
      },
    });

    const source = this.#logs.findDeliverySource(name);

    assertDefined(
      source,
      `sim CloudWatch Logs delivery source for CloudFormation Resource ${resource.logicalId}`,
    );

    return source;
  }

  /**
   * Delete a delivery source created from a CloudFormation Resource.
   */
  async delete(source: SimLogsDeliverySource): Promise<void> {
    await this.#logs.deleteDeliverySource({ input: { name: source.name } });
  }
}
