// Admin API: retrieves orders securely.
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ADMIN_API_TOKEN.

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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

  if (suppliedToken.length !== token.length) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  let authorized = true;

  for (let i = 0; i < token.length; i++) {
    if (suppliedToken[i] !== token[i]) {
      authorized = false;
    }
  }

  if (!authorized) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  try {
    const baseUrl = supabaseUrl.replace(/\/+$/, "");
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
      console.error("Supabase returned status:", response.status);

      return res.status(502).json({
        error: "Could not retrieve orders"
      });
    }

    const orders = await response.json();

    return res.status(200).json({
      orders
    });
  } catch (error) {
    console.error("Admin orders API error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};
