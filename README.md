# is.gratis

De encyclopedie die één vraag beantwoordt: **is het gratis?**

Elke pagina geeft een oordeel in één woord (Ja, Nee, Meestal, Hangt ervan af), legt uit wanneer iets wel en niet gratis is, en beschrijft de verschillen per land. Iedereen met een account kan pagina's verbeteren. Bestaat een pagina nog niet, dan schrijft een taalmodel op verzoek een eerste versie. Die blijft een gemarkeerd concept, buiten zoekmachines, tot een mens hem heeft nagekeken.

Naast het oordeel heeft elke pagina:

- een **Gratis-schaal** van 0 tot 5. Het niveau volgt uit het mechanisme: wie betaalt er, en wanneer. De onderbouwing met literatuur staat op `/methodology`.
- optioneel een **tijdprijs**: hoeveel werktijd iets kost bij een opgegeven uurloon, met bron. Dat is een gangbare maat in de economie.
- **achtergrond en wetenschap**, **kerncijfers** en **"Wist je dat?"**.
- een **emoji** en optioneel een **afbeelding**: geüpload of gegenereerd met een beeldmodel, en dan altijd gelabeld als AI.
- een **llms.txt**: dezelfde inhoud als Markdown voor taalmodellen. Zie [llms.txt](#llmstxt).

Inkomsten komen uit **gesponsorde aanbiedingen**: een apart, duidelijk gelabeld blok "Hier gratis te krijgen" onder het antwoord, voor proefpakketten, demo's en gratis abonnementen. Adverteerders vragen een plek aan via `/advertise`. Een beheerder keurt de aanvraag goed en stelt de looptijd in.

## Architectuur

```
                    ┌──────────── Kubernetes ─────────────────────────────────┐
 bezoeker ─► ingress ─► Varnish ──/api/*──► api (Fastify) ──► PostgreSQL     │
 water.is.gratis      (HTML-cache)          ▲    │  BAN bij elke wijziging    │
                        └── rest ──► web (React Router SSR) ─┘ (intern /api)   │
                                                                               │
                        worker ──► LLM (OpenAI-compatibel: OpenAI, vLLM, Ollama)│
                    └──────────────────────────────────────────────────────────┘
```

- **api**: Fastify, Drizzle ORM, Zod. Volledige REST-API met OpenAPI-documentatie op `/api/docs`.
- **worker**: zelfde image, verwerkt de wachtrij voor LLM-concepten. De wachtrij staat in Postgres (`FOR UPDATE SKIP LOCKED`), dus geen Redis of message broker nodig.
- **web**: React Router 7 (framework-modus, Vite, server-side rendering), Mantine, Motion, Zustand en Tabler-iconen. Rendert complete HTML met structured data, hreflang en llms.txt.
- **Varnish**: cachet pagina's een dag. De API stuurt bij elke wijziging een BAN naar elke Varnish-replica, zodat bezoekers direct de nieuwe versie zien.
- **PostgreSQL**: via de CloudNativePG-operator.

Buiten het taalmodel gebruikt niets een externe dienst. Ook het taalmodel kan in het cluster draaien (zie `deploy/k8s/optional/ollama.yaml`).

### Hoe het schaalt

Een gepubliceerde pagina wordt één keer gerenderd en daarna uit de Varnish-cache geserveerd. De web- en API-pods zijn stateless en schalen met een HorizontalPodAutoscaler op CPU. De worker schaalt optioneel met KEDA op het aantal wachtende concepten. Sessies staan in Postgres, dus elke pod kan elk verzoek afhandelen.

### Bewerken in Markdown, zoals Wikipedia

Wikipedia bewaart elke pagina als *wikitext*, een eigen opmaaktaal met sjablonen voor infoboxen. Bewerkers kiezen tussen die broncode en de VisualEditor, die dezelfde wikitext achter de schermen schrijft. Elke bewerking wordt een volledige nieuwe versie, en verschillen worden op de broncode berekend.

is.gratis werkt hetzelfde, maar met Markdown in plaats van wikitext:

- De editor heeft een **formulier** en een **Markdown-bron**. De bron is de hele pagina als één document. De gestructureerde velden staan bovenaan tussen `---`, als infoblok.
- Beide modi schrijven dezelfde gestructureerde inhoud. Fouten in de bron worden met regelnummer gemeld.
- Elke opslag is een volledige nieuwe versie. De geschiedenis toont de verschillen per sectie van de Markdown-bron.

```markdown
---
title: water
verdict: depends
emoji: 💧
scale: partial
scale-region: NL
---

> Hangt ervan af. Kraanwater kost geld, maar minder dan een cent per liter.

## Wanneer wel gratis

- **Openbare watertappunten** in steden en parken.

## Per land en regio

### Frankrijk [FR]: Ja

Bij een maaltijd hoort een karaf kraanwater gratis te zijn.
```

De omzetting staat in `packages/types/src/markdown.ts` en wordt door tests heen en terug gecontroleerd.

### llms.txt

Volgens de [llms.txt-conventie](https://llmstxt.org) biedt de site Markdown voor taalmodellen en andere tools. Alles wordt automatisch uit dezelfde inhoud gemaakt en door Varnish gecachet:

| Adres | Inhoud |
|---|---|
| `/llms.txt` | Wat is.gratis is, met links naar de talen en de methode |
| `/<taal>/llms.txt` | Alle gepubliceerde pagina's in die taal, met het korte antwoord |
| `/<taal>/<pagina>/llms.txt` | De hele pagina als Markdown, met oordeel, schaal en status |

Elke HTML-pagina verwijst ernaar met `<link rel="alternate" type="text/markdown">`.

### Afbeeldingen

Afbeeldingen staan in Postgres, dus er is geen aparte objectopslag nodig. Elke upload wordt gecontroleerd, rechtop gezet en ontdaan van metadata zoals GPS-locaties. Daarna wordt hij verkleind tot maximaal 1600 pixels en als WebP opgeslagen. De API levert drie breedtes voor responsieve afbeeldingen. Varnish cachet ze voor altijd, want de adressen veranderen nooit.

Beeldgeneratie gebruikt elk OpenAI-compatibel images-endpoint (`IMAGE_MODEL`, standaard uit). De prompt vraagt om een illustratie zonder tekst, logo's of herkenbare personen. Met `DRAFT_WITH_IMAGE=true` krijgt elk nieuw LLM-concept er automatisch een. Bewerkers kunnen ook zelf een afbeelding genereren of uploaden. Bij uploaden bevestigen ze dat ze het recht hebben om de afbeelding te gebruiken.

### Links tussen pagina's

Net als op Wikipedia linken pagina's naar elkaar:

- **Handmatig** met `[[onderwerp]]` of `[[onderwerp|eigen tekst]]`. `[[de huisarts]]` vindt ook de pagina `huisarts`.
- **Rode links.** Een link naar een pagina die nog niet bestaat, wordt rood. Wie erop klikt, kan een eerste versie laten schrijven.
- **Automatisch.** De eerste vermelding van een ander bestaand onderwerp wordt vanzelf klikbaar. Dat gebeurt alleen bij hele woorden en nooit binnen bestaande links. De opgeslagen tekst verandert daarbij niet; alleen de weergave krijgt de links.

### Logo en slogan

Het beeldmerk is een planeet met een gouden ring, een ster en een maan. De gratis dingen in het leven zijn de aarde, de zon, de maan en de sterren. De slogan staat in elke taal: *"Zon, maan en sterren zijn gratis. De rest zoeken wij uit."* Het merk staat als SVG in `packages/types/src/brand.ts`. Favicon, app-iconen en manifest maak je opnieuw met `node scripts/generate-brand-assets.mjs`.

### Index, feeds en deelkaarten

| Adres | Inhoud |
|---|---|
| `/a-z/<taal>` | Alle onderwerpen van A tot Z |
| `/<taal>/feed.xml` | RSS: nieuwe en bijgewerkte pagina's |
| `/<taal>/<pagina>/feed.xml` | RSS: elke wijziging van één pagina |
| `/api/og/<taal>/<pagina>.png` | Deelkaart van 1200 × 630 voor Open Graph en X/Twitter |

De deelkaarten worden met satori en sharp getekend, zonder lettertypen op de server. Het versienummer staat in de URL, zodat sociale netwerken na een bewerking een nieuwe kaart ophalen.

### MCP-server voor AI-agents

`/api/mcp` is een openbare MCP-server (Model Context Protocol, Streamable HTTP). Hij is stateless en alleen-lezen, zonder sleutel, en schaalt mee met de API-pods. De tools zijn `is_it_free`, `search`, `get_page` en `recent_changes`. Toevoegen aan Claude Code:

```bash
claude mcp add --transport http is-gratis https://is.gratis/api/mcp
```

De pagina `/developers` beschrijft de MCP-server, de REST-API, llms.txt en de feeds.

### Donkere modus

De site volgt de systeeminstelling. Via het schermpictogram in de kop kun je licht of donker vastzetten.

### Subdomeinen

`water.is.gratis` stuurt door naar `is.gratis/<taal>/water`. De taal volgt uit de talen waarin de pagina bestaat en de `Accept-Language` van de bezoeker. Lokaal werkt dit met `water.localhost`.

## Projectstructuur

```
apps/api/        Fastify-API, worker, databaseschema, migraties, startinhoud, tests
apps/web/        React Router-app (routes, componenten, stores, vertalingen)
packages/types/  Gedeelde types en hulpfuncties (taal kiezen, slugs)
deploy/docker/   Dockerfiles voor api/worker en web
deploy/k8s/      Kustomize-base, Varnish-configuratie en optionele KEDA/Ollama-manifesten
```

## Lokaal ontwikkelen

Vereisten: Node.js 22+ en PostgreSQL 16 (of Docker).

```bash
npm install
npm run build -w @isgratis/types

cp apps/api/.env.example apps/api/.env      # vul LLM_API_KEY of een lokaal model in
cp apps/web/.env.example apps/web/.env

npm run db:seed        # migraties + tien Nederlandse en twee Engelse startpagina's
npm run dev:api        # http://localhost:4000, docs op /api/docs
npm run dev:worker     # schrijft LLM-concepten
npm run dev:web        # http://localhost:5173
```

De dev-server van Vite stuurt `/api` door naar de API. API en webserver lezen hun `.env` zelf in; variabelen die al gezet zijn gaan voor.

### Alles in Docker

```bash
cp .env.example .env
docker compose up --build                  # http://localhost:8080
docker compose --profile llm up --build    # met een lokaal taalmodel via Ollama
```

### Tests

```bash
createdb isgratis_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/isgratis_test npm test
npm run typecheck
```

De API-tests draaien tegen een echte database: accounts, bewerkingen met conflictdetectie, terugzetten, de conceptwachtrij met retries en rate limits, de LLM-client tegen een nep-endpoint, afbeeldingen en beeldgeneratie, sponsorplekken en cache-invalidatie. De tests van het gedeelde pakket controleren dat de Markdown-bron zonder verlies heen en terug gaat.

## Uitrollen op Kubernetes

1. Installeer de [CloudNativePG-operator](https://cloudnative-pg.io) en, voor de wildcard-certificaten, cert-manager met een DNS-01-issuer.
2. Bouw de images en zet ze in je eigen registry:
   ```bash
   docker build -f deploy/docker/api.Dockerfile -t registry.example.com/isgratis/api:1 .
   docker build -f deploy/docker/web.Dockerfile -t registry.example.com/isgratis/web:1 .
   ```
3. Maak een overlay met je registry, ingress-class en issuer, of pas `deploy/k8s/base` aan.
4. Maak het secret:
   ```bash
   kubectl create namespace isgratis
   kubectl -n isgratis create secret generic isgratis-secrets \
     --from-literal=IP_HASH_SALT="$(openssl rand -hex 32)" \
     --from-literal=LLM_API_KEY=...
   ```
5. Rol uit en vul de startinhoud:
   ```bash
   kubectl apply -k deploy/k8s/base
   kubectl -n isgratis exec deploy/api -- node dist/db/seed.js
   ```
6. Zet je eigen e-mailadres in `ADMIN_EMAILS` in de ConfigMap en maak een account aan. Dat account kan sponsoraanvragen beoordelen op `/admin`.

Migraties draaien in een init-container van de API. Een Postgres advisory lock voorkomt dat replica's elkaar in de weg zitten.

## Taalmodel

De worker praat met elk endpoint dat de OpenAI chat-completions-API spreekt. Zet `LLM_BASE_URL` en `LLM_MODEL`:

| Waar | LLM_BASE_URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| Ollama in het cluster | `http://ollama:11434/v1` |
| vLLM in het cluster | `http://vllm:8000/v1` |

Het antwoord van het model moet aan exact hetzelfde schema voldoen als een menselijke bewerking. Ongeldige uitvoer wordt opnieuw geprobeerd en nooit opgeslagen. Het model mag een onderwerp weigeren als het geen zinnig onderwerp is.

## Nog open

- **E-mailverificatie en wachtwoordherstel.** Daarvoor is een mailserver nodig; die is nu bewust weggelaten.
- **Betalingen.** Sponsorplekken worden nu met de hand gefactureerd.
- **Licentie voor bijdragen.** Kies onder welke licentie bewerkers hun tekst bijdragen en vermeld dat bij het registreren.
- **Startinhoud nalopen.** De twaalf startpagina's zijn zorgvuldig geformuleerd, ook de achtergrondteksten, kerncijfers en weetjes, maar niet tegen bronnen gecontroleerd. Loop ze na voor livegang. Tijdprijzen zijn bewust leeg gelaten: die vragen een prijs en een uurloon met gecontroleerde bron.
- **Beeldmodel kiezen.** Beeldgeneratie staat standaard uit. Voor alles in eigen beheer is een zelf gehost model achter een OpenAI-compatibele server nodig, zoals LocalAI. Dat vraagt een GPU-node.
- **Moderatie.** Iedereen met een account kan bewerken en terugzetten. Bij vandalisme zijn pagina-vergrendeling en een moderatorenoverzicht de volgende stap.
- **Vertalingen koppelen.** Door het taalmodel geschreven pagina's worden automatisch gekoppeld aan dezelfde pagina in andere talen. Met de hand gemaakte pagina's nog niet.
- **Rate limits** voor inloggen en bewerken gelden per pod. Het dure deel, conceptgeneratie, wordt wel centraal in Postgres begrensd.
