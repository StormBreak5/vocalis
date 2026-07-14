export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          code: string
          host_id: string
          status: 'active' | 'paused' | 'closed'
          max_participants: number
          max_queue_entries: number
          created_at: string
          closed_at: string | null
        }
        Insert: {
          id?: string
          code: string
          host_id: string
          status?: 'active' | 'paused' | 'closed'
          max_participants?: number
          max_queue_entries?: number
          created_at?: string
          closed_at?: string | null
        }
        Update: {
          id?: string
          code?: string
          host_id?: string
          status?: 'active' | 'paused' | 'closed'
          max_participants?: number
          max_queue_entries?: number
          created_at?: string
          closed_at?: string | null
        }
        Relationships: []
      }
      participants: {
        Row: {
          id: string
          session_id: string
          display_name: string
          disambiguation_index: number
          recovery_token_hash: string
          joined_at: string
          last_seen: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          display_name: string
          disambiguation_index?: number
          recovery_token_hash: string
          joined_at?: string
          last_seen?: string
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          display_name?: string
          disambiguation_index?: number
          recovery_token_hash?: string
          joined_at?: string
          last_seen?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_session: {
        Args: {
          p_host_id: string
        }
        Returns: Database['public']['Tables']['sessions']['Row']
      }
      join_session: {
        Args: {
          p_code: string
          p_display_name: string
        }
        Returns: {
          participant: Database['public']['Tables']['participants']['Row']
          recovery_token: string
        }
      }
      recover_participant: {
        Args: {
          p_participant_id: string
          p_recovery_token: string
          p_code: string
        }
        Returns: Database['public']['Tables']['participants']['Row']
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
