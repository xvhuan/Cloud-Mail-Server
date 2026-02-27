const encoder = new TextEncoder();

function toHex(bytes) {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function safeEqual(a, b) {
	if (!a || !b || a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

export async function signInboundPayload(secret, timestamp, bodyText) {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const payload = `${timestamp}.${bodyText}`;
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
	return toHex(new Uint8Array(signature));
}

export async function verifyInboundSignature({ request, rawBody, secret, maxSkewSeconds = 300 }) {
	const timestamp = request.header('x-cm-timestamp');
	const signature = request.header('x-cm-signature');
	const eventId = request.header('x-cm-event-id');

	if (!timestamp || !signature || !eventId) {
		return { ok: false, code: 400, message: 'missing signature headers' };
	}

	const tsNum = Number(timestamp);
	if (!Number.isFinite(tsNum)) {
		return { ok: false, code: 400, message: 'invalid timestamp header' };
	}

	const now = Math.floor(Date.now() / 1000);
	if (Math.abs(now - tsNum) > maxSkewSeconds) {
		return { ok: false, code: 401, message: 'timestamp skew too large' };
	}

	const expected = await signInboundPayload(secret, timestamp, rawBody);
	if (!safeEqual(expected, signature)) {
		return { ok: false, code: 401, message: 'signature mismatch' };
	}

	return { ok: true, eventId };
}
