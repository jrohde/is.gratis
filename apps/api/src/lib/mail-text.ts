/**
 * The words in the mails, per language, and a small plain HTML layout. Mail clients ignore most
 * CSS, so the layout is a single column with inline styles; every mail has a text version too.
 */
import { BRAND_GREEN, BRAND_INK, type Language, type MailingList } from '@isgratis/types';

interface MailWords {
  lists: Record<MailingList, string>;
  confirmSubject: string;
  confirmBody: (list: string) => string;
  confirmButton: string;
  confirmIgnore: string;
  offersSubject: (count: number) => string;
  offersIntro: string;
  offersOn: string;
  weekSubject: string;
  weekIntro: string;
  weekNew: string;
  unsubscribe: string;
  why: (list: string) => string;
}

export const MAIL_WORDS: Record<Language, MailWords> = {
  nl: {
    lists: { offers: 'Gratis aanbiedingen van de week', week: 'Gratis deze week' },
    confirmSubject: 'Bevestig je inschrijving op is.gratis*',
    confirmBody: (list) => `Je wilt de mail "${list}" van is.gratis ontvangen. Klik op de knop om dat te bevestigen.`,
    confirmButton: 'Ja, ik wil deze mail',
    confirmIgnore: 'Was jij dit niet? Dan hoef je niets te doen: zonder bevestiging sturen we niets.',
    offersSubject: (n) => (n === 1 ? '1 gratis aanbieding deze week' : `${n} gratis aanbiedingen deze week`),
    offersIntro:
      'Deze aanbiedingen zijn echt gratis: is.gratis* heeft ze nagekeken. Ze zijn gesponsord; de aanbieders betalen voor deze plek.',
    offersOn: 'Bij',
    weekSubject: 'Gratis deze week',
    weekIntro: 'Elke dag één ding dat echt gratis is, en wat er deze week bij kwam.',
    weekNew: 'Nieuw deze week',
    unsubscribe: 'Afmelden',
    why: (list) => `Je krijgt deze mail omdat je je hebt ingeschreven op "${list}" van is.gratis.`,
  },
  en: {
    lists: { offers: 'Free offers of the week', week: 'Free this week' },
    confirmSubject: 'Confirm your subscription to is.gratis*',
    confirmBody: (list) => `You asked to receive "${list}" from is.gratis. Click the button to confirm.`,
    confirmButton: 'Yes, send me this mail',
    confirmIgnore: 'Not you? Then do nothing: without confirmation we send nothing.',
    offersSubject: (n) => (n === 1 ? '1 free offer this week' : `${n} free offers this week`),
    offersIntro: 'These offers are really free: is.gratis* checked them. They are sponsored; the providers pay for this spot.',
    offersOn: 'On',
    weekSubject: 'Free this week',
    weekIntro: 'One thing a day that is really free, and what was added this week.',
    weekNew: 'New this week',
    unsubscribe: 'Unsubscribe',
    why: (list) => `You get this mail because you subscribed to "${list}" from is.gratis.`,
  },
  de: {
    lists: { offers: 'Kostenlose Angebote der Woche', week: 'Kostenlos diese Woche' },
    confirmSubject: 'Bestätige dein Abo bei is.gratis*',
    confirmBody: (list) => `Du möchtest „${list}“ von is.gratis erhalten. Klicke auf den Knopf, um das zu bestätigen.`,
    confirmButton: 'Ja, ich möchte diese Mail',
    confirmIgnore: 'Warst du das nicht? Dann musst du nichts tun: ohne Bestätigung senden wir nichts.',
    offersSubject: (n) => (n === 1 ? '1 kostenloses Angebot diese Woche' : `${n} kostenlose Angebote diese Woche`),
    offersIntro:
      'Diese Angebote sind wirklich kostenlos: is.gratis* hat sie geprüft. Sie sind gesponsert; die Anbieter zahlen für diesen Platz.',
    offersOn: 'Bei',
    weekSubject: 'Kostenlos diese Woche',
    weekIntro: 'Jeden Tag eine Sache, die wirklich kostenlos ist, und was diese Woche dazukam.',
    weekNew: 'Neu diese Woche',
    unsubscribe: 'Abmelden',
    why: (list) => `Du erhältst diese Mail, weil du „${list}“ von is.gratis abonniert hast.`,
  },
  es: {
    lists: { offers: 'Ofertas gratis de la semana', week: 'Gratis esta semana' },
    confirmSubject: 'Confirma tu suscripción a is.gratis*',
    confirmBody: (list) => `Has pedido recibir «${list}» de is.gratis. Pulsa el botón para confirmarlo.`,
    confirmButton: 'Sí, quiero este correo',
    confirmIgnore: '¿No has sido tú? No hagas nada: sin confirmación no enviamos nada.',
    offersSubject: (n) => (n === 1 ? '1 oferta gratis esta semana' : `${n} ofertas gratis esta semana`),
    offersIntro:
      'Estas ofertas son gratis de verdad: is.gratis* las ha comprobado. Son patrocinadas; los proveedores pagan por este espacio.',
    offersOn: 'En',
    weekSubject: 'Gratis esta semana',
    weekIntro: 'Cada día una cosa que es gratis de verdad, y lo nuevo de esta semana.',
    weekNew: 'Nuevo esta semana',
    unsubscribe: 'Darse de baja',
    why: (list) => `Recibes este correo porque te suscribiste a «${list}» de is.gratis.`,
  },
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface MailBlock {
  heading?: string;
  title: string;
  text?: string;
  url: string;
  note?: string;
}

/** One mail in both forms. Every string goes in as plain text and is escaped here. */
export function renderMail(input: {
  lang: Language;
  intro: string;
  sections: Array<{ heading?: string; items: MailBlock[] }>;
  button?: { label: string; url: string };
  footer: string[];
  unsubscribeUrl?: string;
}): { text: string; html: string } {
  const words = MAIL_WORDS[input.lang];
  const text = [
    'is.gratis*',
    '',
    input.intro,
    ...(input.button ? ['', `${input.button.label}: ${input.button.url}`] : []),
    ...input.sections.flatMap((section) => [
      '',
      ...(section.heading ? [section.heading.toUpperCase(), ''] : []),
      ...section.items.flatMap((item) => [
        item.title,
        ...(item.text ? [item.text] : []),
        ...(item.note ? [item.note] : []),
        item.url,
        '',
      ]),
    ]),
    '--',
    ...input.footer,
    ...(input.unsubscribeUrl ? [`${words.unsubscribe}: ${input.unsubscribeUrl}`] : []),
  ].join('\n');

  const p = (content: string, style = '') => `<p style="margin:0 0 12px;${style}">${content}</p>`;
  const html = `<!doctype html><html lang="${input.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f6f7f4;font-family:Helvetica,Arial,sans-serif;color:${BRAND_INK};line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 20px;font-size:22px;font-weight:800">is.gratis<span style="color:${BRAND_GREEN}">*</span></p>
${p(escapeHtml(input.intro))}
${input.button ? `<p style="margin:20px 0"><a href="${escapeHtml(input.button.url)}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:6px">${escapeHtml(input.button.label)}</a></p>` : ''}
${input.sections
  .map(
    (section) =>
      (section.heading ? `<h2 style="font-size:16px;margin:24px 0 8px">${escapeHtml(section.heading)}</h2>` : '') +
      section.items
        .map(
          (item) =>
            `<div style="background:#fff;border:1px solid #e3e6e0;border-radius:8px;padding:12px 14px;margin:0 0 10px">` +
            `<a href="${escapeHtml(item.url)}" style="color:${BRAND_INK};font-weight:700;text-decoration:none">${escapeHtml(item.title)}</a>` +
            (item.text ? `<div style="font-size:14px;margin-top:4px">${escapeHtml(item.text)}</div>` : '') +
            (item.note ? `<div style="font-size:12px;color:#6b7068;margin-top:4px">${escapeHtml(item.note)}</div>` : '') +
            `</div>`,
        )
        .join('\n'),
  )
  .join('\n')}
<div style="font-size:12px;color:#6b7068;margin-top:24px">
${input.footer.map((line) => p(escapeHtml(line), 'font-size:12px')).join('\n')}
${input.unsubscribeUrl ? p(`<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#6b7068">${escapeHtml(words.unsubscribe)}</a>`, 'font-size:12px') : ''}
</div></div></body></html>`;
  return { text, html };
}
