/**
 * Text of the methodology page. Dutch and English are written out; German and Spanish readers
 * get the English text until someone translates it.
 */
import type { FreeType, Language } from '@isgratis/types';

export interface Methodology {
  intro: string;
  scaleTitle: string;
  scaleIntro: string;
  examples: Record<FreeType, string>;
  levelHeader: string;
  typeHeader: string;
  exampleHeader: string;
  why: string;
  basisTitle: string;
  basis: string;
  timeTitle: string;
  time: string;
  limitsTitle: string;
  limits: string;
  sourcesTitle: string;
  sources: string;
  logoTitle: string;
  logo: string;
  referencesTitle: string;
}

const nl: Methodology = {
  intro:
    '“Gratis” is minder eenvoudig dan het lijkt: bijna alles kost iemand ergens iets. Daarom kijkt is.gratis naar twee meetbare dingen. **Waarom** is iets gratis, en **hoeveel werktijd** kost het als je er wel voor betaalt?',
  scaleTitle: 'De Gratis-schaal, van 0 tot 5',
  scaleIntro:
    'Elke pagina krijgt een niveau op basis van het mechanisme achter de prijs: wie betaalt, en wanneer. Het niveau volgt één op één uit dat mechanisme.',
  examples: {
    free_good: 'lucht',
    collective: 'de basisschool, de huisarts in Nederland',
    third_party: 'wifi in een café, parkeren bij de supermarkt',
    partial: 'een museum dat gratis is voor kinderen',
    exception: 'openbaar vervoer in Nederland',
    paid: 'een treinkaartje voor een volwassene',
  },
  levelHeader: 'Niveau',
  typeHeader: 'Mechanisme',
  exampleHeader: 'Voorbeeld',
  why:
    'De schaal meet een mechanisme en geen mening. Twee bewerkers die het eens zijn over de feiten (wie betaalt er, en op welk moment) komen daardoor op hetzelfde niveau uit. Het is een ordinale schaal: 4 is vrijer dan 3, maar niet in een vaste maat “één punt” vrijer.',
  basisTitle: 'Wetenschappelijke basis',
  basis: [
    '- **Vrije en economische goederen.** Een klassiek onderscheid in de economie: iets krijgt pas een prijs als het schaars is. Dat is niveau 5 tegenover de rest.',
    '- **Collectieve goederen.** Paul Samuelson beschreef in 1954 waarom sommige voorzieningen collectief worden betaald. Onderwijs en zorg worden daarnaast vaak als meritgoed gezien: de overheid betaalt omdat iedereen er baat bij heeft. Dat is niveau 4.',
    '- **De vormen van gratis.** Chris Anderson onderscheidt in *Free* (2009) kruissubsidies, markten waarin een derde partij betaalt, zoals adverteerders, en freemium. Die vormen zijn niveau 3 en 2.',
    '- **Het nul-prijs-effect.** Shampanier, Mazar en Ariely toonden in 2007 dat mensen “gratis” onevenredig zwaar laten wegen, ook als een betaald alternatief beter is. Daarom loont het om precies te zijn over wat gratis echt betekent.',
  ].join('\n'),
  timeTitle: 'De tijdprijs',
  time: [
    'Kost iets wel geld, dan drukken we de prijs uit in werktijd: hoe lang moet je werken om het te betalen?',
    '',
    '**Tijdprijs = prijs ÷ uurloon.**',
    '',
    'Economen gebruiken die maat om prijzen tussen landen en eeuwen te vergelijken. William Nordhaus berekende in 1996 hoeveel uur werk licht kostte, van olielamp tot gloeilamp. Gale Pooley en Marian Tupy bouwden er in 2022 hun Simon Abundance Index op.',
    '',
    '*Rekenvoorbeeld:* kost iets 0,15 cent en verdien je 20 euro per uur, dan werk je 0,0015 ÷ 20 × 3600 = 0,27 seconden. Bij elke tijdprijs op is.gratis staan de prijs, het uurloon en een bron voor beide.',
  ].join('\n'),
  limitsTitle: 'Wat we niet meten',
  limits:
    'De schaal zegt niets over kwaliteit of waarde, alleen over de prijs voor jou. Het oordeel bovenaan een pagina (Ja, Nee, Meestal, Hangt ervan af) is de korte samenvatting; de schaal legt uit waarom. Elke beoordeling geldt voor één regio, die erbij staat.',
  sourcesTitle: 'Bronnen en onderbouwing',
  sources: [
    'Net als op Wikipedia moet elke bewering te controleren zijn. Bewerkers verwijzen achter een zin naar een bron met `[^kenmerk]`; lezers zien dan een voetnoot zoals [1] die naar de bron springt.',
    '',
    'Een alinea of opsommingspunt zonder bron krijgt het label **[bron?]** en een oranje stippellijn. Dat betekent niet dat het onjuist is, alleen dat niemand het nog heeft onderbouwd. Bovenaan elke pagina staat hoeveel beweringen een bron hebben. De markering kun je daar uitzetten.',
    '',
    'Het korte antwoord bovenaan telt niet mee: dat vat de onderbouwde punten eronder samen.',
  ].join('\n'),
  logoTitle: 'Het logo',
  logo: [
    'Het logo is een prijskaartje zonder prijs, gevuld met de hemel. Door het oogje kijk je naar de echte lucht van dit moment: overdag de zon, \'s avonds de schemering en \'s nachts de maan in de stand van vandaag. Op het zuidelijk halfrond staat de maan gespiegeld, zoals hij daar ook aan de hemel staat.',
    '',
    'Daardoor ziet iedere bezoeker een ander logo, en het ziet er morgen weer anders uit dan vandaag. Het laat zien waar is.gratis over gaat: de mooiste dingen hebben geen prijs.',
  ].join('\n'),
  referencesTitle: 'Literatuur',
};

const en: Methodology = {
  intro:
    '“Free” is less simple than it seems: almost everything costs someone something somewhere. So is.gratis looks at two measurable things. **Why** is something free, and **how much working time** does it cost when you do pay?',
  scaleTitle: 'The free scale, from 0 to 5',
  scaleIntro:
    'Every page gets a level based on the mechanism behind the price: who pays, and when. The level follows one to one from that mechanism.',
  examples: {
    free_good: 'air',
    collective: 'primary school, the GP in the Netherlands',
    third_party: 'wifi in a cafe, parking at the supermarket',
    partial: 'a museum that is free for children',
    exception: 'public transport in the Netherlands',
    paid: 'an adult train ticket',
  },
  levelHeader: 'Level',
  typeHeader: 'Mechanism',
  exampleHeader: 'Example',
  why:
    'The scale measures a mechanism, not an opinion. Two editors who agree on the facts (who pays, and at what moment) arrive at the same level. It is an ordinal scale: 4 is freer than 3, but not “one point” freer in any fixed unit.',
  basisTitle: 'Scientific basis',
  basis: [
    '- **Free and economic goods.** A classic distinction in economics: something only gets a price when it is scarce. That is level 5 versus the rest.',
    '- **Collective goods.** Paul Samuelson described in 1954 why some services are paid for collectively. Education and health care are also often seen as merit goods: the state pays because everyone benefits. That is level 4.',
    '- **The forms of free.** In *Free* (2009) Chris Anderson distinguishes cross-subsidies, markets where a third party such as an advertiser pays, and freemium. Those are levels 3 and 2.',
    '- **The zero-price effect.** Shampanier, Mazar and Ariely showed in 2007 that people give “free” disproportionate weight, even when a paid alternative is better. That is why it pays to be precise about what free really means.',
  ].join('\n'),
  timeTitle: 'The time price',
  time: [
    'When something does cost money, we express the price in working time: how long do you have to work to pay for it?',
    '',
    '**Time price = price ÷ hourly wage.**',
    '',
    'Economists use this measure to compare prices across countries and centuries. William Nordhaus calculated in 1996 how many hours of work light cost, from oil lamps to light bulbs. Gale Pooley and Marian Tupy built their Simon Abundance Index on it in 2022.',
    '',
    '*Worked example:* if something costs 0.15 cents and you earn 20 euros an hour, you work 0.0015 ÷ 20 × 3600 = 0.27 seconds. Every time price on is.gratis shows the price, the wage and a source for both.',
  ].join('\n'),
  limitsTitle: 'What we do not measure',
  limits:
    'The scale says nothing about quality or value, only about the price for you. The verdict at the top of a page (Yes, No, Usually, It depends) is the short summary; the scale explains why. Every assessment applies to one region, which is shown with it.',
  sourcesTitle: 'Sources and verification',
  sources: [
    'As on Wikipedia, every claim should be verifiable. Editors cite a source after a sentence with `[^id]`; readers then see a footnote such as [1] that jumps to the source.',
    '',
    'A paragraph or list item without a source gets the label **[citation needed]** and an orange dotted underline. That does not mean it is wrong, only that nobody has backed it up yet. Each page shows how many of its claims have a source; you can turn the marking off there.',
    '',
    'The short answer at the top does not count: it sums up the sourced points below it.',
  ].join('\n'),
  logoTitle: 'The logo',
  logo: [
    'The logo is a price tag without a price, filled with sky. Through its eyelet you look at the real sky of this moment: the sun by day, dusk in the evening and the moon in tonight\'s phase at night. In the southern hemisphere the moon is mirrored, just as it appears in the sky there.',
    '',
    'So every visitor sees a different logo, and tomorrow it looks different again. It shows what is.gratis is about: the best things in life have no price.',
  ].join('\n'),
  referencesTitle: 'References',
};

export const METHODOLOGY: Record<Language, Methodology> = { nl, en, de: en, es: en };

export const REFERENCES = [
  'Anderson, C. (2009). *Free: The Future of a Radical Price*. Hyperion.',
  'Nordhaus, W. D. (1996). Do Real-Output and Real-Wage Measures Capture Reality? The History of Lighting Suggests Not. In T. F. Bresnahan & R. J. Gordon (Eds.), *The Economics of New Goods*. University of Chicago Press.',
  'Pooley, G. L., & Tupy, M. L. (2022). *Superabundance*. Cato Institute.',
  'Samuelson, P. A. (1954). The Pure Theory of Public Expenditure. *The Review of Economics and Statistics*, 36(4), 387–389.',
  'Shampanier, K., Mazar, N., & Ariely, D. (2007). Zero as a Special Price: The True Value of Free Products. *Marketing Science*, 26(6), 742–757.',
];
