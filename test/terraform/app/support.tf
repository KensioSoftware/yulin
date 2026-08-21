# ---------- Auth ----------

resource "aws_cognito_user_pool" "users" {
  name = "${var.app}-users"

  password_policy {
    minimum_length    = 12
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  auto_verified_attributes = ["email"]
  tags                     = local.tags
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.app}-web"
  user_pool_id = aws_cognito_user_pool.users.id

  explicit_auth_flows = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  generate_secret     = false
}

# ---------- Configuration and secrets ----------

resource "aws_ssm_parameter" "api_url" {
  name  = "/${var.app}/api-url"
  type  = "String"
  value = "https://api.example.com"
  tags  = local.tags
}

resource "aws_secretsmanager_secret" "payment_api_key" {
  name                    = "${var.app}/payment-api-key"
  recovery_window_in_days = 7
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "payment_api_key" {
  secret_id     = aws_secretsmanager_secret.payment_api_key.id
  secret_string = "placeholder"
}

# ---------- Alerting ----------

resource "aws_sns_topic" "alerts" {
  name = "${var.app}-alerts"
  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "processor_errors" {
  alarm_name          = "${var.app}-processor-errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.processor.function_name
  }

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
  alarm_name          = "${var.app}-dlq-depth"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }

  tags = local.tags
}

# ---------- Scheduled reconciliation ----------

resource "aws_cloudwatch_event_rule" "nightly" {
  name                = "${var.app}-nightly"
  schedule_expression = "cron(0 2 * * ? *)"
  tags                = local.tags
}

resource "aws_cloudwatch_event_target" "nightly_processor" {
  rule      = aws_cloudwatch_event_rule.nightly.name
  target_id = "processor"
  arn       = aws_lambda_function.processor.arn
}

resource "aws_lambda_permission" "allow_events" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.processor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.nightly.arn
}

# ---------- Images ----------

resource "aws_ecr_repository" "processor" {
  name                 = "${var.app}-processor"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = local.tags
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}
