import type { Request, Response } from 'express';
import type {
  AdjustPointsRequest,
  CheckoutQuoteRequest,
  CreateCouponRequest,
} from '@madrasty/shared';
import { config } from '../../config/index';
import { asyncHandler } from '../../lib/async-handler';
import type { LoyaltyService } from './loyalty.service';
import { adjustPointsSchema, createCouponSchema, quoteRequestSchema } from './loyalty.schemas';

// `?locale=` wins, then Accept-Language, else the default (mirrors the other
// modules until a shared i18n middleware attaches req.locale — doc 07).
function localeOf(req: Request): string {
  const supported = config.SUPPORTED_LOCALES;
  const queryLocale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
  if (queryLocale && supported.includes(queryLocale)) return queryLocale;
  const header = req.headers['accept-language'];
  if (header) {
    for (const part of header.split(',')) {
      const tag = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
      if (tag && supported.includes(tag)) return tag;
    }
  }
  return config.DEFAULT_LOCALE;
}

export function createLoyaltyController(loyalty: LoyaltyService) {
  return {
    // GET /me — points balance, tier, progress to next tier (dashboard widget).
    getSummary: asyncHandler(async (req: Request, res: Response) => {
      const summary = await loyalty.getSummary(req.user!.id, localeOf(req));
      res.status(200).json(summary);
    }),

    // POST /quote — preview coupon + points discounts before checkout.
    quote: asyncHandler(async (req: Request, res: Response) => {
      const body = quoteRequestSchema.parse(req.body) as CheckoutQuoteRequest;
      const result = await loyalty.quoteForProgram({ id: req.user!.id }, body);
      res.status(200).json(result);
    }),

    // --- Admin ---
    createCoupon: asyncHandler(async (req: Request, res: Response) => {
      const body = createCouponSchema.parse(req.body) as CreateCouponRequest;
      const coupon = await loyalty.createCoupon(req.user!.id, body);
      res.status(201).json(coupon);
    }),

    listCoupons: asyncHandler(async (_req: Request, res: Response) => {
      const coupons = await loyalty.listCoupons();
      res.status(200).json({ coupons });
    }),

    deleteCoupon: asyncHandler(async (req: Request, res: Response) => {
      await loyalty.deleteCoupon(req.user!.id, req.params.id);
      res.status(204).send();
    }),

    adjustPoints: asyncHandler(async (req: Request, res: Response) => {
      const body = adjustPointsSchema.parse(req.body) as AdjustPointsRequest;
      const result = await loyalty.adjustPoints(req.user!.id, body);
      res.status(200).json(result);
    }),
  };
}
