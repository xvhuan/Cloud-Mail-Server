import app from '../hono/hono';
import result from '../model/result';
import regKeyService from '../service/reg-key-service';
import userContext from '../security/user-context';

app.post('/regKey/add', async (c) => {
	await regKeyService.add(c, await c.req.json(), await userContext.getUserId(c));
	return c.json(result.ok());
})

app.get('/regKey/list', async (c) => {
	const list = await regKeyService.list(c, c.req.query());
	 return c.json(result.ok(list));
})

app.delete('/regKey/delete', async (c) => {
	await regKeyService.delete(c, c.req.query());
	return c.json(result.ok());
})

app.delete('/regKey/clearNotUse', async (c) => {
	await regKeyService.clearNotUse(c);
	return c.json(result.ok());
})

app.get('/regKey/history', async (c) => {
	const list = await regKeyService.history(c, c.req.query());
	return c.json(result.ok(list));
})
