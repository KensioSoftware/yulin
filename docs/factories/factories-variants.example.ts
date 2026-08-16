/**
 * Naming the variations of an event an application receives.
 */

import { VariantFactory } from "@kensio/part-factory";

import { httpApiProxyEventFactory } from "@kensio/yulin/apigatewayv2";
import { s3NotificationEventFactory } from "@kensio/yulin/s3";

const signedInRequestFactory = new VariantFactory(httpApiProxyEventFactory, {
  requestContext: {
    authorizer: { jwt: { claims: { sub: "YL-1" }, scopes: null } },
  },
});

const request = signedInRequestFactory.make({ rawPath: "/account" });

// GET /account YL-1
console.log(
  request.routeKey,
  request.requestContext.authorizer?.jwt?.claims["sub"],
);

const objectRemovedFactory = new VariantFactory(s3NotificationEventFactory, {
  Records: [{ eventName: "ObjectRemoved:Delete" }],
});

const removal = objectRemovedFactory.make();

// ObjectRemoved:Delete undefined
console.log(
  removal.Records[0]?.eventName,
  // A removal reports no size, because the Object is gone.
  removal.Records[0]?.s3.object.size,
);
