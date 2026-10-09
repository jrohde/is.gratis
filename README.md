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

### Bronnen en onderbouwing

Net als op Wikipedia moet elke bewering te controleren zijn:

- **Citaties.** Elke bron heeft een kenmerk. Een bewering verwijst ernaar met `[^kenmerk]`, direct achter de zin. Lezers zien een genummerde voetnoot die naar de bronnenlijst springt, met de titel van de bron bij het aanwijzen.
- **Beweringen zonder bron.** Een alinea of opsommingspunt zonder citatie krijgt het label **[bron?]** en een oranje stippellijn. Een kerncijfer zonder bron krijgt alleen het label. Lezers kunnen de markering uitzetten. Het korte antwoord bovenaan telt niet mee.
- **Onderbouwingsscore.** Elke pagina toont hoeveel beweringen een bron hebben. Ook llms.txt en MCP vermelden dit, met genummerde voetnoten.
- **Controle bij opslaan.** Een citatie naar een bron die niet bestaat, wordt geweigerd, zowel in de editor als in de API. Het taalmodel citeert alleen bronnen die een bewering echt dekken. De rest laat het open, zodat mensen het kunnen nakijken.
- **Dode links.** Als de worker niets te doen heeft, controleert hij de bronlinks van gepubliceerde pagina's, elke link eens per week (`SOURCE_CHECK_INTERVAL_DAYS`). Een werkende link krijgt een groen vinkje, een kapotte een oranje waarschuwing met de statuscode. Sites die bots weren (401, 403, 429) tellen als werkend. De controle weigert private en clusterinterne adressen, ook na een redirect of een DNS-antwoord dat ineens naar binnen wijst. Zo kan een bewerker de worker niet gebruiken om interne diensten aan te roepen.

### Nakijken, volgen en overleg

- **Nakijkwachtrij** (`/review`). Alle concepten van het taalmodel, oudste eerst, met hoeveel beweringen een bron hebben. Iedereen met een account kan publiceren of verbeteren. Moderators kunnen een onzinconcept verwijderen, admins ook een gepubliceerde pagina.
- **Concepten in bulk.** In het beheer zet een admin tientallen onderwerpen tegelijk in de wachtrij, met een startlijst per taal. Zo vul je een nieuwe taal snel, en de wachtrij zorgt dat alles door een mens wordt nagekeken.
- **Volglijst.** Met "Volgen" onderaan een pagina zie je op `/account/watchlist` welke pagina's sinds je laatste bezoek zijn gewijzigd.
- **Overlegpagina** (`/<taal>/<pagina>/talk`). Discussie over de pagina zelf, los van de tekst, net als op Wikipedia. Berichten zijn platte tekst. Moderators kunnen berichten verbergen.

### Per land

`/regions/<taal>` toont een wereldkaart: hoe donkerder het groen, hoe meer onderwerpen een antwoord voor dat land hebben. `/regions/<taal>/<land>` zet alles op een rij wat in één land gratis is en wat niet. Elke pagina heeft ook een kaart, gekleurd naar het oordeel per land. Klik op een land en het schuift bovenaan. De kaart is getekend uit Natural Earth (publiek domein) en zit in de site zelf, zonder kaartdienst of tegels. Opnieuw maken: `node scripts/generate-map-data.mjs`.

### Adverteren op bezoekersaantallen

De browser telt elke paginaweergave met één anoniem verzoek, zonder cookies of IP-adres. Bots die geen JavaScript draaien tellen niet mee. De prijs van een sponsorplek is een vaste basisprijs plus een bedrag per duizend weergaven in de laatste 30 dagen (`SPONSOR_BASE_PRICE_CENTS`, `SPONSOR_PRICE_PER_1000_VIEWS_CENTS`). Een adverteerder ziet de prijs meteen bij het kiezen van een pagina, en die prijs wordt bij de aanvraag vastgelegd. Admins zien in het beheer de best bekeken pagina's met hun prijs.

### Logo en slogan

Het logo is een **prijskaartje zonder prijs, gevuld met de hemel, dat aan de aarde hangt**. Aarde en kaartje zijn ongeveer even groot: wat gratis is, hangt aan de wereld zelf. Door het oogje van het kaartje kijk je naar de echte lucht van dat moment:

- **Overdag** zit de zon in het oogje, tussen wolkjes.
- **'s Avonds en 's ochtends** kleurt het kaartje naar schemering.
- **'s Nachts** staat de maan in het oogje, in de echte fase van die nacht. Het donkere deel heeft aardschijn, zodat ook een nieuwe maan als maan te herkennen is.
- **Op het zuidelijk halfrond** is de maan gespiegeld, zoals hij daar ook aan de hemel staat. Het halfrond volgt uit de tijdzone van de bezoeker.
- **De punt** in "is.gratis" is dezelfde zon of maan. Het favicon in het tabblad beweegt mee.

Iedere bezoeker ziet dus een ander logo, en morgen ziet het er weer anders uit. Het merk staat in `packages/types/src/brand.ts`, met tests voor de maanfase tegen gepubliceerde nieuwe en volle manen. Voor vaste plekken, zoals app-iconen en deelkaarten, is er een statische versie met een jonge maan. Die maak je opnieuw met `node scripts/generate-brand-assets.mjs`.

De slogan is **"Het antwoord is gratis."** Hij beantwoordt de vraag in de domeinnaam en betekent twee dingen tegelijk: het antwoord kost niets, en het antwoord ís gratis. Hij werkt woord voor woord in elke taal: *The answer is free*, *Die Antwort ist gratis*, *La respuesta es gratis*. Bij het logo hoort de zin **"Het mooiste prijskaartje is leeg."**

### Index, feeds en deelkaarten

| Adres | Inhoud |
|---|---|
| `/a-z/<taal>` | Alle onderwerpen van A tot Z |
| `/<taal>/feed.xml` | RSS: nieuwe en bijgewerkte pagina's |
| `/<taal>/<pagina>/feed.xml` | RSS: elke wijziging van één pagina |
| `/api/og/<taal>/<pagina>.png` | Deelkaart van 1200 × 630 voor Open Graph en X/Twitter |

De deelkaarten worden met satori en sharp getekend, zonder lettertypen op de server. Het versienummer staat in de URL, zodat sociale netwerken na een bewerking een nieuwe kaart ophalen.

### MCP-server voor AI-agents

`/api/mcp` is een openbare MCP-server (Model Context Protocol, Streamable HTTP). Hij is stateless en alleen-lezen, zonder sleutel, en schaalt mee met de API-pods. De tools zijn `is_it_free`, `free_in_country`, `search`, `get_page` en `recent_changes`. Toevoegen aan Claude Code:

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
- **Moderatie.** Iedereen met een account kan bewerken en terugzetten. Moderators kunnen concepten verwijderen en overlegberichten verbergen. Bij vandalisme is pagina-vergrendeling de volgende stap. Moderators benoem je nu nog in de database (`update users set role = 'moderator' ...`).
- **Meldingen.** De volglijst toont wijzigingen op de site zelf. Mail bij een wijziging vraagt een mailserver.
- **Vertalingen koppelen.** Door het taalmodel geschreven pagina's worden automatisch gekoppeld aan dezelfde pagina in andere talen. Met de hand gemaakte pagina's nog niet.
- **Rate limits** voor inloggen en bewerken gelden per pod. Het dure deel, conceptgeneratie, wordt wel centraal in Postgres begrensd.
