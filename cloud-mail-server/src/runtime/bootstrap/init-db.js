import settingService from '../../service/setting-service';

const PERM_SEED_SQL = `
INSERT INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
(1, '邮件', NULL, 0, 0, 0),
(2, '邮件删除', 'email:delete', 1, 2, 1),
(3, '邮件发送', 'email:send', 1, 2, 0),
(4, '个人设置', '', 0, 1, 2),
(5, '用户注销', 'my:delete', 4, 2, 0),
(6, '用户信息', NULL, 0, 1, 3),
(7, '用户查看', 'user:query', 6, 2, 0),
(8, '密码修改', 'user:set-pwd', 6, 2, 2),
(9, '状态修改', 'user:set-status', 6, 2, 3),
(10, '权限修改', 'user:set-type', 6, 2, 4),
(11, '用户删除', 'user:delete', 6, 2, 7),
(13, '权限控制', '', 0, 1, 5),
(14, '身份查看', 'role:query', 13, 2, 0),
(15, '身份修改', 'role:set', 13, 2, 1),
(16, '身份删除', 'role:delete', 13, 2, 2),
(17, '系统设置', '', 0, 1, 6),
(18, '设置查看', 'setting:query', 17, 2, 0),
(19, '设置修改', 'setting:set', 17, 2, 1),
(21, '邮箱侧栏', '', 0, 0, 1),
(22, '邮箱查看', 'account:query', 21, 2, 0),
(23, '邮箱添加', 'account:add', 21, 2, 1),
(24, '邮箱删除', 'account:delete', 21, 2, 2),
(25, '用户添加', 'user:add', 6, 2, 1),
(26, '发件重置', 'user:reset-send', 6, 2, 6),
(27, '邮件列表', '', 0, 1, 4),
(28, '邮件查看', 'all-email:query', 27, 2, 0),
(29, '邮件删除', 'all-email:delete', 27, 2, 0),
(30, '身份添加', 'role:add', 13, 2, -1),
(31, '分析页', NULL, 0, 1, 2.1),
(32, '数据查看', 'analysis:query', 31, 2, 1),
(33, '注册密钥', NULL, 0, 1, 5.1),
(34, '密钥查看', 'reg-key:query', 33, 2, 0),
(35, '密钥添加', 'reg-key:add', 33, 2, 1),
(36, '密钥删除', 'reg-key:delete', 33, 2, 2)
ON CONFLICT (perm_id) DO NOTHING;
`;

const ROLE_SEED_SQL = `
INSERT INTO "role" (
  role_id, name, key, create_time, sort, description, user_id, is_default,
  send_count, send_type, account_count, ban_email, ban_email_type, avail_domain
)
VALUES
(1, '普通用户', NULL, '1970-01-01 00:00:00', 0, '只有普通使用权限', 0, 1, NULL, 'ban', 10, '', 0, '')
ON CONFLICT (role_id) DO NOTHING;
`;

const ROLE_PERM_SEED_SQL = `
INSERT INTO role_perm (id, role_id, perm_id) VALUES
(100, 1, 2),
(101, 1, 21),
(102, 1, 22),
(103, 1, 23),
(104, 1, 24),
(105, 1, 4),
(106, 1, 5),
(107, 1, 1),
(108, 1, 3)
ON CONFLICT (id) DO NOTHING;
`;

const CREATE_TABLE_SQL = [
	`CREATE TABLE IF NOT EXISTS email (
		email_id SERIAL PRIMARY KEY,
		send_email TEXT,
		name TEXT,
		account_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL,
		subject TEXT,
		text TEXT,
		content TEXT,
		cc TEXT NOT NULL DEFAULT '[]',
		bcc TEXT NOT NULL DEFAULT '[]',
		recipient TEXT,
		to_email TEXT NOT NULL DEFAULT '',
		to_name TEXT NOT NULL DEFAULT '',
		in_reply_to TEXT NOT NULL DEFAULT '',
		relation TEXT NOT NULL DEFAULT '',
		message_id TEXT NOT NULL DEFAULT '',
		type INTEGER NOT NULL DEFAULT 0,
		status INTEGER NOT NULL DEFAULT 0,
		resend_email_id TEXT,
		message TEXT,
		unread INTEGER NOT NULL DEFAULT 0,
		create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		is_del INTEGER NOT NULL DEFAULT 0
	)` ,
	`CREATE TABLE IF NOT EXISTS star (
		star_id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL,
		email_id INTEGER NOT NULL,
		create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)` ,
	`CREATE TABLE IF NOT EXISTS attachments (
		att_id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL,
		email_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		key TEXT NOT NULL,
		filename TEXT,
		mime_type TEXT,
		size INTEGER,
		status INTEGER NOT NULL DEFAULT 0,
		type INTEGER NOT NULL DEFAULT 0,
		disposition TEXT,
		related TEXT,
		content_id TEXT,
		encoding TEXT,
		create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)` ,
	`CREATE TABLE IF NOT EXISTS "user" (
		user_id SERIAL PRIMARY KEY,
		email TEXT NOT NULL,
		type INTEGER NOT NULL DEFAULT 1,
		password TEXT NOT NULL,
		salt TEXT NOT NULL,
		status INTEGER NOT NULL DEFAULT 0,
		create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		active_time TIMESTAMP,
		create_ip TEXT,
		active_ip TEXT,
		os TEXT,
		browser TEXT,
		device TEXT,
		sort INTEGER DEFAULT 0,
		send_count INTEGER DEFAULT 0,
		reg_key_id INTEGER NOT NULL DEFAULT 0,
		is_del INTEGER NOT NULL DEFAULT 0
	)` ,
	`CREATE TABLE IF NOT EXISTS account (
		account_id SERIAL PRIMARY KEY,
		email TEXT NOT NULL,
		name TEXT NOT NULL DEFAULT '',
		status INTEGER NOT NULL DEFAULT 0,
		latest_email_time TIMESTAMP,
		create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		user_id INTEGER NOT NULL,
		all_receive INTEGER NOT NULL DEFAULT 0,
		sort INTEGER NOT NULL DEFAULT 0,
		is_del INTEGER NOT NULL DEFAULT 0
	)` ,
	`CREATE TABLE IF NOT EXISTS setting (
		register INTEGER NOT NULL DEFAULT 0,
		receive INTEGER NOT NULL DEFAULT 0,
		title TEXT NOT NULL DEFAULT 'Cloud Mail',
		many_email INTEGER NOT NULL DEFAULT 0,
		add_email INTEGER NOT NULL DEFAULT 0,
		auto_refresh INTEGER NOT NULL DEFAULT 5,
		add_email_verify INTEGER NOT NULL DEFAULT 1,
		register_verify INTEGER NOT NULL DEFAULT 1,
		reg_verify_count INTEGER NOT NULL DEFAULT 1,
		add_verify_count INTEGER NOT NULL DEFAULT 1,
		send INTEGER NOT NULL DEFAULT 0,
		r2_domain TEXT DEFAULT '/api/oss',
		secret_key TEXT,
		site_key TEXT,
		reg_key INTEGER NOT NULL DEFAULT 1,
		background TEXT,
		tg_bot_token TEXT NOT NULL DEFAULT '',
		tg_chat_id TEXT NOT NULL DEFAULT '',
		tg_bot_status INTEGER NOT NULL DEFAULT 1,
		forward_email TEXT NOT NULL DEFAULT '',
		forward_status INTEGER NOT NULL DEFAULT 1,
		rule_email TEXT NOT NULL DEFAULT '',
		rule_type INTEGER NOT NULL DEFAULT 0,
		login_opacity DOUBLE PRECISION DEFAULT 0.88,
		resend_tokens TEXT NOT NULL DEFAULT '{}',
		notice_title TEXT NOT NULL DEFAULT 'Cloud Mail',
		notice_content TEXT NOT NULL DEFAULT '本项目仅供学习交流，禁止用于违法业务<br>请遵守当地法规，作者不承担任何法律责任',
		notice_type TEXT NOT NULL DEFAULT 'none',
		notice_duration INTEGER NOT NULL DEFAULT 0,
		notice_position TEXT NOT NULL DEFAULT 'top-right',
		notice_offset INTEGER NOT NULL DEFAULT 0,
		notice_width INTEGER NOT NULL DEFAULT 340,
		notice INTEGER NOT NULL DEFAULT 0,
		no_recipient INTEGER NOT NULL DEFAULT 1,
		login_domain INTEGER NOT NULL DEFAULT 0,
		bucket TEXT NOT NULL DEFAULT '',
		region TEXT NOT NULL DEFAULT '',
		endpoint TEXT NOT NULL DEFAULT '',
		s3_access_key TEXT NOT NULL DEFAULT '',
		s3_secret_key TEXT NOT NULL DEFAULT '',
		force_path_style INTEGER NOT NULL DEFAULT 1,
		custom_domain TEXT NOT NULL DEFAULT '',
		tg_msg_from TEXT NOT NULL DEFAULT 'only-name',
		tg_msg_to TEXT NOT NULL DEFAULT 'show',
		tg_msg_text TEXT NOT NULL DEFAULT 'hide',
		min_email_prefix INTEGER NOT NULL DEFAULT 1,
		email_prefix_filter TEXT NOT NULL DEFAULT ''
	)` ,
	`CREATE TABLE IF NOT EXISTS perm (
		perm_id SERIAL PRIMARY KEY,
		name TEXT NOT NULL,
		perm_key TEXT,
		pid INTEGER NOT NULL DEFAULT 0,
		type INTEGER NOT NULL DEFAULT 2,
		sort NUMERIC
	)` ,
	`CREATE TABLE IF NOT EXISTS "role" (
		role_id SERIAL PRIMARY KEY,
		name TEXT NOT NULL,
		key TEXT,
		description TEXT,
		ban_email TEXT NOT NULL DEFAULT '',
		ban_email_type INTEGER NOT NULL DEFAULT 0,
		avail_domain TEXT DEFAULT '',
		sort INTEGER,
		is_default INTEGER DEFAULT 0,
		create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		user_id INTEGER,
		send_count INTEGER,
		send_type TEXT DEFAULT 'count',
		account_count INTEGER
	)` ,
	`CREATE TABLE IF NOT EXISTS role_perm (
		id SERIAL PRIMARY KEY,
		role_id INTEGER,
		perm_id INTEGER
	)` ,
	`CREATE TABLE IF NOT EXISTS reg_key (
		rege_key_id SERIAL PRIMARY KEY,
		code TEXT NOT NULL DEFAULT '',
		count INTEGER NOT NULL DEFAULT 0,
		role_id INTEGER NOT NULL DEFAULT 0,
		user_id INTEGER NOT NULL DEFAULT 0,
		expire_time TIMESTAMP,
		create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)` ,
	`CREATE TABLE IF NOT EXISTS verify_record (
		vr_id SERIAL PRIMARY KEY,
		ip TEXT NOT NULL DEFAULT '',
		count INTEGER NOT NULL DEFAULT 1,
		type INTEGER NOT NULL DEFAULT 0,
		update_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)` ,
	`CREATE TABLE IF NOT EXISTS oauth (
		oauth_id SERIAL PRIMARY KEY,
		oauth_user_id TEXT,
		username TEXT,
		name TEXT,
		avatar TEXT,
		active INTEGER,
		trust_level INTEGER,
		silenced INTEGER,
		create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		platform INTEGER NOT NULL DEFAULT 0,
		user_id INTEGER NOT NULL DEFAULT 0
	)` ,
	`CREATE TABLE IF NOT EXISTS inbound_event (
		event_id TEXT PRIMARY KEY,
		status TEXT NOT NULL DEFAULT 'processing',
		error TEXT,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	)` ,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_account_email_nocase ON account (LOWER(email))`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_nocase ON "user" (LOWER(email))`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_code ON reg_key (LOWER(code))`,
	`CREATE INDEX IF NOT EXISTS idx_email_user_id_account_id ON email (user_id, account_id)`
];

async function ensureSeedData(env) {
	await env.db.prepare(`
		INSERT INTO setting (register)
		SELECT 0
		WHERE NOT EXISTS (SELECT 1 FROM setting)
	`).run();

	await env.db.prepare(PERM_SEED_SQL).run();
	await env.db.prepare(ROLE_SEED_SQL).run();
	await env.db.prepare(ROLE_PERM_SEED_SQL).run();
}

function toContext(env) {
	return {
		env,
		set() {},
		get() { return undefined; }
	};
}

export async function bootstrapDatabase(target) {
	const env = target?.env || target;

	for (const sql of CREATE_TABLE_SQL) {
		await env.db.prepare(sql).run();
	}

	await ensureSeedData(env);
	await settingService.refresh(toContext(env));
}

export async function bootstrapByInitRoute(c) {
	const secret = c.req.param('secret');

	if (secret !== c.env.jwt_secret) {
		return c.text('❌ JWT secret mismatch');
	}

	await bootstrapDatabase(c);
	return c.text('success');
}
