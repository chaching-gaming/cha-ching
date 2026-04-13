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
          id: string;
          requested_by: string | null;
          room_id: string | null;
          status: string | null;
        };
        Insert: {
          created_at?: string | null;
          current_balance?: number | null;
          id?: string;
          requested_by?: string | null;
          room_id?: string | null;
          status?: string | null;
        };
        Update: {
          created_at?: string | null;
          current_balance?: number | null;
          id?: string;
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
          created_at: string | null;
          id: string;
          room_id: string | null;
          type: string | null;
          user_id: string | null;
        };
        Insert: {
          amount: number;
          bet_id?: string | null;
          created_at?: string | null;
          id?: string;
          room_id?: string | null;
          type?: string | null;
          user_id?: string | null;
        };
        Update: {
          amount?: number;
          bet_id?: string | null;
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
      create_room: {
        Args: { p_chip_limit?: number; p_name: string; p_session_date: string };
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
      get_my_room_balance: { Args: { p_room_id: string }; Returns: number };
      is_room_member: { Args: { p_room_id: string }; Returns: boolean };
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
      reassign_admin: {
        Args: { p_new_admin_user_id: string; p_room_id: string };
        Returns: undefined;
      };
      remove_member: {
        Args: { p_room_id: string; p_target_user_id: string };
        Returns: undefined;
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
