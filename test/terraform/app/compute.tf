# ---------- Encryption ----------

resource "aws_kms_key" "app" {
  description             = "Application data key"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "app" {
  name          = "alias/${var.app}"
  target_key_id = aws_kms_key.app.key_id
}

# ---------- Lambda ----------

data "aws_iam_policy_document" "assume_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "processor" {
  name               = "${var.app}-processor"
  assume_role_policy = data.aws_iam_policy_document.assume_lambda.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "processor" {
  name = "${var.app}-processor"
  role = aws_iam_role.processor.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query"]
        Resource = [aws_dynamodb_table.orders.arn, "${aws_dynamodb_table.orders.arn}/index/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.uploads.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.processing.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "processor_basic" {
  role       = aws_iam_role.processor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "processor" {
  name              = "/aws/lambda/${var.app}-processor"
  retention_in_days = 14
  tags              = local.tags
}

resource "aws_lambda_function" "processor" {
  function_name    = "${var.app}-processor"
  role             = aws_iam_role.processor.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = "processor.zip"
  source_code_hash = filebase64sha256("processor.zip")
  timeout          = 30
  memory_size      = 512

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.orders.name
      QUEUE_URL  = aws_sqs_queue.processing.url
      TOPIC_ARN  = aws_sns_topic.order_events.arn
    }
  }

  tags       = local.tags
  depends_on = [aws_cloudwatch_log_group.processor]
}

resource "aws_lambda_permission" "allow_bucket" {
  statement_id  = "AllowExecutionFromS3"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.processor.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.uploads.arn
}

resource "aws_lambda_event_source_mapping" "processing" {
  event_source_arn = aws_sqs_queue.processing.arn
  function_name    = aws_lambda_function.processor.arn
  batch_size       = 10
}

# ---------- HTTP API ----------

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.app}-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["https://example.com"]
    allow_methods = ["GET", "POST"]
  }
  tags = local.tags
}

resource "aws_apigatewayv2_integration" "processor" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.processor.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_orders" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "POST /orders"
  target    = "integrations/${aws_apigatewayv2_integration.processor.id}"
}

resource "aws_apigatewayv2_route" "get_order" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /orders/{orderId}"
  target    = "integrations/${aws_apigatewayv2_integration.processor.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
  tags        = local.tags
}

resource "aws_lambda_permission" "allow_api" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.processor.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
