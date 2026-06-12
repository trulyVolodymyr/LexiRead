// Hand-authored to match supabase/migrations/0001_init.sql.
// If the schema changes, regenerate with: supabase gen types typescript --local

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      books: {
        Row: {
          id: string
          user_id: string
          title: string
          author: string | null
          language: string
          format: string
          file_hash: string
          file_path: string
          cover_path: string | null
          chunk_count: number
          char_count: number
          toc: Json
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          author?: string | null
          language: string
          format: string
          file_hash: string
          file_path: string
          cover_path?: string | null
          chunk_count: number
          char_count: number
          toc?: Json
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          author?: string | null
          language?: string
          format?: string
          file_hash?: string
          file_path?: string
          cover_path?: string | null
          chunk_count?: number
          char_count?: number
          toc?: Json
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      book_chunks: {
        Row: {
          book_id: string
          chunk_index: number
          chapter_index: number
          char_start: number
          char_count: number
          content: string
        }
        Insert: {
          book_id: string
          chunk_index: number
          chapter_index: number
          char_start: number
          char_count: number
          content: string
        }
        Update: {
          book_id?: string
          chunk_index?: number
          chapter_index?: number
          char_start?: number
          char_count?: number
          content?: string
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          user_id: string
          book_id: string
          chunk_index: number
          char_offset: number
          percent: number
          device_id: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          book_id: string
          chunk_index?: number
          char_offset?: number
          percent?: number
          device_id?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          book_id?: string
          chunk_index?: number
          char_offset?: number
          percent?: number
          device_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      translation_cache: {
        Row: {
          cache_key: string
          src_lang: string
          tgt_lang: string
          mode: string
          response: Json
          provider: string
          hit_count: number
          created_at: string
        }
        Insert: {
          cache_key: string
          src_lang: string
          tgt_lang: string
          mode: string
          response: Json
          provider: string
          hit_count?: number
          created_at?: string
        }
        Update: {
          cache_key?: string
          src_lang?: string
          tgt_lang?: string
          mode?: string
          response?: Json
          provider?: string
          hit_count?: number
          created_at?: string
        }
        Relationships: []
      }
      usage_quotas: {
        Row: {
          user_id: string
          day: string
          word_lookups: number
          sentence_translations: number
        }
        Insert: {
          user_id: string
          day?: string
          word_lookups?: number
          sentence_translations?: number
        }
        Update: {
          user_id?: string
          day?: string
          word_lookups?: number
          sentence_translations?: number
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      increment_usage: {
        Args: { p_user: string; p_kind: string; p_limit: number }
        Returns: boolean
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
