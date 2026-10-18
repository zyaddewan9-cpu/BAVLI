
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({
      success: false,
      message: "Server configuration is incomplete"
    });
  }

  try {
    const url = supabaseUrl.replace(/\/+$/, "");
    const query = new URLSearchParams({
      select: "id,name,category,price,sale_price,image,colors",
      active: "eq.true",
      order: "created_at.desc"
    });

    const response = await fetch(
      `${url}/rest/v1/products?${query.toString()}`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`
        }
      }
    );

    if (!response.ok) {
      console.error("Products API status:", response.status);

      return res.status(502).json({
        success: false,
        message: "Could not load products"
      });
    }

    const products = await response.json();

    return res.status(200).json({
      success: true,
      products: products.map(product => ({
        ...product,
        price: Number(product.price),
        sale_price: product.sale_price == null
          ? null
          : Number(product.sale_price)
      }))
    });
  } catch (error) {
    console.error("Products API error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
