export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      bet_stakes: {
        Row: {
          bet_id: string;
          created_at: string | null;
          id: string;
          pick: string;
          stake: number;
          user_id: string;
        };
        Insert: {
          bet_id: string;
          created_at?: string | null;
          id?: string;
          pick: string;
          stake: number;
          user_id: string;
        };
        Update: {
          bet_id?: string;
          created_at?: string | null;
          id?: string;
          pick?: string;
          stake?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bet_stakes_bet_id_fkey';
            columns: ['bet_id'];
            isOneToOne: false;
            referencedRelation: 'bets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bet_stakes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      bet_void_logs: {
        Row: {
          affected_user_count: number;
          bet_id: string;
          created_at: string;
          id: string;
          previous_status: string;
          reason: string | null;
          refund_total: number;
          room_id: string;
          voided_by: string;
        };
        Insert: {
          affected_user_count?: number;
          bet_id: string;
          created_at?: string;
          id?: string;
          previous_status: string;
          reason?: string | null;
          refund_total?: number;
          room_id: string;
          voided_by: string;
        };
        Update: {
          affected_user_count?: number;
          bet_id?: string;
          created_at?: string;
          id?: string;
          previous_status?: string;
          reason?: string | null;
          refund_total?: number;
          room_id?: string;
          voided_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bet_void_logs_bet_id_fkey';
            columns: ['bet_id'];
            isOneToOne: false;
            referencedRelation: 'bets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bet_void_logs_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bet_void_logs_voided_by_fkey';
            columns: ['voided_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      bets: {
        Row: {
          accepted_by: string | null;
          accepted_pick: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          offered_by: string | null;
          offered_pick: string | null;
          options: Json;
          outcome: string | null;
          question: string;
          room_id: string;
          settled_at: string | null;
          settlement_method: string | null;
          stake: number;
          status: string | null;
          subject_positive_option: string | null;
          subject_user_id: string | null;
          template_id: string | null;
          winner: string | null;
        };
        Insert: {
          accepted_by?: string | null;
          accepted_pick?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          offered_by?: string | null;
          offered_pick?: string | null;
          options: Json;
          outcome?: string | null;
          question: string;
          room_id: string;
          settled_at?: string | null;
          settlement_method?: string | null;
          stake: number;
          status?: string | null;
          subject_positive_option?: string | null;
          subject_user_id?: string | null;
          template_id?: string | null;
          winner?: string | null;
        };
        Update: {
          accepted_by?: string | null;
          accepted_pick?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          offered_by?: string | null;
          offered_pick?: string | null;
          options?: Json;
          outcome?: string | null;
          question?: string;
          room_id?: string;
          settled_at?: string | null;
          settlement_method?: string | null;
          stake?: number;
          status?: string | null;
          subject_positive_option?: string | null;
          subject_user_id?: string | null;
          template_id?: string | null;
          winner?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bets_accepted_by_fkey';
            columns: ['accepted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
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
            foreignKeyName: 'bets_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bets_subject_user_id_fkey';
            columns: ['subject_user_id'];
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
      chip_requests: {
        Row: {
          created_at: string | null;
          current_balance: number | null;
          fulfilled_amount: number;
          id: string;
          message: string | null;
          requested_amount: number;
          requested_by: string | null;
          room_id: string | null;
          status: string | null;
        };
        Insert: {
          created_at?: string | null;
          current_balance?: number | null;
          fulfilled_amount?: number;
          id?: string;
          message?: string | null;
          requested_amount: number;
          requested_by?: string | null;
          room_id?: string | null;
          status?: string | null;
        };
        Update: {
          created_at?: string | null;
          current_balance?: number | null;
          fulfilled_amount?: number;
          id?: string;
          message?: string | null;
          requested_amount?: number;
          requested_by?: string | null;
          room_id?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chip_requests_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chip_requests_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
        ];
      };
      ledger_entries: {
        Row: {
          amount: number;
          bet_id: string | null;
          chip_request_id: string | null;
          created_at: string | null;
          id: string;
          room_id: string | null;
          type: string | null;
          user_id: string | null;
        };
        Insert: {
          amount: number;
          bet_id?: string | null;
          chip_request_id?: string | null;
          created_at?: string | null;
          id?: string;
          room_id?: string | null;
          type?: string | null;
          user_id?: string | null;
        };
        Update: {
          amount?: number;
          bet_id?: string | null;
          chip_request_id?: string | null;
          created_at?: string | null;
          id?: string;
          room_id?: string | null;
          type?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ledger_entries_bet_id_fkey';
            columns: ['bet_id'];
            isOneToOne: false;
            referencedRelation: 'bets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_chip_request_id_fkey';
            columns: ['chip_request_id'];
            isOneToOne: false;
            referencedRelation: 'chip_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
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
      outcome_submissions: {
        Row: {
          bet_id: string | null;
          id: string;
          selected_option: string;
          submitted_at: string | null;
          user_id: string | null;
        };
        Insert: {
          bet_id?: string | null;
          id?: string;
          selected_option: string;
          submitted_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          bet_id?: string | null;
          id?: string;
          selected_option?: string;
          submitted_at?: string | null;
          user_id?: string | null;
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
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          display_name: string | null;
          email: string | null;
          id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          email?: string | null;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          email?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      question_templates: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          options: Json;
          question_text: string;
          short_label: string;
          slug: string;
          subject_positive_option: string | null;
        };
        Insert: {
          category?: string;
          created_at?: string;
          id?: string;
          options: Json;
          question_text: string;
          short_label: string;
          slug: string;
          subject_positive_option?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          options?: Json;
          question_text?: string;
          short_label?: string;
          slug?: string;
          subject_positive_option?: string | null;
        };
        Relationships: [];
      };
      room_members: {
        Row: {
          id: string;
          joined_at: string | null;
          role: string | null;
          room_id: string | null;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          joined_at?: string | null;
          role?: string | null;
          room_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          joined_at?: string | null;
          role?: string | null;
          room_id?: string | null;
          user_id?: string | null;
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
      rooms: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          ended_at: string | null;
          id: string;
          invite_code: string;
          is_active: boolean;
          name: string;
          per_user_chip_limit: number | null;
          session_date: string;
          starting_chips: number;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          ended_at?: string | null;
          id?: string;
          invite_code: string;
          is_active?: boolean;
          name: string;
          per_user_chip_limit?: number | null;
          session_date: string;
          starting_chips?: number;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          ended_at?: string | null;
          id?: string;
          invite_code?: string;
          is_active?: boolean;
          name?: string;
          per_user_chip_limit?: number | null;
          session_date?: string;
          starting_chips?: number;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_bet: {
        Args: { p_bet_id: string; p_pick: string };
        Returns: {
          accepted_by: string | null;
          accepted_pick: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          offered_by: string | null;
          offered_pick: string | null;
          options: Json;
          outcome: string | null;
          question: string;
          room_id: string;
          settled_at: string | null;
          settlement_method: string | null;
          stake: number;
          status: string | null;
          subject_positive_option: string | null;
          subject_user_id: string | null;
          template_id: string | null;
          winner: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'bets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancel_chip_request: {
        Args: { p_chip_request_id: string };
        Returns: {
          created_at: string | null;
          current_balance: number | null;
          fulfilled_amount: number;
          id: string;
          message: string | null;
          requested_amount: number;
          requested_by: string | null;
          room_id: string | null;
          status: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'chip_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_bet: {
        Args: {
          p_expires_at: string;
          p_offered_pick: string;
          p_options: Json;
          p_question: string;
          p_room_id: string;
          p_stake: number;
          p_subject_display_name?: string;
          p_subject_positive_option?: string;
          p_subject_user_id: string;
          p_template_id?: string;
        };
        Returns: {
          accepted_by: string | null;
          accepted_pick: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          offered_by: string | null;
          offered_pick: string | null;
          options: Json;
          outcome: string | null;
          question: string;
          room_id: string;
          settled_at: string | null;
          settlement_method: string | null;
          stake: number;
          status: string | null;
          subject_positive_option: string | null;
          subject_user_id: string | null;
          template_id: string | null;
          winner: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'bets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_room: {
        Args: { p_name: string; p_description?: string | null; p_starting_chips?: number };
        Returns: {
          created_at: string | null;
          created_by: string | null;
          ended_at: string | null;
          id: string;
          invite_code: string;
          is_active: boolean;
          name: string;
          per_user_chip_limit: number | null;
          session_date: string;
          starting_chips: number;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      donate_chips: {
        Args: { p_amount: number; p_chip_request_id: string };
        Returns: {
          created_at: string | null;
          current_balance: number | null;
          fulfilled_amount: number;
          id: string;
          message: string | null;
          requested_amount: number;
          requested_by: string | null;
          room_id: string | null;
          status: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'chip_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      end_session: {
        Args: { p_room_id: string };
        Returns: {
          created_at: string | null;
          created_by: string | null;
          ended_at: string | null;
          id: string;
          invite_code: string;
          is_active: boolean;
          name: string;
          per_user_chip_limit: number | null;
          session_date: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      expire_open_bets: { Args: never; Returns: number };
      export_room_bets: {
        Args: { p_room_id: string };
        Returns: {
          accepted_by: string;
          accepted_by_name: string;
          accepted_pick: string;
          created_at: string;
          id: string;
          offered_by: string;
          offered_by_name: string;
          offered_pick: string;
          options: Json;
          outcome: string;
          question: string;
          settled_at: string;
          settlement_method: string;
          stake: number;
          status: string;
          subject_positive_option: string;
          subject_user_id: string;
          subject_user_name: string;
          void_reason: string;
          voided_at: string;
          voided_by: string;
          voided_by_name: string;
          winner: string;
          winner_name: string;
        }[];
      };
      get_my_room_balance: { Args: { p_room_id: string }; Returns: number };
      get_room_event_stats: {
        Args: { p_room_id: string };
        Returns: {
          matched_bets: number;
          open_bets: number;
          popular_templates: Json;
          settled_bets: number;
          total_bets: number;
          total_chips_wagered: number;
          total_donations: number;
          total_members: number;
          voided_bets: number;
        }[];
      };
      get_room_ledger: {
        Args: { p_limit?: number; p_offset?: number; p_room_id: string };
        Returns: {
          amount: number;
          avatar_url: string;
          bet_id: string;
          bet_question: string;
          chip_request_id: string;
          created_at: string;
          display_name: string;
          id: string;
          type: string;
          user_id: string;
        }[];
      };
      get_room_member_balances: {
        Args: { p_room_id: string };
        Returns: {
          avatar_url: string;
          balance: number;
          display_name: string;
          losses: number;
          user_id: string;
          wins: number;
        }[];
      };
      get_room_player_stats: {
        Args: { p_room_id: string };
        Returns: {
          avatar_url: string;
          balance: number;
          category_breakdown: Json;
          display_name: string;
          losses: number;
          user_id: string;
          wins: number;
        }[];
      };
      is_room_admin: { Args: { p_room_id: string }; Returns: boolean };
      is_room_attestor: { Args: { p_room_id: string }; Returns: boolean };
      is_room_member: { Args: { p_room_id: string }; Returns: boolean };
      join_bet: {
        Args: { p_bet_id: string; p_pick: string };
        Returns: {
          accepted_by: string | null;
          accepted_pick: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          offered_by: string | null;
          offered_pick: string | null;
          options: Json;
          outcome: string | null;
          question: string;
          room_id: string;
          settled_at: string | null;
          settlement_method: string | null;
          stake: number;
          status: string | null;
          subject_positive_option: string | null;
          subject_user_id: string | null;
          template_id: string | null;
          winner: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'bets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      join_room_via_invite: {
        Args: { p_invite_code: string };
        Returns: {
          created_at: string | null;
          created_by: string | null;
          ended_at: string | null;
          id: string;
          invite_code: string;
          is_active: boolean;
          name: string;
          per_user_chip_limit: number | null;
          session_date: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rooms';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      list_question_templates: {
        Args: { p_category?: string };
        Returns: {
          category: string;
          created_at: string;
          id: string;
          options: Json;
          question_text: string;
          short_label: string;
          slug: string;
          subject_positive_option: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'question_templates';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      reassign_admin: {
        Args: { p_new_admin_user_id: string; p_room_id: string };
        Returns: undefined;
      };
      remove_member: {
        Args: { p_room_id: string; p_target_user_id: string };
        Returns: undefined;
      };
      request_chips: {
        Args: { p_amount: number; p_message?: string; p_room_id: string };
        Returns: {
          created_at: string | null;
          current_balance: number | null;
          fulfilled_amount: number;
          id: string;
          message: string | null;
          requested_amount: number;
          requested_by: string | null;
          room_id: string | null;
          status: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'chip_requests';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      resolve_dispute: {
        Args: { p_bet_id: string; p_final_option: string };
        Returns: {
          accepted_by: string | null;
          accepted_pick: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          offered_by: string | null;
          offered_pick: string | null;
          options: Json;
          outcome: string | null;
          question: string;
          room_id: string;
          settled_at: string | null;
          settlement_method: string | null;
          stake: number;
          status: string | null;
          subject_positive_option: string | null;
          subject_user_id: string | null;
          template_id: string | null;
          winner: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'bets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      settle_bet: {
        Args: { p_bet_id: string };
        Returns: {
          accepted_by: string | null;
          accepted_pick: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          offered_by: string | null;
          offered_pick: string | null;
          options: Json;
          outcome: string | null;
          question: string;
          room_id: string;
          settled_at: string | null;
          settlement_method: string | null;
          stake: number;
          status: string | null;
          subject_positive_option: string | null;
          subject_user_id: string | null;
          template_id: string | null;
          winner: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'bets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      submit_outcome: {
        Args: { p_bet_id: string; p_selected_option: string };
        Returns: {
          bet_id: string | null;
          id: string;
          selected_option: string;
          submitted_at: string | null;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'outcome_submissions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_member_role: {
        Args: {
          p_new_role: string;
          p_room_id: string;
          p_target_user_id: string;
        };
        Returns: undefined;
      };
      update_profile: {
        Args: { p_avatar_url?: string; p_display_name?: string };
        Returns: {
          avatar_url: string | null;
          created_at: string | null;
          display_name: string | null;
          email: string | null;
          id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      void_bet: {
        Args: { p_bet_id: string; p_reason?: string };
        Returns: {
          accepted_by: string | null;
          accepted_pick: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          offered_by: string | null;
          offered_pick: string | null;
          options: Json;
          outcome: string | null;
          question: string;
          room_id: string;
          settled_at: string | null;
          settlement_method: string | null;
          stake: number;
          status: string | null;
          subject_positive_option: string | null;
          subject_user_id: string | null;
          template_id: string | null;
          winner: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'bets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_notifications: {
        Args: { p_limit?: number; p_offset?: number };
        Returns: {
          id: string;
          type: string;
          title: string;
          body: string | null;
          data: Json | null;
          read: boolean;
          created_at: string;
        }[];
      };
      get_unread_notification_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      mark_notifications_read: {
        Args: { p_notification_ids: string[] };
        Returns: number;
      };
      register_device: {
        Args: { p_expo_push_token: string; p_platform: string };
        Returns: undefined;
      };
      unregister_device: {
        Args: { p_expo_push_token: string };
        Returns: undefined;
      };
      update_notification_preference: {
        Args: { p_notification_type: string; p_enabled: boolean };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
