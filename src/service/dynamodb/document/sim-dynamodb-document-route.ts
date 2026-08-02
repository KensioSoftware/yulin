import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
} from "../../../sdk/index.js";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import type { SimDynamoDbRequestOptions } from "../sim-dynamodb.types.js";
import { simDynamoDbDocumentAttributeValue } from "./sim-dynamodb-document-marshall.js";
import type { SimDynamoDbDocumentPath } from "./sim-dynamodb-document-path.js";
import { simDynamoDbDocumentNativeValue } from "./sim-dynamodb-document-unmarshall.js";

/**
 * Send one already-converted request to a simulated DynamoDB operation.
 */
type SimDynamoDbDocumentSend = (
  input: object,
  options: SimDynamoDbRequestOptions | undefined,
) => Promise<object>;

interface SimDynamoDbDocumentRouteProperties {
  readonly input: SimDynamoDbDocumentPath;
  readonly output: SimDynamoDbDocumentPath;
  readonly send: SimDynamoDbDocumentSend;
}

/**
 * One document client Command routed to the operation it stands for.
 *
 * The document client marshals in middleware, and an intercepted send replaces
 * the send that would have run that middleware, so the conversion happens here
 * instead. Everything after it is the ordinary operation: the same validation,
 * the same authorization, the same simulated table.
 */
export class SimDynamoDbDocumentRoute {
  private readonly input: SimDynamoDbDocumentPath;
  private readonly output: SimDynamoDbDocumentPath;
  private readonly send: SimDynamoDbDocumentSend;

  constructor(properties: SimDynamoDbDocumentRouteProperties) {
    this.input = properties.input;
    this.output = properties.output;
    this.send = properties.send;
  }

  /**
   * The route the SDK interception engine calls.
   */
  route(): SimSdkCommandRoute {
    return async (command, context): Promise<unknown> => {
      const input = this.input.convert(
        command.input,
        (value, path) => simDynamoDbDocumentAttributeValue(value, path),
        "input",
      );

      const output = await this.send(
        input as object,
        simSdkCallerOptions(context),
      );

      return this.output.convert(
        output,
        (value, path) =>
          simDynamoDbDocumentNativeValue(
            value as SimDynamoDbAttributeValue,
            path,
          ),
        "output",
      );
    };
  }
}
