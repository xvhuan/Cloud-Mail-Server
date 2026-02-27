import 'dotenv/config';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import cron from 'node-cron';
import { extname, resolve, sep } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import app from './hono/webs';
import { createRuntime } from './runtime/create-runtime-env';
import { verifyInboundSignature } from './runtime/inbound/signature';
import { handleInboundPayload, InboundRejectedError } from './runtime/inbound/handle-inbound';
import { bootstrapDatabase } from './runtime/bootstrap/init-db';
import { runDailyTasks } from './runtime/tasks/daily-tasks';
import { startSmtpServer } from './runtime/smtp/start-smtp-server';
import r2Service from './service/r2-service';

console.log('[boot] preparing runtime...');
const runtime = await createRuntime();
console.log('[boot] runtime ready.');

if (runtime.config.autoInit) {
	await bootstrapDatabase(runtime.env);
	console.log('[bootstrap] schema and seed ensured.');
}

const gateway = new Hono();
const webDistDir = resolve(process.cwd(), process.env.WEB_DIST_DIR || './public');
const webIndexPath = resolve(webDistDir, 'index.html');

function getMimeType(filePath) {
	const ext = extname(filePath).toLowerCase();
	const mimeMap = {
		'.html': 'text/html; charset=utf-8',
		'.js': 'text/javascript; charset=utf-8',
		'.mjs': 'text/javascript; charset=utf-8',
		'.css': 'text/css; charset=utf-8',
		'.json': 'application/json; charset=utf-8',
		'.ico': 'image/x-icon',
		'.png': 'image/png',
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.svg': 'image/svg+xml',
		'.gif': 'image/gif',
		'.webp': 'image/webp',
		'.woff': 'font/woff',
		'.woff2': 'font/woff2',
		'.ttf': 'font/ttf',
		'.txt': 'text/plain; charset=utf-8'
	};
	return mimeMap[ext] || 'application/octet-stream';
}

function resolveSafePath(rootDir, requestPath) {
	const relativePath = String(requestPath || '/').replace(/^\/+/, '');
	const fullPath = resolve(rootDir, relativePath);
	if (fullPath === rootDir || fullPath.startsWith(rootDir + sep)) {
		return fullPath;
	}
	return null;
}

async function readStaticFile(filePath) {
	const content = await readFile(filePath);
	const headers = new Headers();
	headers.set('Content-Type', getMimeType(filePath));
	if (filePath.endsWith('.html')) {
		headers.set('Cache-Control', 'no-cache');
	}
	return new Response(content, { headers });
}

function contextLike(c) {
	return {
		env: runtime.env,
		req: c.req,
		set() {},
		get() { return undefined; }
	};
}

function safeExecutionCtx(c) {
	try {
		return c.executionCtx;
	} catch {
		return undefined;
	}
}

async function proxyObject(c) {
	const key = c.req.path.replace(/^\//, '');
	const obj = await r2Service.getObj(contextLike(c), key);

	if (!obj || !obj.body) {
		return c.text('Not Found', 404);
	}

	const meta = obj.httpMetadata || obj.metadata || {};
	const headers = new Headers();
	headers.set('Content-Type', meta.contentType || 'application/octet-stream');
	if (meta.contentDisposition) headers.set('Content-Disposition', meta.contentDisposition);
	if (meta.cacheControl) headers.set('Cache-Control', meta.cacheControl);

	return new Response(obj.body, { headers });
}

gateway.get('/healthz', (c) => c.json({ ok: true }));

gateway.get('/attachments/*', proxyObject);
gateway.get('/static/*', proxyObject);

gateway.post('/api/internal/inbound-email', async (c) => {
	if (!runtime.config.inboundSharedSecret) {
		return c.json({ message: 'inbound secret not configured' }, 500);
	}

	const rawBody = await c.req.text();
	const verify = await verifyInboundSignature({
		request: c.req,
		rawBody,
		secret: runtime.config.inboundSharedSecret,
		maxSkewSeconds: runtime.config.inboundMaxSkewSeconds
	});

	if (!verify.ok) {
		return c.json({ message: verify.message }, verify.code);
	}

	let payload;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return c.json({ message: 'invalid json body' }, 400);
	}

	const eventId = verify.eventId;
	const inserted = await runtime.env.db
		.prepare(`INSERT INTO inbound_event (event_id, status) VALUES (?, 'processing') ON CONFLICT (event_id) DO NOTHING RETURNING event_id`)
		.bind(eventId)
		.first();

	if (!inserted) {
		return c.json({ success: true, duplicate: true });
	}

	try {
		await handleInboundPayload(runtime.env, payload);
		await runtime.env.db.prepare(`UPDATE inbound_event SET status = 'ok', error = NULL, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?`).bind(eventId).run();
		return c.json({ success: true });
	} catch (error) {
		await runtime.env.db.prepare(`UPDATE inbound_event SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP WHERE event_id = ?`).bind(error?.message || 'unknown', eventId).run();

		if (error instanceof InboundRejectedError) {
			return c.json({ success: false, message: error.message }, 400);
		}

		console.error('[inbound] process failed:', error);
		return c.json({ success: false, message: 'internal error' }, 500);
	}
});

gateway.all('/api/*', async (c) => {
	const url = new URL(c.req.url);
	url.pathname = c.req.path.replace(/^\/api/, '') || '/';
	const req = new Request(url.toString(), c.req.raw);
	return app.fetch(req, runtime.env, safeExecutionCtx(c));
});

gateway.get('*', async (c) => {
	const path = c.req.path === '/' ? '/index.html' : c.req.path;
	const staticFilePath = resolveSafePath(webDistDir, path);

	if (staticFilePath) {
		try {
			const fileStat = await stat(staticFilePath);
			if (fileStat.isFile()) {
				return await readStaticFile(staticFilePath);
			}
		} catch {
			// fallback to SPA index below
		}
	}

	try {
		await stat(webIndexPath);
		return await readStaticFile(webIndexPath);
	} catch {
		return c.text('Frontend not found. Build mail-vue and place dist into WEB_DIST_DIR.', 404);
	}
});

if (runtime.config.enableCron) {
	cron.schedule(runtime.config.cronExpr, async () => {
		try {
			await runDailyTasks(runtime.env);
			console.log('[cron] daily tasks completed.');
		} catch (error) {
			console.error('[cron] daily tasks failed:', error);
		}
	}, { timezone: runtime.config.cronTimezone });
}

const httpServer = serve({
	fetch: gateway.fetch,
	port: runtime.config.port
});

console.log(`[server] cloud-mail-server listening on :${runtime.config.port}`);

const smtpServerController = await startSmtpServer(runtime);
console.log('[boot] smtp startup finished.');

const close = async () => {
	if (smtpServerController) {
		await smtpServerController.close();
	}
	await new Promise((resolve) => httpServer.close(() => resolve()));
	await runtime.close();
	process.exit(0);
};

process.on('SIGINT', close);
process.on('SIGTERM', close);
