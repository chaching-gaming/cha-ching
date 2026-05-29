import { corsHeaders } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { bet_id, delay_seconds = 30 } = await req.json();

    // Wait exactly 30 seconds
    await new Promise((resolve) => setTimeout(resolve, delay_seconds * 1000));

    // Delete only if still VOID (safety check)
    const { data, error } = await supabaseAdmin
      .from('bets')
      .delete()
      .eq('id', bet_id)
      .eq('status', 'VOID')
      .select('id');

    return new Response(
      JSON.stringify({ success: !error, deleted: data?.length ?? 0, bet_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in delete-void-bet:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
