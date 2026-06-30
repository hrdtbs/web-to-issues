import type { Context, Next } from 'hono';
import type { Env } from '../types';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

function getClientIp(c: Context<{ Bindings: Env }>): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyPrefix } = config;

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const kv = c.env.RATE_LIMIT;
    if (!kv || c.env.ENVIRONMENT === 'development') {
      return next();
    }

    const clientIp = getClientIp(c);
    const windowStart = Math.floor(Date.now() / windowMs);
    const key = `${keyPrefix}:${clientIp}:${windowStart}`;

    try {
      const currentCount = parseInt((await kv.get(key)) || '0', 10);
      if (currentCount >= maxRequests) {
        const retryAfter = Math.ceil(windowMs / 1000);
        return c.json(
          { error: 'Too many requests. Please try again later.', retryAfter },
          429,
          { 'Retry-After': String(retryAfter) }
        );
      }

      await kv.put(key, String(currentCount + 1), {
        expirationTtl: Math.ceil(windowMs / 1000),
      });
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', String(maxRequests - currentCount - 1));
      return next();
    } catch (error) {
      console.error('[RateLimit] KV error:', error);
      return next();
    }
  };
}

export function rateLimitByRepo(config: Omit<RateLimitConfig, 'keyPrefix'>) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const kv = c.env.RATE_LIMIT;
    if (!kv || c.env.ENVIRONMENT === 'development' || c.req.method !== 'POST') {
      return next();
    }

    try {
      const clonedRequest = c.req.raw.clone();
      const body = (await clonedRequest.json()) as { repo?: string };
      const repo = body.repo;
      if (!repo) return next();

      const windowStart = Math.floor(Date.now() / config.windowMs);
      const key = `repo:${repo}:${windowStart}`;
      const currentCount = parseInt((await kv.get(key)) || '0', 10);

      if (currentCount >= config.maxRequests) {
        return c.json(
          { error: 'This repository has received too many submissions. Please try again later.' },
          429
        );
      }

      await kv.put(key, String(currentCount + 1), {
        expirationTtl: Math.ceil(config.windowMs / 1000),
      });
      return next();
    } catch {
      return next();
    }
  };
}
