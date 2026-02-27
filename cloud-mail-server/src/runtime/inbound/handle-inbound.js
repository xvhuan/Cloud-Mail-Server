import { email as onInboundEmail } from '../../email/email';

export class InboundRejectedError extends Error {
	constructor(message) {
		super(message);
		this.name = 'InboundRejectedError';
	}
}

function createInboundMessage(envelopeTo, rawBytes, forward = null) {
	const rawStream = new Blob([rawBytes]).stream();

	return {
		to: envelopeTo,
		raw: rawStream,
		setReject(reason) {
			throw new InboundRejectedError(reason || 'rejected');
		},
		async forward(toEmail) {
			if (typeof forward === 'function') {
				return forward(toEmail);
			}
			console.warn(`[inbound] message.forward is not implemented on server runtime, skip forward to: ${toEmail}`);
			return;
		}
	};
}

export async function handleInboundRawMime(env, envelopeTo, rawMimeBytes, options = {}) {
	if (!envelopeTo || !rawMimeBytes) {
		throw new Error('invalid payload: envelopeTo/rawMimeBytes required');
	}

	const message = createInboundMessage(envelopeTo, rawMimeBytes, options.forward);
	await onInboundEmail(message, env, null);
}

export async function handleInboundPayload(env, payload) {
	const { envelopeTo, rawMimeBase64 } = payload;

	if (!envelopeTo || !rawMimeBase64) {
		throw new Error('invalid payload: envelopeTo/rawMimeBase64 required');
	}

	const rawBytes = Buffer.from(rawMimeBase64, 'base64');
	await handleInboundRawMime(env, envelopeTo, rawBytes);
}
