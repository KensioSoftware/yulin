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

interface SimCloudFrontFunctionProps {
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
  #status: CloudFrontFunctionStatus;
  public readonly accountId: SimAwsAccountId;

  private readonly handlerFunction: CloudFrontFunction.Handler;
  private readonly eventAdapter: SimCffEventAdapter;

  constructor(props: SimCloudFrontFunctionProps) {
    const {
      name,
      status = "UNPUBLISHED",
      accountId = makeSimAwsAccountId(),
      handlerFunction = defaultCffHandler,
      eventAdapter = new SimCffEventAdapter(),
    } = props;
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
  handleViewerRequest(req: Request): Request | Response {
    const cffEvent = this.eventAdapter.toViewerRequestEvent(req);

    const handlerFunction = this
      .handlerFunction as CloudFrontFunction.ViewerRequestHandler;
    const cffResult = handlerFunction(cffEvent);

    return this.eventAdapter.fromViewerRequestResult(cffResult, req);
  }

  /**
   * Run the viewer-response CFF handler on a native Request and Response.
   */
  handleViewerResponse(req: Request, res: Response): Response {
    const cffEvent = this.eventAdapter.toViewerResponseEvent(req, res);

    const handlerFunction = this
      .handlerFunction as CloudFrontFunction.ViewerResponseHandler;
    const cffResult = handlerFunction(cffEvent);

    return this.eventAdapter.fromViewerResponseResult(cffResult);
  }
}
