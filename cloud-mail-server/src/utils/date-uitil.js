import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

export function formatDetailDate(time) {
	return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

export function toUtc(time) {
	return dayjs.utc(time || dayjs())
}
