# Use the AWS CLI with Yulin

Point the AWS CLI at a served `SimAws` instance to run supported commands against simulated AWS.

## Start a local endpoint

Create an IAM user and access key in the simulation, then pass the same `SimAws` instance to
`serveSimAws`:

```typescript sim-cli-endpoint
/**
 * Serving a simulated environment for the aws CLI to reach.
 */

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const simIam = simAws.iam();

await simIam.createUser(new CreateUserCommand({ UserName: "Operator" }));
await simIam.putUserPolicy(
  new PutUserPolicyCommand({
    UserName: "Operator",
    PolicyName: "Everything",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "*", Resource: "*" },
    }),
  }),
);
const created = await simIam.createAccessKey(
  new CreateAccessKeyCommand({ UserName: "Operator" }),
);

const srv = await serveSimAws({ simAws, port: 8787 });

// Paste these into the shell the CLI runs in.
console.log(`export AWS_ENDPOINT_URL=http://localhost:${srv.port}`);
console.log(`export AWS_ACCESS_KEY_ID=${created.AccessKey.AccessKeyId}`);
console.log(
  `export AWS_SECRET_ACCESS_KEY=${created.AccessKey.SecretAccessKey}`,
);
console.log(`export AWS_DEFAULT_REGION=${simAws.defaultRegionName}`);
```

Set `port` when scripts need a stable endpoint. If you omit it, Yulin chooses an available port.

## Configure the CLI

Export the endpoint, simulated credentials, and Region printed by the setup script:

```bash
export AWS_ENDPOINT_URL=http://localhost:8787
export AWS_ACCESS_KEY_ID=AKIAVEXOWARWMKBOA0MP
export AWS_SECRET_ACCESS_KEY=RzIvKRp1sd5yXfEifA1twsUTd4GlHL5JpzvECpox
export AWS_DEFAULT_REGION=us-east-1
```

Run `sts get-caller-identity` to check the connection. It returns the simulated principal that owns
the access key:

```bash
aws sts get-caller-identity
{
    "UserId": "AIDARNFLISEC7SCUNSDY",
    "Account": "888888888888",
    "Arn": "arn:aws:iam::888888888888:user/Operator"
}
```

The credentials must come from simulated IAM. Yulin rejects an unknown key with `403 Forbidden`.
It also rejects unsigned AWS API requests.

A Region is required. Changing `AWS_DEFAULT_REGION` selects another simulated Region. For example,
a queue created in `eu-west-2` is absent from `us-east-1`.

### Use a named profile

You can put the endpoint and credentials in the AWS CLI config:

```ini
[profile sim]
region = us-east-1
endpoint_url = http://localhost:8787
aws_access_key_id = AKIAVEXOWARWMKBOA0MP
aws_secret_access_key = RzIvKRp1sd5yXfEifA1twsUTd4GlHL5JpzvECpox
```

Now `aws --profile sim sts get-caller-identity` reaches Yulin. The profile must contain its own
credentials because the CLI stops reading `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` after you
pass `--profile`.

Profiles with `role_arn` and `source_profile` also work. The CLI calls simulated STS and signs later
requests with the returned role session:

```ini
[profile reader]
region = us-east-1
endpoint_url = http://localhost:8787
role_arn = arn:aws:iam::888888888888:role/Reader
source_profile = sim
```

## Create more simulated identities

Only the first access key needs to come from the setup process. Use `aws iam` to create more users
and keys through the endpoint:

```bash
aws iam create-user --user-name shopper
aws iam put-user-policy --user-name shopper --policy-name read-buckets \
  --policy-document '{"Version":"2012-10-17","Statement":{"Effect":"Allow","Action":"s3:ListAllMyBuckets","Resource":"*"}}'
aws iam create-access-key --user-name shopper
```

`create-access-key` returns the secret once. Requests signed with the new key run as the new user and
are checked against its simulated IAM policies:

```bash
aws s3api create-bucket --bucket nope

aws: [ERROR]: An error occurred (AccessDenied) when calling the CreateBucket operation: User:
arn:aws:iam::888888888888:user/shopper is not authorized to perform: s3:CreateBucket on resource:
arn:aws:s3:::nope
```

`aws sts assume-role` returns temporary credentials. Export the access key, secret key, and session
token to run later commands as the role:

```bash
aws sts assume-role --role-arn arn:aws:iam::888888888888:role/Reader --role-session-name probe
export AWS_ACCESS_KEY_ID=ASIAKBEUIHDMON9VBZXF
export AWS_SECRET_ACCESS_KEY=jm2N56vfVtLgJEo11OtbIXbgnJBgxpUMrszPrQdl
export AWS_SESSION_TOKEN=11568oBDksY9czECUMiAWk9tzmvG7zlQNjtLI1WmhZFS...
```

The credentials expire according to [simulated time](https://yulinsim.dev/time/). Requests fail once
the `SimAws` clock passes their expiry.

## Run service commands

Use ordinary AWS CLI commands after the endpoint is configured:

```bash
aws s3 cp ./index.html s3://widgets/index.html
aws s3 sync ./site s3://widgets/site/
aws dynamodb put-item --table-name widgets --item '{"id":{"S":"w1"}}'
aws sqs create-queue --queue-name orders
aws ssm get-parameter --name /shop/url --query 'Parameter.Value' --output text
aws secretsmanager get-secret-value --secret-id shop/db --query SecretString --output text
aws logs describe-log-groups --query 'logGroups[].logGroupName' --output text
```

Client-side CLI options such as `--query` and `--output text` work with simulated responses.

The [localhost server guide](https://yulinsim.dev/serve/#which-services-answer) lists the operations
available for each service. Yulin returns `NotImplemented` for other operations.

## Commands that need extra configuration

### `--payload` needs `--cli-binary-format`

CLI v2 reads `--payload` as base64 by default:

```bash
aws lambda invoke --function-name orders --payload '{"id":1}' out.json

aws: [ERROR]: Invalid base64: "{"id":1}"
```

Pass `--cli-binary-format raw-in-base64-out` to send the JSON payload:

```bash
aws lambda invoke --function-name orders --payload '{"id":1}' \
  --cli-binary-format raw-in-base64-out out.json
cat out.json
```

`--invocation-type Event` returns `202` before the handler runs. Code in the server process can call
`simAws.backgroundTasksComplete()` before inspecting the result.

### S3 addressing style

The CLI's default `auto` addressing style sends path-style requests to custom endpoints. Yulin
supports that form. AWS SDK clients need `forcePathStyle: true` when they use the served endpoint.

Do not set `addressing_style = virtual` for the CLI profile. Yulin does not route virtual-hosted S3
API requests through the general endpoint.

### `aws cloudformation deploy` uses change sets

The CLI implements `aws cloudformation deploy` with change sets. Yulin does not serve
`CreateChangeSet`, so the command fails:

```bash
aws cloudformation deploy --stack-name site --template-file template.json

aws: [ERROR]: An error occurred (NotImplemented) when calling the CreateChangeSet operation:
Simulated CloudFormation does not serve CreateChangeSet
```

Use `create-stack` and `describe-stacks` instead. `create-stack` returns while resource creation runs
in the background.

### Presigned S3 URLs

Run `aws s3 presign` against the configured endpoint:

```bash
aws s3 presign s3://widgets/one.txt
```

The returned URL includes a signed credential scope, which Yulin uses to route the request to S3.
It works with `curl`, a browser, or another HTTP client. The S3 guide also covers
[presigned URLs built with the SDK](https://yulinsim.dev/services/s3/#presigned-urls).

### A bad key looks like an XML parse failure

STS, IAM, and ELBv2 return XML responses. Yulin currently returns a rejected signature as JSON for
these services, so the CLI reports an XML parsing error:

```bash
aws sts get-caller-identity

aws: [ERROR]: Unable to parse response (not well-formed (invalid token): line 1, column 0), invalid
XML received. Further retries may succeed:
b'{"Message":"Forbidden"}'
```

The `{"Message":"Forbidden"}` body means that the access key or signature was rejected. Other served
services report the rejection as a plain `403`.

## Available functionality

The served AWS API supports CLI operations for these services:

- ACM
- CloudFormation
- CloudWatch metrics and CloudWatch Logs
- Cognito Identity Provider
- DynamoDB and DynamoDB Streams
- ECS and Elastic Load Balancing v2
- EventBridge
- IAM and STS
- KMS and Secrets Manager
- Lambda
- Rekognition
- S3
- SNS and SQS
- SSM Parameter Store

Profiles and role assumption work with the endpoint. Client-side features such as JMESPath queries
and output formatting work with simulated responses.

## Limitations

- Services absent from the list above are not available through the general AWS API endpoint. Use
  `SimAws` directly or [SDK interception](https://yulinsim.dev/sdk/) where the service supports it.
  Simulated ECR exposes only an in-process API.
- An unsupported operation on a served service returns `NotImplemented`. For example,
  `aws iam list-users` reports
  `Simulated IAM does not serve ListUsers`, and `aws lambda list-functions` names the path it
  arrived at.
- `aws cloudwatch get-metric-statistics` and `aws cloudwatch get-metric-data` fail with
  `TypeError: time.getTime is not a function`. The JSON protocol carries a timestamp as epoch
  seconds and the endpoint hands that number to the simulation where a `Date` is expected. Both
  reads work in process and through SDK interception. `put-metric-data` and `list-metrics` are
  unaffected.
