import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimEventBusStore } from "../../bus/sim-event-bus-store.js";
import { SimEventBridgeValidationException } from "../../error/sim-event-bridge.error.js";
import { SimPartnerEventSourceName } from "../../source/sim-partner-event-source-name.js";
import { partnerEventSourceArn } from "../../source/sim-partner-event-source.js";
import type { SimPartnerEventSourceStore } from "../../source/sim-partner-event-source-store.js";
import type { SimEventBridgeAuthorizer } from "../authorize/sim-event-bridge-authorizer.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type {
  SimDescribeEventSourceCommand,
  SimDescribeEventSourceCommandOutput,
} from "./source.command.js";

interface SimEventBridgeDescribeEventSourceProperties {
  readonly sources: SimPartnerEventSourceStore;
  readonly buses: SimEventBusStore;
  readonly authorizer: SimEventBridgeAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The DescribeEventSource command.
 *
 * The state is `ACTIVE` while a partner event bus of the source's name exists,
 * and `PENDING` otherwise. `ExpirationTime` is left out, because a pending
 * source never expires here.
 */
export class SimEventBridgeDescribeEventSource {
  private readonly sources: SimPartnerEventSourceStore;
  private readonly buses: SimEventBusStore;
  private readonly authorizer: SimEventBridgeAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimEventBridgeDescribeEventSourceProperties) {
    this.sources = properties.sources;
    this.buses = properties.buses;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Describe a partner event source shared with this Account and Region.
   *
   * The caller is authorized against the ARN the source would have before it
   * is looked up, so a caller with no permission learns nothing about which
   * sources exist.
   */
  handle(
    command: SimDescribeEventSourceCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimDescribeEventSourceCommandOutput {
    const requested = command.input.Name;

    if (requested === undefined) {
      throw new SimEventBridgeValidationException(
        "Invalid parameter: Name is required",
      );
    }

    const name = SimPartnerEventSourceName.of(requested, "Name");

    this.authorizer.authorizeEventSource(
      "events:DescribeEventSource",
      partnerEventSourceArn(name, this.accountRegionScope),
      options,
    );

    const source = this.sources.require(name.value);

    return {
      $metadata: {},
      Arn: source.arn,
      CreatedBy: source.name.partner,
      CreationTime: source.creationTime,
      Name: source.name.value,
      State: source.state(this.buses.find(source.name.value) !== undefined),
    };
  }
}
