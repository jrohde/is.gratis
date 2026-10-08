/**
 * Starting content: hand-written pages that show what a good page looks like.
 * Facts are deliberately phrased as rules rather than prices, which change.
 * Review before going live; editors improve them from there.
 */
import type { Language, PageContent } from '@isgratis/types';

export interface SeedPage {
  topicKey: string;
  lang: Language;
  slug: string;
  title: string;
  content: PageContent;
}

export const seedPages: SeedPage[] = [
  {
    topicKey: 'air',
    lang: 'nl',
    slug: 'lucht',
    title: 'lucht',
    content: {
      verdict: 'yes',
      summary:
        'Ja. De lucht die je inademt is overal gratis. Je betaalt hooguit voor een dienst rond lucht, zoals perslucht om een duikfles te vullen.',
      whenFree: [
        '- **Ademlucht**, overal en voor iedereen.',
        '- **Bandenlucht** bij veel tankstations, meestal bij een luchtpomp naast het tankeiland.',
        '- **Fietspompen** die gemeenten, stations of fietsenmakers openbaar neerzetten.',
      ].join('\n'),
      whenNotFree: [
        '- Bij sommige tankstations kost de bandenpomp een klein bedrag per beurt.',
        '- Een **duikfles** laten vullen met perslucht of nitrox kost geld bij een duikcentrum.',
        '- **Ingeblikte lucht** wordt als grap of souvenir verkocht. Je betaalt dan voor het blikje en het verhaal.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'yes',
          text: 'Bij veel tankstations is bandenlucht gratis. Waar een pomp geld kost, gaat het om een klein bedrag.',
        },
        {
          region: 'US',
          verdict: 'depends',
          text: 'In Californië moeten tankstations klanten die tanken gratis lucht en water voor de banden geven. In veel andere staten betaal je per beurt aan een muntautomaat.',
        },
        {
          region: 'GB',
          verdict: 'depends',
          text: 'Bandenpompen bij tankstations kosten vaak een klein bedrag per beurt.',
        },
      ],
      sources: [{ title: 'Atmosphere of Earth (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Atmosphere_of_Earth' }],
    },
  },
  {
    topicKey: 'water',
    lang: 'nl',
    slug: 'water',
    title: 'water',
    content: {
      verdict: 'depends',
      summary:
        'Hangt ervan af. Kraanwater thuis betaal je aan het drinkwaterbedrijf, maar een liter kost een fractie van een cent. Aan openbare watertappunten is het gratis, en in sommige landen moet een restaurant je gratis kraanwater geven.',
      whenFree: [
        '- **Openbare watertappunten** in steden en parken, en op sommige stations en luchthavens.',
        '- **Kraanwater in de horeca** in landen waar dat wettelijk geregeld is, zoals Frankrijk en Spanje. Zie de regio’s hieronder.',
        '- **Regenwater** dat je zelf opvangt.',
        '- Veel horecazaken geven op verzoek een glas kraanwater, ook waar dat niet verplicht is.',
      ].join('\n'),
      whenNotFree: [
        '- **Kraanwater thuis**: je betaalt per kubieke meter plus een vast bedrag per jaar. Omgerekend per liter is dat heel weinig.',
        '- **Flessenwater** kost vaak honderden keren meer dan kraanwater.',
        '- **In restaurants** mag een zaak in landen zonder wettelijke regel geld vragen voor kraanwater, of het niet schenken.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'depends',
          text: 'Kraanwater is van goede kwaliteit en kost per liter een fractie van een cent. Horeca mag geld vragen voor een kan kraanwater; er is geen wettelijke plicht om het gratis te geven.',
        },
        {
          region: 'FR',
          verdict: 'yes',
          text: 'Wie in een restaurant een maaltijd eet, krijgt op verzoek gratis een karaf kraanwater (*une carafe d’eau*).',
        },
        {
          region: 'ES',
          verdict: 'yes',
          text: 'Sinds de afvalwet van 2022 moeten horecazaken klanten de mogelijkheid bieden om gratis kraanwater te krijgen.',
        },
        {
          region: 'GB',
          verdict: 'usually',
          text: 'Zaken met een drankvergunning in Engeland, Schotland en Wales moeten klanten op verzoek gratis kraanwater geven.',
        },
        {
          region: 'DE',
          verdict: 'depends',
          text: 'Er is geen plicht om kraanwater gratis te schenken. Veel zaken rekenen er geld voor of serveren alleen flessenwater.',
        },
        {
          region: 'BE',
          verdict: 'depends',
          text: 'Er is geen wettelijke plicht. Veel zaken rekenen kraanwater af of bieden alleen flessenwater aan.',
        },
      ],
      sources: [
        { title: 'Drinkwater (Wikipedia)', url: 'https://nl.wikipedia.org/wiki/Drinkwater' },
        { title: 'Tap water (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Tap_water' },
      ],
    },
  },
  {
    topicKey: 'education',
    lang: 'nl',
    slug: 'onderwijs',
    title: 'onderwijs',
    content: {
      verdict: 'usually',
      summary:
        'Meestal. In Nederland zijn de basisschool en de middelbare school gratis: de overheid betaalt. Scholen mogen een vrijwillige ouderbijdrage vragen. Voor hoger onderwijs betaal je collegegeld.',
      whenFree: [
        '- **Basisonderwijs en voortgezet onderwijs** op scholen die door de overheid worden bekostigd: geen lesgeld.',
        '- **Schoolboeken en lesmateriaal** in het voortgezet onderwijs betaalt de school.',
        '- **De ouderbijdrage is vrijwillig.** Een school mag een kind niet uitsluiten van activiteiten omdat de ouders niet betalen.',
      ].join('\n'),
      whenNotFree: [
        '- **Particuliere scholen** zonder overheidsgeld rekenen schoolgeld.',
        '- **Mbo**: voor studenten van 18 jaar en ouder kan lesgeld gelden. Kijk bij DUO voor de actuele regels.',
        '- **Hbo en universiteit**: je betaalt wettelijk collegegeld, enkele duizenden euro’s per jaar.',
        '- **Extra’s** zoals schoolreizen, een eigen laptop of bijles zijn vaak niet gratis.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'usually',
          text: 'Gratis tot en met de middelbare school, met een vrijwillige ouderbijdrage. Collegegeld in het hoger onderwijs.',
        },
        {
          region: 'BE',
          verdict: 'usually',
          text: 'Het basisonderwijs is gratis. In Vlaanderen geldt een maximumfactuur voor extra kosten zoals uitstappen.',
        },
        {
          region: 'DE',
          verdict: 'usually',
          text: 'Openbare scholen zijn gratis. Aan de meeste openbare universiteiten betaal je geen collegegeld, wel een semesterbijdrage. Baden-Württemberg rekent collegegeld voor studenten van buiten de EU.',
        },
        {
          region: 'US',
          verdict: 'depends',
          text: 'Openbare scholen tot en met de high school zijn gratis. Colleges en universiteiten rekenen meestal hoge tuition fees.',
        },
      ],
      sources: [{ title: 'DUO', url: 'https://www.duo.nl' }],
    },
  },
  {
    topicKey: 'library',
    lang: 'nl',
    slug: 'bibliotheek',
    title: 'de bibliotheek',
    content: {
      verdict: 'usually',
      summary:
        'Meestal. Een openbare bibliotheek binnenlopen, er lezen en de wifi gebruiken is gratis. Boeken lenen is in Nederland voor kinderen tot 18 jaar meestal gratis; volwassenen betalen een abonnement.',
      whenFree: [
        '- **Binnenlopen en ter plekke lezen**, ook kranten en tijdschriften.',
        '- **Wifi en studieplekken** in de meeste vestigingen.',
        '- **Lidmaatschap voor kinderen en jongeren tot 18 jaar** bij de meeste Nederlandse bibliotheken.',
        '- Veel bibliotheken organiseren **gratis hulp** bij digitale vragen en formulieren.',
      ].join('\n'),
      whenNotFree: [
        '- **Abonnement voor volwassenen** om boeken te lenen; de prijs verschilt per bibliotheek.',
        '- **Te laat inleveren** kost bij sommige bibliotheken een boete; andere hebben boetes afgeschaft.',
        '- **Reserveren** en lenen uit een andere bibliotheek kan extra kosten.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'usually',
          text: 'Gratis voor wie jonger is dan 18 bij de meeste bibliotheken; volwassenen betalen een jaarabonnement.',
        },
        {
          region: 'GB',
          verdict: 'yes',
          text: 'Lid worden van een openbare bibliotheek is gratis.',
        },
        {
          region: 'US',
          verdict: 'yes',
          text: 'Een kaart van de openbare bibliotheek is meestal gratis voor inwoners van de gemeente of county.',
        },
        {
          region: 'DE',
          verdict: 'depends',
          text: 'Veel stadsbibliotheken vragen volwassenen een jaarbijdrage. Kinderen zijn vaak gratis lid.',
        },
      ],
      sources: [{ title: 'De Bibliotheek', url: 'https://www.bibliotheek.nl' }],
    },
  },
  {
    topicKey: 'public-transport',
    lang: 'nl',
    slug: 'openbaar-vervoer',
    title: 'openbaar vervoer',
    content: {
      verdict: 'no',
      summary:
        'Nee, meestal niet. In Nederland betaal je voor bus, tram, metro en trein. Kleine kinderen reizen gratis, en in Luxemburg is al het openbaar vervoer gratis.',
      whenFree: [
        '- **Kinderen tot 4 jaar** reizen in Nederland gratis mee met trein, bus, tram en metro.',
        '- **Sommige gemeenten** bieden bepaalde groepen gratis busvervoer, bijvoorbeeld ouderen buiten de spits. Dit verschilt per gemeente.',
        '- **Luxemburg**: het hele land, zie hieronder.',
      ].join('\n'),
      whenNotFree: [
        '- **Gewoon reizen in Nederland**: je betaalt per rit of met een abonnement, met de OV-chipkaart of je bankpas.',
        '- **Duitsland**: het Deutschlandticket is een betaald maandabonnement voor regionaal vervoer in het hele land.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'no',
          text: 'Betaald, behalve voor kinderen tot 4 jaar en lokale regelingen voor bepaalde groepen.',
        },
        {
          region: 'LU',
          verdict: 'yes',
          text: 'Sinds 1 maart 2020 is het openbaar vervoer in heel Luxemburg gratis. Alleen de eerste klas in de trein is betaald.',
        },
        {
          region: 'EE',
          verdict: 'depends',
          text: 'In Tallinn is het stadsvervoer gratis voor geregistreerde inwoners. Bezoekers betalen.',
        },
        {
          region: 'DE',
          verdict: 'no',
          text: 'Betaald. Het Deutschlandticket maakt reizen met regionaal vervoer in het hele land wel voordelig.',
        },
      ],
      sources: [
        { title: 'Free public transport (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Free_public_transport' },
        { title: 'NS', url: 'https://www.ns.nl' },
      ],
    },
  },
  {
    topicKey: 'parking',
    lang: 'nl',
    slug: 'parkeren',
    title: 'parkeren',
    content: {
      verdict: 'depends',
      summary:
        'Hangt ervan af. In Nederland bepaalt de gemeente waar en wanneer je betaalt. Buiten de centra is parkeren vaak gratis, in de binnensteden bijna nooit.',
      whenFree: [
        '- **Buiten de stadscentra** en in de meeste dorpen.',
        '- **In een blauwe zone** met een parkeerschijf, zolang je binnen de toegestane tijd blijft.',
        '- **Buiten de betaaltijden**: veel gemeenten rekenen ’s avonds of op zondag niets. Lees altijd het bord of de automaat.',
        '- **Bij veel supermarkten en winkelcentra**, soms met een maximale parkeerduur.',
      ].join('\n'),
      whenNotFree: [
        '- **Binnensteden en drukke wijken** met betaald parkeren of een vergunning voor bewoners.',
        '- **Parkeergarages** van gemeenten en bedrijven.',
        '- **Bij ziekenhuizen, stations en luchthavens** meestal wel. Een P+R-terrein is vaak goedkoper in combinatie met het openbaar vervoer.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'depends',
          text: 'Elke gemeente stelt eigen tarieven en tijden vast. Met een gehandicaptenparkeerkaart gelden in sommige gemeenten andere regels; vraag het na bij je gemeente.',
        },
        {
          region: 'BE',
          verdict: 'depends',
          text: 'Ook hier kennen veel steden een blauwe zone met parkeerschijf en betaald parkeren in het centrum.',
        },
        {
          region: 'DE',
          verdict: 'depends',
          text: 'Met een parkeerschijf (*Parkscheibe*) parkeer je op aangegeven plekken een beperkte tijd gratis. In centra betaal je meestal.',
        },
      ],
      sources: [],
    },
  },
  {
    topicKey: 'general-practitioner',
    lang: 'nl',
    slug: 'huisarts',
    title: 'de huisarts',
    content: {
      verdict: 'usually',
      summary:
        'Meestal. In Nederland betaal je voor een bezoek aan de huisarts niets extra: het valt onder de basisverzekering en niet onder het eigen risico. Je betaalt wel de premie van je zorgverzekering.',
      whenFree: [
        '- **Consult, telefonisch consult en huisbezoek** bij je eigen huisarts, als je verzekerd bent.',
        '- **De huisartsenpost** buiten kantooruren, op dezelfde manier.',
      ].join('\n'),
      whenNotFree: [
        '- **Bloedonderzoek in een lab** en **medicijnen** die de huisarts voorschrijft vallen wel onder het eigen risico.',
        '- **Zonder zorgverzekering** betaal je de rekening zelf. In Nederland is een basisverzekering verplicht.',
        '- **Doorverwijzing naar het ziekenhuis**: die zorg valt meestal onder het eigen risico.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'yes',
          text: 'Geen eigen risico voor huisartsenzorg. Wel voor het lab, medicijnen en de meeste zorg na een verwijzing.',
        },
        {
          region: 'BE',
          verdict: 'depends',
          text: 'Je betaalt het consult en krijgt een deel terug van je ziekenfonds. Met de derdebetalersregeling betaal je alleen je eigen aandeel (remgeld).',
        },
        {
          region: 'DE',
          verdict: 'yes',
          text: 'Wie wettelijk verzekerd is, betaalt sinds 2013 geen praktijkvergoeding meer.',
        },
        {
          region: 'GB',
          verdict: 'yes',
          text: 'Een huisarts van de NHS is gratis op het moment dat je hem bezoekt.',
        },
        {
          region: 'US',
          verdict: 'no',
          text: 'Je betaalt per bezoek, afhankelijk van je verzekering via een vast bedrag (copay) of het volledige tarief.',
        },
      ],
      sources: [{ title: 'Zorginstituut Nederland', url: 'https://www.zorginstituutnederland.nl' }],
    },
  },
  {
    topicKey: 'wifi',
    lang: 'nl',
    slug: 'wifi',
    title: 'wifi',
    content: {
      verdict: 'usually',
      summary:
        'Meestal. Op veel openbare plekken is wifi gratis, zoals in bibliotheken, treinen en horeca. In vliegtuigen en sommige hotels betaal je ervoor.',
      whenFree: [
        '- **Bibliotheken, gemeentehuizen en veel stations.**',
        '- **In de trein** bij de NS.',
        '- **Horeca en winkels**, vaak met een wachtwoord op de bon of aan de muur.',
        '- **Gemeentelijke hotspots**, in de EU soms met subsidie van het programma WiFi4EU.',
      ].join('\n'),
      whenNotFree: [
        '- **In vliegtuigen** is wifi meestal betaald, soms met een gratis variant alleen voor berichten.',
        '- **Sommige hotels en campings** rekenen voor wifi of voor een snellere verbinding.',
        '- **Thuis** betaal je een internetabonnement.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'usually',
          text: 'Gratis wifi is wijdverbreid in openbare gebouwen, treinen en horeca.',
        },
        {
          region: 'EU',
          verdict: 'usually',
          text: 'Met WiFi4EU heeft de EU gemeenten geholpen gratis wifi aan te bieden op openbare plekken.',
        },
      ],
      sources: [{ title: 'Wifi (Wikipedia)', url: 'https://nl.wikipedia.org/wiki/Wifi' }],
    },
  },
  {
    topicKey: 'public-toilet',
    lang: 'nl',
    slug: 'toilet',
    title: 'een openbaar toilet',
    content: {
      verdict: 'depends',
      summary:
        'Hangt ervan af. In Nederland kosten toiletten op stations en in winkelcentra vaak een klein bedrag. In musea, bibliotheken en gemeentelijke gebouwen kun je meestal gratis terecht.',
      whenFree: [
        '- **Openbare gebouwen** zoals bibliotheken, gemeentehuizen en musea, vaak ook voor wie geen kaartje heeft voor de collectie.',
        '- **Als klant** in de horeca of een winkel met een klantentoilet.',
        '- **Gemeentelijke openbare toiletten** zijn in sommige steden gratis.',
      ].join('\n'),
      whenNotFree: [
        '- **Stations, winkelcentra en snelwegrestaurants** rekenen vaak een klein bedrag.',
        '- **Horeca** mag een toilet weigeren aan wie geen klant is, of er geld voor vragen.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'depends',
          text: 'Vaak betaald op stations en in winkelgebieden. Apps zoals HogeNood tonen toiletten in de buurt.',
        },
        {
          region: 'FR',
          verdict: 'yes',
          text: 'De openbare toiletcabines op straat in Parijs (*sanisettes*) zijn gratis.',
        },
        {
          region: 'DE',
          verdict: 'depends',
          text: 'Bij snelwegrestaurants betaal je meestal, soms met een bon die je in de winkel kunt verrekenen.',
        },
      ],
      sources: [],
    },
  },
  {
    topicKey: 'museum',
    lang: 'nl',
    slug: 'museum',
    title: 'een museum',
    content: {
      verdict: 'depends',
      summary:
        'Hangt ervan af. In Nederland betalen volwassenen meestal entree, maar veel grote musea zijn gratis voor wie jonger is dan 18. In het Verenigd Koninkrijk zijn de nationale musea gratis.',
      whenFree: [
        '- **Kinderen en jongeren**: veel Nederlandse musea, waaronder het Rijksmuseum, zijn gratis tot 18 jaar.',
        '- **Met een Museumkaart** kom je zonder extra betaling binnen bij honderden musea. De kaart zelf kost wel geld.',
        '- **Kleine en gemeentelijke musea** zijn soms helemaal gratis.',
      ].join('\n'),
      whenNotFree: [
        '- **Entree voor volwassenen** bij de meeste Nederlandse musea.',
        '- **Tijdelijke tentoonstellingen** kosten soms extra, ook in musea die verder gratis zijn.',
      ].join('\n'),
      regions: [
        {
          region: 'NL',
          verdict: 'depends',
          text: 'Betaald voor volwassenen, vaak gratis tot 18 jaar. Een Museumkaart loont als je vaak gaat.',
        },
        {
          region: 'GB',
          verdict: 'yes',
          text: 'De vaste collecties van nationale musea zoals het British Museum en de National Gallery zijn gratis.',
        },
        {
          region: 'FR',
          verdict: 'depends',
          text: 'Veel nationale musea zijn gratis voor inwoners van de EU jonger dan 26.',
        },
        {
          region: 'US',
          verdict: 'depends',
          text: 'De Smithsonian-musea in Washington zijn gratis. Elders betaal je meestal entree.',
        },
      ],
      sources: [
        { title: 'Museumkaart', url: 'https://www.museumkaart.nl' },
        { title: 'Rijksmuseum', url: 'https://www.rijksmuseum.nl' },
      ],
    },
  },
  {
    topicKey: 'air',
    lang: 'en',
    slug: 'air',
    title: 'air',
    content: {
      verdict: 'yes',
      summary:
        'Yes. The air you breathe is free everywhere. You only pay for services around air, such as filling a scuba tank.',
      whenFree: [
        '- **Breathing air**, everywhere, for everyone.',
        '- **Tyre air** at many petrol stations.',
        '- **Public bike pumps** placed by cities, stations or bike shops.',
      ].join('\n'),
      whenNotFree: [
        '- Some petrol stations charge a small fee for the tyre pump.',
        '- **Filling a scuba tank** with compressed air or nitrox costs money at a dive centre.',
        '- **Canned air** is sold as a joke or souvenir.',
      ].join('\n'),
      regions: [
        {
          region: 'US',
          verdict: 'depends',
          text: 'In California, petrol stations must give customers who buy fuel free air and water for their tyres. In many other states you pay at a coin-operated machine.',
        },
        {
          region: 'GB',
          verdict: 'depends',
          text: 'Tyre pumps at petrol stations often charge a small fee per use.',
        },
      ],
      sources: [{ title: 'Atmosphere of Earth (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Atmosphere_of_Earth' }],
    },
  },
  {
    topicKey: 'water',
    lang: 'en',
    slug: 'water',
    title: 'water',
    content: {
      verdict: 'depends',
      summary:
        'It depends. You pay your water company for tap water at home, though a litre costs a fraction of a cent. Public drinking fountains are free, and in some countries restaurants must give you tap water for free.',
      whenFree: [
        '- **Public drinking fountains** in cities, parks and some stations and airports.',
        '- **Tap water in restaurants and bars** where the law requires it, such as in the UK, France and Spain.',
        '- **Rainwater** you collect yourself.',
      ].join('\n'),
      whenNotFree: [
        '- **Tap water at home**: you pay per cubic metre plus a standing charge.',
        '- **Bottled water** often costs hundreds of times more than tap water.',
        '- **In restaurants** in countries without such a law, a venue may charge for tap water or not serve it.',
      ].join('\n'),
      regions: [
        {
          region: 'GB',
          verdict: 'usually',
          text: 'Licensed premises in England, Scotland and Wales must provide free tap water on request.',
        },
        {
          region: 'FR',
          verdict: 'yes',
          text: 'With a meal in a restaurant you can ask for a free carafe of tap water (*une carafe d’eau*).',
        },
        {
          region: 'ES',
          verdict: 'yes',
          text: 'Since the 2022 waste law, bars and restaurants must offer customers free tap water.',
        },
        {
          region: 'DE',
          verdict: 'depends',
          text: 'There is no obligation to serve tap water for free. Many places charge for it or only serve bottled water.',
        },
      ],
      sources: [
        { title: 'Tap water (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Tap_water' },
        { title: 'Drinking fountain (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Drinking_fountain' },
      ],
    },
  },
];
