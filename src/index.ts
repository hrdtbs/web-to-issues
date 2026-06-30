import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Env } from './types';
import api from './routes/api';

const app = new Hono<{ Bindings: Env }>();

let envChecked = false;
app.use('*', async (c, next) => {
  if (!envChecked) {
    const missing: string[] = [];
    if (!c.env.GITHUB_APP_ID) missing.push('GITHUB_APP_ID');
    if (!c.env.GITHUB_PRIVATE_KEY) missing.push('GITHUB_PRIVATE_KEY');
    if (missing.length > 0) {
      console.warn(`Missing env vars (feedback will fail): ${missing.join(', ')}`);
    }
    envChecked = true;
  }
  return next();
});

app.use('*', logger());
app.route('/api', api);

app.get('/', c => c.text('web-to-issues', 200));

app.get('/widget.js', c => c.env.ASSETS.fetch(c.req.raw));

export default app;
