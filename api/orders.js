const PRODUCTS = {
  shadow_hoodie: {
    name: "Shadow Hoodie",
    price: 1450
  },
  essential_sweatshirt: {
    name: "Essential Sweatshirt",
    price: 1250
  },
  classic_hoodie: {
    name: "Classic Hoodie",
    price: 1400
  },
  1: {
    name: "Shadow Hoodie",
    price: 1450
  },
  2: {
    name: "Essential T-Shirt",
    price: 650
  },
  3: {
    name: "Essential Sweatshirt",
    price: 1250
  },
  4: {
    name: "Classic Jacket",
    price: 1800
  },
  5: {
    name: "Urban Cargo Pants",
    price: 1250
  }
};

const SHIPPING = 80;
const SIZES = ["S", "M", "L", "XL", "XXL"];

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const {
      customer_name,
      phone,
      governorate,
      address,
      items
    } = req.body || {};

    if (
      typeof customer_name !== "string" ||
      !customer_name.trim() ||
      typeof phone !== "string" ||
      !phone.trim() ||
      typeof governorate !== "string" ||
      !governorate.trim() ||
      typeof address !== "string" ||
      !address.trim() ||
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 20
    ) {
      return res.status(400).json({
        success: false,
        error: "من فضلك راجع بيانات الطلب."
      });
    }

    const cleanItems = [];

    for (const item of items) {
      const productId = String(item.product_id ?? item.id ?? "");
      const product = PRODUCTS[productId];
      const quantity = Number(item.quantity);
      const size = String(item.size || "").toUpperCase();
      const color =
        typeof item.color === "string" ? item.color.slice(0, 40) : null;

      if (
        !product ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10 ||
        (size && !SIZES.includes(size))
      ) {
        return res.status(400).json({
          success: false,
          error: "بيانات أحد المنتجات غير صحيحة."
        });
      }

      cleanItems.push({
        product_id: productId,
        name: product.name,
        price: product.price,
        quantity,
        size: size || null,
        color: color || null
      });
    }

    const subtotal = cleanItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase environment configuration");

      return res.status(500).json({
        success: false,
        error: "إعدادات تسجيل الطلبات غير مكتملة على السيرفر."
      });
    }

    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/orders`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          customer_name: customer_name.trim(),
          phone: phone.trim(),
          governorate: governorate.trim(),
          address: address.trim(),
          items: cleanItems,
          subtotal,
          shipping: SHIPPING,
          payment_method: "COD",
          status: "new"
        })
      }
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Supabase order error:", response.status, result);

      return res.status(500).json({
        success: false,
        error: "فشل حفظ الطلب في قاعدة البيانات. راجع إعدادات Supabase."
      });
    }

    const order = Array.isArray(result) ? result[0] : result;

    if (!order) {
      return res.status(500).json({
        success: false,
        error: "لم يتم تأكيد حفظ الطلب."
      });
    }

    return res.status(201).json({
      success: true,
      message: "تم استلام طلبك بنجاح!",
      order_number: order.order_number,
      order
    });
  } catch (error) {
    console.error("Order API error:", error);

    return res.status(500).json({
      success: false,
      error: "حصل خطأ أثناء تسجيل الطلب."
    });
  }
};