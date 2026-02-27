import { Pool } from 'pg';

const RESERVED_IDENTIFIERS = new Set(['user', 'role']);

function normalizeParam(value) {
	if (value === undefined) return null;
	if (value instanceof ArrayBuffer) return Buffer.from(value);
	if (ArrayBuffer.isView(value)) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	}
	return value;
}

function transformSql(sql) {
	let out = '';
	let token = '';
	let paramIndex = 1;

	let inSingle = false;
	let inDouble = false;
	let inLineComment = false;
	let inBlockComment = false;

	const flushToken = () => {
		if (!token) return;
		const lower = token.toLowerCase();
		if (RESERVED_IDENTIFIERS.has(lower)) {
			out += `\"${lower}\"`;
		} else {
			out += token;
		}
		token = '';
	};

	for (let i = 0; i < sql.length; i++) {
		const ch = sql[i];
		const next = sql[i + 1];

		if (inLineComment) {
			out += ch;
			if (ch === '\n') inLineComment = false;
			continue;
		}

		if (inBlockComment) {
			out += ch;
			if (ch === '*' && next === '/') {
				out += next;
				i++;
				inBlockComment = false;
			}
			continue;
		}

		if (inSingle) {
			out += ch;
			if (ch === "'" && next === "'") {
				out += next;
				i++;
				continue;
			}
			if (ch === "'") inSingle = false;
			continue;
		}

		if (inDouble) {
			out += ch;
			if (ch === '"' && next === '"') {
				out += next;
				i++;
				continue;
			}
			if (ch === '"') inDouble = false;
			continue;
		}

		if (ch === '-' && next === '-') {
			flushToken();
			out += '--';
			i++;
			inLineComment = true;
			continue;
		}

		if (ch === '/' && next === '*') {
			flushToken();
			out += '/*';
			i++;
			inBlockComment = true;
			continue;
		}

		if (ch === "'") {
			flushToken();
			out += ch;
			inSingle = true;
			continue;
		}

		if (ch === '"') {
			flushToken();
			out += ch;
			inDouble = true;
			continue;
		}

		if (/[A-Za-z0-9_]/.test(ch)) {
			token += ch;
			continue;
		}

		flushToken();

		if (ch === '?') {
			out += `$${paramIndex++}`;
		} else {
			out += ch;
		}
	}

	flushToken();
	return patchInsertAutoIncrementNull(out);
}

function patchInsertAutoIncrementNull(sql) {
	const headerMatch = sql.match(/^\s*insert\s+into\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*\(\s*("[^"]+"|[A-Za-z_][A-Za-z0-9_]*)\s*,/i);
	if (!headerMatch) return sql;

	const firstColumnRaw = headerMatch[2];
	const firstColumn = firstColumnRaw.replace(/^"|"$/g, '').toLowerCase();
	const isAutoIdColumn = firstColumn === 'id' || firstColumn.endsWith('_id');
	if (!isAutoIdColumn) return sql;

	return sql.replace(/(\bvalues\s*\()\s*null(\s*,)/i, '$1DEFAULT$2');
}

class PostgresD1PreparedStatement {
	constructor(database, sql, params = []) {
		this.database = database;
		this.sql = sql;
		this.params = params;
	}

	bind(...params) {
		return new PostgresD1PreparedStatement(this.database, this.sql, params);
	}

	async _query(client) {
		return this.database.execute(this.sql, this.params, client);
	}

	async run() {
		const res = await this._query();
		return {
			success: true,
			meta: { changes: res.rowCount || 0 },
			results: res.rows || []
		};
	}

	async all() {
		const res = await this._query();
		return {
			success: true,
			meta: { changes: res.rowCount || 0 },
			results: res.rows || []
		};
	}

	async first(columnName) {
		const res = await this._query();
		const row = res.rows?.[0] ?? null;
		if (!row) return null;
		if (columnName) return row[columnName] ?? null;
		return row;
	}

	async raw() {
		const res = await this._query();
		return (res.rows || []).map((row) => Object.values(row));
	}
}

class PostgresD1Database {
	constructor(pool) {
		this.pool = pool;
	}

	prepare(sql) {
		return new PostgresD1PreparedStatement(this, sql, []);
	}

	async execute(sql, params = [], client) {
		const queryText = transformSql(sql);
		const values = params.map(normalizeParam);
		const executor = client || this.pool;
		return executor.query(queryText, values);
	}

	async batch(statements) {
		if (!Array.isArray(statements) || statements.length === 0) {
			return [];
		}

		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			const results = [];
			for (const stmt of statements) {
				const prepared = stmt instanceof PostgresD1PreparedStatement ? stmt : this.prepare(String(stmt));
				const res = await prepared._query(client);
				results.push({
					success: true,
					meta: { changes: res.rowCount || 0 },
					results: res.rows || []
				});
			}
			await client.query('COMMIT');
			return results;
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}
}

function toBool(value, fallback = false) {
	if (value === undefined || value === null || value === '') return fallback;
	if (typeof value === 'boolean') return value;
	return String(value).toLowerCase() === 'true';
}

export function createPgPoolFromEnv(env = process.env) {
	const ssl = toBool(env.PG_SSL, false);
	return new Pool({
		connectionString: env.DATABASE_URL,
		ssl: ssl ? { rejectUnauthorized: false } : undefined
	});
}

export function createPostgresD1Database(pool) {
	return new PostgresD1Database(pool);
}
