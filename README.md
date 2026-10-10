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

### Vertalen

Een nagekeken pagina kan het taalmodel vertalen naar de talen waarin ze nog ontbreekt: onderaan de pagina voor ingelogde gebruikers, of in het beheer voor alles tegelijk ("Alles vertalen" van de ene taal naar de andere). De vertaling houdt dezelfde bronnen, citaties, schaal en regio's, wordt aan hetzelfde onderwerp gekoppeld en komt als concept in de nakijkwachtrij. Concepten worden niet vertaald: dan zouden fouten zich over talen verspreiden. Vertalingen tellen mee in dezelfde limieten per uur als nieuwe concepten.

### Zoeken

Zoeken werkt zoals op Wikipedia, helemaal in de eigen database:

- **Volledige tekst** van elke pagina, met de woordenboeken van Postgres voor Nederlands, Engels, Duits en Spaans: "musea" vindt ook "museum". Titels wegen het zwaarst, dan het korte antwoord, dan de rest. Resultaten tonen fragmenten met de gevonden woorden gemarkeerd. "Aanhalingstekens" zoeken een woordgroep, een min sluit een woord uit. Postgres houdt de zoekindex zelf bij met een trigger, dus ook bij terugzetten en startinhoud.
- **"Bedoelde je…?"** bij tikfouten, via `pg_trgm`. Dat is een standaardextensie van Postgres die de eigenaar van de database zelf mag aanzetten; bij CloudNativePG is dat de app-gebruiker, dus de migratie regelt het.
- **Enter** gaat direct naar de pagina als die precies bestaat, anders naar `/search/<taal>?q=`. Elke pagina heeft een zoekvak in de kop.
- **Suggesties tijdens het typen:** eerst bestaande pagina's, daarna onderwerpen zonder pagina ("Zonnebrandcreme is gratis\* \*nog geen antwoord"). Kiezen laat een eerste versie schrijven. Die onderwerpen komen uit:
  1. rode links: onderwerpen waar andere pagina's naar linken;
  2. andere talen (voor Engels: onderwerpen die alleen in een andere taal bestaan);
  3. zoekopdrachten die minstens twee keer niets vonden, anoniem per dag geteld;
  4. de startlijst per taal;
  5. op de resultatenpagina het taalmodel: verwante onderwerpen, één keer per zoekterm gevraagd en daarna uit de database, met een limiet per uur over alle replica's (`SEARCH_RELATED_PER_HOUR`).

  Onderwerpen die het model ooit als onzin afwees, worden nooit voorgesteld.
- **Gevraagd:** de nakijkpagina toont de meest gevraagde onderwerpen zonder pagina, als takenlijst voor schrijvers. Ook via `GET /api/wanted`.
- De MCP-tool `search` zoekt in de volledige tekst.

### Insluiten, beveiligen en koppelen

- **Insluiten:** elke nagekeken pagina heeft een knop "Insluiten" met een kleine antwoordkaart ("Parkeren is gratis\* \*deels") als SVG en de HTML om op een andere site te plakken. De kaart blijft actueel en linkt terug. Adres: `/api/og/embed/<taal>/<pagina>.svg`, gecachet zoals de deelkaarten.
- **Beveiligen:** moderators kunnen een pagina beveiligen; dan kunnen alleen moderators haar bewerken of terugzetten. Anderen zien een slotje en worden naar de overlegpagina verwezen.
- **Vertalingen koppelen:** moderators kunnen een pagina koppelen aan een bestaande pagina in een andere taal, als iemand die los heeft geschreven.
- **Teller:** moderators zien in het menu hoeveel concepten en meldingen er wachten.
- **Rollen:** admins maken in het beheer (tabblad Gebruikers) iemand moderator of admin. Je eigen rol kun je niet veranderen, zodat je jezelf niet per ongeluk buitensluit.

### Voor bezoekers: gratis van de dag, aanbod en quiz

- **Gratis van de dag** op de homepage: elke dag een ander onderwerp dat (bijna) voor iedereen gratis is, voor iedereen hetzelfde. Een hash van de datum kiest; er is geen tabel of cronjob voor nodig.
- **Gratis deze week** (`/week/<taal>`): de zeven onderwerpen van de dag en wat er die week nieuw bij kwam. De feed `/<taal>/daily.xml` geeft elke dag één item ("Wifi is gratis\* \*door iemand anders"), klaar om met een eigen bot of een RSS-naar-sociale-media-dienst te delen.
- **Nu gratis te krijgen** (`/offers/<taal>`): alle goedgekeurde gesponsorde aanbiedingen op één plek, gemarkeerd als gesponsord en met het keurmerk. Meer zichtbaarheid voor adverteerders, dus meer waarde per plek.
- **Verlengen en opwaarderen:** op de statistiekenpagina vraagt de adverteerder met één klik dezelfde plek opnieuw aan, of hetzelfde aanbod op een pagina die vaker bekeken wordt, met de prijs van vandaag. Het wordt een nieuwe aanvraag die de beheerder goedkeurt.
- **Statistieken voor adverteerders:** bij een aanvraag krijgt de adverteerder een geheime link (`/advertise/stats/<token>`) met hoe vaak het aanbod getoond en aangeklikt is, per dag en in totaal. Getoond wordt in de browser geteld, klikken via een korte doorverwijzing (`/api/offers/<id>/go`); er wordt niets over bezoekers opgeslagen.
- **Quiz** (`/quiz/<taal>`): je ziet een bewering ("Onderwijs is gratis\*") en raadt de voetnoot op de gratis-schaal. Precies goed is 2 punten, één stap ernaast 1. Na tien vragen kun je je score delen.

### Per land

`/regions/<taal>` toont een wereldkaart: hoe donkerder het groen, hoe meer onderwerpen een antwoord voor dat land hebben. `/regions/<taal>/<land>` zet alles op een rij wat in één land gratis is en wat niet. Elke pagina heeft ook een kaart, gekleurd naar het oordeel per land. Klik op een land en het schuift bovenaan. De kaart is getekend uit Natural Earth (publiek domein) en zit in de site zelf, zonder kaartdienst of tegels. Opnieuw maken: `node scripts/generate-map-data.mjs`.

### Adverteren op bezoekersaantallen

De browser telt elke paginaweergave met één anoniem verzoek, zonder cookies of IP-adres. Bots die geen JavaScript draaien tellen niet mee. De prijs van een sponsorplek is een vaste basisprijs plus een bedrag per duizend weergaven in de laatste 30 dagen (`SPONSOR_BASE_PRICE_CENTS`, `SPONSOR_PRICE_PER_1000_VIEWS_CENTS`). Een adverteerder ziet de prijs meteen bij het kiezen van een pagina, en die prijs wordt bij de aanvraag vastgelegd. Admins zien in het beheer de best bekeken pagina's met hun prijs.

### Merk: het sterretje

Overal betekent een sterretje achter "gratis": let op, er zit een addertje onder het gras. Bij is.gratis wijst het sterretje naar het eerlijke antwoord.

- **Naam:** `is.gratis*`, het woord in inkt en alleen het sterretje in groen.
- **Slogan:** de voetnoot die de naam weer een vraag maakt: `*Is het?` (*Is it?*, *Ist es?*, *¿Lo es?*).
- **Pagina's** stellen hun onderwerp als bewering, "Water is gratis\*", met het antwoord als voetnoot. Die voetnoot is de trede op de gratis-schaal:

| Schaal | Voetnoot |
|---|---|
| 5 · Vrij goed | \*echt |
| 4 · Collectief betaald | \*via belasting |
| 3 · Betaald door een ander | \*door iemand anders |
| 2 · Deels gratis | \*deels |
| 1 · Alleen bij uitzondering | \*bij uitzondering |
| 0 · Altijd betaald | \*echt niet |

  Pagina's zonder schaal krijgen hun oordeel als voetnoot. Meervoud wordt "Musea zijn gratis\*" (een vinkje in de editor, en `plural: true` in de Markdown-bron). In de paginatitel en voor zoekmachines blijft de vraag staan: "Is water gratis?".
- **Keurmerk:** goedgekeurd gesponsord aanbod krijgt een ronde stempel met `IS.GRATIS* · NAGEKEKEN`.
- **Beeldmerk:** het sterretje heeft altijd zes armen, met één arm recht omhoog. Vijf armen zou een ster worden, een beoordeling. Favicon en app-icoon zijn een wit sterretje op een groen vlak. Alles staat in `packages/types/src/brand.ts`; de vaste bestanden maak je opnieuw met `node scripts/generate-brand-assets.mjs`.

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

## De bot

Een apart proces (`node dist/bot.js`, Deployment `bot`) dat elke minuut kijkt
of er taken klaarstaan. Elke taak kent zijn eigen *sleutels* (bijvoorbeeld
`mastodon:nl:2026-10-10`); per taak en sleutel draait hij precies één keer,
vastgelegd in de tabel `bot_runs`. Mislukt een run, dan probeert de bot het
nog maximaal twee keer; een run die langer dan 15 minuten hangt, mag opnieuw.
Meerdere bot-pods tegelijk is dus veilig, maar één is genoeg.

Taken nu:

- **Gratis van de dag** — post dagelijks (`BOT_DAILY_TIME`, standaard 07:00)
  het onderwerp van de dag naar Mastodon en/of Bluesky, per taal.
- **Aanbiedingen verlopen** — zet elk uur verlopen aanbiedingen op verlopen
  en ververst de cache.
- **Wat mensen zoeken laten schrijven** — elke nacht (`BOT_DRAFTS_TIME`,
  standaard 03:00) zet de bot per taal de meest gevraagde onderwerpen zonder
  pagina in de wachtrij van de worker (`BOT_DRAFTS_PER_DAY`, standaard 5).
  Gevraagd betekent: gezocht zonder resultaat (telt 1) of gelinkt vanaf een
  pagina (telt 3), over de laatste 30 dagen; minimaal `BOT_DRAFTS_MIN_WEIGHT`.
- **Redactie** — elke tien minuten leest een redactie-taalmodel de wachtende
  concepten (zie hieronder).
- **Opruimen** — vergeet dagelijks bot-runs ouder dan 30 dagen.

### De redactie

Concepten van het taalmodel hoeven niet meer op een mens te wachten. Het
redactiemodel krijgt dezelfde regels als de schrijver, plus de opdracht om
streng te zijn op feiten: klopt het oordeel, past de stap op de gratis-schaal,
horen de bronvermeldingen bij de bewering, is het neutraal? Vooraf controleert
de bot elke bron-URL; dode bronnen moet de redactie schrappen. Daarna:

- **publiceren** als het klopt;
- **verbeteren en publiceren** als de redactie alles zelf kan rechtzetten. Ze
  mag schrappen en herformuleren, maar nooit een bron toevoegen: dat wordt
  in de code geweigerd, en de nieuwe versie gaat door dezelfde controle als
  een menselijke bewerking;
- **laten liggen** als het onderwerp niet bestaat of de feiten te onzeker
  zijn. Het concept blijft dan in de nakijklijst, met de notitie van de
  redactie erbij.

Elke beslissing staat in de geschiedenis van de pagina (auteur: "redactie
(taalmodel)") en in het beheer onder **Bot**. Mislukt het drie keer bij
hetzelfde concept, dan laat de redactie het aan mensen. Een sterker model
voor de redactie dan voor het schrijven werkt het best: zet `EDITOR_MODEL`
(en eventueel `EDITOR_BASE_URL`, met `EDITOR_API_KEY` in de Secret). Uitzetten
kan met `EDITOR_ENABLED=false`; dan wachten concepten weer op mensen.

**Advertenties** gaan ook langs de redactie. Een gesponsorde aanbieding staat
onder het kopje "hier is het gratis", dus ze moet echt gratis zijn (geen
proefabonnement, geen aankoop), over het onderwerp gaan en neutraal zijn
verwoord. De bot leest de tekst van de landingspagina (met dezelfde
bescherming tegen interne adressen als de bronnencontrole) en geeft de
beheerder advies: akkoord, afgewezen of twijfel, eventueel met een neutralere
tekst die de beheerder bij goedkeuren kan overnemen. Zolang de redactie aan
staat, gaat een aanbieding zonder haar akkoord alleen live als de beheerder
bewust overstemt; dat wordt gelogd. De beheerder keurt altijd zelf goed,
omdat daar ook de betaling aan hangt.

Instellen (accounts en tokens horen in de Secret, niet in de ConfigMap):

| Variabele | Inhoud |
| --- | --- |
| `BOT_MASTODON` | JSON-lijst: `[{"lang":"nl","url":"https://social.example","token":"…"}]` |
| `BOT_BLUESKY` | JSON-lijst: `[{"lang":"en","service":"https://bsky.social","identifier":"…","password":"app-wachtwoord"}]` |
| `BOT_DRY_RUN_LANGUAGES` | Talen die alleen naar het log posten, bijvoorbeeld `nl,en` |
| `BOT_DAILY_TIME` | Tijdstip van de dagelijkse post (`HH:MM`) |

In het beheer staat een tabblad **Bot** met elke run: wat, wanneer, en of het
lukte.

Een taak toevoegen: schrijf in `apps/api/src/bot/tasks.ts` een `BotTask` met
een `name`, een `due(now)` die de sleutels teruggeeft die nu aan de beurt zijn
(`dailyAt`, `today` helpen), en een `run(ctx, key)` die het werk doet en een
korte omschrijving teruggeeft. Voeg hem toe aan `buildTasks`. Herhalen,
vastleggen en niet-dubbel-doen regelt de planner.

## Mailinglijsten

Losse lijsten, elk apart aan te melden; nieuwe lijsten kunnen erbij
(`MAILING_LISTS` in `packages/types`):

- **Gratis aanbiedingen van de week** (`offers`), per regio: de lopende
  gesponsorde aanbiedingen die de mailing hebben geboekt. Een aanbieding voor
  de EU gaat ook naar abonnees in EU-landen, een zonder regio naar iedereen.
  Is er niets voor iemands regio, dan krijgt die geen mail. Links lopen via de
  klikteller, zodat adverteerders zien wat de mail opleverde.
- **Gratis deze week** (`week`): het gratis ding van elke dag en de nieuwe
  pagina's.

Adverteerders vinken bij hun aanvraag "ook in de wekelijkse mail" aan, voor
`SPONSOR_MAILING_PRICE_CENTS` per maand extra (standaard € 5). Bij verlengen
gaat de optie mee, tegen de prijs van dat moment.

Inschrijven gaat met bevestiging per mail (double opt-in); zonder bevestiging
wordt niets verstuurd, en onbevestigde aanmeldingen verdwijnen na een week.
Bevestigen en afmelden gebeuren met een knop op de site, niet door het openen
van de link, omdat mailsystemen links openen om ze te scannen. Elke mail heeft
een afmeldlink en de `List-Unsubscribe`-kop voor afmelden met één klik
(RFC 8058). Afmelden verwijdert het adres. Het formulier antwoordt altijd
hetzelfde, zodat niemand kan nagaan wie ingeschreven is. Een andere regio of
taal kiezen gaat ook via een bevestiging en vervangt dan de oude inschrijving.

Mail wordt in de database klaargezet en door de bot verstuurd via je eigen
SMTP-server (`SMTP_URL` in de Secret). De wekelijkse mails gaan op
`MAIL_WEEKLY_DAY` om `MAIL_WEEKLY_TIME` de wachtrij in; iedereen krijgt ze
precies één keer, ook als de bot halverwege herstart. Is de mailserver
onbereikbaar, dan probeert de bot het later opnieuw, tot vijf keer. Zonder
`SMTP_URL` schrijft de bot de mail alleen naar zijn log; met docker compose
vangt Mailpit alle mail op (http://localhost:8025). In het beheer staan onder
**Bot** het aantal abonnees per lijst en taal en de stand van de wachtrij.

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
- **Meldingen.** De volglijst toont wijzigingen op de site zelf. Mail bij een wijziging vraagt een mailserver.
- **Rate limits** voor inloggen en bewerken gelden per pod. Het dure deel, conceptgeneratie, wordt wel centraal in Postgres begrensd.
