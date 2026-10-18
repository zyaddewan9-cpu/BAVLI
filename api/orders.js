
const crypto = require("crypto");

const SHIPPING = 80;
const SIZES = ["S", "M", "L", "XL", "XXL"];
const MAX_ITEMS = 30;
const MAX_QUANTITY = 20;

const ALLOWED_STATUSES = [
  "Order Received",
  "Confirmed",
  "Shipped",
  "Delivered",
  "Cancelled"
];

function send(res, status, data) {
  return res.status(status).json(data);
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables.");
  }

  return {
    url: url.replace(/\/+$/, ""),
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

function normalizeStatus(value) {
  const status = cleanText(value, 50).toLowerCase();

  const statuses = {
    "order received": "Order Received",
    "new": "Order Received",
    "received": "Order Received",
    "confirmed": "Confirmed",
    "shipped": "Shipped",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
    "canceled": "Cancelled"
  };

  return statuses[status] || null;
}

async function getActiveProducts(productIds) {
  const uniqueIds = [...new Set(productIds)];

  const query = new URLSearchParams({
    select: "id,name,price,sale_price,colors,active",
    active: "eq.true",
    id: `in.(${uniqueIds.join(",")})`
  });

  const rows = await supabaseRequest(
    `products?${query.toString()}`,
    { method: "GET" }
  );

  return new Map(
    (Array.isArray(rows) ? rows : []).map(product => [
      String(product.id),
      product
    ])
  );
}

function getValidColors(product) {
  if (!Array.isArray(product.colors)) return [];

  return product.colors
    .map(item => {
      if (typeof item === "string") return item.trim();

      if (item && typeof item.name === "string") {
        return item.name.trim();
      }

      return "";
    })
    .filter(Boolean);
}

function getProductPrice(product) {
  const regularPrice = Number(product.price);

  if (!Number.isFinite(regularPrice) || regularPrice < 0) {
    throw new Error("Invalid product price in database.");
  }

  if (product.sale_price !== null && product.sale_price !== undefined) {
    const salePrice = Number(product.sale_price);

    if (
      Number.isFinite(salePrice) &&
      salePrice >= 0 &&
      salePrice < regularPrice
    ) {
      return salePrice;
    }
  }

  return regularPrice;
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

  if (body.items.length > MAX_ITEMS) {
    return send(res, 400, {
      success: false,
      message: "Too many cart items."
    });
  }

  const requestedItems = [];
  const productIds = [];

  for (const item of body.items) {
    if (!item || typeof item !== "object") {
      return send(res, 400, {
        success: false,
        message: "Invalid cart item."
      });
    }

    const productId = cleanText(
      String(item.product_id ?? item.productId ?? item.id ?? ""),
      100
    );

    const quantity = Number(item.quantity);
    const size = cleanText(item.size, 10);
    const color = cleanText(item.color, 30);

    if (!productId) {
      return send(res, 400, {
        success: false,
        message: "An invalid product was selected."
      });
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY
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

    if (!color) {
      return send(res, 400, {
        success: false,
        message: "Please select a valid product color."
      });
    }

    requestedItems.push({
      productId,
      quantity,
      size,
      color
    });

    productIds.push(productId);
  }

  const products = await getActiveProducts(productIds);
  const items = [];

  for (const requested of requestedItems) {
    const product = products.get(requested.productId);

    if (!product) {
      return send(res, 400, {
        success: false,
        message: "A product is unavailable. Please refresh your cart."
      });
    }

    const colors = getValidColors(product);

    if (!colors.includes(requested.color)) {
      return send(res, 400, {
        success: false,
        message: "A selected color is unavailable. Please refresh your cart."
      });
    }

    const price = getProductPrice(product);
    const lineTotal = Math.round(price * requested.quantity * 100) / 100;

    items.push({
      product_id: String(product.id),
      name: cleanText(product.name, 150),
      price,
      color: requested.color,
      size: requested.size,
      quantity: requested.quantity,
      line_total: lineTotal
    });
  }

  const subtotal = Math.round(
    items.reduce((sum, item) => sum + item.line_total, 0) * 100
  ) / 100;

  const total = Math.round((subtotal + SHIPPING) * 100) / 100;
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
    status: normalizeStatus(savedOrder.status) || "Order Received",
    tracking_token,
    subtotal,
    shipping: SHIPPING,
    total
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

  const status = normalizeStatus(order.status);

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return send(res, 500, {
      success: false,
      message: "The order status is invalid."
    });
  }

  return send(res, 200, {
    success: true,
    order: {
      id: order.id,
      status,
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
