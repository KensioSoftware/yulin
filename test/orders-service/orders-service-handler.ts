import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

/**
 * The application the orders container runs.
 *
 * It is ordinary code: an SDK client built from the environment the task
 * definition declared, a route or two, and a response. Nothing in it knows it
 * is running under a simulator, which is the point of the whole scenario.
 */
export async function handleOrdersRequest(request: Request): Promise<Response> {
  const tableName = process.env["ORDERS_TABLE"];
  const { pathname } = new URL(request.url);

  if (request.method === "POST") {
    return await placeOrder(request, tableName);
  }

  return await readOrder(pathname.split("/").at(-1) ?? "", tableName);
}

/**
 * Record an order and answer with where it can be read back.
 */
async function placeOrder(
  request: Request,
  tableName: string | undefined,
): Promise<Response> {
  const order = (await request.json()) as { orderId: string; item: string };

  await new DynamoDBClient({}).send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        orderId: { S: order.orderId },
        item: { S: order.item },
      },
    }),
  );

  return Response.json(
    { orderId: order.orderId },
    {
      status: 201,
      headers: {
        "content-type": "application/json",
        location: `/orders/${order.orderId}`,
      },
    },
  );
}

/**
 * Read one order back, or say there is no such order.
 */
async function readOrder(
  orderId: string,
  tableName: string | undefined,
): Promise<Response> {
  const read = await new DynamoDBClient({}).send(
    new GetItemCommand({
      TableName: tableName,
      Key: { orderId: { S: orderId } },
    }),
  );

  if (read.Item === undefined) {
    return new Response("no such order", { status: 404 });
  }

  return Response.json(
    { orderId, item: read.Item["item"]?.S ?? "" },
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
