
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH");
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
  const suppliedToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  const supplied = Buffer.from(suppliedToken);
  const expected = Buffer.from(adminToken);

  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };

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
      console.error("Supabase products API status:", response.status);
      throw new Error("SUPABASE_REQUEST_FAILED");
    }

    return data;
  }

  const validCategories = ["hoodies", "crewnecks", "zip-ups"];
  const validSizes = ["S", "M", "L", "XL", "XXL"];

  function validateProduct(body, partial = false) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return "بيانات المنتج غير صحيحة.";
    }

    const allowedFields = [
      "name", "category", "price", "sale_price",
      "image", "colors", "active"
    ];

    if (Object.keys(body).some(key => !allowedFields.includes(key))) {
      return "يوجد حقل غير مسموح به.";
    }

    if (!partial || "name" in body) {
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 150
      ) {
        return "اسم المنتج مطلوب وبحد أقصى 150 حرفًا.";
      }
    }

    if (!partial || "category" in body) {
      if (!validCategories.includes(body.category)) {
        return "القسم غير صحيح.";
      }
    }

    if (!partial || "price" in body) {
      if (
        typeof body.price !== "number" ||
        !Number.isFinite(body.price) ||
        body.price < 0 ||
        body.price > 10000000
      ) {
        return "السعر غير صحيح.";
      }
    }

    if ("sale_price" in body) {
      if (
        body.sale_price !== null &&
        (
          typeof body.sale_price !== "number" ||
          !Number.isFinite(body.sale_price) ||
          body.sale_price < 0 ||
          body.sale_price > 10000000
        )
      ) {
        return "سعر التخفيض غير صحيح.";
      }

      const effectivePrice = "price" in body ? body.price : null;

      if (
        body.sale_price !== null &&
        effectivePrice !== null &&
        body.sale_price > effectivePrice
      ) {
        return "سعر التخفيض لا يمكن أن يكون أعلى من السعر الأصلي.";
      }
    }

    if ("price" in body && !("sale_price" in body) && partial) {
      // سيتم فحص السعر مقابل سعر التخفيض الحالي داخل PATCH.
    }

    if ("image" in body) {
      if (
        body.image !== null &&
        (
          typeof body.image !== "string" ||
          body.image.length > 2000 ||
          !/^https:\/\/\S+$/i.test(body.image)
        )
      ) {
        return "رابط الصورة يجب أن يبدأ بـ HTTPS.";
      }
    }

    if (!partial || "colors" in body) {
      if (
        !Array.isArray(body.colors) ||
        body.colors.length > 30
      ) {
        return "قائمة الألوان غير صحيحة.";
      }

      const names = new Set();

      for (const color of body.colors) {
        if (
          !color ||
          typeof color !== "object" ||
          typeof color.name !== "string" ||
          !color.name.trim() ||
          color.name.length > 60
        ) {
          return "كل لون يجب أن يحتوي على اسم صحيح.";
        }

        const normalizedName = color.name.trim().toLowerCase();

        if (names.has(normalizedName)) {
          return "لا يمكن تكرار اللون نفسه.";
        }

        names.add(normalizedName);
      }
    }

    if ("active" in body && typeof body.active !== "boolean") {
      return "حالة المنتج غير صحيحة.";
    }

    return null;
  }

  try {
    // GET: عرض جميع المنتجات للمدير، بما فيها المخفية.
    if (req.method === "GET") {
      const query = new URLSearchParams({
        select: "id,name,category,price,sale_price,image,colors,active,created_at,updated_at",
        order: "created_at.desc"
      });

      const products = await supabaseRequest(`products?${query}`);

      return res.status(200).json({
        success: true,
        products: (products || []).map(product => ({
          ...product,
          price: Number(product.price),
          sale_price: product.sale_price == null
            ? null
            : Number(product.sale_price)
        }))
      });
    }

    const body = req.body || {};

    // POST: إضافة منتج جديد.
    if (req.method === "POST") {
      const validationError = validateProduct(body);

      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const product = {
        id: crypto.randomUUID(),
        name: body.name.trim(),
        category: body.category,
        price: body.price,
        sale_price: body.sale_price ?? null,
        image: body.image ?? null,
        colors: body.colors.map(color => ({
          name: color.name.trim()
        })),
        active: body.active ?? true
      };

      const created = await supabaseRequest("products", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(product)
      });

      return res.status(201).json({
        success: true,
        product: created?.[0] || null
      });
    }

    // PATCH: تعديل منتج موجود باستخدام id.
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id || id.length > 100) {
      return res.status(400).json({
        error: "معرّف المنتج غير صحيح."
      });
    }

    const changes = { ...body };
    delete changes.id;

    if (!Object.keys(changes).length) {
      return res.status(400).json({
        error: "لم يتم إرسال أي تعديلات."
      });
    }

    const validationError = validateProduct(changes, true);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // قراءة المنتج الحالي للتحقق من سعر التخفيض حتى عند تغيير السعر فقط.
    const currentQuery = new URLSearchParams({
      id: `eq.${id}`,
      select: "id,price,sale_price"
    });

    const current = await supabaseRequest(`products?${currentQuery}`);

    if (!current?.length) {
      return res.status(404).json({ error: "المنتج غير موجود." });
    }

    const oldProduct = current[0];
    const newPrice = changes.price ?? Number(oldProduct.price);
    const newSalePrice = "sale_price" in changes
      ? changes.sale_price
      : oldProduct.sale_price == null
        ? null
        : Number(oldProduct.sale_price);

    if (newSalePrice !== null && newSalePrice > newPrice) {
      return res.status(400).json({
        error: "سعر التخفيض لا يمكن أن يكون أعلى من السعر الأصلي."
      });
    }

    const update = {
      ...changes,
      updated_at: new Date().toISOString()
    };

    if ("name" in update) update.name = update.name.trim();

    if ("colors" in update) {
      update.colors = update.colors.map(color => ({
        name: color.name.trim()
      }));
    }

    const updateQuery = new URLSearchParams({
      id: `eq.${id}`,
      select: "id,name,category,price,sale_price,image,colors,active,updated_at"
    });

    const updated = await supabaseRequest(`products?${updateQuery}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(update)
    });

    if (!updated?.length) {
      return res.status(404).json({ error: "المنتج غير موجود." });
    }

    return res.status(200).json({
      success: true,
      product: updated[0]
    });
  } catch (error) {
    console.error("Admin products API error:", error);

    return res.status(500).json({
      error: error.message === "SUPABASE_REQUEST_FAILED"
        ? "تعذر حفظ المنتج في قاعدة البيانات."
        : "حدث خطأ داخلي في الخادم."
    });
  }
};
