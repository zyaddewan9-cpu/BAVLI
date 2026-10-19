
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminToken = process.env.ADMIN_API_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!adminToken || !supabaseUrl || !serviceKey) {
    return res.status(500).json({
      error: "Server configuration is incomplete"
    });
  }

  const authHeader = req.headers.authorization || "";
  const suppliedToken = Buffer.from(
    authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  );
  const expectedToken = Buffer.from(adminToken);

  if (
    suppliedToken.length !== expectedToken.length ||
    !crypto.timingSafeEqual(suppliedToken, expectedToken)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };

  const validStatuses = [
    "new",
    "confirmed",
    "shipped",
    "delivered",
    "cancelled"
  ];

  function normalizeStatus(status) {
    const value = String(status || "").trim().toLowerCase();

    const aliases = {
      "جديد": "new",
      "تم التأكيد": "confirmed",
      "تم الشحن": "shipped",
      "تم التسليم": "delivered",
      "ملغي": "cancelled"
    };

    return aliases[value] || value;
  }

  async function supabaseRequest(path, options = {}) {
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      console.error("Admin orders Supabase status:", response.status);
      throw new Error("SUPABASE_REQUEST_FAILED");
    }

    return data;
  }

  try {
    // GET: تحميل الطلبات من قاعدة البيانات.
    if (req.method === "GET") {
      const query = new URLSearchParams({
        select: "*",
        order: "created_at.desc",
        limit: "100"
      });

      const rows = await supabaseRequest(`orders?${query.toString()}`);
      const orders = (Array.isArray(rows) ? rows : []).map(order => ({
        ...order,
        status: normalizeStatus(order.status)
      }));

      return res.status(200).json({
        success: true,
        orders
      });
    }

    // PATCH: تحديث حالة طلب محدد.
    const body = req.body || {};
    const id = String(body.id || "").trim();
    const status = normalizeStatus(body.status);

    if (!id || id.length > 200) {
      return res.status(400).json({
        error: "رقم الطلب غير صحيح."
      });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: "حالة الطلب غير صحيحة."
      });
    }

    const query = new URLSearchParams({
      id: `eq.${id}`,
      select: "*"
    });

    const updated = await supabaseRequest(
      `orders?${query.toString()}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify({ status })
      }
    );

    if (!Array.isArray(updated) || updated.length === 0) {
      return res.status(404).json({
        error: "الطلب غير موجود."
      });
    }

    return res.status(200).json({
      success: true,
      order: {
        ...updated[0],
        status: normalizeStatus(updated[0].status)
      }
    });
  } catch (error) {
    console.error("Admin orders API error:", error);

    return res.status(500).json({
      error: error.message === "SUPABASE_REQUEST_FAILED"
        ? "تعذر قراءة الطلبات أو تحديثها. راجع أسماء الأعمدة وصلاحيات قاعدة البيانات."
        : "حدث خطأ داخلي في الخادم."
    });
  }
};
