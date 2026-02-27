import verifyRecordService from '../../service/verify-record-service';
import userService from '../../service/user-service';
import emailService from '../../service/email-service';
import oauthService from '../../service/oauth-service';

function fakeContext(env) {
	return { env };
}

export async function runDailyTasks(env) {
	const c = fakeContext(env);
	await verifyRecordService.clearRecord(c);
	await userService.resetDaySendCount(c);
	await emailService.completeReceiveAll(c);
	await oauthService.clearNoBindOathUser(c);
}
