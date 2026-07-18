import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeReminderItems, computeRemainingAmount, findActivePeriod, type Cadence } from './plan.ts';
import { buildCalendarFeed } from './ics.ts';

const CADENCES = new Set(['monthly', 'bimonthly', 'semiannual']);

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return new Response('Metodo non consentito', { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const houseId = Number(url.searchParams.get('house'));
  const token = url.searchParams.get('token') || '';
  if (!Number.isFinite(houseId) || !token) {
    return new Response('Parametri mancanti', { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: house, error: houseErr } = await supabase
    .from('houses')
    .select('id, name, calendar_feed_token, calendar_feed_enabled, calendar_reminder_cadence, calendar_reminder_lead_days')
    .eq('id', houseId)
    .single();

  if (houseErr || !house || !house.calendar_feed_enabled || String(house.calendar_feed_token) !== token) {
    return new Response('Non trovato', { status: 404, headers: corsHeaders });
  }

  const cadence: Cadence = CADENCES.has(house.calendar_reminder_cadence) ? house.calendar_reminder_cadence : 'monthly';
  const leadDays = Number.isFinite(Number(house.calendar_reminder_lead_days)) ? Number(house.calendar_reminder_lead_days) : 3;
  const today = new Date().toISOString().slice(0, 10);

  const [periodsRes, duesRes, paymentsRes, priorBalancesRes] = await Promise.all([
    supabase.from('fiscal_periods').select('id, label, start_date, end_date').eq('house_id', houseId),
    supabase.from('dues').select('fiscal_period_id, amount, due_kind').eq('house_id', houseId),
    supabase.from('payments').select('fiscal_period_id, amount, date').eq('house_id', houseId),
    supabase.from('prior_balances').select('fiscal_period_id, amount').eq('house_id', houseId)
  ]);

  const periods = (periodsRes.data || []).map(p => ({
    id: p.id,
    label: p.label,
    startDate: p.start_date,
    endDate: p.end_date
  }));
  const dues = (duesRes.data || []).map(d => ({
    fiscalPeriodId: d.fiscal_period_id,
    amount: Number(d.amount),
    dueKind: d.due_kind || 'preventivo'
  }));
  const payments = (paymentsRes.data || []).map(p => ({
    fiscalPeriodId: p.fiscal_period_id,
    amount: Number(p.amount),
    date: p.date || ''
  }));
  const priorBalances = (priorBalancesRes.data || []).map(b => ({
    fiscalPeriodId: b.fiscal_period_id,
    amount: Number(b.amount)
  }));

  const period = findActivePeriod(periods, today);
  const items = period
    ? computeReminderItems(period, computeRemainingAmount(period, dues, payments, priorBalances), cadence, today, house.name, payments)
    : [];

  const ics = buildCalendarFeed(houseId, period?.id ?? 'none', house.name, items, leadDays);

  return new Response(ics, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="condoledger-${houseId}.ics"`,
      'Cache-Control': 'no-cache'
    }
  });
});
