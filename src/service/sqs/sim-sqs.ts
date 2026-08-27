import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import { SimSqsAuthorizer } from "./command/authorize/sim-sqs-authorizer.js";
import { SimSqsChangeMessageVisibility } from "./command/message/sim-sqs-change-message-visibility.js";
import { SimSqsDeleteMessageCommands } from "./command/message/sim-sqs-delete-message-commands.js";
import { SimSqsReceiveMessage } from "./command/message/sim-sqs-receive-message.js";
import { SimSqsSendMessageCommands } from "./command/message/sim-sqs-send-message-commands.js";
import { SimSqsQueueAccess } from "./command/queue/sim-sqs-queue-access.js";
import { SimSqsCreateQueue } from "./command/queue/sim-sqs-create-queue.js";
import { SimSqsQueueAttributeCommands } from "./command/queue/sim-sqs-queue-attribute-commands.js";
import { SimSqsQueueCommands } from "./command/queue/sim-sqs-queue-commands.js";
import type * as simSqsCommands from "./command/sim-sqs-command.types.js";
import type { SimSqsRequestOptions } from "./command/sim-sqs-request-options.js";
import { SimSqsCfnResourceFactory } from "./cfn/sim-sqs-cfn-resource-factory.js";
import { SimSqsMessageWriter } from "./message/sim-sqs-message-writer.js";
import { SimSqsDeadLetterTargets } from "./queue/sim-sqs-dead-letter-targets.js";
import type { SimSqsQueue } from "./queue/sim-sqs-queue.js";
import { SimSqsQueueActivity } from "./queue/sim-sqs-queue-activity.js";
import { SimSqsQueueStore } from "./queue/sim-sqs-queue-store.js";
import { SimSqsSdkCommandRouter } from "./sdk/sim-sqs-sdk-command-router.js";

interface SimSqsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated SQS. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * Queues are scoped to an account and region, as they are on real AWS: a queue
 * name is unique within one of those scopes, and both the queue URL and the ARN
 * name the region.
 *
 * Only standard queues are simulated. FIFO queues are not.
 */
export class SimSqs {
  private readonly queues = new SimSqsQueueStore();
  private readonly queueCreation: SimSqsCreateQueue;
  private readonly queueCommands: SimSqsQueueCommands;
  private readonly attributeCommands: SimSqsQueueAttributeCommands;
  private readonly sendCommands: SimSqsSendMessageCommands;
  private readonly receiveCommand: SimSqsReceiveMessage;
  private readonly deletionCommands: SimSqsDeleteMessageCommands;
  private readonly visibilityCommand: SimSqsChangeMessageVisibility;
  private readonly background: BackgroundScheduler;
  private readonly activity: SimSqsQueueActivity;
  private readonly sdkRouter = new SimSqsSdkCommandRouter(this);
  private readonly cfnFactory = new SimSqsCfnResourceFactory({ sqs: this });

  constructor(properties: SimSqsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
    } = properties;

    const iam = simIamInRegion(properties.iam, accountRegionScope.regionName);

    const access = new SimSqsQueueAccess({
      queues: this.queues,
      authorizer: new SimSqsAuthorizer({ iam }),
      accountRegionScope,
      clock: background,
    });

    this.background = background;
    this.activity = new SimSqsQueueActivity({
      queues: this.queues,
      clock: background,
    });
    this.queueCreation = new SimSqsCreateQueue({
      queues: this.queues,
      access,
      accountRegionScope,
      clock: background,
      deadLetterTargets: new SimSqsDeadLetterTargets({ queues: this.queues }),
      activity: this.activity,
    });
    this.queueCommands = new SimSqsQueueCommands({
      queues: this.queues,
      access,
      accountRegionScope,
      clock: background,
    });
    this.attributeCommands = new SimSqsQueueAttributeCommands({
      access,
      clock: background,
    });
    this.sendCommands = new SimSqsSendMessageCommands({
      access,
      writer: new SimSqsMessageWriter({ clock: background }),
    });
    this.receiveCommand = new SimSqsReceiveMessage({
      access,
      clock: background,
    });
    this.deletionCommands = new SimSqsDeleteMessageCommands({
      access,
      clock: background,
    });
    this.visibilityCommand = new SimSqsChangeMessageVisibility({
      access,
      clock: background,
    });
  }

  /**
   * Find a queue by name.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting queue
   * state without going through a Command and its authorization.
   */
  findQueue(name: string): SimSqsQueue | undefined {
    return this.queues.find(name);
  }

  /**
   * Keep up with the queues in this scope without polling them.
   *
   * Not an SQS API operation. Real SQS is polled continuously by whatever
   * consumes it, and nothing in this simulation runs continuously, so a
   * simulated consumer that would poll is told when there is something to poll
   * for. A Lambda event source mapping is what uses it.
   */
  queueActivity(): SimSqsQueueActivity {
    return this.activity;
  }

  /**
   * Handle a CreateQueue Command from the SDK.
   */
  async createQueue(
    command: simSqsCommands.SimCreateQueueCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimCreateQueueCommandOutput> {
    await this.background.sequence();
    return this.queueCreation.handle(command, options);
  }

  /**
   * Handle a GetQueueUrl Command from the SDK.
   */
  async getQueueUrl(
    command: simSqsCommands.SimGetQueueUrlCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimGetQueueUrlCommandOutput> {
    await this.background.sequence();
    return this.queueCommands.getQueueUrl(command, options);
  }

  /**
   * Handle a ListQueues Command from the SDK.
   */
  async listQueues(
    command: simSqsCommands.SimListQueuesCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimListQueuesCommandOutput> {
    await this.background.sequence();
    return this.queueCommands.listQueues(command, options);
  }

  /**
   * Handle a DeleteQueue Command from the SDK.
   */
  async deleteQueue(
    command: simSqsCommands.SimDeleteQueueCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimDeleteQueueCommandOutput> {
    await this.background.sequence();
    return this.queueCommands.deleteQueue(command, options);
  }

  /**
   * Handle a GetQueueAttributes Command from the SDK.
   */
  async getQueueAttributes(
    command: simSqsCommands.SimGetQueueAttributesCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimGetQueueAttributesCommandOutput> {
    await this.background.sequence();
    return this.attributeCommands.getQueueAttributes(command, options);
  }

  /**
   * Handle a SetQueueAttributes Command from the SDK.
   */
  async setQueueAttributes(
    command: simSqsCommands.SimSetQueueAttributesCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimSetQueueAttributesCommandOutput> {
    await this.background.sequence();
    return this.attributeCommands.setQueueAttributes(command, options);
  }

  /**
   * Handle a PurgeQueue Command from the SDK.
   */
  async purgeQueue(
    command: simSqsCommands.SimPurgeQueueCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimPurgeQueueCommandOutput> {
    await this.background.sequence();
    return this.attributeCommands.purgeQueue(command, options);
  }

  /**
   * Handle a SendMessage Command from the SDK.
   */
  async sendMessage(
    command: simSqsCommands.SimSendMessageCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimSendMessageCommandOutput> {
    await this.background.sequence();
    return this.sendCommands.send(command, options);
  }

  /**
   * Handle a SendMessageBatch Command from the SDK.
   */
  async sendMessageBatch(
    command: simSqsCommands.SimSendMessageBatchCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimSendMessageBatchCommandOutput> {
    await this.background.sequence();
    return this.sendCommands.sendBatch(command, options);
  }

  /**
   * Handle a ReceiveMessage Command from the SDK.
   */
  async receiveMessage(
    command: simSqsCommands.SimReceiveMessageCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimReceiveMessageCommandOutput> {
    await this.background.sequence();
    return this.receiveCommand.handle(command, options);
  }

  /**
   * Handle a DeleteMessage Command from the SDK.
   */
  async deleteMessage(
    command: simSqsCommands.SimDeleteMessageCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimDeleteMessageCommandOutput> {
    await this.background.sequence();
    return this.deletionCommands.deleteMessage(command, options);
  }

  /**
   * Handle a DeleteMessageBatch Command from the SDK.
   */
  async deleteMessageBatch(
    command: simSqsCommands.SimDeleteMessageBatchCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimDeleteMessageBatchCommandOutput> {
    await this.background.sequence();
    return this.deletionCommands.deleteMessageBatch(command, options);
  }

  /**
   * Handle a ChangeMessageVisibility Command from the SDK.
   */
  async changeMessageVisibility(
    command: simSqsCommands.SimChangeMessageVisibilityCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimChangeMessageVisibilityCommandOutput> {
    await this.background.sequence();
    return this.visibilityCommand.handle(command, options);
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimSqsCfnResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
