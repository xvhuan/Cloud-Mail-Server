import { createPgPoolFromEnv, createPostgresD1Database } from './db/postgres-d1';
import { createRedisClientFromEnv, createRedisKVNamespace } from './kv/redis-kv';

function toBool(value, fallback = false) {
	if (value === undefined || value === null || value === '') return fallback;
	if (typeof value === 'boolean') return value;
	return String(value).toLowerCase() === 'true';
}

function parseDomain(domainRaw) {
	if (!domainRaw) return [];
	if (Array.isArray(domainRaw)) return domainRaw;
	const text = String(domainRaw).trim();
	if (!text) return [];

	if (text.startsWith('[')) {
		try {
			const parsed = JSON.parse(text);
			if (Array.isArray(parsed)) {
				return parsed.map((item) => String(item).trim()).filter(Boolean);
			}
		} catch {
			// fallback to csv
		}
	}

	return text.split(',').map((item) => item.trim()).filter(Boolean);
}

export async function createRuntime() {
	const pgPool = createPgPoolFromEnv(process.env);
	const redis = createRedisClientFromEnv(process.env);
	redis.on('error', (error) => {
		console.warn(`[redis] ${error.message}`);
	});

	const db = createPostgresD1Database(pgPool);
	const kv = createRedisKVNamespace(redis, process.env.KV_PREFIX || 'cm:kv:');

	const domain = parseDomain(process.env.DOMAIN);

	const env = {
		db,
		kv,
		domain,
		admin: process.env.ADMIN || '',
		jwt_secret: process.env.JWT_SECRET || '',
		orm_log: toBool(process.env.ORM_LOG, false),
		linuxdo_client_id: process.env.LINUXDO_CLIENT_ID || '',
		linuxdo_client_secret: process.env.LINUXDO_CLIENT_SECRET || '',
		linuxdo_callback_url: process.env.LINUXDO_CALLBACK_URL || '',
		linuxdo_switch: toBool(process.env.LINUXDO_SWITCH, false)
	};

	const config = {
		port: Number(process.env.PORT || 8787),
		enableCron: toBool(process.env.ENABLE_CRON, true),
		cronExpr: process.env.CRON_EXPR || '0 0 * * *',
		cronTimezone: process.env.CRON_TIMEZONE || 'Asia/Shanghai',
		autoInit: toBool(process.env.AUTO_INIT, false),
		inboundSharedSecret: process.env.INBOUND_SHARED_SECRET || '',
		inboundMaxSkewSeconds: Number(process.env.INBOUND_MAX_SKEW_SECONDS || 300),
		smtpEnabled: toBool(process.env.SMTP_ENABLED, true),
		smtpHost: process.env.SMTP_HOST || '0.0.0.0',
		smtpPort: Number(process.env.SMTP_PORT || 25),
		smtpRequireAuth: toBool(process.env.SMTP_REQUIRE_AUTH, false),
		smtpAuthUser: process.env.SMTP_AUTH_USER || '',
		smtpAuthPass: process.env.SMTP_AUTH_PASS || '',
		smtpMaxSize: Number(process.env.SMTP_MAX_SIZE || 25 * 1024 * 1024),
		smtpEnableStarttls: toBool(process.env.SMTP_ENABLE_STARTTLS, false),
		smtpTlsKeyPath: process.env.SMTP_TLS_KEY_PATH || '',
		smtpTlsCertPath: process.env.SMTP_TLS_CERT_PATH || ''
	};

	if (!env.jwt_secret) {
		console.warn('[runtime] JWT_SECRET is empty.');
	}

	if (!env.admin) {
		console.warn('[runtime] ADMIN is empty.');
	}

	if (domain.length === 0) {
		console.warn('[runtime] DOMAIN is empty.');
	}

	if (!config.inboundSharedSecret) {
		console.warn('[runtime] INBOUND_SHARED_SECRET is empty. /api/internal/inbound-email will reject requests.');
	}

	if (config.smtpEnabled && config.smtpPort < 1024) {
		console.warn(`[runtime] SMTP_PORT=${config.smtpPort} usually requires privileged permission/root.`);
	}

	return {
		env,
		config,
		async close() {
			await Promise.allSettled([
				pgPool.end(),
				redis.quit()
			]);
		}
	};
}
