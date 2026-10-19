# Stripe – slik slår du på betaling i Fixvice

Koden er ferdig (`api/checkout.js`, `api/stripe-webhook.js`). Ingen hemmelige nøkler ligger i `index.html`.
Betaling er **av** til du setter `const PAYMENTS_LIVE = true;` i `index.html`.

## 1. Opprett produkter i Stripe (Dashboard → Product catalogue)
Du kan bruke enten pris-ID (`price_...` i miljøvariabel) ELLER produkt-ID (`prod_...`). Med produkt-ID setter koden prisen selv (7,90 / 9,90 / 9 €). Boost +50 % bruker allerede `prod_VTAQDDQ5ULsLaX`; sett `STRIPE_PRODUCT_BOOST100` og `STRIPE_PRODUCT_PREMIUM` for de to andre (eller legg dem inn i `api/checkout.js`).
| Produkt | Pris | Type | Miljøvariabel |
|---|---|---|---|
| Boost +50 % | 7,90 € | Engangs | `STRIPE_PRICE_BOOST50` (price_...) |
| Boost +100 % | 9,90 € | Engangs | `STRIPE_PRICE_BOOST100` |
| Premium | 9 € | Ukentlig abonnement | `STRIPE_PRICE_PREMIUM` |

## 2. Webhook (Developers → Webhooks → Add endpoint)
- URL: `https://DIN-SIDE.vercel.app/api/stripe-webhook`
- Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`
- Kopier «Signing secret» (whsec_...) → `STRIPE_WEBHOOK_SECRET`

## 3. Miljøvariabler i Vercel (Project → Settings → Environment Variables)
- `STRIPE_SECRET_KEY` – Stripe secret key (sk_test_... først, sk_live_... senere)
- `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BOOST50`, `STRIPE_PRICE_BOOST100`, `STRIPE_PRICE_PREMIUM`
- `SUPABASE_SERVICE_KEY` – Supabase secret key (kun her, aldri i koden)
- (valgfritt) `SITE_URL` – f.eks. `https://fixvice.no`
Redeploy etter at variablene er lagt inn.

## 4. Test
Bruk testmodus og kortet `4242 4242 4242 4242`. Sett `PAYMENTS_LIVE = true`, push, kjøp en boost og sjekk at tjenesten får «Sponsored».
Bytt til live-nøkler først når testen virker.

## Viktig før du går live
Boosts lagres i Supabase-radene `boosts` og `premium`, og bare webhooken skal skrive dem. Fordi siden bruker den offentlige nøkkelen,
bør du låse skrivetilgang for disse radene (Row Level Security) så ingen kan gi seg selv gratis boost.
