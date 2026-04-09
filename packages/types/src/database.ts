// Auto-generated placeholder — run `pnpm db:gen-types` with local Supabase to regenerate.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          email: string | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          invite_code: string;
          created_by: string | null;
          chip_limit: number | null;
          status: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          invite_code: string;
          created_by?: string | null;
          chip_limit?: number | null;
          status?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          invite_code?: string;
          created_by?: string | null;
          chip_limit?: number | null;
          status?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rooms_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      room_members: {
        Row: {
          id: string;
          room_id: string | null;
          user_id: string | null;
          role: 'PLAYER' | 'ATTESTOR' | 'ADMIN' | null;
          joined_at: string | null;
        };
        Insert: {
          id?: string;
          room_id?: string | null;
          user_id?: string | null;
          role?: 'PLAYER' | 'ATTESTOR' | 'ADMIN' | null;
          joined_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string | null;
          user_id?: string | null;
          role?: 'PLAYER' | 'ATTESTOR' | 'ADMIN' | null;
          joined_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'room_members_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'room_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          room_id: string | null;
          name: string;
          sport: string | null;
          status: 'UPCOMING' | 'LIVE' | 'COMPLETED' | null;
          created_by: string | null;
          event_date: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          room_id?: string | null;
          name: string;
          sport?: string | null;
          status?: 'UPCOMING' | 'LIVE' | 'COMPLETED' | null;
          created_by?: string | null;
          event_date?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string | null;
          name?: string;
          sport?: string | null;
          status?: 'UPCOMING' | 'LIVE' | 'COMPLETED' | null;
          created_by?: string | null;
          event_date?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'events_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      bets: {
        Row: {
          id: string;
          event_id: string | null;
          room_id: string | null;
          question: string;
          options: Json;
          template_id: string | null;
          stake: number;
          offered_by: string | null;
          offered_pick: string | null;
          accepted_by: string | null;
          accepted_pick: string | null;
          status:
            | 'OPEN'
            | 'MATCHED'
            | 'PENDING_RESULT'
            | 'DISPUTED'
            | 'SETTLED'
            | 'EXPIRED'
            | 'VOID'
            | null;
          expires_at: string | null;
          created_at: string | null;
          settled_at: string | null;
          outcome: string | null;
          winner: string | null;
          settlement_method: string | null;
        };
        Insert: {
          id?: string;
          event_id?: string | null;
          room_id?: string | null;
          question: string;
          options: Json;
          template_id?: string | null;
          stake: number;
          offered_by?: string | null;
          offered_pick?: string | null;
          accepted_by?: string | null;
          accepted_pick?: string | null;
          status?:
            | 'OPEN'
            | 'MATCHED'
            | 'PENDING_RESULT'
            | 'DISPUTED'
            | 'SETTLED'
            | 'EXPIRED'
            | 'VOID'
            | null;
          expires_at?: string | null;
          created_at?: string | null;
          settled_at?: string | null;
          outcome?: string | null;
          winner?: string | null;
          settlement_method?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string | null;
          room_id?: string | null;
          question?: string;
          options?: Json;
          template_id?: string | null;
          stake?: number;
          offered_by?: string | null;
          offered_pick?: string | null;
          accepted_by?: string | null;
          accepted_pick?: string | null;
          status?:
            | 'OPEN'
            | 'MATCHED'
            | 'PENDING_RESULT'
            | 'DISPUTED'
            | 'SETTLED'
            | 'EXPIRED'
            | 'VOID'
            | null;
          expires_at?: string | null;
          created_at?: string | null;
          settled_at?: string | null;
          outcome?: string | null;
          winner?: string | null;
          settlement_method?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bets_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bets_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bets_offered_by_fkey';
            columns: ['offered_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bets_accepted_by_fkey';
            columns: ['accepted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bets_winner_fkey';
            columns: ['winner'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      outcome_submissions: {
        Row: {
          id: string;
          bet_id: string | null;
          user_id: string | null;
          selected_option: string;
          submitted_at: string | null;
        };
        Insert: {
          id?: string;
          bet_id?: string | null;
          user_id?: string | null;
          selected_option: string;
          submitted_at?: string | null;
        };
        Update: {
          id?: string;
          bet_id?: string | null;
          user_id?: string | null;
          selected_option?: string;
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'outcome_submissions_bet_id_fkey';
            columns: ['bet_id'];
            isOneToOne: false;
            referencedRelation: 'bets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'outcome_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ledger_entries: {
        Row: {
          id: string;
          room_id: string | null;
          type: 'BET' | 'DONATION' | null;
          bet_id: string | null;
          user_id: string | null;
          amount: number;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          room_id?: string | null;
          type?: 'BET' | 'DONATION' | null;
          bet_id?: string | null;
          user_id?: string | null;
          amount: number;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string | null;
          type?: 'BET' | 'DONATION' | null;
          bet_id?: string | null;
          user_id?: string | null;
          amount?: number;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ledger_entries_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_bet_id_fkey';
            columns: ['bet_id'];
            isOneToOne: false;
            referencedRelation: 'bets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      chip_requests: {
        Row: {
          id: string;
          room_id: string | null;
          requested_by: string | null;
          current_balance: number | null;
          status: 'OPEN' | 'FULFILLED' | 'EXPIRED' | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          room_id?: string | null;
          requested_by?: string | null;
          current_balance?: number | null;
          status?: 'OPEN' | 'FULFILLED' | 'EXPIRED' | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string | null;
          requested_by?: string | null;
          current_balance?: number | null;
          status?: 'OPEN' | 'FULFILLED' | 'EXPIRED' | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chip_requests_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chip_requests_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      update_profile: {
        Args: {
          p_display_name: string | null;
          p_avatar_url: string | null;
        };
        Returns: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          email: string | null;
          created_at: string | null;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
