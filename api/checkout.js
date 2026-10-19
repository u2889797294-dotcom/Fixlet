// POST /api/checkout  { plan: "boost50" | "boost100" | "premium", serviceId?: number, username: string }
// Creates a Stripe Checkout Session and returns { url }. Nothing is charged until the customer pays on Stripe's page.
const { sbGetRow, stripe } = require('./_shared');

const PLANS = {
  boost50:  { price: () => process.env.STRIPE_PRICE_BOOST50,  mode: 'payment',      needsService: true },
  boost100: { price: () => process.env.STRIPE_PRICE_BOOST100, mode: 'payment',      needsService: true },
  premium:  { price: () => process.env.STRIPE_PRICE_PREMIUM,  mode: 'subscription', needsService: false }
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if(req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    if(!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments are not configured yet.' });
    const { plan, serviceId, username } = req.body || {};
    const def = PLANS[plan];
    if(!def || !def.price()) return res.status(400).json({ error: 'Unknown plan.' });
    if(!username || typeof username !== 'string' || username.length > 20) return res.status(400).json({ error: 'Missing username.' });

    if(def.needsService){
      const services = await sbGetRow('global', process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY);
      const svc = Array.isArray(services) ? services.find(s => String(s.id) === String(serviceId)) : null;
      if(!svc) return res.status(404).json({ error: 'Service not found.' });
      if(String(svc.ownerCode).toLowerCase() !== username.toLowerCase()) return res.status(403).json({ error: 'You can only boost your own service.' });
    }

    const origin = process.env.SITE_URL || ('https://' + req.headers.host);
    const meta = { plan, username: username.toLowerCase(), serviceId: def.needsService ? String(serviceId) : '' };
    const form = {
      mode: def.mode,
      'line_items[0][price]': def.price(),
      'line_items[0][quantity]': '1',
      success_url: origin + '/?paid=1&plan=' + plan,
      cancel_url: origin + '/?paid=0',
      client_reference_id: meta.username,
      'metadata[plan]': meta.plan, 'metadata[username]': meta.username, 'metadata[serviceId]': meta.serviceId
    };
    if(def.mode === 'subscription'){
      form['subscription_data[metadata][plan]'] = meta.plan;
      form['subscription_data[metadata][username]'] = meta.username;
    }
    const session = await stripe('checkout/sessions', { method: 'POST', form });
    return res.status(200).json({ url: session.url });
  } catch(e){
    console.error('checkout error', e);
    return res.status(500).json({ error: 'Could not start checkout.' });
  }
};
