import { SimDynamoDbEventSourceStreams } from "../../lambda/event-source/stream/sim-dynamodb-event-source-streams.js";
import { SimSqsEventSourceQueues } from "../../lambda/event-source/queue/sim-sqs-event-source-queues.js";
import { SimEcrLambdaContainerImages } from "../../lambda/function/code/image/sim-ecr-lambda-container-images.js";
import { SimS3LambdaCodeStore } from "../../lambda/function/code/store/sim-s3-lambda-code-store.js";
import { SimSdkLambdaVmModuleProvider } from "../../lambda/function/code/vm/sdk/sim-sdk-lambda-vm-module-provider.js";
import type { SimLambdaUrlRegistry } from "../../lambda/registry/sim-lambda-url-registry.js";
import type { SimAwsScopedServiceRegistries } from "./sim-aws-scoped-service-registries.js";
import type { SimAwsAccountRegionContainer } from "../sim-aws-account-region-scope.js";
import type { SimAws } from "../sim-aws.js";

interface SimAwsLambdaCollaboratorsProperties {
  readonly simAws: SimAws;
  readonly scope: SimAwsAccountRegionContainer;
  readonly urlRegistry: SimLambdaUrlRegistry;
  readonly registries: SimAwsScopedServiceRegistries;
}

/**
 * What simulated Lambda reaches for in the rest of the simulation.
 */
interface SimAwsLambdaCollaborators {
  readonly runAsOwner: SimAws;
  readonly urlRegistry: SimLambdaUrlRegistry;
  readonly codeStore: SimS3LambdaCodeStore;
  readonly containerImages: SimEcrLambdaContainerImages;
  readonly eventSourceQueues: SimSqsEventSourceQueues;
  readonly eventSourceStreams: SimDynamoDbEventSourceStreams;
  readonly vmSdkModuleProvider: SimSdkLambdaVmModuleProvider;
}

/**
 * Build the collaborators simulated Lambda takes beyond the scoped ones every
 * service gets.
 *
 * S3-located function code is fetched from the same Account/Region scope's
 * simulated S3, as real Lambda requires same-region code buckets. Function
 * code running in the vm runtime is provided host-installed AWS SDK packages
 * intercepted into this SimAws, as the real Lambda runtime provides the SDK.
 *
 * Event source mappings poll the same scope's simulated SQS and DynamoDB, as a
 * queue or a table's stream can only be an event source for a function in its
 * own Account and Region.
 *
 * A container image function's image is resolved in the whole simulation's ECR
 * rather than this scope's, because an image URI names the Account and Region
 * its registry is in, which need not be this one.
 */
export function simAwsLambdaCollaborators(
  properties: SimAwsLambdaCollaboratorsProperties,
): SimAwsLambdaCollaborators {
  const { simAws, scope } = properties;

  return {
    runAsOwner: simAws,
    urlRegistry: properties.urlRegistry,
    codeStore: new SimS3LambdaCodeStore({ s3: scope.s3() }),
    containerImages: new SimEcrLambdaContainerImages({
      repositories: properties.registries.ecr,
    }),
    eventSourceQueues: new SimSqsEventSourceQueues({ sqs: scope.sqs() }),
    eventSourceStreams: new SimDynamoDbEventSourceStreams({
      dynamoDb: scope.dynamoDb(),
    }),
    vmSdkModuleProvider: new SimSdkLambdaVmModuleProvider({
      simAws,
      regionName: scope.accountRegionScope.regionName,
    }),
  };
}
