import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";
import { SimCffEventAdapter } from "./adapter/sim-cff-event-adapter.js";
import type { Brand } from "../../../util/brand.type.js";
import type { SimArn } from "../../aws/arn.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../aws/sim-aws-account.js";
import type { SimCloudFrontKeyValueStore } from "../key-value-store/sim-cf-key-value-store.js";
import {
  SimCffConfiguration,
  type SimCffConfigurationProperties,
} from "./sim-cff-configuration.js";
import { cffCloudFrontModule } from "./kvs/cff-cloudfront-module.js";
import { simCffCloudFrontGlobal } from "./kvs/sim-cff-cloudfront-global.js";

export type SimCloudFrontFunctionName = Brand<
  string,
  "SimCloudFrontFunctionName"
>;

export type CloudFrontFunctionStatus =
  | "UNPUBLISHED"
  | "UNASSOCIATED"
  | "ASSOCIATED";

interface SimCloudFrontFunctionProperties extends SimCffConfigurationProperties {
  name: SimCloudFrontFunctionName | string;
  status?: CloudFrontFunctionStatus;
  readonly accountId?: SimAwsAccountId;
  handlerFunction?: CloudFrontFunction.Handler;
  eventAdapter?: SimCffEventAdapter;
  keyValueStore?: SimCloudFrontKeyValueStore | undefined;
}

export const defaultCffHandler: CloudFrontFunction.Handler = (
  event: CloudFrontFunction.Event,
) => {
  if (event.context.eventType === "viewer-response") {
    return (event as CloudFrontFunction.ViewerResponseEvent).response;
  }
  return event.request;
};

/**
 * Simulated CloudFront Function resource.
 */
export class SimCloudFrontFunction {
  public readonly name: SimCloudFrontFunctionName;
  public readonly accountId: SimAwsAccountId;

  /**
   * What this Function was created with, which every read of it reports.
   */
  public readonly config: SimCffConfiguration;

  #status: CloudFrontFunctionStatus;
  private readonly handlerFunction: CloudFrontFunction.Handler;
  private readonly eventAdapter: SimCffEventAdapter;
  private readonly associatedKeyValueStore:
    | SimCloudFrontKeyValueStore
    | undefined;

  constructor(properties: SimCloudFrontFunctionProperties) {
    const {
      name,
      status = "UNPUBLISHED",
      accountId = makeSimAwsAccountId(),
      handlerFunction = defaultCffHandler,
      eventAdapter = new SimCffEventAdapter(),
    } = properties;
    this.name = name as SimCloudFrontFunctionName;
    this.#status = status;
    this.accountId = accountId;
    this.config = new SimCffConfiguration(properties);
    this.handlerFunction = handlerFunction;
    this.eventAdapter = eventAdapter;
    this.associatedKeyValueStore = properties.keyValueStore;
  }

  /**
   * Get the current status of this sim CloudFront Function.
   */
  get status(): CloudFrontFunctionStatus {
    return this.#status;
  }

  /**
   * Get the ARN for this sim CloudFront Function.
   */
  get arn(): SimArn {
    return `arn:aws:cloudfront::${this.accountId}:function/${this.name}`;
  }

  /**
   * Move this sim CloudFront Function to the PUBLISHED status.
   */
  publish(): Promise<void> {
    this.#status = "UNASSOCIATED";
    return Promise.resolve();
  }

  /**
   * The key value store this Function may read, if it is associated with one.
   */
  get keyValueStore(): SimCloudFrontKeyValueStore | undefined {
    return this.associatedKeyValueStore;
  }

  /**
   * Run the viewer-request CFF handler on a native Request.
   *
   * Awaited because a Function reading a key value store is async. One that
   * reads nothing is synchronous and still works: awaiting a plain value is
   * what makes both shapes the same here.
   */
  async handleViewerRequest(request: Request): Promise<Request | Response> {
    const cffEvent = this.eventAdapter.toViewerRequestEvent(request);

    const handlerFunction = this
      .handlerFunction as CloudFrontFunction.ViewerRequestHandler;
    const cffResult = await this.running(
      async () => await handlerFunction(cffEvent),
    );

    return this.eventAdapter.fromViewerRequestResult(cffResult, request);
  }

  /**
   * Run the viewer-response CFF handler on a native Request and Response.
   */
  async handleViewerResponse(
    request: Request,
    response: Response,
  ): Promise<Response> {
    const cffEvent = this.eventAdapter.toViewerResponseEvent(request, response);

    const handlerFunction = this
      .handlerFunction as CloudFrontFunction.ViewerResponseHandler;
    const cffResult = await this.running(
      async () => await handlerFunction(cffEvent),
    );

    return this.eventAdapter.fromViewerResponseResult(cffResult, response);
  }

  /**
   * Run the handler with this Function's own `cf` in scope.
   *
   * A Function given as source code already has `cf` in its vm sandbox, so this
   * is what gives one given as a function reference the same thing: the module
   * is held in asynchronous context for the length of the invocation, and the
   * global `cf` resolves to it. Setting it for both is harmless and means the
   * two kinds of Function reach a store the same way.
   */
  private async running<T>(handler: () => Promise<T>): Promise<T> {
    return await simCffCloudFrontGlobal.run(
      cffCloudFrontModule(this.associatedKeyValueStore),
      handler,
    );
  }
}
