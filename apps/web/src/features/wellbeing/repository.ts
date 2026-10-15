import { createClient } from '@/lib/supabase/client';
import type { WellbeingAnswers } from './model';

export async function saveWellbeing(organizationId: string, personId: string, date: string, answers: WellbeingAnswers, wantsContact: boolean, note: string) {
  const client = createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('Sessão inválida');
  const { error } = await client.from('member_wellbeing_checkins').upsert({ organization_id: organizationId, person_id: personId, checkin_date: date, emotional: answers.emotional ?? null, financial: answers.financial ?? null, sentimental: answers.sentimental ?? null, spiritual: answers.spiritual ?? null, wants_contact: wantsContact, note: note || null }, { onConflict: 'person_id,checkin_date' });
  if (error) throw error;
}

export async function loadWellbeingHistory(organizationId: string, personId: string) {
  const client = createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('Sessão inválida');
  const { data, error } = await client.from('member_wellbeing_checkins').select('*').eq('organization_id', organizationId).eq('person_id', personId).order('checkin_date', { ascending: false }).limit(30);
  if (error) throw error;
  return data ?? [];
}
