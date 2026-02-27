import { resolveMx } from 'node:dns/promises';
import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';
import { randomBytes, randomUUID } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 20000;

function sanitizeHeader(value) {
	return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeader(value) {
	const safe = sanitizeHeader(value);
	if (!safe) return '';
	if (/^[\x20-\x7E]*$/.test(safe)) return safe;
	return `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=`;
}

function encodeFilename(filename) {
	const safe = sanitizeHeader(filename || 'attachment.bin').replace(/["\\]/g, '_');
	const utf8 = encodeURIComponent(safe);
	return { safe, utf8 };
}

function formatAddress(name, email) {
	const addr = sanitizeHeader(email);
	if (!addr) return '';
	const display = encodeHeader(name);
	if (!display) return `<${addr}>`;
	return `${display} <${addr}>`;
}

function chunkBase64(buffer, size = 76) {
	const data = Buffer.from(buffer).toString('base64');
	const lines = [];
	for (let i = 0; i < data.length; i += size) {
		lines.push(data.slice(i, i + size));
	}
	return lines.join('\r\n');
}

function buildTextPart(contentType, value) {
	const content = value || '';
	return [
		`Content-Type: ${contentType}; charset=utf-8`,
		'Content-Transfer-Encoding: base64',
		'',
		chunkBase64(Buffer.from(content, 'utf8'))
	].join('\r\n');
}

function boundary(prefix) {
	return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function toBuffer(content) {
	if (Buffer.isBuffer(content)) return content;
	if (content instanceof Uint8Array) return Buffer.from(content);
	if (content instanceof ArrayBuffer) return Buffer.from(content);
	if (typeof content === 'string') {
		const base64 = content.includes(',') ? content.split(',').pop() : content;
		return Buffer.from(base64 || '', 'base64');
	}
	return Buffer.alloc(0);
}

function buildMimeMessage({
	fromName,
	fromEmail,
	to,
	subject,
	text,
	html,
	attachments = [],
	inReplyTo,
	references
}) {
	const toList = Array.isArray(to) ? to.filter(Boolean) : [];
	const hasHtml = Boolean(html);
	const hasText = Boolean(text);
	const safeText = hasText ? text : '';
	const safeHtml = hasHtml ? html : '';
	const messageId = `<${randomUUID()}@${(fromEmail.split('@')[1] || 'localhost')}>`;

	const headers = [
		`From: ${formatAddress(fromName, fromEmail)}`,
		`To: ${toList.map((addr) => formatAddress('', addr)).join(', ')}`,
		`Subject: ${encodeHeader(subject || '')}`,
		`Date: ${new Date().toUTCString()}`,
		`Message-ID: ${messageId}`,
		'MIME-Version: 1.0'
	];

	if (inReplyTo) {
		headers.push(`In-Reply-To: ${sanitizeHeader(inReplyTo)}`);
	}

	if (references) {
		headers.push(`References: ${sanitizeHeader(references)}`);
	}

	let body = '';

	if (attachments.length > 0) {
		const mixedBoundary = boundary('mix');
		headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

		if (hasText && hasHtml) {
			const altBoundary = boundary('alt');
			body += `--${mixedBoundary}\r\n`;
			body += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
			body += `--${altBoundary}\r\n${buildTextPart('text/plain', safeText)}\r\n`;
			body += `--${altBoundary}\r\n${buildTextPart('text/html', safeHtml)}\r\n`;
			body += `--${altBoundary}--\r\n`;
		} else if (hasHtml) {
			body += `--${mixedBoundary}\r\n${buildTextPart('text/html', safeHtml)}\r\n`;
		} else {
			body += `--${mixedBoundary}\r\n${buildTextPart('text/plain', safeText)}\r\n`;
		}

		for (const attachment of attachments) {
			const content = toBuffer(attachment.content);
			const contentType = sanitizeHeader(attachment.contentType || 'application/octet-stream');
			const contentId = sanitizeHeader(String(attachment.contentId || '').replace(/^<|>$/g, ''));
			const disposition = contentId ? 'inline' : 'attachment';
			const { safe: safeFilename, utf8: utf8Filename } = encodeFilename(attachment.filename);

			body += `--${mixedBoundary}\r\n`;
			body += `Content-Type: ${contentType}; name="${safeFilename}"; name*=UTF-8''${utf8Filename}\r\n`;
			body += 'Content-Transfer-Encoding: base64\r\n';
			body += `Content-Disposition: ${disposition}; filename="${safeFilename}"; filename*=UTF-8''${utf8Filename}\r\n`;
			if (contentId) {
				body += `Content-ID: <${contentId}>\r\n`;
			}
			body += '\r\n';
			body += `${chunkBase64(content)}\r\n`;
		}

		body += `--${mixedBoundary}--`;
	} else if (hasText && hasHtml) {
		const altBoundary = boundary('alt');
		headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
		body += `--${altBoundary}\r\n${buildTextPart('text/plain', safeText)}\r\n`;
		body += `--${altBoundary}\r\n${buildTextPart('text/html', safeHtml)}\r\n`;
		body += `--${altBoundary}--`;
	} else if (hasHtml) {
		headers.push('Content-Type: text/html; charset=utf-8');
		headers.push('Content-Transfer-Encoding: base64');
		body = chunkBase64(Buffer.from(safeHtml, 'utf8'));
	} else {
		headers.push('Content-Type: text/plain; charset=utf-8');
		headers.push('Content-Transfer-Encoding: base64');
		body = chunkBase64(Buffer.from(safeText, 'utf8'));
	}

	return `${headers.join('\r\n')}\r\n\r\n${body}\r\n`;
}

function createLineReader(socket) {
	let buffer = '';
	const queue = [];
	const pending = [];
	let stopped = false;
	let stoppedError = null;

	const flushPending = (error) => {
		while (pending.length > 0) {
			const waiter = pending.shift();
			clearTimeout(waiter.timer);
			waiter.reject(error);
		}
	};

	const pushLine = (line) => {
		if (pending.length > 0) {
			const waiter = pending.shift();
			clearTimeout(waiter.timer);
			waiter.resolve(line);
			return;
		}
		queue.push(line);
	};

	const onData = (chunk) => {
		buffer += chunk;
		while (true) {
			const idx = buffer.indexOf('\n');
			if (idx < 0) return;
			const line = buffer.slice(0, idx).replace(/\r$/, '');
			buffer = buffer.slice(idx + 1);
			pushLine(line);
		}
	};

	const onError = (error) => {
		stopped = true;
		stoppedError = error;
		flushPending(error);
	};

	const onClose = () => {
		if (stopped) return;
		const error = new Error('SMTP socket closed unexpectedly');
		stopped = true;
		stoppedError = error;
		flushPending(error);
	};

	socket.on('data', onData);
	socket.on('error', onError);
	socket.on('close', onClose);

	return {
		async readLine(timeoutMs = DEFAULT_TIMEOUT_MS) {
			if (queue.length > 0) {
				return queue.shift();
			}
			if (stopped) {
				throw stoppedError || new Error('SMTP reader stopped');
			}
			return await new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					const index = pending.findIndex((item) => item.resolve === resolve);
					if (index >= 0) pending.splice(index, 1);
					reject(new Error('SMTP response timeout'));
				}, timeoutMs);
				pending.push({ resolve, reject, timer });
			});
		},
		dispose() {
			socket.off('data', onData);
			socket.off('error', onError);
			socket.off('close', onClose);
		}
	};
}

async function readResponse(reader, timeoutMs) {
	const lines = [];
	let code = null;

	while (true) {
		const line = await reader.readLine(timeoutMs);
		const match = line.match(/^(\d{3})([ -])(.*)$/);
		if (!match) {
			throw new Error(`Invalid SMTP response: ${line}`);
		}

		if (code === null) code = Number(match[1]);
		lines.push(line);

		if (match[2] === ' ') {
			return {
				code,
				lines,
				message: lines.map((item) => item.slice(4)).join(' | ')
			};
		}
	}
}

async function sendCommand(session, command, expectedCodes = [250], timeoutMs = DEFAULT_TIMEOUT_MS) {
	session.socket.write(`${command}\r\n`);
	const resp = await readResponse(session.reader, timeoutMs);
	if (!expectedCodes.includes(resp.code)) {
		throw new Error(`SMTP ${command.split(' ')[0]} failed: ${resp.code} ${resp.message}`);
	}
	return resp;
}

async function connectSmtp(host, port = 25, timeoutMs = DEFAULT_TIMEOUT_MS) {
	const socket = net.connect({ host, port });
	socket.setEncoding('utf8');

	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.destroy(new Error(`SMTP connect timeout: ${host}:${port}`));
		}, timeoutMs);

		const onConnect = () => {
			clearTimeout(timer);
			socket.off('error', onError);
			resolve();
		};

		const onError = (error) => {
			clearTimeout(timer);
			socket.off('connect', onConnect);
			reject(error);
		};

		socket.once('connect', onConnect);
		socket.once('error', onError);
	});

	const reader = createLineReader(socket);
	return { socket, reader };
}

async function upgradeToStartTls(session, servername, timeoutMs = DEFAULT_TIMEOUT_MS) {
	session.reader.dispose();

	const tlsSocket = tls.connect({
		socket: session.socket,
		servername,
		rejectUnauthorized: false
	});
	tlsSocket.setEncoding('utf8');

	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			tlsSocket.destroy(new Error(`SMTP STARTTLS timeout: ${servername}`));
		}, timeoutMs);

		const onSecure = () => {
			clearTimeout(timer);
			tlsSocket.off('error', onError);
			resolve();
		};

		const onError = (error) => {
			clearTimeout(timer);
			tlsSocket.off('secureConnect', onSecure);
			reject(error);
		};

		tlsSocket.once('secureConnect', onSecure);
		tlsSocket.once('error', onError);
	});

	return {
		socket: tlsSocket,
		reader: createLineReader(tlsSocket)
	};
}

function normalizeSmtpData(rawMessage) {
	const normalized = String(rawMessage || '').replace(/\r?\n/g, '\r\n');
	return normalized
		.split('\r\n')
		.map((line) => (line.startsWith('.') ? `.${line}` : line))
		.join('\r\n');
}

async function smtpSendByHost({
	mxHost,
	envelopeFrom,
	recipients,
	rawMessage,
	ehloName,
	timeoutMs = DEFAULT_TIMEOUT_MS
}) {
	let session = await connectSmtp(mxHost, 25, timeoutMs);
	const accepted = [];
	const rejected = [];

	try {
		const greet = await readResponse(session.reader, timeoutMs);
		if (greet.code !== 220) {
			throw new Error(`SMTP greeting failed: ${greet.code} ${greet.message}`);
		}

		let ehloResp = await sendCommand(session, `EHLO ${ehloName}`, [250], timeoutMs);
		const supportsStartTls = ehloResp.lines.some((line) => /STARTTLS/i.test(line));

		if (supportsStartTls) {
			await sendCommand(session, 'STARTTLS', [220], timeoutMs);
			session = await upgradeToStartTls(session, mxHost, timeoutMs);
			ehloResp = await sendCommand(session, `EHLO ${ehloName}`, [250], timeoutMs);
		}

		await sendCommand(session, `MAIL FROM:<${envelopeFrom}>`, [250], timeoutMs);

		for (const recipient of recipients) {
			try {
				await sendCommand(session, `RCPT TO:<${recipient}>`, [250, 251], timeoutMs);
				accepted.push(recipient);
			} catch (error) {
				rejected.push({ recipient, message: error.message });
			}
		}

		if (accepted.length === 0) {
			throw new Error(`All recipients rejected on ${mxHost}`);
		}

		await sendCommand(session, 'DATA', [354], timeoutMs);
		const messageData = normalizeSmtpData(rawMessage);
		session.socket.write(`${messageData}\r\n.\r\n`);
		const dataResp = await readResponse(session.reader, timeoutMs);
		if (dataResp.code !== 250) {
			throw new Error(`SMTP DATA failed: ${dataResp.code} ${dataResp.message}`);
		}

		try {
			await sendCommand(session, 'QUIT', [221], timeoutMs);
		} catch {
			// ignore quit failures
		}

		session.reader.dispose();
		session.socket.end();

		return { accepted, rejected };
	} catch (error) {
		session.reader.dispose();
		session.socket.destroy();
		throw error;
	}
}

async function resolveMxHosts(domain) {
	try {
		const records = await resolveMx(domain);
		if (records.length > 0) {
			return records
				.sort((a, b) => a.priority - b.priority)
				.map((item) => item.exchange)
				.filter(Boolean);
		}
	} catch (error) {
		if (!['ENODATA', 'ENOTFOUND', 'ENOTIMP', 'SERVFAIL'].includes(error?.code)) {
			throw error;
		}
	}
	return [domain];
}

function groupRecipientsByDomain(recipients) {
	const map = new Map();
	for (const recipient of recipients) {
		const email = sanitizeHeader(recipient).toLowerCase();
		const parts = email.split('@');
		if (parts.length !== 2 || !parts[1]) continue;
		const domain = parts[1];
		if (!map.has(domain)) map.set(domain, []);
		map.get(domain).push(email);
	}
	return map;
}

export async function sendOutboundEmailDirect({
	fromName,
	fromEmail,
	to,
	subject,
	text,
	html,
	attachments = [],
	inReplyTo,
	references,
	timeoutMs = DEFAULT_TIMEOUT_MS
}) {
	const recipients = Array.isArray(to) ? Array.from(new Set(to.filter(Boolean))) : [];
	if (recipients.length === 0) {
		throw new Error('No recipients for outbound SMTP');
	}

	const ehloName = sanitizeHeader(fromEmail.split('@')[1] || os.hostname() || 'localhost');
	const rawMessage = buildMimeMessage({
		fromName,
		fromEmail,
		to: recipients,
		subject,
		text,
		html,
		attachments,
		inReplyTo,
		references
	});

	const groups = groupRecipientsByDomain(recipients);
	if (groups.size === 0) {
		throw new Error('No valid recipients for outbound SMTP');
	}
	const accepted = [];
	const rejected = [];

	for (const [domain, groupRecipients] of groups.entries()) {
		const mxHosts = await resolveMxHosts(domain);
		let delivered = false;
		let lastError = null;

		for (const mxHost of mxHosts) {
			try {
				const result = await smtpSendByHost({
					mxHost,
					envelopeFrom: fromEmail,
					recipients: groupRecipients,
					rawMessage,
					ehloName,
					timeoutMs
				});
				accepted.push(...result.accepted);
				rejected.push(...result.rejected);
				delivered = true;
				break;
			} catch (error) {
				lastError = error;
			}
		}

		if (!delivered) {
			rejected.push({
				recipient: groupRecipients.join(','),
				message: lastError?.message || `Cannot deliver to domain ${domain}`
			});
		}
	}

	if (rejected.length > 0) {
		const details = rejected.map((item) => `${item.recipient}: ${item.message}`).join('; ');
		throw new Error(`SMTP send failed: ${details}`);
	}

	return { accepted };
}
