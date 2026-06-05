import { DynamicFactory } from "@kensio/part-factory";
import { faker } from "@faker-js/faker";
import { SimAwsHttpRequest } from "./sim-aws-req-res.js";
import type { IncomingMessage } from "node:http";

interface SimAwsReqProps {
  method: string;
  host: string;
  url: string;
}

const simAwsReqPropsFactory = new DynamicFactory<SimAwsReqProps>(
  (overrides) => {
    const host = overrides?.host ?? `${faker.internet.domainName()}.localhost`;
    return {
      method: faker.internet.httpMethod(),
      host,
      url: `http://${host}/foobar/index.html`,
    };
  },
);

/**
 * Generate a fake simulated AWS HTTP request object.
 */
export function makeSimAwsHttpRequest(
  overrides?: Partial<SimAwsReqProps>,
): SimAwsHttpRequest {
  const { method, host, url } = simAwsReqPropsFactory.make(overrides);
  return new SimAwsHttpRequest({
    method,
    url,
    headers: { host },
  } as IncomingMessage);
}
