/**
 * Expo Push API helper for sending push notifications.
 * See: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type ExpoPushMessage = {
  to: string | string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
};

export type ExpoPushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error: string } };

export type ExpoPushResponse = {
  data: ExpoPushTicket[];
};

/**
 * Send push notifications via Expo Push API.
 * Returns array of tickets for tracking delivery status.
 */
export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) {
    return [];
  }

  // Expo recommends batching in chunks of 100
  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  const allTickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      console.error('Expo Push API error:', response.status, await response.text());
      continue;
    }

    const result: ExpoPushResponse = await response.json();
    allTickets.push(...result.data);
  }

  return allTickets;
}

/**
 * Check if a token error indicates the device is no longer registered.
 * These tokens should be removed from the database.
 */
export function isDeviceNotRegistered(ticket: ExpoPushTicket): boolean {
  return (
    ticket.status === 'error' &&
    ticket.details?.error === 'DeviceNotRegistered'
  );
}

/**
 * Check if a token is a valid Expo push token format.
 */
export function isValidExpoToken(token: string): boolean {
  return /^ExponentPushToken\[.+\]$/.test(token) || /^ExpoPushToken\[.+\]$/.test(token);
}
