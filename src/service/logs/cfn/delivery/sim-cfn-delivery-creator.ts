import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLogsDelivery } from "../../delivery/sim-logs-delivery.js";
import type { SimLogs } from "../../sim-logs.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimCfnDeliveryAuthorization } from "./sim-cfn-delivery-authorization.js";
import { simCfnDeliveryInput } from "./sim-cfn-delivery-input.js";
import { SimCfnDeliveryProperties } from "./sim-cfn-delivery-properties.js";
import { deliveryUnsimulatedReasons } from "./sim-cfn-delivery-unsimulated-properties.js";

const resourceType = "AWS::Logs::Delivery";
const actedOnProperties = new Set([
  "DeliverySourceName",
  "DeliveryDestinationArn",
  "RecordFields",
  "FieldDelimiter",
  "S3SuffixPath",
  "S3EnableHiveCompatiblePath",
]);

interface SimCfnDeliveryCreatorProperties {
  readonly logs: SimLogs;
  readonly authorization: SimCfnDeliveryAuthorization;
}

/**
 * Creates simulated deliveries from AWS::Logs::Delivery Resources.
 *
 * A delivery is the join between a source and a destination, and both have to
 * be deployed before it. A template gets that ordering from naming them
 * through `Ref` and `Fn::GetAtt`.
 *
 * The handler reads deliveries back before it creates one, and that read is
 * what a CloudFormation execution Role needs `logs:GetDelivery` for.
 */
export class SimCfnDeliveryCreator {
  readonly #logs: SimLogs;
  readonly #authorization: SimCfnDeliveryAuthorization;

  constructor(properties: SimCfnDeliveryCreatorProperties) {
    this.#logs = properties.logs;
    this.#authorization = properties.authorization;
  }

  /**
   * Create a delivery from an AWS::Logs::Delivery Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimLogsDelivery> {
    const reader = new SimCfnDeliveryProperties({
      resource,
      properties,
      resourceType,
      actedOnProperties,
      unsimulatedReasons: deliveryUnsimulatedReasons,
    });

    reader.recordIgnoredProperties();

    this.#authorization.authorizeDeliveryCreate(options?.caller);

    const created = await this.#logs.createDelivery(
      { input: simCfnDeliveryInput(reader) },
      options,
    );
    const delivery = this.#logs.findDelivery(created.delivery?.id ?? "");

    assertDefined(
      delivery,
      `sim CloudWatch Logs delivery for CloudFormation Resource ${resource.logicalId}`,
    );

    return delivery;
  }

  /**
   * Delete a delivery created from a CloudFormation Resource.
   */
  async delete(
    delivery: SimLogsDelivery,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.#logs.deleteDelivery({ input: { id: delivery.id } }, options);
  }
}
