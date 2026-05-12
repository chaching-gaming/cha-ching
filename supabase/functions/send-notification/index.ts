import { corsHeaders } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import {
  sendExpoPushNotifications,
  isDeviceNotRegistered,
  isValidExpoToken,
  type ExpoPushMessage,
} from '../_shared/expo-push.ts';

type NotificationType =
  | 'bet_matched'
  | 'bet_accepted'
  | 'bet_settled'
  | 'bet_disputed'
  | 'bet_expiring'
  | 'chip_request_created'
  | 'chip_donated';

type NotificationPayload = {
  type: NotificationType;
  user_ids: string[];
  title: string;
  body: string;
  data?: {
    room_id?: string;
    bet_id?: string;
    chip_request_id?: string;
  };
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authorization (service role key)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: NotificationPayload = await req.json();
    const { type, user_ids, title, body, data = {} } = payload;

    if (!type || !user_ids?.length || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, user_ids, title, body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const results = {
      notified: 0,
      skipped: 0,
      failed: 0,
      invalidTokensRemoved: 0,
    };

    // Process each user
    const pushMessages: ExpoPushMessage[] = [];
    const tokenToUserMap: Map<string, string> = new Map();

    for (const userId of user_ids) {
      // Get user notification settings
      const { data: settings, error: settingsError } = await supabaseAdmin.rpc(
        'get_user_notification_settings',
        { p_user_id: userId }
      );

      if (settingsError || !settings?.length) {
        console.error(`Failed to get settings for user ${userId}:`, settingsError);
        results.skipped++;
        continue;
      }

      const userSettings = settings[0];

      // Skip if notifications disabled
      if (!userSettings.notifications_enabled) {
        results.skipped++;
        continue;
      }

      // Skip if no device tokens
      if (!userSettings.expo_push_tokens?.length) {
        results.skipped++;
        continue;
      }

      // Insert notification record for history/badge and get the ID
      const { data: insertedNotification, error: insertError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: userId,
          type,
          title,
          body,
          data,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error(`Failed to insert notification for user ${userId}:`, insertError);
      }

      const notificationId = insertedNotification?.id ?? null;

      // Queue push messages for valid tokens
      for (const token of userSettings.expo_push_tokens) {
        if (!isValidExpoToken(token)) {
          continue;
        }

        tokenToUserMap.set(token, userId);
        pushMessages.push({
          to: token,
          title,
          body,
          data: {
            type,
            notification_id: notificationId,
            ...data,
          },
          sound: 'default',
          priority: 'high',
        });
      }
    }

    // Send all push notifications
    if (pushMessages.length > 0) {
      const tickets = await sendExpoPushNotifications(pushMessages);

      // Process results and clean up invalid tokens
      const tokensToRemove: string[] = [];

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const message = pushMessages[i];
        const token = typeof message.to === 'string' ? message.to : message.to[0];

        if (ticket.status === 'ok') {
          results.notified++;
        } else {
          results.failed++;

          // Remove invalid tokens
          if (isDeviceNotRegistered(ticket)) {
            tokensToRemove.push(token);
          }
        }
      }

      // Clean up invalid tokens from database
      if (tokensToRemove.length > 0) {
        for (const token of tokensToRemove) {
          const userId = tokenToUserMap.get(token);
          if (userId) {
            const { error: deleteError } = await supabaseAdmin
              .from('user_devices')
              .delete()
              .eq('user_id', userId)
              .eq('expo_push_token', token);

            if (!deleteError) {
              results.invalidTokensRemoved++;
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in send-notification:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
