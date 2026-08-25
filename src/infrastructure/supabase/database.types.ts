export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      display_pairings: {
        Row: {
          auth_user_id: string
          id: string
          paired_at: string
          revoked_at: string | null
          session_id: string
        }
        Insert: {
          auth_user_id: string
          id?: string
          paired_at?: string
          revoked_at?: string | null
          session_id: string
        }
        Update: {
          auth_user_id?: string
          id?: string
          paired_at?: string
          revoked_at?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_pairings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          auth_user_id: string | null
          created_at: string
          disambiguation_index: number
          display_name: string
          id: string
          joined_at: string
          last_seen: string
          session_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          disambiguation_index?: number
          display_name: string
          id?: string
          joined_at?: string
          last_seen?: string
          session_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          disambiguation_index?: number
          display_name?: string
          id?: string
          joined_at?: string
          last_seen?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      queue: {
        Row: {
          artist: string | null
          created_at: string
          id: string
          participant_id: string
          position: number
          session_id: string
          song_title: string | null
          status: string
          updated_at: string
        }
        Insert: {
          artist?: string | null
          created_at?: string
          id?: string
          participant_id: string
          position: number
          session_id: string
          song_title?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          artist?: string | null
          created_at?: string
          id?: string
          participant_id?: string
          position?: number
          session_id?: string
          song_title?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_participant_session_fk"
            columns: ["participant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id", "session_id"]
          },
          {
            foreignKeyName: "queue_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          closed_at: string | null
          code: string
          created_at: string
          host_id: string
          id: string
          max_participants: number
          max_queue_entries: number
          status: string
        }
        Insert: {
          closed_at?: string | null
          code: string
          created_at?: string
          host_id: string
          id?: string
          max_participants?: number
          max_queue_entries?: number
          status?: string
        }
        Update: {
          closed_at?: string | null
          code?: string
          created_at?: string
          host_id?: string
          id?: string
          max_participants?: number
          max_queue_entries?: number
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_queue_entry: { Args: { p_queue_id: string }; Returns: undefined }
      close_session: {
        Args: { p_session_id: string }
        Returns: {
          changed: boolean
          closed_at: string
          session_id: string
          status: string
        }[]
      }
      create_queue_entry: {
        Args: { p_artist: string; p_session_id: string; p_song_title: string }
        Returns: {
          artist: string
          created_at: string
          id: string
          participant_id: string
          position: number
          session_id: string
          song_title: string
          status: string
          updated_at: string
        }[]
      }
      create_session: {
        Args: never
        Returns: {
          closed_at: string | null
          code: string
          created_at: string
          host_id: string
          id: string
          max_participants: number
          max_queue_entries: number
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_display_pairing_code: {
        Args: { p_session_id: string }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      get_display_session_details: {
        Args: { p_session_id: string }
        Returns: {
          closed_at: string
          code: string
          id: string
          status: string
        }[]
      }
      get_host_session_details: {
        Args: { p_session_id: string }
        Returns: {
          closed_at: string
          code: string
          created_at: string
          id: string
          max_participants: number
          max_queue_entries: number
          status: string
        }[]
      }
      join_session: {
        Args: { p_code: string; p_display_name: string }
        Returns: Json
      }
      list_active_queue: {
        Args: { p_session_id: string }
        Returns: {
          artist: string
          created_at: string
          id: string
          participant_id: string
          participant_name: string
          position: number
          session_id: string
          song_title: string
          status: string
          updated_at: string
        }[]
      }
      list_host_sessions: {
        Args: never
        Returns: {
          closed_at: string
          code: string
          created_at: string
          id: string
          participant_count: number
          song_count: number
          status: string
        }[]
      }
      list_paired_displays: {
        Args: { p_session_id: string }
        Returns: {
          id: string
          paired_at: string
        }[]
      }
      redeem_display_pairing_code: {
        Args: { p_pairing_code: string; p_room_code: string }
        Returns: {
          paired: boolean
          session_id: string
        }[]
      }
      reorder_queue: {
        Args: { p_queue_ids: string[]; p_session_id: string }
        Returns: {
          id: string
          position: number
        }[]
      }
      revoke_display_pairing: {
        Args: { p_display_pairing_id: string }
        Returns: {
          id: string
          revoked: boolean
        }[]
      }
      update_queue_song: {
        Args: { p_artist: string; p_queue_id: string; p_song_title: string }
        Returns: {
          artist: string
          created_at: string
          id: string
          participant_id: string
          position: number
          session_id: string
          song_title: string
          status: string
          updated_at: string
        }[]
      }
      update_queue_status: {
        Args: { p_new_status: string; p_queue_id: string }
        Returns: {
          changed: boolean
          id: string
          status: string
          updated_at: string
        }[]
      }
      update_session_status: {
        Args: { p_new_status: string; p_session_id: string }
        Returns: {
          changed: boolean
          id: string
          status: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      join_session_result: {
        participant: Database["public"]["Tables"]["participants"]["Row"] | null
        recovery_token: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

