import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";
import { SimCffEventAdapter } from "./adapter/sim-cff-event-adapter.js";
import type { Brand } from "../../../util/brand.type.js";
import type { SimArn } from "../../aws/arn.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../aws/sim-aws-account.js";

export type SimCloudFrontFunctionName = Brand<
  string,
  "SimCloudFrontFunctionName"
>;

export type CloudFrontFunctionStatus =
  "UNPUBLISHED" | "UNASSOCIATED" | "ASSOCIATED";

interface SimCloudFrontFunctionProperties {
  name: SimCloudFrontFunctionName | string;
  status?: CloudFrontFunctionStatus;
  readonly accountId?: SimAwsAccountId;
  handlerFunction?: CloudFrontFunction.Handler;
  eventAdapter?: SimCffEventAdapter;
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

  #status: CloudFrontFunctionStatus;
  private readonly handlerFunction: CloudFrontFunction.Handler;
  private readonly eventAdapter: SimCffEventAdapter;

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
    this.handlerFunction = handlerFunction;
    this.eventAdapter = eventAdapter;
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
   * Run the viewer-request CFF handler on a native Request.
   */
  handleViewerRequest(request: Request): Request | Response {
    const cffEvent = this.eventAdapter.toViewerRequestEvent(request);

    const handlerFunction = this
      .handlerFunction as CloudFrontFunction.ViewerRequestHandler;
    const cffResult = handlerFunction(cffEvent);

    return this.eventAdapter.fromViewerRequestResult(cffResult, request);
  }

  /**
   * Run the viewer-response CFF handler on a native Request and Response.
   */
  handleViewerResponse(request: Request, response: Response): Response {
    const cffEvent = this.eventAdapter.toViewerResponseEvent(request, response);

    const handlerFunction = this
      .handlerFunction as CloudFrontFunction.ViewerResponseHandler;
    const cffResult = handlerFunction(cffEvent);

    return this.eventAdapter.fromViewerResponseResult(cffResult, response);
  }
}
