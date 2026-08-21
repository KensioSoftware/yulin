import type {
  TerraformResourceFold,
  TerraformResourceMapping,
} from "./sim-tf-mapping.type.js";
import { metricAlarm } from "./map/sim-tf-map-cloudwatch.js";
import { cognitoUserPool } from "./map/sim-tf-map-cognito.js";
import { cognitoUserPoolClient } from "./map/sim-tf-map-cognito-client.js";
import { dynamodbTable } from "./map/sim-tf-map-dynamodb.js";
import { ecrRepository } from "./map/sim-tf-map-ecr.js";
import { eventRule, eventTargetFolds } from "./map/sim-tf-map-events.js";
import { httpApi, httpApiStage } from "./map/sim-tf-map-http-api.js";
import {
  httpApiIntegration,
  httpApiRoute,
} from "./map/sim-tf-map-http-api-routes.js";
import { iamRole, iamRoleFolds } from "./map/sim-tf-map-iam.js";
import { kmsAlias, kmsKey } from "./map/sim-tf-map-kms.js";
import {
  lambdaEventSourceMapping,
  lambdaFunction,
  lambdaPermission,
} from "./map/sim-tf-map-lambda.js";
import { logGroup } from "./map/sim-tf-map-logs.js";
import { s3Bucket } from "./map/sim-tf-map-s3.js";
import { s3BucketFolds } from "./map/sim-tf-map-s3-folds.js";
import { s3LifecycleFolds } from "./map/sim-tf-map-s3-lifecycle.js";
import { bucketNotification } from "./map/sim-tf-map-s3-notification.js";
import {
  secretsManagerFolds,
  secretsManagerSecret,
} from "./map/sim-tf-map-secretsmanager.js";
import { snsSubscription, snsTopic } from "./map/sim-tf-map-sns.js";
import { sqsQueue } from "./map/sim-tf-map-sqs.js";
import { sqsRedriveFolds } from "./map/sim-tf-map-sqs-redrive.js";
import { ssmParameter } from "./map/sim-tf-map-ssm.js";

/**
 * The Terraform resource types this import turns into CloudFormation Resources.
 *
 * A type with no entry is recorded as skipped, which is what the stack already
 * does with a CloudFormation Resource type no simulated service models. The
 * set grows a service at a time.
 */
export const terraformResourceMappings: ReadonlyMap<
  string,
  TerraformResourceMapping
> = new Map([
  ["aws_apigatewayv2_api", httpApi],
  ["aws_apigatewayv2_integration", httpApiIntegration],
  ["aws_apigatewayv2_route", httpApiRoute],
  ["aws_apigatewayv2_stage", httpApiStage],
  ["aws_cloudwatch_event_rule", eventRule],
  ["aws_cloudwatch_log_group", logGroup],
  ["aws_cloudwatch_metric_alarm", metricAlarm],
  ["aws_cognito_user_pool", cognitoUserPool],
  ["aws_cognito_user_pool_client", cognitoUserPoolClient],
  ["aws_dynamodb_table", dynamodbTable],
  ["aws_ecr_repository", ecrRepository],
  ["aws_iam_role", iamRole],
  ["aws_kms_alias", kmsAlias],
  ["aws_kms_key", kmsKey],
  ["aws_lambda_event_source_mapping", lambdaEventSourceMapping],
  ["aws_lambda_function", lambdaFunction],
  ["aws_lambda_permission", lambdaPermission],
  ["aws_s3_bucket", s3Bucket],
  ["aws_s3_bucket_notification", bucketNotification],
  ["aws_secretsmanager_secret", secretsManagerSecret],
  ["aws_sns_topic", snsTopic],
  ["aws_sns_topic_subscription", snsSubscription],
  ["aws_sqs_queue", sqsQueue],
  ["aws_ssm_parameter", ssmParameter],
]);

/**
 * The Terraform resource types that configure another resource rather than
 * creating one of their own.
 */
export const terraformResourceFolds: ReadonlyMap<
  string,
  TerraformResourceFold
> = new Map([
  ...s3BucketFolds,
  ...s3LifecycleFolds,
  ...iamRoleFolds,
  ...secretsManagerFolds,
  ...eventTargetFolds,
  ...sqsRedriveFolds,
]);
