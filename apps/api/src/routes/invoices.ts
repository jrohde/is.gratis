/** Invoices: view and pay with the secret link, Mollie's webhook, and the admin's tools. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import type { Config } from '../config.js';
import type { Database } from '../db/client.js';
import type { CacheInvalidator } from '../lib/cache.js';
import { renderInvoicePdf } from '../lib/invoice-pdf.js';
import { errorSchema } from '../schemas.js';
import {
  handleMollieWebhook,
  importStatement,
  invoiceByToken,
  listInvoices,
  markPaid,
  quarterCsv,
  startPayment,
  toInvoice,
  voidInvoice,
  type BillingDeps,
} from '../services/invoices.js';

export const invoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  token: z.string(),
  offerId: z.string().nullable(),
  lang: z.enum(['nl', 'en', 'de', 'es']),
  customerName: z.string(),
  customerEmail: z.string(),
  lines: z.array(z.object({ description: z.string(), amountCents: z.number().int() })),
  subtotalCents: z.number().int(),
  vatRateBps: z.number().int(),
  vatNote: z.string().nullable(),
  vatCents: z.number().int(),
  totalCents: z.number().int(),
  status: z.enum(['open', 'paid', 'void']),
  issuedAt: z.string(),
  dueAt: z.string(),
  paidAt: z.string().nullable(),
  paidVia: z.enum(['mollie', 'transfer', 'manual']).nullable(),
});

const tokenParams = z.object({ token: z.string().min(16).max(128) });

export const invoiceRoutes: FastifyPluginAsyncZod<{ db: Database; config: Config; cache: CacheInvalidator; mollieFetch?: typeof fetch }> = async (
  app,
  { db, config, cache, mollieFetch },
) => {
  const deps: BillingDeps = { db, billing: config.billing, origin: config.publicOrigin, cache, ...(mollieFetch ? { mollieFetch } : {}) };
  const seller = {
    companyName: config.billing.companyName,
    companyAddress: config.billing.companyAddress,
    kvk: config.billing.kvk,
    vatNumber: config.billing.vatNumber,
    iban: config.billing.iban,
    bic: config.billing.bic,
  };
  // Mollie posts its webhook as a form: "id=tr_...".
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) =>
    done(null, Object.fromEntries(new URLSearchParams(String(body)))),
  );

  app.get(
    '/invoices/:token',
    {
      schema: {
        tags: ['sponsors'],
        summary: 'An invoice, by its secret link',
        params: tokenParams,
        response: {
          200: z.object({
            invoice: invoiceSchema,
            payOnline: z.boolean(),
            seller: z.object({ companyName: z.string(), iban: z.string() }),
          }),
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('cache-control', 'private, no-store');
      const invoice = await invoiceByToken(db, request.params.token);
      return {
        invoice: toInvoice(invoice),
        payOnline: Boolean(config.billing.mollieApiKey),
        seller: { companyName: seller.companyName, iban: seller.iban },
      };
    },
  );

  app.get(
    '/invoices/:token/pdf',
    { schema: { tags: ['sponsors'], summary: 'The invoice as a PDF', params: tokenParams } },
    async (request, reply) => {
      const invoice = await invoiceByToken(db, request.params.token);
      const payUrl = config.billing.mollieApiKey ? `${config.publicOrigin}/advertise/invoice/${invoice.token}?lang=${invoice.lang}` : null;
      const pdf = await renderInvoicePdf(invoice, seller, payUrl);
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `inline; filename="is.gratis-${invoice.number}.pdf"`)
        .header('cache-control', 'private, no-store')
        .send(pdf);
    },
  );

  app.post(
    '/invoices/:token/pay',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['sponsors'],
        summary: 'Start an online payment (iDEAL, Bancontact, card) through Mollie',
        params: tokenParams,
        response: { 200: z.object({ checkoutUrl: z.string() }), 404: errorSchema, 409: errorSchema },
      },
    },
    async (request) => ({ checkoutUrl: await startPayment(deps, request.params.token) }),
  );

  app.post(
    '/payments/mollie/webhook',
    {
      schema: {
        tags: ['sponsors'],
        summary: 'Mollie reports that a payment changed; we look it up at Mollie before acting',
        body: z.object({ id: z.string().max(64) }),
        response: { 200: z.null() },
      },
    },
    async (request, reply) => {
      await handleMollieWebhook(deps, request.body.id);
      return reply.code(200).send(null);
    },
  );

  app.get(
    '/admin/invoices',
    {
      schema: {
        tags: ['admin'],
        summary: 'All invoices, newest first (admin)',
        response: { 200: z.object({ invoices: z.array(invoiceSchema) }), 401: errorSchema, 403: errorSchema },
      },
    },
    async (request, reply) => {
      requireRole(request, 'admin');
      reply.header('cache-control', 'private, no-store');
      return { invoices: await listInvoices(db) };
    },
  );

  app.post(
    '/admin/invoices/:id/:action',
    {
      schema: {
        tags: ['admin'],
        summary: 'Mark an invoice paid (for a payment the statement import did not match) or void it (admin)',
        params: z.object({ id: z.uuid(), action: z.enum(['paid', 'void']) }),
        response: { 204: z.null(), 401: errorSchema, 403: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      const admin = requireRole(request, 'admin');
      if (request.params.action === 'paid') await markPaid(deps, request.params.id, 'manual');
      else await voidInvoice(db, request.params.id);
      request.log.info({ invoiceId: request.params.id, action: request.params.action, userId: admin.id }, 'invoice changed by hand');
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/admin/invoices/statement',
    {
      bodyLimit: 20 * 1024 * 1024,
      schema: {
        tags: ['admin'],
        summary: 'Import a bank statement (CAMT.053 or MT940) and mark the matching invoices paid (admin)',
        body: z.object({ content: z.string().min(1) }),
        response: { 200: z.object({ matched: z.array(z.string()), unmatched: z.number().int() }), 401: errorSchema, 403: errorSchema },
      },
    },
    async (request) => {
      requireRole(request, 'admin');
      return importStatement(deps, request.body.content);
    },
  );

  app.get(
    '/admin/invoices/export',
    {
      schema: {
        tags: ['admin'],
        summary: 'Invoices of a quarter as CSV, for the bookkeeping (admin)',
        querystring: z.object({ year: z.coerce.number().int().min(2020).max(2100), quarter: z.coerce.number().int().min(1).max(4) }),
      },
    },
    async (request, reply) => {
      requireRole(request, 'admin');
      const { year, quarter } = request.query;
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="is.gratis-facturen-${year}-Q${quarter}.csv"`)
        .header('cache-control', 'private, no-store')
        .send(await quarterCsv(db, year, quarter));
    },
  );
};
