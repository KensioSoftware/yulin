import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  simLogsAnyDeliverySourceArn,
  simLogsDeliverySourceArn,
} from "../../delivery/sim-logs-delivery-arn.js";
import {
  requireSimLogsDeliverySource,
  requiredSimLogsDeliveredService,
} from "../../delivery/sim-logs-delivery-source-service.js";
import { SimLogsDeliverySource } from "../../delivery/sim-logs-delivery-source.js";
import type { SimLogsDeliverySourceStore } from "../../delivery/sim-logs-delivery-source-store.js";
import type { SimLogsDeliveryStore } from "../../delivery/sim-logs-delivery-store.js";
import type { SimLogsAuthorizer } from "../authorize/sim-logs-authorizer.js";
import { SimLogsPage } from "../sim-logs-page.js";
import type { SimLogsRequestOptions } from "../sim-logs-request-options.js";
import type {
  SimDeleteDeliverySourceCommand,
  SimDeleteDeliverySourceCommandOutput,
  SimDescribeDeliverySourcesCommand,
  SimDescribeDeliverySourcesCommandOutput,
  SimPutDeliverySourceCommand,
  SimPutDeliverySourceCommandOutput,
} from "./delivery-source.command.js";
import { simLogsDeliverySourceDetail } from "./sim-logs-delivery-detail.js";
import { refuseSimLogsDeliverySourceInUse } from "./sim-logs-delivery-in-use.js";
import {
  refuseUnsimulatedDeliveryTags,
  requiredSimLogsDeliveryValue,
} from "./sim-logs-delivery-input.js";

/** The largest page the delivery listings take, as real CloudWatch Logs does. */
const maximumDescribeLimit = 50;

interface SimLogsDeliverySourceCommandsProperties {
  readonly sources: SimLogsDeliverySourceStore;
  readonly deliveries: SimLogsDeliveryStore;
  readonly authorizer: SimLogsAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The commands that put, describe and remove delivery sources.
 */
export class SimLogsDeliverySourceCommands {
  readonly #sources: SimLogsDeliverySourceStore;
  readonly #deliveries: SimLogsDeliveryStore;
  readonly #authorizer: SimLogsAuthorizer;
  readonly #scope: SimAwsAccountRegionScope;

  constructor(properties: SimLogsDeliverySourceCommandsProperties) {
    this.#sources = properties.sources;
    this.#deliveries = properties.deliveries;
    this.#authorizer = properties.authorizer;
    this.#scope = properties.accountRegionScope;
  }

  /**
   * Put a delivery source over a resource whose logs are to be delivered.
   *
   * The service is read from the resource ARN, as real CloudWatch Logs reads
   * it, and the region the request was made in has to be one that service's
   * delivery can be set up from.
   */
  putDeliverySource(
    command: SimPutDeliverySourceCommand,
    options?: SimLogsRequestOptions,
  ): SimPutDeliverySourceCommandOutput {
    const input = command.input;
    const name = requiredSimLogsDeliveryValue(input.name, "name");
    const resourceArn = requiredSimLogsDeliveryValue(
      input.resourceArn,
      "resourceArn",
    );
    const logType = requiredSimLogsDeliveryValue(input.logType, "logType");

    refuseUnsimulatedDeliveryTags(input.tags, "PutDeliverySource");
    this.#authorizer.authorizeResource(
      "logs:PutDeliverySource",
      simLogsDeliverySourceArn(this.#scope, name),
      options?.caller,
    );

    const service = requiredSimLogsDeliveredService(resourceArn);

    requireSimLogsDeliverySource({
      service,
      regionName: this.#scope.regionName,
      logType,
    });

    const source = new SimLogsDeliverySource({
      name,
      resourceArn,
      logType,
      service,
      accountRegionScope: this.#scope,
    });

    this.#sources.put(source);

    return {
      $metadata: {},
      deliverySource: simLogsDeliverySourceDetail(source),
    };
  }

  /**
   * Describe the delivery sources in this scope, in the order they were put.
   */
  describeDeliverySources(
    command: SimDescribeDeliverySourcesCommand,
    options?: SimLogsRequestOptions,
  ): SimDescribeDeliverySourcesCommandOutput {
    const input = command.input;

    this.#authorizer.authorizeResource(
      "logs:DescribeDeliverySources",
      simLogsAnyDeliverySourceArn(this.#scope),
      options?.caller,
    );

    const page = new SimLogsPage({
      listed: this.#sources.all,
      limit: input.limit,
      nextToken: input.nextToken,
      maximumLimit: maximumDescribeLimit,
    });

    return {
      $metadata: {},
      deliverySources: page.items.map((source) =>
        simLogsDeliverySourceDetail(source),
      ),
      nextToken: page.nextToken,
    };
  }

  /**
   * Remove a delivery source no delivery is carrying logs from.
   */
  deleteDeliverySource(
    command: SimDeleteDeliverySourceCommand,
    options?: SimLogsRequestOptions,
  ): SimDeleteDeliverySourceCommandOutput {
    const name = requiredSimLogsDeliveryValue(command.input.name, "name");

    this.#authorizer.authorizeResource(
      "logs:DeleteDeliverySource",
      simLogsDeliverySourceArn(this.#scope, name),
      options?.caller,
    );

    refuseSimLogsDeliverySourceInUse(this.#deliveries, name);
    this.#sources.delete(name);

    return { $metadata: {} };
  }
}
