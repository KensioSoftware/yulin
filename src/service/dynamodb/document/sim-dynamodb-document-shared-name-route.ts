import type { SimSdkCommandRoute } from "../../../sdk/index.js";
import { isSimDynamoDbDocumentCommand } from "./sim-dynamodb-document-command.js";

interface SimDynamoDbSharedNameRouteProperties {
  readonly document: SimSdkCommandRoute;
  readonly client: SimSdkCommandRoute;
}

/**
 * One Command name both DynamoDB clients use, routed by the client it came
 * from.
 *
 * The SDK router keys on the Command's class name, and `@aws-sdk/lib-dynamodb`
 * names its `QueryCommand` and `ScanCommand` exactly as
 * `@aws-sdk/client-dynamodb` does, unlike `PutCommand` and `PutItemCommand`. So
 * the name alone cannot say whether the request carries native JavaScript
 * values or AttributeValues, and the Command is asked instead.
 */
export class SimDynamoDbSharedNameRoute {
  private readonly document: SimSdkCommandRoute;
  private readonly client: SimSdkCommandRoute;

  constructor(properties: SimDynamoDbSharedNameRouteProperties) {
    this.document = properties.document;
    this.client = properties.client;
  }

  /**
   * The route the SDK interception engine calls.
   */
  route(): SimSdkCommandRoute {
    return async (command, context): Promise<unknown> => {
      if (isSimDynamoDbDocumentCommand(command)) {
        return await this.document(command, context);
      }

      return await this.client(command, context);
    };
  }
}
