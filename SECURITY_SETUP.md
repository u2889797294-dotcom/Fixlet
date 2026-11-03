# Sikkerhet – hva som er gjort og hva du må gjøre i Supabase

## Gjort i koden
- Hemmelige nøkler (Stripe, Supabase service key) ligger bare i Vercel Environment Variables, aldri i koden. Ingen nøkler finnes i repoet eller historikken.
- `.gitignore` blokkerer `.env`-filer.
- Prisene sjekkes på serveren (`api/checkout.js`). Nettleseren sender bare hvilken plan, ikke pris.
- Maks 5 innloggingsforsøk per time per brukernavn (på enheten), og maks 5 forsøk per time per brukernavn og 20 per IP på serveren for å avslutte Premium. Maks 20 betalingsøkter per time per IP.

## Ny sikker innlogging (testes i `kopi.html`)
- Passord lagres aldri i klartekst: serveren lagrer en scrypt-hash i raden `accounts`. Nettleseren får bare en signert innloggingsnøkkel (30 dager).
- Alt som endrer data går via `/api/auth` og `/api/data`: registrering, innlogging, profil, annonser, meldinger, sletting av konto.
- Serveren sjekker eier: ingen kan redigere eller slette andres annonser, og samtaler ligger i egne rader (`chat_<id>`) som bare serveren leser.
- Begrensning mot gjetting: 5 feil per time per brukernavn, 30 per IP. Maks 5 nye kontoer per time per IP.

### Miljøvariabler i Vercel (Settings → Environment Variables)
- `SUPABASE_SERVICE_KEY` (finnes fra før)
- `SESSION_SECRET` (valgfri, lang tilfeldig tekst; hvis den mangler brukes service key)
- `ADMIN_KEY` (lang tilfeldig tekst, brukes bare til å nullstille glemt passord)

### Glemt passord (du nullstiller manuelt)
```bash
curl -X POST https://DITT-DOMENE/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"adminResetPassword","adminKey":"DIN_ADMIN_KEY","username":"Brukernavn","newPassword":"nyttPassord123"}'
```
Gi brukeren det nye passordet, og be dem bytte det under Profil.

## Du må gjøre selv: databaseregler (RLS) i Supabase
Kjør dette ETTER at `kopi.html` er byttet inn som `index.html`. Nettleseren trenger da bare å LESE offentlige rader. Alle skrivinger går via serveren (service key omgår RLS).

```sql
alter table "Jelp-services" enable row level security;

-- Fjern gamle åpne regler først (Authentication → Policies), ellers gjelder de fortsatt.
create policy "anon read public" on "Jelp-services" for select to anon
  using (id in ('svc2','boosts','premium','banned','forceLogout'));
-- Ingen insert/update/delete for anon.
```
Rader som `accounts`, `av_*`, `chat_*`, `chatidx` og `ratelimit` kan da ikke leses utenfra.

## Admin-panelet (admin.html)
Admin-panelet går nå via serveren (`/api/admin`) og bruker `ADMIN_KEY` fra Vercel. Det er ikke noe passord i filen lenger, og panelet skriver ikke direkte til databasen. Det virker derfor også etter at databasereglene er låst. Det gamle passordet i filen lå åpent i repoet og i git-historikken, så regn det som kjent for andre.

## Det som fortsatt er svakt
Aktivitetsdata ved «Godta alle» skrives fortsatt direkte fra nettleseren til `an_<bruker>`. Det slutter å virke når reglene over er på plass, og må flyttes til serveren. Banneord-filteret for innhold sjekkes bare i nettleseren.
