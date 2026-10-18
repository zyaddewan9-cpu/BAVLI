
const PRODUCTS = {
  "1": {
    name: "Essentials Hoodie",
    price: 650,
    colors: ["Black", "Gray"],
  },
  "2": {
    name: "Jacket Hoodie",
    price: 750,
    colors: ["Black", "Gray"],
  },
  "3": {
    name: "Supreme Hoodie",
    price: 650,
    colors: ["Black", "Gray"],
  },
  "4": {
    name: "Scuffer Hoodie",
    price: 650,
    colors: ["Blue", "White"],
  },
  "5": {
    name: "British Hoodie",
    price: 650,
    colors: ["British", "Black"],
  },
};

const SHIPPING = 80;
const SIZES = ["S", "M", "L", "XL", "XXL"];

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(res, status, error) {
  return res.status(status).json({
    success: false,
    error,
  });
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "Method not allowed.");
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const customer_name = clean(body.customer_name);
    const phone = clean(body.phone);
    const governorate = clean(body.governorate);
    const address = clean(body.address);
    const payment_method = clean(body.payment_method || "COD");

    if (customer_name.length < 2 || customer_name.length > 100) {
      return fail(res, 400, "Please enter a valid customer name.");
    }

    if (phone.length < 7 || phone.length > 25) {
      return fail(res, 400, "Please enter a valid phone number.");
    }

    if (!governorate || governorate.length > 80) {
      return fail(res, 400, "Please select a governorate.");
    }

    if (address.length < 5 || address.length > 500) {
      return fail(res, 400, "Please enter a complete address.");
    }

    if (
      !["COD", "cash_on_delivery", "Cash on Delivery"].includes(
        payment_method
      )
    ) {
      return fail(res, 400, "Unsupported payment method.");
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return fail(res, 400, "Your cart is empty.");
    }

    if (body.items.length > 30) {
      return fail(res, 400, "Too many items in the order.");
    }

    const items = [];

    for (const item of body.items) {
      const id = String(
        item.product_id ?? item.productId ?? item.id ?? ""
      );
      const product = PRODUCTS[id];

      if (!product) {
        return fail(
          res,
          400,
          "A product in your cart is invalid. Please refresh the page."
        );
      }

      const color = clean(item.color);
      const size = clean(item.size);
      const quantity = Number(item.quantity ?? item.qty ?? 1);

      if (!product.colors.includes(color)) {
        return fail(res, 400, `Invalid color for ${product.name}.`);
      }

      if (!SIZES.includes(size)) {
        return fail(res, 400, `Invalid size for ${product.name}.`);
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return fail(res, 400, "Invalid product quantity.");
      }

      items.push({
        product_id: id,
        name: product.name,
        price: product.price,
        color,
        size,
        quantity,
        line_total: product.price * quantity,
      });
    }

    const subtotal = items.reduce(
      (sum, item) => sum + item.line_total,
      0
    );

    const total = subtotal + SHIPPING;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase environment variables.");

      return fail(
        res,
        500,
        "Order service is not configured. Check Vercel environment variables."
      );
    }

    const order = {
      customer_name,
      phone,
      governorate,
      address,
      items,
      payment_method: "COD",
      subtotal,
      shipping: SHIPPING,
    };

    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/orders`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(order),
      }
    );

    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        "Supabase order insert failed:",
        response.status,
        responseText
      );

      return fail(
        res,
        500,
        "Order could not be saved. Check Vercel logs for the exact database error."
      );
    }

    let savedOrder = null;

    try {
      const result = responseText ? JSON.parse(responseText) : [];
      savedOrder = Array.isArray(result) ? result[0] : result;
    } catch {
      savedOrder = null;
    }

    return res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      order_id: savedOrder?.id ?? null,
      subtotal,
      shipping: SHIPPING,
      total,
    });
  } catch (error) {
    console.error("Order API error:", error);

    return fail(
      res,
      500,
      "An unexpected error occurred while saving your order."
    );
  }
};
