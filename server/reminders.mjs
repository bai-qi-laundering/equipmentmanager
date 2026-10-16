import {machineTasks, taskDue, addDays} from './inspection-rules.mjs';

export function taipeiClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(p => [p.type, p.value]));
  return {date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`};
}

export function dueMachines(equipment, state, today) {
  if (!state.baseline) return [];
  const horizon = addDays(today, Number(state.reminder?.lead || 0));
  return equipment.filter(m => m.status !== '停用').flatMap(machine => {
    const due = machineTasks(machine, state).map(t => ({task: t, due: taskDue(machine, t, state)}))
      .filter(t => t.due && t.due <= horizon);
    return due.length ? [{machine, due}] : [];
  });
}

export function startReminderWorker({pool, webpush, enabled, logger = console, intervalMs = 60000, startImmediately = true}) {
  let running = false;
  const status = {enabled, lastCheckedAt: null, lastError: null};
  async function tick(now = new Date()) {
    if (!enabled || running) return;
    running = true;
    try {
      status.lastError = null;
      const clock = taipeiClock(now);
      const entities = await pool.query('SELECT kind,id,data FROM inspection_sync_entities');
      const state = {records: [], settings: {}, reminder: {time: '08:00', lead: 1}};
      for (const e of entities.rows) {
        if (e.kind === 'record') state.records.push(e.data);
        else if (e.kind === 'setting') state.settings[e.id] = e.data;
        else if (e.id === 'baseline') state.baseline = e.data.date;
        else if (e.id === 'reminder') state.reminder = e.data;
      }
      if (clock.time < state.reminder.time || !state.baseline) return;
      const rows = await pool.query('SELECT id,name,kind,status,cleaning_last_date::text,cleaning_cycle_days FROM equipment');
      const equipment = rows.rows.map(m => ({...m, cleaningLastDate: m.cleaning_last_date, cleaningCycleDays: m.cleaning_cycle_days}));
      for (const name of ['軟水', '發電機', '移載車']) equipment.push({id: 'CHECK-' + name, name});
      const due = dueMachines(equipment, state, clock.date);
      if (!due.length) return;
      // Only the equipment group leader receives automatic reminders.
      const subscriptions = await pool.query(`SELECT s.endpoint,s.subscription,s.member_id FROM push_subscriptions s
        JOIN push_members m ON m.id=s.member_id WHERE s.enabled=true AND m.active=true AND m.name=$1`, ['簡通延']);
      for (const sub of subscriptions.rows) {
        const claimed = await pool.query(`INSERT INTO push_deliveries(endpoint,delivery_day,claimed_until)
          VALUES($1,$2,now()+interval '5 minutes') ON CONFLICT(endpoint,delivery_day)
          DO UPDATE SET claimed_until=EXCLUDED.claimed_until
          WHERE push_deliveries.sent_at IS NULL AND push_deliveries.claimed_until<now() RETURNING endpoint`, [sub.endpoint, clock.date]);
        if (!claimed.rowCount) continue;
        try {
          const names = due.slice(0, 3).map(d => d.machine.name).join('、');
          await webpush.sendNotification(sub.subscription, JSON.stringify({
            title: '百麒設備查檢提醒', body: `${due.length} 台設備有到期／即將到期項目：${names}${due.length > 3 ? '…' : ''}`,
            url: './?inspection=due', tag: 'baiqi-inspection-' + clock.date
          }), {TTL: 3600, timeout: 15000});
          await pool.query('UPDATE push_deliveries SET sent_at=now() WHERE endpoint=$1 AND delivery_day=$2', [sub.endpoint, clock.date]);
        } catch (error) {
          if ([404, 410].includes(error.statusCode)) await pool.query('UPDATE push_subscriptions SET enabled=false WHERE endpoint=$1', [sub.endpoint]);
          // The five-minute lease provides bounded retry and excludes concurrent workers.
          logger.error('Inspection push delivery failed', error.statusCode || error.message);
          status.lastError = 'push_delivery_failed';
        }
      }
    } catch (error) {
      status.lastError = 'reminder_worker_failed';
      logger.error('Inspection reminder worker failed', error.message);
    } finally {
      status.lastCheckedAt = now.toISOString();
      running = false;
    }
  }
  const timer = enabled ? setInterval(() => void tick(), intervalMs) : null;
  timer?.unref();
  if (enabled && startImmediately) void tick();
  return {status, tick, stop: () => clearInterval(timer)};
}
