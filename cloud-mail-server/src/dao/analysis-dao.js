import { emailConst } from '../const/entity-const';

const analysisDao = {
	async numberCount(c) {
		const { results } = await c.env.db.prepare(`
            SELECT
				COALESCE(e.receiveTotal, 0) AS receiveTotal,
				COALESCE(e.sendTotal, 0) AS sendTotal,
				COALESCE(e.delReceiveTotal, 0) AS delReceiveTotal,
				COALESCE(e.delSendTotal, 0) AS delSendTotal,
				COALESCE(e.normalReceiveTotal, 0) AS normalReceiveTotal,
				COALESCE(e.normalSendTotal, 0) AS normalSendTotal,
				COALESCE(u.userTotal, 0) AS userTotal,
				COALESCE(u.normalUserTotal, 0) AS normalUserTotal,
				COALESCE(u.delUserTotal, 0) AS delUserTotal,
				COALESCE(a.accountTotal, 0) AS accountTotal,
				COALESCE(a.normalAccountTotal, 0) AS normalAccountTotal,
				COALESCE(a.delAccountTotal, 0) AS delAccountTotal
            FROM
                (
                    SELECT
                        SUM(CASE WHEN type = 0 THEN 1 ELSE 0 END) AS receiveTotal,
                        SUM(CASE WHEN type = 1 THEN 1 ELSE 0 END) AS sendTotal,
                        SUM(CASE WHEN type = 0 AND is_del = 1 THEN 1 ELSE 0 END) AS delReceiveTotal,
                        SUM(CASE WHEN type = 1 AND is_del = 1 THEN 1 ELSE 0 END) AS delSendTotal,
                        SUM(CASE WHEN type = 0 AND is_del = 0 THEN 1 ELSE 0 END) AS normalReceiveTotal,
                        SUM(CASE WHEN type = 1 AND is_del = 0 THEN 1 ELSE 0 END) AS normalSendTotal
                    FROM
                        email where status != ${emailConst.status.SAVING}
                ) e
            CROSS JOIN (
                SELECT
                    COUNT(*) AS userTotal,
                    SUM(CASE WHEN is_del = 1 THEN 1 ELSE 0 END) AS delUserTotal,
                    SUM(CASE WHEN is_del = 0 THEN 1 ELSE 0 END) AS normalUserTotal
                FROM
                    user
            ) u
            CROSS JOIN (
                SELECT
                    COUNT(*) AS accountTotal,
                    SUM(CASE WHEN is_del = 1 THEN 1 ELSE 0 END) AS delAccountTotal,
                    SUM(CASE WHEN is_del = 0 THEN 1 ELSE 0 END) AS normalAccountTotal
                FROM
                    account
            ) a
        `).all();
		return results[0];
	},

	async userDayCount(c, diffHours) {
		const hours = Number(diffHours) || 0;
		const { results } = await c.env.db.prepare(`
            SELECT
                TO_CHAR((create_time + INTERVAL '${hours} hour')::date, 'YYYY-MM-DD') AS date,
                COUNT(*) AS total
            FROM
                "user"
            WHERE
                (create_time + INTERVAL '${hours} hour')::date BETWEEN
                ((NOW() + INTERVAL '${hours} hour')::date - INTERVAL '15 day')::date
                AND ((NOW() + INTERVAL '${hours} hour')::date - INTERVAL '1 day')::date
            GROUP BY
                (create_time + INTERVAL '${hours} hour')::date
            ORDER BY
                date ASC
        `).all();
		return results;
	},

	async receiveDayCount(c, diffHours) {
		const hours = Number(diffHours) || 0;
		const { results } = await c.env.db.prepare(`
            SELECT
                TO_CHAR((create_time + INTERVAL '${hours} hour')::date, 'YYYY-MM-DD') AS date,
                COUNT(*) AS total
            FROM
                email
            WHERE
			  				(create_time + INTERVAL '${hours} hour')::date BETWEEN
			  				((NOW() + INTERVAL '${hours} hour')::date - INTERVAL '15 day')::date
			  				AND ((NOW() + INTERVAL '${hours} hour')::date - INTERVAL '1 day')::date
                AND type = 0
            GROUP BY
                (create_time + INTERVAL '${hours} hour')::date
            ORDER BY
                date ASC
        `).all();
		return results;
	},

	async sendDayCount(c, diffHours) {
		const hours = Number(diffHours) || 0;
		const { results } = await c.env.db.prepare(`
            SELECT
                TO_CHAR((create_time + INTERVAL '${hours} hour')::date, 'YYYY-MM-DD') AS date,
                COUNT(*) AS total
            FROM
                email
            WHERE
			  				(create_time + INTERVAL '${hours} hour')::date BETWEEN
			  				((NOW() + INTERVAL '${hours} hour')::date - INTERVAL '15 day')::date
			  				AND ((NOW() + INTERVAL '${hours} hour')::date - INTERVAL '1 day')::date
                AND type = 1
            GROUP BY
                (create_time + INTERVAL '${hours} hour')::date
            ORDER BY
                date ASC
        `).all();
		return results;
	}

};

export default analysisDao;
