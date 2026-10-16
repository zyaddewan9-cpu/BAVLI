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
  }
};

const SHIPPING = 80;

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
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
        error: "من فضلك راجع بيانات الطلب."
      });
    }

    const cleanItems = [];

    for (const item of items) {
      const product = PRODUCTS[item.product_id];
      const quantity = Number(item.quantity);
      const size = String(item.size || "").toUpperCase();

      if (
        !product ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10 ||
        !["S", "M", "L", "XL", "XXL"].includes(size)
      ) {
        return res.status(400).json({
          error: "بيانات أحد المنتجات غير صحيحة."
        });
      }

      cleanItems.push({
        product_id: item.product_id,
        name: product.name,
        price: product.price,
        quantity,
        size
      });
    }

    const subtotal = cleanItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Server configuration is missing");
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/orders`,
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

    const result = await response.json();

    if (!response.ok) {
      console.error("Supabase order error:", result);

      return res.status(500).json({
        error: "حصلت مشكلة في تسجيل الطلب. حاول مرة تانية."
      });
    }

    return res.status(201).json({
      success: true,
      message: "تم استلام طلبك بنجاح!",
      order: result[0]
    });
  } catch (error) {
    console.error("Order API error:", error);

    return res.status(500).json({
      error: "حصل خطأ أثناء تسجيل الطلب."
    });
  }
};