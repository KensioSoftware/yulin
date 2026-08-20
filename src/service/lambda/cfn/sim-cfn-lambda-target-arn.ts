import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { sqsQueueArn } from "../../sqs/queue/sim-sqs-queue-arn.js";
import { SimSqsQueueUrl } from "../../sqs/queue/sim-sqs-queue-url.js";
import { SimLambdaDestinationArn } from "../destination/sim-lambda-destination-arn.js";
import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";
import { requireLambdaDeadLetterTarget } from "../function/event-invoke/lambda-dead-letter-target.js";
import { SimCfnLambdaPropertyParser } from "./function/sim-cfn-lambda-property-parser.js";

/**
 * How an ARN a template property names is read, which is by the same reader
 * the SDK path uses.
 */
type SimCfnLambdaTargetReader = (arn: string) => string | undefined;

/**
 * Reads the template properties naming where a function's asynchronous
 * invocations end up.
 *
 * A destination and a dead-letter target are named the same way and go wrong
 * the same way, so they are read here rather than beside each of the two
 * Resources carrying one.
 *
 * Neither takes the Resource down with it. A destination naming a Resource
 * simulated CloudFormation skipped, or a service outside the template, is
 * recorded against the Resource and left off it, so the function still
 * deploys and a test can find out where its failures are not going. A stack
 * refusing to deploy a function over one destination is the outcome issue
 * #823 was about.
 */
export class SimCfnLambdaTargetArn {
  private readonly parser = new SimCfnLambdaPropertyParser();

  /**
   * Where an asynchronous invocation result is sent, if it can be sent there.
   */
  destination(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    path: string,
  ): string | undefined {
    return this.usable(
      resource,
      value,
      path,
      (arn) => SimLambdaDestinationArn.of(arn).value,
    );
  }

  /**
   * Where an asynchronous event that was given up on is kept, if it can be
   * kept there.
   */
  deadLetter(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    path: string,
  ): string | undefined {
    return this.usable(resource, value, path, (arn) =>
      requireLambdaDeadLetterTarget({ TargetArn: arn }),
    );
  }

  /**
   * The ARN this property names, or nothing when the simulation will not send
   * there and has recorded why.
   */
  private usable(
    resource: SimCfnResource,
    value: SimCfnTemplateValue | undefined,
    path: string,
    read: SimCfnLambdaTargetReader,
  ): string | undefined {
    const named = this.parser.optionalString(resource, value, path);

    if (named === undefined || named === "") {
      return undefined;
    }

    try {
      return read(queueUrlAsArn(named));
    } catch (error) {
      if (error instanceof SimLambdaInvalidParameterValueException) {
        resource.ignoreProperty(
          path,
          `${path} names ${named}, which simulated Lambda has nowhere to ` +
            `send to, so the Resource is deployed without it: ${error.message}`,
        );

        return undefined;
      }

      /* v8 ignore next 2 -- unreachable: reading an ARN refuses one it cannot
         use and does nothing else that throws. */
      throw error;
    }
  }
}

/**
 * A queue named by its URL, read as the ARN every other way of naming a queue
 * gives.
 *
 * `Ref` on an `AWS::SQS::Queue` resolves to the queue's URL, since that is
 * what an SDK request names a queue by, while everything here names a queue by
 * ARN. A template pointing at a queue either way means the same queue.
 */
function queueUrlAsArn(named: string): string {
  const queue = SimSqsQueueUrl.parse(named);

  return queue === undefined ? named : sqsQueueArn(queue);
}
