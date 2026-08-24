import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  simLogsAnyDeliveryArn,
  simLogsDeliveryArn,
} from "../../delivery/sim-logs-delivery-arn.js";
import type { SimLogsDeliveryDestinationStore } from "../../delivery/sim-logs-delivery-destination-store.js";
import { SimLogsDeliveryIds } from "../../delivery/sim-logs-delivery-ids.js";
import type { SimLogsDeliverySourceStore } from "../../delivery/sim-logs-delivery-source-store.js";
import type { SimLogsDeliveryStore } from "../../delivery/sim-logs-delivery-store.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import { SimLogsPage } from "../sim-logs-page.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import type {
  SimCreateDeliveryCommand,
  SimCreateDeliveryCommandOutput,
  SimDeleteDeliveryCommand,
  SimDeleteDeliveryCommandOutput,
  SimDescribeDeliveriesCommand,
  SimDescribeDeliveriesCommandOutput,
} from "./delivery.command.js";
import { simLogsCreatedDelivery } from "./sim-logs-created-delivery.js";
import { simLogsDeliveryDetail } from "./sim-logs-delivery-detail.js";
import {
  refuseUnsimulatedDeliveryTags,
  requiredSimLogsDeliveryValue,
} from "./sim-logs-delivery-input.js";

/** The largest page of deliveries this simulation reports at once. */
const maximumDescribeLimit = 100;

interface SimLogsDeliveryCommandsProperties {
  readonly sources: SimLogsDeliverySourceStore;
  readonly destinations: SimLogsDeliveryDestinationStore;
  readonly deliveries: SimLogsDeliveryStore;
  readonly authorizer: SimLogsAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The commands that create, describe and remove deliveries.
 */
export class SimLogsDeliveryCommands {
  readonly #sources: SimLogsDeliverySourceStore;
  readonly #destinations: SimLogsDeliveryDestinationStore;
  readonly #deliveries: SimLogsDeliveryStore;
  readonly #authorizer: SimLogsAuthorizer;
  readonly #scope: SimAwsAccountRegionScope;
  readonly #ids = new SimLogsDeliveryIds();

  constructor(properties: SimLogsDeliveryCommandsProperties) {
    this.#sources = properties.sources;
    this.#destinations = properties.destinations;
    this.#deliveries = properties.deliveries;
    this.#authorizer = properties.authorizer;
    this.#scope = properties.accountRegionScope;
  }

  /**
   * Join a delivery source to a delivery destination.
   *
   * Both have to be there already. CloudWatch Logs issues the identifier, and
   * this is the one delivery resource a caller cannot name.
   */
  createDelivery(
    command: SimCreateDeliveryCommand,
    options?: SimLogsRequestOptions,
  ): SimCreateDeliveryCommandOutput {
    const input = command.input;
    const deliverySourceName = requiredSimLogsDeliveryValue(
      input.deliverySourceName,
      "deliverySourceName",
    );
    const deliveryDestinationArn = requiredSimLogsDeliveryValue(
      input.deliveryDestinationArn,
      "deliveryDestinationArn",
    );

    refuseUnsimulatedDeliveryTags(input.tags, "CreateDelivery");
    this.#authorizer.authorizeResource(
      "logs:CreateDelivery",
      simLogsAnyDeliveryArn(this.#scope),
      options?.caller,
    );

    this.#sources.require(deliverySourceName);

    const delivery = simLogsCreatedDelivery({
      id: this.#ids.next(),
      deliverySourceName,
      destination: this.#destinations.requireByArn(deliveryDestinationArn),
      input,
      accountRegionScope: this.#scope,
    });

    this.#deliveries.add(delivery);

    return { $metadata: {}, delivery: simLogsDeliveryDetail(delivery) };
  }

  /**
   * Describe the deliveries in this scope, in the order they were created.
   */
  describeDeliveries(
    command: SimDescribeDeliveriesCommand,
    options?: SimLogsRequestOptions,
  ): SimDescribeDeliveriesCommandOutput {
    const input = command.input;

    this.#authorizer.authorizeResource(
      "logs:DescribeDeliveries",
      simLogsAnyDeliveryArn(this.#scope),
      options?.caller,
    );

    const page = new SimLogsPage({
      listed: this.#deliveries.all,
      limit: input.limit,
      nextToken: input.nextToken,
      maximumLimit: maximumDescribeLimit,
    });

    return {
      $metadata: {},
      deliveries: page.items.map((delivery) => simLogsDeliveryDetail(delivery)),
      nextToken: page.nextToken,
    };
  }

  /**
   * Remove a delivery, leaving its source and destination in place.
   */
  deleteDelivery(
    command: SimDeleteDeliveryCommand,
    options?: SimLogsRequestOptions,
  ): SimDeleteDeliveryCommandOutput {
    const id = requiredSimLogsDeliveryValue(command.input.id, "id");

    this.#authorizer.authorizeResource(
      "logs:DeleteDelivery",
      simLogsDeliveryArn(this.#scope, id),
      options?.caller,
    );

    this.#deliveries.delete(id);

    return { $metadata: {} };
  }
}
