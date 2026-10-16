const PRODUCTS = {
  "1": {
    name: "Black Logo Hoodie",
    price: 650,
    colors: ["Black"]
  },
  "2": {
    name: "British Flag Hoodie",
    price: 650,
    colors: ["Black"]
  },
  "3": {
    name: "Olive Logo Hoodie",
    price: 650,
    colors: ["Olive"]
  },
  "4": {
    name: "Black Plaid-Lined Hoodie",
    price: 750,
    colors: ["Black"]
  }
};

const SHIPPING = 80;
const SIZES = ["S", "M", "L", "XL", "XXL"];

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    const {
      customer_name,
      phone,
      governorate,
      address,
      items,
      payment_method
    } = req.body || {};

    // Validate customer information.
    if (
      typeof customer_name !== "string" ||
      customer_name.trim().length < 2 ||
      customer_name.trim().length > 100 ||
      typeof phone !== "string" ||
      phone.trim().length < 7 ||
      phone.trim().length > 25 ||
      typeof governorate !== "string" ||
      !governorate.trim() ||
      governorate.trim().length > 80