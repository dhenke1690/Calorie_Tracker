import { serve } from 'https://deno.land/std@0.194.0/http/server.ts';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLAUDE_API_KEY) {
  throw new Error('Missing required environment variables for the Claude Edge Function.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization token.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(authHeader);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const description = (body.description || '').trim();
  if (!description) {
    return new Response(JSON.stringify({ error: 'Missing description.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = `Analyze this meal entry and reply only with a JSON object containing calories, protein, carbs, and fat rounded to whole numbers. Do not add any prose.\n\nFood description: ${description}\n\nExample response:\n{\n  "calories": 420,\n  "protein": 22,\n  "carbs": 35,\n  "fat": 18\n}`;

  const res = await fetch('https://api.anthropic.com/v1/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
    },
    body: JSON.stringify({
      model: 'claude-3.5-mini',
      prompt: `<s>\nHuman: ${prompt}\nAssistant:`,
      max_tokens_to_sample: 150,
      temperature: 0.2,
    }),
  });

  const result = await res.json().catch(() => null);
  if (!res.ok) {
    return new Response(JSON.stringify({ error: result?.error || 'Claude request failed.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ completion: result.completion?.trim() ?? '' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
