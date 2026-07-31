export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
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
          artist: string
          created_at: string
          id: string
          participant_id: string
          position: number
          session_id: string
          song_title: string
          status: string
          updated_at: string
        }
        Insert: {
          artist: string
          created_at?: string
          id?: string
          participant_id: string
          position: number
          session_id: string
          song_title: string
          status?: string
          updated_at?: string
        }
        Update: {
          artist?: string
          created_at?: string
          id?: string
          participant_id?: string
          position?: number
          session_id?: string
          song_title?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
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
        Args: { p_host_id: string }
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
      recover_participant: {
        Args: {
          p_code: string
          p_participant_id: string
          p_recovery_token: string
        }
        Returns: {
          auth_user_id: string | null
          created_at: string
          disambiguation_index: number
          display_name: string
          id: string
          joined_at: string
          last_seen: string
          session_id: string
        }
        SetofOptions: {
          from: "*"
          to: "participants"
          isOneToOne: true
          isSetofReturn: false
        }
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
  public: {
    Enums: {},
  },
} as const

