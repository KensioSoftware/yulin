import type {
  TerraformResourceFold,
  TerraformResourceMapping,
} from "./sim-tf-mapping.type.js";
import { dynamodbTable } from "./sim-tf-map-dynamodb.js";
import { s3Bucket } from "./sim-tf-map-s3.js";
import { s3BucketFolds } from "./sim-tf-map-s3-folds.js";
import { sqsQueue } from "./sim-tf-map-sqs.js";
import { iamRole, iamRoleFolds, logGroup } from "./sim-tf-map-iam.js";
import {
  lambdaEventSourceMapping,
  lambdaFunction,
  lambdaPermission,
} from "./sim-tf-map-lambda.js";
import {
  httpApi,
  httpApiIntegration,
  httpApiRoute,
  httpApiStage,
} from "./sim-tf-map-http-api.js";
import { snsSubscription, snsTopic } from "./sim-tf-map-sns.js";
import {
  secretsManagerFolds,
  secretsManagerSecret,
  ssmParameter,
} from "./sim-tf-map-config.js";

/**
 * The Terraform resource types this import turns into CloudFormation Resources.
 *
 * A type with no entry is recorded as skipped, which is what the stack already
 * does with a CloudFormation Resource type no simulated service models.
 */
export const terraformResourceMappings: ReadonlyMap<
  string,
  TerraformResourceMapping
> = new Map([
  ["aws_s3_bucket", s3Bucket],
  ["aws_dynamodb_table", dynamodbTable],
  ["aws_sqs_queue", sqsQueue],
  ["aws_sns_topic", snsTopic],
  ["aws_sns_topic_subscription", snsSubscription],
  ["aws_lambda_function", lambdaFunction],
  ["aws_lambda_permission", lambdaPermission],
  ["aws_lambda_event_source_mapping", lambdaEventSourceMapping],
  ["aws_iam_role", iamRole],
  ["aws_cloudwatch_log_group", logGroup],
  ["aws_apigatewayv2_api", httpApi],
  ["aws_apigatewayv2_integration", httpApiIntegration],
  ["aws_apigatewayv2_route", httpApiRoute],
  ["aws_apigatewayv2_stage", httpApiStage],
  ["aws_ssm_parameter", ssmParameter],
  ["aws_secretsmanager_secret", secretsManagerSecret],
]);

/**
 * The Terraform resource types that configure another resource rather than
 * creating one of their own.
 */
export const terraformResourceFolds: ReadonlyMap<
  string,
  TerraformResourceFold
> = new Map([...s3BucketFolds, ...iamRoleFolds, ...secretsManagerFolds]);
