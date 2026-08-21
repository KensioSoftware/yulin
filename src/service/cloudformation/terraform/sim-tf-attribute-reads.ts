/**
 * How one Terraform attribute is read off the CloudFormation Resource standing
 * in for it.
 *
 * `Ref` means the CloudFormation Resource's own Ref value returns it, and any
 * other string is the `Fn::GetAtt` attribute name. The table is per Terraform
 * type because the provider and CloudFormation disagree about which value is
 * the Ref. An `AWS::SNS::Topic` Ref is the topic ARN, an `AWS::SQS::Queue` Ref
 * is the queue URL, and an `AWS::S3::Bucket` Ref is the bucket name.
 */
export const terraformAttributeReads: ReadonlyMap<string, string> = new Map([
  ["aws_s3_bucket.id", "Ref"],
  ["aws_s3_bucket.bucket", "Ref"],
  ["aws_s3_bucket.arn", "Arn"],
  ["aws_s3_bucket.bucket_regional_domain_name", "RegionalDomainName"],
  ["aws_s3_bucket.bucket_domain_name", "DomainName"],
  ["aws_dynamodb_table.id", "Ref"],
  ["aws_dynamodb_table.name", "Ref"],
  ["aws_dynamodb_table.arn", "Arn"],
  ["aws_dynamodb_table.stream_arn", "StreamArn"],
  ["aws_sqs_queue.id", "Ref"],
  ["aws_sqs_queue.url", "Ref"],
  ["aws_sqs_queue.arn", "Arn"],
  ["aws_sqs_queue.name", "QueueName"],
  ["aws_sns_topic.id", "Ref"],
  ["aws_sns_topic.arn", "Ref"],
  ["aws_sns_topic.name", "TopicName"],
  ["aws_lambda_function.arn", "Arn"],
  ["aws_lambda_function.invoke_arn", "Arn"],
  ["aws_lambda_function.qualified_arn", "Arn"],
  ["aws_lambda_function.function_name", "Ref"],
  ["aws_lambda_function.id", "Ref"],
  ["aws_iam_role.arn", "Arn"],
  ["aws_iam_role.id", "Ref"],
  ["aws_iam_role.name", "Ref"],
  ["aws_kms_key.arn", "Arn"],
  ["aws_kms_key.id", "Ref"],
  ["aws_kms_key.key_id", "Ref"],
  ["aws_apigatewayv2_api.id", "Ref"],
  ["aws_apigatewayv2_api.api_endpoint", "ApiEndpoint"],
  ["aws_apigatewayv2_integration.id", "Ref"],
  ["aws_cognito_user_pool.id", "Ref"],
  ["aws_cognito_user_pool.arn", "Arn"],
  ["aws_cognito_user_pool_client.id", "Ref"],
  ["aws_cloudwatch_log_group.arn", "Arn"],
  ["aws_cloudwatch_log_group.name", "Ref"],
  ["aws_cloudwatch_event_rule.arn", "Arn"],
  ["aws_cloudwatch_event_rule.name", "Ref"],
  ["aws_secretsmanager_secret.id", "Ref"],
  ["aws_secretsmanager_secret.arn", "Ref"],
  ["aws_ecr_repository.arn", "Arn"],
  ["aws_ecr_repository.repository_url", "RepositoryUri"],
]);
