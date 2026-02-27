import app from '../hono/hono';
import { bootstrapByInitRoute } from '../runtime/bootstrap/init-db';

app.get('/init/:secret', (c) => {
	return bootstrapByInitRoute(c);
})
