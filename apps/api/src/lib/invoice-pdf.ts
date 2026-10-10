/**
 * The invoice as a PDF, in the advertiser's language, with an EPC QR code ("girocode") that
 * banking apps scan to fill in a transfer: amount, account and invoice number.
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { BRAND_GREEN, BRAND_INK, type Language } from '@isgratis/types';
import type { InvoiceLine } from '../db/schema.js';

export interface InvoiceForPdf {
  number: string;
  lang: Language;
  issuedAt: Date;
  dueAt: Date;
  customerName: string;
  customerEmail: string;
  customerAddress: string | null;
  customerCountry: string | null;
  customerVatNumber: string | null;
  lines: InvoiceLine[];
  subtotalCents: number;
  vatRateBps: number;
  vatNote: string | null;
  vatCents: number;
  totalCents: number;
  status: 'open' | 'paid' | 'void';
}

export interface Seller {
  companyName: string;
  companyAddress: string;
  kvk: string;
  vatNumber: string;
  iban: string;
  bic: string;
}

export const INVOICE_WORDS: Record<
  Language,
  {
    invoice: string;
    number: string;
    date: string;
    due: string;
    to: string;
    description: string;
    amount: string;
    subtotal: string;
    vat: (rate: string) => string;
    total: string;
    payOnline: (url: string) => string;
    transfer: (total: string, iban: string, name: string, number: string, alone: boolean) => string;
    scan: string;
    paid: string;
    void: string;
    kvk: string;
    vatNumber: string;
  }
> = {
  nl: {
    invoice: 'Factuur',
    number: 'Factuurnummer',
    date: 'Factuurdatum',
    due: 'Vervaldatum',
    to: 'Aan',
    description: 'Omschrijving',
    amount: 'Bedrag',
    subtotal: 'Subtotaal',
    vat: (rate) => `Btw ${rate}`,
    total: 'Totaal',
    payOnline: (url) => `Betaal online met iDEAL, Bancontact of creditcard: ${url}`,
    transfer: (total, iban, name, number, alone) => `${alone ? 'Maak' : 'Of maak'} ${total} over naar ${iban} t.n.v. ${name}, onder vermelding van ${number}.`,
    scan: 'Scan met je bank-app',
    paid: 'BETAALD',
    void: 'VERVALLEN',
    kvk: 'KvK',
    vatNumber: 'Btw-nummer',
  },
  en: {
    invoice: 'Invoice',
    number: 'Invoice number',
    date: 'Invoice date',
    due: 'Due date',
    to: 'To',
    description: 'Description',
    amount: 'Amount',
    subtotal: 'Subtotal',
    vat: (rate) => `VAT ${rate}`,
    total: 'Total',
    payOnline: (url) => `Pay online with iDEAL, Bancontact or card: ${url}`,
    transfer: (total, iban, name, number, alone) => `${alone ? 'Please transfer' : 'Or transfer'} ${total} to ${iban} in the name of ${name}, mentioning ${number}.`,
    scan: 'Scan with your banking app',
    paid: 'PAID',
    void: 'VOID',
    kvk: 'Chamber of Commerce',
    vatNumber: 'VAT number',
  },
  de: {
    invoice: 'Rechnung',
    number: 'Rechnungsnummer',
    date: 'Rechnungsdatum',
    due: 'Fällig am',
    to: 'An',
    description: 'Beschreibung',
    amount: 'Betrag',
    subtotal: 'Zwischensumme',
    vat: (rate) => `MwSt. ${rate}`,
    total: 'Gesamt',
    payOnline: (url) => `Online bezahlen mit iDEAL, Bancontact oder Kreditkarte: ${url}`,
    transfer: (total, iban, name, number, alone) => `${alone ? 'Bitte überweise' : 'Oder überweise'} ${total} an ${iban}, Empfänger ${name}, mit dem Verwendungszweck ${number}.`,
    scan: 'Mit der Banking-App scannen',
    paid: 'BEZAHLT',
    void: 'STORNIERT',
    kvk: 'Handelsregister (KvK)',
    vatNumber: 'USt-IdNr.',
  },
  es: {
    invoice: 'Factura',
    number: 'Número de factura',
    date: 'Fecha de factura',
    due: 'Vencimiento',
    to: 'Para',
    description: 'Descripción',
    amount: 'Importe',
    subtotal: 'Subtotal',
    vat: (rate) => `IVA ${rate}`,
    total: 'Total',
    payOnline: (url) => `Paga en línea con iDEAL, Bancontact o tarjeta: ${url}`,
    transfer: (total, iban, name, number, alone) => `${alone ? 'Transfiere' : 'O transfiere'} ${total} a ${iban} a nombre de ${name}, indicando ${number}.`,
    scan: 'Escanea con tu app bancaria',
    paid: 'PAGADA',
    void: 'ANULADA',
    kvk: 'Registro mercantil (KvK)',
    vatNumber: 'NIF-IVA',
  },
};

const LOCALES: Record<Language, string> = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE', es: 'es-ES' };

export function money(cents: number, lang: Language): string {
  return new Intl.NumberFormat(LOCALES[lang], { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

const day = (date: Date, lang: Language) =>
  new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }).format(date);

/**
 * The EPC069-12 "SEPA Credit Transfer" QR payload. Banking apps across the eurozone read it.
 * Name at most 70 characters, remittance text at most 140.
 */
export function epcPayload(input: { name: string; iban: string; bic: string; amountCents: number; text: string }): string {
  return [
    'BCD',
    '002',
    '1',
    'SCT',
    input.bic,
    input.name.slice(0, 70),
    input.iban.replace(/\s+/g, ''),
    `EUR${(input.amountCents / 100).toFixed(2)}`,
    '',
    '',
    input.text.slice(0, 140),
  ].join('\n');
}

export async function renderInvoicePdf(invoice: InvoiceForPdf, seller: Seller, payUrl: string | null): Promise<Buffer> {
  const words = INVOICE_WORDS[invoice.lang];
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `${words.invoice} ${invoice.number}`, Author: seller.companyName } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const left = 56;
  const right = doc.page.width - 56;
  const width = right - left;

  // Header: the wordmark, the seller.
  doc.font('Helvetica-Bold').fontSize(22).fillColor(BRAND_INK).text('is.gratis', left, 56, { continued: true }).fillColor(BRAND_GREEN).text('*');
  doc.font('Helvetica').fontSize(9).fillColor('#555');
  const sellerLines = [
    seller.companyName,
    ...seller.companyAddress.split(/\||\n/).map((line) => line.trim()).filter(Boolean),
    ...(seller.kvk ? [`${words.kvk} ${seller.kvk}`] : []),
    ...(seller.vatNumber ? [`${words.vatNumber} ${seller.vatNumber}`] : []),
    ...(seller.iban ? [`IBAN ${seller.iban}`] : []),
  ];
  doc.text(sellerLines.join('\n'), left + width / 2, 56, { width: width / 2, align: 'right' });

  // Title and invoice details.
  doc.moveDown(2);
  const top = Math.max(doc.y, 150);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(BRAND_INK).text(words.invoice, left, top);
  doc.font('Helvetica').fontSize(10).fillColor(BRAND_INK);
  const details = [
    [words.number, invoice.number],
    [words.date, day(invoice.issuedAt, invoice.lang)],
    [words.due, day(invoice.dueAt, invoice.lang)],
  ];
  let y = top + 30;
  for (const [label, value] of details) {
    doc.fillColor('#555').text(label!, left, y, { width: 110 });
    doc.fillColor(BRAND_INK).text(value!, left + 110, y);
    y += 15;
  }

  // Customer.
  const customer = [
    invoice.customerName,
    ...(invoice.customerAddress ?? '').split('\n').map((line) => line.trim()).filter(Boolean),
    ...(invoice.customerCountry ? [invoice.customerCountry] : []),
    ...(invoice.customerVatNumber ? [`${words.vatNumber} ${invoice.customerVatNumber}`] : []),
    invoice.customerEmail,
  ];
  doc.fillColor('#555').text(words.to, left + width / 2, top + 30);
  doc.fillColor(BRAND_INK).text(customer.join('\n'), left + width / 2, top + 45, { width: width / 2 });

  // Lines.
  y = Math.max(doc.y, y) + 30;
  doc.font('Helvetica-Bold').fontSize(10).text(words.description, left, y).text(words.amount, left, y, { width, align: 'right' });
  y += 16;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#ccc').stroke();
  y += 8;
  doc.font('Helvetica');
  for (const line of invoice.lines) {
    doc.text(line.description, left, y, { width: width - 110 });
    const height = doc.y - y;
    doc.text(money(line.amountCents, invoice.lang), left, y, { width, align: 'right' });
    y += Math.max(height, 14) + 6;
  }
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#ccc').stroke();
  y += 10;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, left + width / 2, y, { width: width / 4 });
    doc.text(value, left, y, { width, align: 'right' });
    y += 16;
  };
  totalRow(words.subtotal, money(invoice.subtotalCents, invoice.lang));
  totalRow(words.vat(`${(invoice.vatRateBps / 100).toLocaleString(LOCALES[invoice.lang])}%`), money(invoice.vatCents, invoice.lang));
  totalRow(words.total, money(invoice.totalCents, invoice.lang), true);
  if (invoice.vatNote) {
    doc.font('Helvetica').fontSize(9).fillColor('#555').text(invoice.vatNote, left, y + 4, { width });
    y = doc.y + 6;
  }

  // Payment, or the stamp of how it ended.
  y += 24;
  if (invoice.status === 'open') {
    doc.font('Helvetica').fontSize(10).fillColor(BRAND_INK);
    const textWidth = seller.iban ? width - 130 : width;
    let textY = y;
    if (payUrl) {
      doc.text(words.payOnline(payUrl), left, textY, { width: textWidth });
      textY = doc.y + 8;
    }
    if (seller.iban) {
      doc.text(words.transfer(money(invoice.totalCents, invoice.lang), seller.iban, seller.companyName, invoice.number, !payUrl), left, textY, {
        width: textWidth,
      });
      const qr = await QRCode.toBuffer(
        epcPayload({ name: seller.companyName, iban: seller.iban, bic: seller.bic, amountCents: invoice.totalCents, text: invoice.number }),
        { errorCorrectionLevel: 'M', margin: 1, width: 220 },
      );
      doc.image(qr, right - 110, y, { width: 110 });
      doc.fontSize(8).fillColor('#555').text(words.scan, right - 110, y + 114, { width: 110, align: 'center' });
    }
  } else {
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor(invoice.status === 'paid' ? BRAND_GREEN : '#c92a2a')
      .text(invoice.status === 'paid' ? words.paid : words.void, left, y);
  }

  doc.end();
  return done;
}
