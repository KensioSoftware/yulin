terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.100.0"
    }
  }
}

provider "aws" {
  region                      = "eu-west-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}

# Community modules, written by the terraform-aws-modules maintainers.
# Nothing here is hand-picked for what Yulin happens to support.

module "uploads_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "4.11.0"

  bucket = "orders-uploads-independent"

  versioning = { enabled = true }

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = { sse_algorithm = "AES256" }
    }
  }

  cors_rule = [{
    allowed_methods = ["GET", "PUT"]
    allowed_origins = ["https://example.com"]
    allowed_headers = ["*"]
  }]

  lifecycle_rule = [{
    id      = "expire-old"
    enabled = true
    expiration = { days = 90 }
  }]
}

module "orders_table" {
  source  = "terraform-aws-modules/dynamodb-table/aws"
  version = "4.4.0"

  name      = "orders-independent"
  hash_key  = "pk"
  range_key = "sk"

  attributes = [
    { name = "pk", type = "S" },
    { name = "sk", type = "S" },
    { name = "gsi1pk", type = "S" },
  ]

  global_secondary_indexes = [{
    name            = "gsi1"
    hash_key        = "gsi1pk"
    projection_type = "ALL"
  }]

  ttl_enabled        = true
  ttl_attribute_name = "expiresAt"
}

module "processing_queue" {
  source  = "terraform-aws-modules/sqs/aws"
  version = "4.3.1"

  name                       = "orders-processing-independent"
  visibility_timeout_seconds = 60

  create_dlq = true
  redrive_policy = {
    maxReceiveCount = 3
  }
}

module "processor" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "7.21.1"

  function_name = "orders-processor-independent"
  handler       = "index.handler"
  runtime       = "nodejs20.x"

  source_path = "${path.module}/src"

  environment_variables = {
    TABLE_NAME = module.orders_table.dynamodb_table_id
  }

  attach_policy_statements = true
  policy_statements = {
    dynamodb = {
      effect    = "Allow"
      actions   = ["dynamodb:PutItem", "dynamodb:Query"]
      resources = [module.orders_table.dynamodb_table_arn]
    }
  }

  allowed_triggers = {
    sqs = {
      principal  = "sqs.amazonaws.com"
      source_arn = module.processing_queue.queue_arn
    }
    api = {
      principal  = "apigateway.amazonaws.com"
      source_arn = "${module.api.api_execution_arn}/*/*"
    }
  }
}

module "api" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "5.5.0"

  name          = "orders-api-independent"
  protocol_type = "HTTP"

  create_domain_name = false

  routes = {
    "POST /orders" = {
      integration = {
        uri                    = module.processor.lambda_function_arn
        payload_format_version = "2.0"
      }
    }
  }
}
