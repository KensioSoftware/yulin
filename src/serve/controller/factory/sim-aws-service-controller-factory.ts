import type { SimAwsServiceController } from "../sim-service-controller.js";
import type { SimAws } from "../../../service/aws/sim-aws.js";
import { SimApiGatewayV2ServiceController } from "../../../service/apigatewayv2/serve/sim-api-gateway-v2-controller.js";
import { SimCloudFrontServiceController } from "../../../service/cloudfront/controller/sim-cloudfront-controller.js";
import { SimCognitoServiceController } from "../../../service/cognito/serve/sim-cognito-controller.js";
import { SimLambdaServiceController } from "../../../service/lambda/serve/sim-lambda-controller.js";
import { SimRoute53ServiceController } from "../../../service/route53/serve/sim-route53-controller.js";
import { SimS3ServiceController } from "../../../service/s3/serve/sim-s3-controller.js";

/**
 * Factory for simulated AWS HTTP service controllers.
 */
export class SimAwsServiceControllerFactory {
  constructor(private readonly simAws: SimAws) {}

  /**
   * Create a simulated AWS HTTP service controller.
   */
  create(serviceName: string): SimAwsServiceController {
    switch (serviceName) {
      case "s3": {
        return new SimS3ServiceController({ simAws: this.simAws });
      }
      case "cloudFront": {
        return new SimCloudFrontServiceController({
          simAws: this.simAws,
        });
      }
      case "lambda": {
        return new SimLambdaServiceController({ simAws: this.simAws });
      }
      case "route53": {
        return new SimRoute53ServiceController({ simAws: this.simAws });
      }
      case "apiGatewayV2": {
        return new SimApiGatewayV2ServiceController({ simAws: this.simAws });
      }
      case "cognitoIdentityProvider": {
        return new SimCognitoServiceController({ simAws: this.simAws });
      }
      default: {
        throw new Error(
          `No controller for simulated AWS service ${serviceName}`,
        );
      }
    }
  }
}
