import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  simLogsAnyDeliveryDestinationArn,
  simLogsDeliveryDestinationArn,
} from "../../delivery/sim-logs-delivery-arn.js";
import { SimLogsDeliveryDestination } from "../../delivery/sim-logs-delivery-destination.js";
import type { SimLogsDeliveryDestinationStore } from "../../delivery/sim-logs-delivery-destination-store.js";
import type { SimLogsDeliveryStore } from "../../delivery/sim-logs-delivery-store.js";
import { requiredSimLogsDeliveryDestinationType } from "../../delivery/sim-logs-delivery-destination-type.js";
import { requiredSimLogsDeliveryOutputFormat } from "../../delivery/sim-logs-delivery-output-format.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import { SimLogsPage } from "../sim-logs-page.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import type {
  SimDeleteDeliveryDestinationCommand,
  SimDeleteDeliveryDestinationCommandOutput,
  SimDescribeDeliveryDestinationsCommand,
  SimDescribeDeliveryDestinationsCommandOutput,
  SimPutDeliveryDestinationCommand,
  SimPutDeliveryDestinationCommandOutput,
} from "./delivery-destination.command.js";
import { simLogsDeliveryDestinationDetail } from "./sim-logs-delivery-detail.js";
import { refuseSimLogsDeliveryDestinationInUse } from "./sim-logs-delivery-in-use.js";
import {
  refuseUnsimulatedDeliveryTags,
  requiredSimLogsDeliveryValue,
} from "./sim-logs-delivery-input.js";

/** The largest page the delivery listings take, as real CloudWatch Logs does. */
const maximumDescribeLimit = 50;

interface SimLogsDeliveryDestinationCommandsProperties {
  readonly destinations: SimLogsDeliveryDestinationStore;
  readonly deliveries: SimLogsDeliveryStore;
  readonly authorizer: SimLogsAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The commands that put, describe and remove delivery destinations.
 */
export class SimLogsDeliveryDestinationCommands {
  readonly #destinations: SimLogsDeliveryDestinationStore;
  readonly #deliveries: SimLogsDeliveryStore;
  readonly #authorizer: SimLogsAuthorizer;
  readonly #scope: SimAwsAccountRegionScope;

  constructor(properties: SimLogsDeliveryDestinationCommandsProperties) {
    this.#destinations = properties.destinations;
    this.#deliveries = properties.deliveries;
    this.#authorizer = properties.authorizer;
    this.#scope = properties.accountRegionScope;
  }

  /**
   * Put a delivery destination over the resource logs are to be written into.
   *
   * The kind of destination is read from the ARN, and the output format is
   * fixed from here on: a put that would change it is refused rather than
   * applied.
   */
  putDeliveryDestination(
    command: SimPutDeliveryDestinationCommand,
    options?: SimLogsRequestOptions,
  ): SimPutDeliveryDestinationCommandOutput {
    const input = command.input;
    const name = requiredSimLogsDeliveryValue(input.name, "name");
    const destinationResourceArn = requiredSimLogsDeliveryValue(
      input.deliveryDestinationConfiguration?.destinationResourceArn,
      "deliveryDestinationConfiguration.destinationResourceArn",
    );

    refuseUnsimulatedDeliveryTags(input.tags, "PutDeliveryDestination");
    this.#authorizer.authorizeResource(
      "logs:PutDeliveryDestination",
      simLogsDeliveryDestinationArn(this.#scope, name),
      options?.caller,
    );

    const destinationType = requiredSimLogsDeliveryDestinationType(
      destinationResourceArn,
    );
    const destination = new SimLogsDeliveryDestination({
      name,
      destinationResourceArn,
      destinationType,
      outputFormat: requiredSimLogsDeliveryOutputFormat(
        input.outputFormat,
        destinationType,
      ),
      accountRegionScope: this.#scope,
    });

    this.#destinations.put(destination);

    return {
      $metadata: {},
      deliveryDestination: simLogsDeliveryDestinationDetail(destination),
    };
  }

  /**
   * Describe the delivery destinations in this scope, in the order they were
   * put.
   */
  describeDeliveryDestinations(
    command: SimDescribeDeliveryDestinationsCommand,
    options?: SimLogsRequestOptions,
  ): SimDescribeDeliveryDestinationsCommandOutput {
    const input = command.input;

    this.#authorizer.authorizeResource(
      "logs:DescribeDeliveryDestinations",
      simLogsAnyDeliveryDestinationArn(this.#scope),
      options?.caller,
    );

    const page = new SimLogsPage({
      listed: this.#destinations.all,
      limit: input.limit,
      nextToken: input.nextToken,
      maximumLimit: maximumDescribeLimit,
    });

    return {
      $metadata: {},
      deliveryDestinations: page.items.map((destination) =>
        simLogsDeliveryDestinationDetail(destination),
      ),
      nextToken: page.nextToken,
    };
  }

  /**
   * Remove a delivery destination no delivery is writing to.
   */
  deleteDeliveryDestination(
    command: SimDeleteDeliveryDestinationCommand,
    options?: SimLogsRequestOptions,
  ): SimDeleteDeliveryDestinationCommandOutput {
    const name = requiredSimLogsDeliveryValue(command.input.name, "name");

    this.#authorizer.authorizeResource(
      "logs:DeleteDeliveryDestination",
      simLogsDeliveryDestinationArn(this.#scope, name),
      options?.caller,
    );

    refuseSimLogsDeliveryDestinationInUse(
      this.#deliveries,
      this.#destinations.require(name),
    );
    this.#destinations.delete(name);

    return { $metadata: {} };
  }
}
