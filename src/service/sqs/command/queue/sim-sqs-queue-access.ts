import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimSqsInvalidAddress,
  SimSqsQueueDoesNotExist,
  SimSqsValidationException,
} from "../../error/sim-sqs.error.js";
import type { SimSqsQueue } from "../../queue/sim-sqs-queue.js";
import { sqsQueueArnPrefix } from "../../queue/sim-sqs-queue-arn.js";
import type { SimSqsQueueStore } from "../../queue/sim-sqs-queue-store.js";
import { SimSqsQueueUrl } from "../../queue/sim-sqs-queue-url.js";
import type { SimSqsAuthorizer } from "../authorize/sim-sqs-authorizer.js";
import type { SimSqsRequestOptions } from "../sim-sqs-request-options.js";

/**
 * The operation an IAM action names, for a message about a missing request
 * input.
 */
function operationName(action: string): string {
  return action.replace("sqs:", "");
}

interface SimSqsQueueAccessProperties {
  readonly queues: SimSqsQueueStore;
  readonly authorizer: SimSqsAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: BackgroundScheduler;
}

/**
 * How a request reaches the queue it names.
 *
 * Every operation but ListQueues and CreateQueue starts the same way: read the
 * queue URL, find the queue that URL implies, authorize the action against it,
 * then require it to be there.
 *
 * Finding the queue comes before authorizing because the queue's own policy is
 * part of the decision, and nothing can supply a policy without first having the
 * queue. A caller with no permission is still refused for a queue that does not
 * exist rather than told the queue is missing, because a queue that is not there
 * contributes no policy and cannot admit anyone.
 */
export class SimSqsQueueAccess {
  private readonly queues: SimSqsQueueStore;
  private readonly authorizer: SimSqsAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: BackgroundScheduler;

  constructor(properties: SimSqsQueueAccessProperties) {
    this.queues = properties.queues;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Ensure the caller may perform an action on the queue of a given name.
   *
   * The queue need not exist, which is what CreateQueue needs: it authorizes
   * against the ARN the queue is about to have. A queue that is there brings its
   * policy into the decision.
   */
  authorizeName(
    action: string,
    name: string,
    options?: SimSqsRequestOptions,
  ): void {
    this.authorizer.authorizeQueue({
      action,
      queueArn: sqsQueueArnPrefix(this.accountRegionScope) + name,
      queue: this.queues.find(name),
      options,
    });
  }

  /**
   * Ensure the caller may perform an action naming no particular queue.
   */
  authorizeAnyQueue(action: string, options?: SimSqsRequestOptions): void {
    this.authorizer.authorizeAnyQueue(action, options);
  }

  /**
   * Resolve the queue a request names by name, authorizing the action first.
   */
  requireByName(
    action: string,
    name: string | undefined,
    options?: SimSqsRequestOptions,
  ): SimSqsQueue {
    if (name === undefined || name === "") {
      throw new SimSqsValidationException(
        `${operationName(action)} requires a QueueName`,
      );
    }

    return this.authorized(action, name, options);
  }

  /**
   * Resolve the queue a request names by URL, authorizing the action first.
   */
  requireByUrl(
    action: string,
    queueUrl: string | undefined,
    options?: SimSqsRequestOptions,
  ): SimSqsQueue {
    return this.authorized(action, this.nameFromUrl(action, queueUrl), options);
  }

  /**
   * The queue of a name, once the caller is allowed to reach it.
   *
   * Every queue is brought up to date first and not just this one, because a
   * message moves to a dead-letter queue when its source queue notices, and a
   * request may be about the dead-letter queue rather than the source.
   */
  private authorized(
    action: string,
    name: string,
    options: SimSqsRequestOptions | undefined,
  ): SimSqsQueue {
    this.queues.applyLifecycle(this.clock.now());
    this.authorizeName(action, name, options);

    return this.queues.require(name);
  }

  /**
   * Read the queue name out of the URL a request carries.
   *
   * A URL naming another account or region reaches nothing, rather than having
   * its name read out and looked up locally. A queue URL is scoped, and treating
   * a foreign one as local would let a test pass while the real call crossed an
   * account boundary it has no permission for.
   */
  private nameFromUrl(action: string, queueUrl: string | undefined): string {
    if (queueUrl === undefined || queueUrl === "") {
      throw new SimSqsValidationException(
        `${operationName(action)} requires a QueueUrl`,
      );
    }

    const parts = SimSqsQueueUrl.parse(queueUrl);

    if (parts === undefined) {
      throw new SimSqsInvalidAddress(
        `The address ${queueUrl} is not valid for this endpoint: a queue URL ` +
          `is https://sqs.<region>.amazonaws.com/<account-id>/<queue-name>`,
      );
    }

    const { accountId, regionName } = this.accountRegionScope;

    if (parts.accountId !== accountId || parts.regionName !== regionName) {
      throw new SimSqsQueueDoesNotExist(
        `The specified queue does not exist: ${queueUrl} names Account ` +
          `${parts.accountId} in ${parts.regionName}, and this simulated SQS ` +
          `is Account ${accountId} in ${regionName}`,
      );
    }

    return parts.name;
  }
}
