import { SMTPServer } from 'smtp-server';
import { handleInboundRawMime, InboundRejectedError } from '../inbound/handle-inbound';
import { readFileSync } from 'node:fs';

function stripBrackets(email) {
	return String(email || '').trim().replace(/^<|>$/g, '').toLowerCase();
}

function getDomain(email) {
	const atIndex = email.lastIndexOf('@');
	if (atIndex < 0) return '';
	return email.slice(atIndex + 1).toLowerCase();
}

function smtpError(message, code = 550) {
	const error = new Error(message);
	error.responseCode = code;
	return error;
}

async function collectRawBuffer(stream, maxSize) {
	const chunks = [];
	let total = 0;

	for await (const chunk of stream) {
		const buff = Buffer.from(chunk);
		total += buff.length;
		if (total > maxSize) {
			throw smtpError(`Message too large, max=${maxSize} bytes`, 552);
		}
		chunks.push(buff);
	}

	return Buffer.concat(chunks);
}

export async function startSmtpServer(runtime) {
	const {
		smtpEnabled,
		smtpHost,
		smtpPort,
		smtpRequireAuth,
		smtpAuthUser,
		smtpAuthPass,
		smtpMaxSize,
		smtpEnableStarttls,
		smtpTlsKeyPath,
		smtpTlsCertPath
	} = runtime.config;

	if (!smtpEnabled) {
		console.log('[smtp] disabled.');
		return null;
	}

	const allowDomains = new Set((runtime.env.domain || []).map((item) => String(item).toLowerCase()));
	const disabledCommands = [];
	if (!smtpRequireAuth) disabledCommands.push('AUTH');

	let tlsKey = null;
	let tlsCert = null;
	let enableStarttls = smtpEnableStarttls;

	if (enableStarttls) {
		if (!smtpTlsKeyPath || !smtpTlsCertPath) {
			console.warn('[smtp] STARTTLS enabled but cert path missing. fallback to disable STARTTLS.');
			enableStarttls = false;
		} else {
			try {
				tlsKey = readFileSync(smtpTlsKeyPath);
				tlsCert = readFileSync(smtpTlsCertPath);
			} catch (error) {
				console.warn(`[smtp] unable to load TLS cert/key (${error.message}). fallback to disable STARTTLS.`);
				enableStarttls = false;
			}
		}
	}

	if (!enableStarttls) {
		disabledCommands.push('STARTTLS');
	}

	const server = new SMTPServer({
		secure: false,
		key: tlsKey || undefined,
		cert: tlsCert || undefined,
		disabledCommands,
		authOptional: !smtpRequireAuth,
		banner: 'cloud-mail-server smtp inbound',
		size: smtpMaxSize,
		onAuth(auth, session, callback) {
			if (!smtpRequireAuth) {
				callback(null, { user: auth.username || 'anonymous' });
				return;
			}

			if (auth.username === smtpAuthUser && auth.password === smtpAuthPass) {
				callback(null, { user: auth.username });
				return;
			}

			callback(smtpError('Authentication failed', 535));
		},
		onRcptTo(address, session, callback) {
			const rcpt = stripBrackets(address?.address || address);
			if (!rcpt) {
				callback(smtpError('Invalid recipient', 550));
				return;
			}

			const rcptDomain = getDomain(rcpt);
			if (!allowDomains.has(rcptDomain)) {
				callback(smtpError(`Relay denied for domain ${rcptDomain}`, 550));
				return;
			}

			callback();
		},
		onData(stream, session, callback) {
			(async () => {
				const rawBuffer = await collectRawBuffer(stream, smtpMaxSize);
				const recipients = (session?.envelope?.rcptTo || [])
					.map((item) => stripBrackets(item?.address || item))
					.filter(Boolean);

				if (recipients.length === 0) {
					throw smtpError('No recipient', 550);
				}

				for (const recipient of recipients) {
					try {
						await handleInboundRawMime(runtime.env, recipient, rawBuffer);
					} catch (error) {
						if (error instanceof InboundRejectedError) {
							throw smtpError(error.message || 'Recipient rejected', 550);
						}
						throw error;
					}
				}

				callback(null, 'accepted');
			})().catch((error) => {
				if (error?.responseCode) {
					callback(error);
					return;
				}
				console.error('[smtp] inbound process failed:', error);
				callback(smtpError('Internal processing error', 451));
			});
		}
	});

	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(smtpPort, smtpHost, () => {
			server.off('error', reject);
			resolve();
		});
	});

	console.log(`[smtp] listening on ${smtpHost}:${smtpPort}`);

	return {
		close() {
			return new Promise((resolveClose) => {
				server.close(() => resolveClose());
			});
		}
	};
}
