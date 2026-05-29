const CLAUDE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
const FALLBACK_PROXY_URL = import.meta.env.VITE_CLAUDE_PROXY_URL;
const BASE_URL = CLAUDE_FUNCTIONS_URL || FALLBACK_PROXY_URL || 'http://localhost:5174';

export async function estimateMacros(description, accessToken) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}/claude`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ description }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || 'Claude estimate failed');
  }

  const data = await response.json();
  return data.completion;
}
