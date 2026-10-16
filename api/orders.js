 Vercel serverless function. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
const SHIPPING_FEE = 80;
const PRODUCTS = {
  shadow_hoodie: { name: "Shadow Hoodie", price: 1450 },
  essential_sweatshirt: { name: "Essential Sweatshirt", price: 1250 },
  classic_hoodie: { name: "Classic Hoodie", price: 1400 },
};
function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}
module.exports = async (req, res) => {
  if (req.method !== "POST") { res.setHeader("Allow","POST"); return send(res,405,{error:"Method not allowed"}); }
  const { customer_name, phone, governorate, address, items } = req.body || {};
  if (typeof customer_name !== "string" || customer_name.trim().length < 2 ||
      typeof phone !== "string" || phone.trim().length < 8 ||
      typeof governorate !== "string" || governorate.trim().length < 2 ||
      typeof address !== "string" || address.trim().length < 5 ||
      !Array.isArray(items) || items.length < 1 || items.length > 20)
    return send(res,400,{error:"Please provide valid customer details and items."});
  const cleanItems=[]; let subtotal=0;
  for (const item of items) {
    const product=PRODUCTS[item.product_id], quantity=Number(item.quantity), size=String(item.size||"").trim();
    const color=String(item.color||"").trim();
    if (!product || !Number.isInteger(quantity) || quantity<1 || quantity>10 ||
        !["S","M","L","XL","XXL"].includes(size))
      return send(res,400,{error:"One or more items are invalid."});
    subtotal += product.price*quantity;
    cleanItems.push({product_id:item.product_id,name:product.name,price:product.price,quantity,size,color:color.slice(0,40)});
  }
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return send(res,500,{error:"Order service is not configured yet."});
  try {
    const r=await fetch(`${url}/rest/v1/orders`,{method:"POST",headers:{
      "Content-Type":"application/json","apikey":key,"Authorization":`Bearer ${key}`,"Prefer":"return=representation"
    },body:JSON.stringify({
      customer_name:customer_name.trim().slice(0,100),phone:phone.trim().slice(0,30),
      governorate:governorate.trim().slice(0,80),address:address.trim().slice(0,500),
      items:cleanItems,subtotal,shipping:SHIPPING_FEE,payment_method:"Cash on Delivery",status:"new"
    })});
    const result=await r.json().catch(()=>null);
    if(!r.ok){console.error("Supabase insert failed",r.status,result);return send(res,500,{error:"Could not save order. Please try again."});}
    const order=Array.isArray(result)?result[0]:null;
    return send(res,201,{ok:true,order_number:order?.order_number||null,subtotal,shipping:SHIPPING_FEE,total:subtotal+SHIPPING_FEE});
  } catch(e) { console.error(e); return send(res,500,{error:"Order service temporarily unavailable."}); }
};
