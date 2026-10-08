# is.gratis

De encyclopedie die één vraag beantwoordt: **is het gratis?**

Elke pagina geeft een oordeel in één woord (Ja, Nee, Meestal, Hangt ervan af), legt uit wanneer iets wel en niet gratis is, en beschrijft de verschillen per land. Iedereen met een account kan pagina's verbeteren. Bestaat een pagina nog niet, dan schrijft een taalmodel op verzoek een eerste versie. Die blijft een gemarkeerd concept, buiten zoekmachines, tot een mens hem heeft nagekeken.

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
- **web**: React Router 7 (framework-modus, Vite, server-side rendering), Mantine, Motion, Zustand. Rendert complete HTML met structured data en hreflang.
- **Varnish**: cachet pagina's een dag. De API stuurt bij elke wijziging een BAN naar elke Varnish-replica, zodat bezoekers direct de nieuwe versie zien.
- **PostgreSQL**: via de CloudNativePG-operator.

Buiten het taalmodel gebruikt niets een externe dienst. Ook het taalmodel kan in het cluster draaien (zie `deploy/k8s/optional/ollama.yaml`).

### Hoe het schaalt

Een gepubliceerde pagina wordt één keer gerenderd en daarna uit de Varnish-cache geserveerd. De web- en API-pods zijn stateless en schalen met een HorizontalPodAutoscaler op CPU. De worker schaalt optioneel met KEDA op het aantal wachtende concepten. Sessies staan in Postgres, dus elke pod kan elk verzoek afhandelen.

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

De API-tests draaien tegen een echte database: accounts, bewerkingen met conflictdetectie, terugzetten, de conceptwachtrij met retries en rate limits, de LLM-client tegen een nep-endpoint, sponsorplekken en cache-invalidatie.

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
- **Startinhoud nalopen.** De twaalf startpagina's zijn zorgvuldig geformuleerd maar niet tegen bronnen gecontroleerd. Loop ze na voor livegang.
- **Moderatie.** Iedereen met een account kan bewerken en terugzetten. Bij vandalisme zijn pagina-vergrendeling en een moderatorenoverzicht de volgende stap.
- **Vertalingen koppelen.** Door het taalmodel geschreven pagina's worden automatisch gekoppeld aan dezelfde pagina in andere talen. Met de hand gemaakte pagina's nog niet.
- **Rate limits** voor inloggen en bewerken gelden per pod. Het dure deel, conceptgeneratie, wordt wel centraal in Postgres begrensd.
