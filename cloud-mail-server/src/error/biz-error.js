class BizError extends Error {
	constructor(message, code) {
		super(message);
		this.code = code ? code : 501;
		this.name = 'BizError';
	}
}

export default BizError;
