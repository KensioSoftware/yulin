import { SimAwsLambdaDestinations } from "../../lambda/destination/sim-aws-lambda-destinations.js";
import { SimDynamoDbEventSourceStreams } from "../../lambda/event-source/stream/sim-dynamodb-event-source-streams.js";
import { SimSqsEventSourceQueues } from "../../lambda/event-source/queue/sim-sqs-event-source-queues.js";
import { SimEcrLambdaContainerImages } from "../../lambda/function/code/image/sim-ecr-lambda-container-images.js";
import { SimS3LambdaCodeStore } from "../../lambda/function/code/store/sim-s3-lambda-code-store.js";
import { SimSdkLambdaVmModuleProvider } from "../../lambda/function/code/vm/sdk/sim-sdk-lambda-vm-module-provider.js";
import { makeSimLambdaOutboundHttp } from "../../lambda/function/outbound/sim-lambda-outbound-http.factory.js";
import type { SimLambdaOutboundHttp } from "../../lambda/function/outbound/sim-lambda-outbound-http.js";
import type { SimLambdaUrlRegistry } from "../../lambda/registry/sim-lambda-url-registry.js";
import type { SimLogsServiceWriter } from "../../logs/write/sim-logs-service-writer.js";
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
  readonly outboundHttp: SimLambdaOutboundHttp;
  readonly logs: SimLogsServiceWriter;
  readonly destinations: SimAwsLambdaDestinations;
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
 *
 * An asynchronous invocation result is sent through the whole simulation
 * rather than through this scope, because a destination ARN names the Account
 * and Region it lives in, and real Lambda delivers across both.
 *
 * Handler output is recorded to the same Account/Region scope's simulated
 * CloudWatch Logs, since that is where `/aws/lambda/<name>` lives for a
 * function in this scope.
 *
 * The HTTP requests function code makes are answered by this whole SimAws
 * rather than by this scope, because a hostname says which Account and Region
 * serves it: an AWS API request carries the Region it was signed for, and
 * every other hostname is resolved by simulated Route53, which is
 * simulation-wide.
 */
export function simAwsLambdaCollaborators(
  properties: SimAwsLambdaCollaboratorsProperties,
): SimAwsLambdaCollaborators {
  const { simAws, scope } = properties;
  const outboundHttp = makeSimLambdaOutboundHttp({
    simAws,
    regionName: scope.accountRegionScope.regionName,
  });

  return {
    outboundHttp,
    runAsOwner: simAws,
    destinations: new SimAwsLambdaDestinations({ simAws }),
    logs: scope.logs().serviceWriter(),
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
      outboundHttp,
    }),
  };
}
