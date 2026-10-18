
const crypto = require("crypto");

const PRODUCTS = {
  "1": { name: "Essentials Hoodie", price: 650, colors: ["Black", "Gray"] },
  "2": { name: "Jacket Hoodie", price: 750, colors: ["Black", "Gray"] },
  "3": { name: "Supreme Hoodie", price: 650, colors: ["Black", "Gray"] },
  "4": { name: "Scuffer Hoodie", price: 650, colors: ["Blue", "White"] },
  "5": { name: "British Hoodie", price: 650, colors: ["British"] }
};

const SHIPPING = 80;
const SIZES = ["S", "M", "L", "XL", "XXL"];

const ALLOWED_STATUSES = [
  "Order Received",
  "Confirmed",
  "Shipped",
  "Delivered",
  "Cancelled"
];

function send(res, status, data) {
  res.status(status).json(data);
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables.");
  }

  return {
    url: url.replace(/\/$/, ""),
    key
  };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    console.error("Supabase error:", response.status, data);
    throw new Error("Database request failed.");
  }

  return data;
}

function cleanText(value, maxLength = 250) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

async function createOrder(req, res) {
  const body = req.body || {};

  const customer_name = cleanText(body.customer_name, 100);
  const phone = cleanText(body.phone, 30);
  const governorate = cleanText(body.governorate, 100);
  const address = cleanText(body.address, 500);

  if (!customer_name || !phone || !governorate || !address) {
    return send(res, 400, {
      success: false,
      message: "Please complete all customer and address fields."
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return send(res, 400, {
      success: false,
      message: "Your cart is empty."
    });
  }

  if (body.items.length > 30) {
    return send(res, 400, {
      success: false,
      message: "Too many cart items."
    });
  }

  const items = [];

  for (const item of body.items) {
    const productId = String(
      item.product_id ?? item.productId ?? item.id ?? ""
    );

    const product = PRODUCTS[productId];

    if (!product) {
      return send(res, 400, {
        success: false,
        message: "An invalid product was selected."
      });
    }

    const quantity = Number(item.quantity);
    const size = cleanText(item.size, 10);
    const color = cleanText(item.color, 30);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 20
    ) {
      return send(res, 400, {
        success: false,
        message: "Invalid product quantity."
      });
    }

    if (!SIZES.includes(size)) {
      return send(res, 400, {
        success: false,
        message: "Please select a valid size."
      });
    }

    if (!product.colors.includes(color)) {
      return send(res, 400, {
        success: false,
        message: "Please select a valid product color."
      });
    }

    items.push({
      product_id: productId,
      name: product.name,
      price: product.price,
      color,
      size,
      quantity,
      line_total: product.price * quantity
    });
  }

  const subtotal = items.reduce(
    (sum, item) => sum + item.line_total,
    0
  );

  const tracking_token = crypto.randomBytes(24).toString("hex");

  const order = {
    customer_name,
    phone,
    governorate,
    address,
    items,
    payment_method: "COD",
    subtotal,
    shipping: SHIPPING,
    status: "Order Received",
    tracking_token
  };

  const savedOrders = await supabaseRequest(
    "orders?select=id,status,created_at",
    {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify(order)
    }
  );

  const savedOrder = Array.isArray(savedOrders)
    ? savedOrders[0]
    : null;

  if (!savedOrder) {
    throw new Error("The order was not returned by the database.");
  }

  return send(res, 201, {
    success: true,
    message: "Order placed successfully.",
    order_id: savedOrder.id,
    status: savedOrder.status,
    tracking_token,
    subtotal,
    shipping: SHIPPING,
    total: subtotal + SHIPPING
  });
}

async function getOrderStatus(req, res) {
  const token = cleanText(req.query?.token, 100);

  if (!/^[a-f0-9]{48}$/.test(token)) {
    return send(res, 400, {
      success: false,
      message: "Invalid tracking link."
    });
  }

  const query = new URLSearchParams({
    tracking_token: `eq.${token}`,
    select: "id,status,created_at",
    limit: "1"
  });

  const orders = await supabaseRequest(
    `orders?${query.toString()}`,
    { method: "GET" }
  );

  const order = Array.isArray(orders) ? orders[0] : null;

  if (!order) {
    return send(res, 404, {
      success: false,
      message: "Order not found."
    });
  }

  if (!ALLOWED_STATUSES.includes(order.status)) {
    return send(res, 500, {
      success: false,
      message: "The order status is invalid."
    });
  }

  return send(res, 200, {
    success: true,
    order: {
      id: order.id,
      status: order.status,
      created_at: order.created_at
    }
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      return await createOrder(req, res);
    }

    if (req.method === "GET") {
      return await getOrderStatus(req, res);
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, {
      success: false,
      message: "Method not allowed."
    });
  } catch (error) {
    console.error("Orders API error:", error);

    return send(res, 500, {
      success: false,
      message: "Something went wrong. Please try again."
    });
  }
};
