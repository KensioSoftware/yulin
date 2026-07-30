import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
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
 * queue URL, authorize the action against the ARN that URL implies, then look the
 * queue up. Authorization comes first because real IAM decides before the
 * service does anything, so a caller with no permission is refused whether or not
 * the queue exists.
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
   */
  authorizeName(action: string, name: string, caller?: SimAwsCaller): void {
    this.authorizer.authorizeQueue(
      action,
      sqsQueueArnPrefix(this.accountRegionScope) + name,
      caller,
    );
  }

  /**
   * Ensure the caller may perform an action naming no particular queue.
   */
  authorizeAnyQueue(action: string, caller?: SimAwsCaller): void {
    this.authorizer.authorizeAnyQueue(action, caller);
  }

  /**
   * Resolve the queue a request names by name, authorizing the action first.
   */
  requireByName(
    action: string,
    name: string | undefined,
    caller?: SimAwsCaller,
  ): SimSqsQueue {
    if (name === undefined || name === "") {
      throw new SimSqsValidationException(
        `${operationName(action)} requires a QueueName`,
      );
    }

    this.authorizeName(action, name, caller);

    return this.upToDate(name);
  }

  /**
   * Resolve the queue a request names by URL, authorizing the action first.
   */
  requireByUrl(
    action: string,
    queueUrl: string | undefined,
    caller?: SimAwsCaller,
  ): SimSqsQueue {
    const name = this.nameFromUrl(action, queueUrl);

    this.authorizeName(action, name, caller);

    return this.upToDate(name);
  }

  /**
   * The queue of a name, with every queue brought up to date first.
   *
   * Every queue and not just this one, because a message moves to a dead-letter
   * queue when its source queue notices, and a request may be about the
   * dead-letter queue rather than the source.
   */
  private upToDate(name: string): SimSqsQueue {
    this.queues.applyLifecycle(this.clock.now());

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
