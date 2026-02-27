import Redis from 'ioredis';

const WRAP_MARK = '__cmkv';

function toArrayBuffer(buffer) {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function packValue(value, metadata = null) {
	if (typeof value === 'string') {
		return JSON.stringify({ [WRAP_MARK]: 1, t: 'str', v: value, m: metadata });
	}

	if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
		const buff = value instanceof ArrayBuffer
			? Buffer.from(value)
			: Buffer.from(value.buffer, value.byteOffset, value.byteLength);
		return JSON.stringify({ [WRAP_MARK]: 1, t: 'bin', v: buff.toString('base64'), m: metadata });
	}

	return JSON.stringify({ [WRAP_MARK]: 1, t: 'str', v: String(value), m: metadata });
}

function unpackRaw(raw) {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (parsed && parsed[WRAP_MARK] === 1) {
			return parsed;
		}
	} catch {
		// legacy plain string
	}
	return { [WRAP_MARK]: 1, t: 'str', v: raw, m: null };
}

function unpackValue(record, type = undefined) {
	if (!record) return null;

	if (type === 'arrayBuffer') {
		if (record.t === 'bin') {
			return toArrayBuffer(Buffer.from(record.v, 'base64'));
		}
		return toArrayBuffer(Buffer.from(record.v || '', 'utf8'));
	}

	if (type === 'json') {
		try {
			return JSON.parse(record.v || 'null');
		} catch {
			return null;
		}
	}

	if (record.t === 'bin') {
		return Buffer.from(record.v, 'base64').toString('utf8');
	}

	return record.v;
}

class RedisKVNamespace {
	constructor(redis, prefix = 'cm:kv:') {
		this.redis = redis;
		this.prefix = prefix;
	}

	keyOf(key) {
		return `${this.prefix}${key}`;
	}

	async put(key, value, options = {}) {
		const payload = packValue(value, options.metadata || null);
		const finalKey = this.keyOf(key);
		const ttl = Number(options.expirationTtl);

		if (Number.isFinite(ttl) && ttl > 0) {
			await this.redis.set(finalKey, payload, 'EX', ttl);
			return;
		}

		await this.redis.set(finalKey, payload);
	}

	async get(key, options = {}) {
		const raw = await this.redis.get(this.keyOf(key));
		const record = unpackRaw(raw);
		return unpackValue(record, options.type);
	}

	async getWithMetadata(key, options = {}) {
		const raw = await this.redis.get(this.keyOf(key));
		const record = unpackRaw(raw);
		if (!record) {
			return { value: null, metadata: null };
		}
		return {
			value: unpackValue(record, options.type),
			metadata: record.m || null
		};
	}

	async delete(key) {
		await this.redis.del(this.keyOf(key));
	}
}

export function createRedisClientFromEnv(env = process.env) {
	return new Redis(env.REDIS_URL, {
		maxRetriesPerRequest: null,
		enableReadyCheck: true
	});
}

export function createRedisKVNamespace(redis, prefix) {
	return new RedisKVNamespace(redis, prefix);
}
