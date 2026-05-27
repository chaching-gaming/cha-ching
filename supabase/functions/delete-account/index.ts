import { corsHeaders } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get the user's JWT from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the token and get the user
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    // Delete user data in order (respecting foreign key constraints)
    // Note: profiles table has ON DELETE CASCADE from auth.users,
    // but we'll clean up other data explicitly for safety

    // 1. Delete user's notifications
    await supabaseAdmin.from('notifications').delete().eq('user_id', userId);

    // 2. Delete user's notification config
    await supabaseAdmin.from('notification_config').delete().eq('user_id', userId);

    // 3. Delete user's devices
    await supabaseAdmin.from('user_devices').delete().eq('user_id', userId);

    // 4. Delete user's outcome submissions
    await supabaseAdmin.from('outcome_submissions').delete().eq('submitted_by', userId);

    // 5. Delete user's ledger entries
    await supabaseAdmin.from('ledger_entries').delete().eq('user_id', userId);

    // 6. Remove user from room_members
    await supabaseAdmin.from('room_members').delete().eq('user_id', userId);

    // 7. Anonymize bets where user is involved (don't delete - preserve room history)
    // Set offered_by/accepted_by/winner to null for deleted user
    await supabaseAdmin
      .from('bets')
      .update({ offered_by: null })
      .eq('offered_by', userId);
    await supabaseAdmin
      .from('bets')
      .update({ accepted_by: null })
      .eq('accepted_by', userId);
    await supabaseAdmin
      .from('bets')
      .update({ winner: null })
      .eq('winner', userId);

    // 8. Delete user's bet stakes
    await supabaseAdmin.from('bet_stakes').delete().eq('user_id', userId);

    // 9. Finally, delete the auth user (this will cascade delete the profile)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete account. Please try again.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Account deleted successfully' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in delete-account:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
