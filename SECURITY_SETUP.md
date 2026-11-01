# Sikkerhet – hva som er gjort og hva du må gjøre i Supabase

## Gjort i koden
- Hemmelige nøkler (Stripe, Supabase service key) ligger bare i Vercel Environment Variables, aldri i koden. Ingen nøkler finnes i repoet eller historikken.
- `.gitignore` blokkerer `.env`-filer.
- Prisene sjekkes på serveren (`api/checkout.js`). Nettleseren sender bare hvilken plan, ikke pris.
- Maks 5 innloggingsforsøk per time per brukernavn (på enheten), og maks 5 forsøk per time per brukernavn og 20 per IP på serveren for å avslutte Premium. Maks 20 betalingsøkter per time per IP.

## Du må gjøre selv: databaseregler (RLS) i Supabase
Supabase → SQL Editor → kjør dette. Det hindrer at hvem som helst kan skrive seg selv gratis Boost eller Premium (webhooken bruker service key og påvirkes ikke).

```sql
alter table "Jelp-services" enable row level security;

-- Fjern gamle åpne regler først (se Authentication → Policies), ellers gjelder de fortsatt.
create policy "anon read"   on "Jelp-services" for select to anon using (id <> 'ratelimit');
create policy "anon insert" on "Jelp-services" for insert to anon with check (id not in ('boosts','premium','ratelimit'));
create policy "anon update" on "Jelp-services" for update to anon using (id not in ('boosts','premium','ratelimit')) with check (id not in ('boosts','premium','ratelimit'));
create policy "anon delete" on "Jelp-services" for delete to anon using (id like 'an\_%');
```

## Det som fortsatt er svakt (krever større ombygging)
Innloggingen skjer i nettleseren mot raden `users`, som alle med den offentlige nøkkelen kan lese. Da kan 6-sifrede numre leses ut. Ekte "brukere leser bare sine egne rader" krever at innlogging og alle skrivinger går via serveren. Det er ikke bygget ennå.
