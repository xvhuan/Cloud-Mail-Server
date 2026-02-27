const kvObjService = {

	async putObj(c, key, content, metadata) {
		await c.env.kv.put(key, content, { metadata: metadata });
	},

	async deleteObj(c, keys) {

		if (typeof keys === 'string') {
			keys = [keys];
		}

		if (keys.length === 0) {
			return;
		}

		await Promise.all(keys.map( key => c.env.kv.delete(key)));
	},

	async toObjResp(c, key) {

		const obj = await c.env.kv.getWithMetadata(key, { type: "arrayBuffer"});
		if (!obj?.value) {
			return new Response('Not Found', { status: 404 });
		}

		return new Response(obj.value, {
			headers: {
				'Content-Type': obj.metadata?.contentType || 'application/octet-stream',
				'Content-Disposition': obj.metadata?.contentDisposition || null,
				'Cache-Control': obj.metadata?.cacheControl || null
			}
		});

	},

	async getObj(c, key) {
		const obj = await c.env.kv.getWithMetadata(key, { type: 'arrayBuffer' });
		if (!obj?.value) {
			return null;
		}
		return {
			body: obj.value,
			httpMetadata: {
				contentType: obj.metadata?.contentType,
				contentDisposition: obj.metadata?.contentDisposition,
				cacheControl: obj.metadata?.cacheControl
			}
		};
	}

};

export default kvObjService;
