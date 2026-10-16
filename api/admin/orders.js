// BALVI Admin API
// Required environment variables:
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
// ADMIN_API_TOKEN

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const allowedStatuses = [
    "new",
    "confirmed",
    "shipped",
    "delivered",
    "cancelled"
  ];

  if (!["GET", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, PATCH");

    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const token = process.env.ADMIN_API_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!token || !supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: "Server configuration is incomplete"
    });
  }

  const authHeader = req.headers.authorization || "";
  const suppliedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  if (
    suppliedToken.length !== token.length ||
    !require("crypto").timingSafeEqual(
      Buffer.from(suppliedToken),
      Buffer.from(token)
    )
  ) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  try {
    const baseUrl = supabaseUrl.replace(/\/+$/, "");

    // GET: retrieve orders
    if (req.method === "GET") {
      const response = await fetch(
        `${baseUrl}/rest/v1/orders?select=*&order=created_at.desc&limit=100`,
        {
          method: "GET",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`
          }
        }
      );

      if (!response.ok) {
        console.error("Supabase GET status:", response.status);

        return res.status(502).json({
          error: "Could not retrieve orders"
        });
      }

      const orders = await response.json();

      return res.status(200).json({ orders });
    }

    // PATCH: update an order status
    const body = req.body || {};
    const id = body.id;
    const status = body.status;

    if (
      (typeof id !== "string" && typeof id !== "number") ||
      !String(id).trim() ||
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        error: "Invalid order ID or status"
      });
    }

    const query = new URLSearchParams({
      id: `eq.${String(id)}`,
      select: "id,status"
    });

    const response = await fetch(
      `${baseUrl}/rest/v1/orders?${query.toString()}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({ status })
      }
    );

    if (!response.ok) {
      console.error("Supabase PATCH status:", response.status);

      return res.status(502).json({
        error: "Could not update order status"
      });
    }

    const updated = await response.json();

    if (!updated.length) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    return res.status(200).json({
      success: true,
      order: updated[0]
    });

  } catch (error) {
    console.error("BALVI Admin API error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};