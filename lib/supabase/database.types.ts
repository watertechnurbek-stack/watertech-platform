// Regenerate with npm run gen:types; hand-written from migrations 0001–0007 on 2026-09-17,
// rate_limits / rate_limit_hit added by hand from 0008 on 2026-09-18, user_state by hand
// from 0009 on 2026-09-19, content_changelog by hand from 0010 on 2026-09-20,
// content_contacts / content_sops by hand from 0011 / 0012 on 2026-09-20
// (Supabase CLI unavailable locally: SUPABASE_PROJECT_ID unset).
//
// allowed_users (full_name, is_active, created_at, updated_at, updated_by) and
// content_versions (op) added by hand from 0013 on 2026-09-22 — run
// `npm run gen:types` once 0013 is applied to confirm them against the project.
// reorder_content_rows added by hand from 0015 on 2026-09-22.
// access_audit and admin_user_last_activity added by hand from 0017 on
// 2026-09-23. access_audit's Insert/Update exist only because the generator
// always emits them — no API role holds either privilege on that table.
// copilot_stats / copilot_unanswered added by hand from 0019 on 2026-09-23.
// dashboard_* and run_retention added by hand from 0016 on 2026-09-23. Every
// RETURNS TABLE function comes back from PostgREST as an array of rows; bigint
// and numeric columns arrive as JSON numbers. `p_operator` / `p_limit` /
// `p_skip_if_scheduled` have SQL defaults, hence optional.
// admin_people_overview, admin_person_summary / _daily / _sections /
// _recent_events and admin_top_content added by hand from 0021 on 2026-09-24,
// same conventions (a `date` column arrives as "YYYY-MM-DD", jsonb as `Json`).
// lib/admin/people.ts parses every row with zod before anything reads it.
// admin_purge_person_history added by hand from 0022 on 2026-09-26 (a jsonb
// scalar return: {"telemetry", "user_state", "copilot"} counts; 0023 adds
// "assessment_attempts", "assessment_messages", "assessment_unlocks").
// assessment_config / _items / _attempts / _messages / _unlocks / _audit, the
// admin_assessment_* functions and run_assessment_retention added by hand from
// 0023 on 2026-09-26, same conventions (text[] as string[], numeric(5,2) as
// number, `p_version` of admin_assessment_reset has a SQL default, hence
// optional). The column grants of 0023 are narrower than these Insert/Update
// shapes — the generator does not read grants; lib/attestation/repository.ts
// writes only what they allow.
//
// allowed_users and telemetry_events were created by hand before
// supabase/migrations existed; 0013_baseline_and_audit_integrity.sql is their
// baseline. The columns below are the shape that migration declares:
// allowed_users from 0001_custom_access_token_hook.sql (email, role) plus 0013's
// bookkeeping columns, telemetry_events from app/api/events/route.ts (insert)
// and lib/telemetry/aggregate.ts (TelemetryRow).

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
      access_audit: {
        Row: {
          action: string
          actor: string
          after: Json | null
          before: Json | null
          created_at: string
          id: number
          target_email: string
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: never
          target_email: string
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: never
          target_email?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          actor: string | null
          body: string | null
          created_at: string
          href: string | null
          id: number
          kind: string
          read_at: string | null
          row_id: string | null
          severity: string
          table_name: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actor?: string | null
          body?: string | null
          created_at?: string
          href?: string | null
          id?: number
          kind: string
          read_at?: string | null
          row_id?: string | null
          severity: string
          table_name?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actor?: string | null
          body?: string | null
          created_at?: string
          href?: string | null
          id?: number
          kind?: string
          read_at?: string | null
          row_id?: string | null
          severity?: string
          table_name?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      allowed_users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          is_active: boolean
          role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          is_active?: boolean
          role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          is_active?: boolean
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      assessment_attempts: {
        Row: {
          answers: Json
          attempt_no: number
          day: number
          day_score: number | null
          eval_model: string | null
          evaluator_runs: Json
          factual_errors: Json | null
          flags: Json
          id: string
          item_ids: string[]
          model: string | null
          needs_review: boolean
          overridden_at: string | null
          overridden_by: string | null
          override_note: string | null
          override_score: number | null
          part_a_finished_at: string | null
          part_a_score: number | null
          part_a_started_at: string | null
          part_b_score: number | null
          part_b_started_at: string | null
          persona: Json | null
          phase: string
          rubric: Json | null
          served_items: Json
          started_at: string
          status: string
          submitted_at: string | null
          updated_at: string
          updated_by: string | null
          user_email: string
          version: number
        }
        Insert: {
          answers?: Json
          attempt_no?: number
          day: number
          day_score?: number | null
          eval_model?: string | null
          evaluator_runs?: Json
          factual_errors?: Json | null
          flags?: Json
          id?: string
          item_ids?: string[]
          model?: string | null
          needs_review?: boolean
          overridden_at?: string | null
          overridden_by?: string | null
          override_note?: string | null
          override_score?: number | null
          part_a_finished_at?: string | null
          part_a_score?: number | null
          part_a_started_at?: string | null
          part_b_score?: number | null
          part_b_started_at?: string | null
          persona?: Json | null
          phase?: string
          rubric?: Json | null
          served_items?: Json
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
          user_email: string
          version?: number
        }
        Update: {
          answers?: Json
          attempt_no?: number
          day?: number
          day_score?: number | null
          eval_model?: string | null
          evaluator_runs?: Json
          factual_errors?: Json | null
          flags?: Json
          id?: string
          item_ids?: string[]
          model?: string | null
          needs_review?: boolean
          overridden_at?: string | null
          overridden_by?: string | null
          override_note?: string | null
          override_score?: number | null
          part_a_finished_at?: string | null
          part_a_score?: number | null
          part_a_started_at?: string | null
          part_b_score?: number | null
          part_b_started_at?: string | null
          persona?: Json | null
          phase?: string
          rubric?: Json | null
          served_items?: Json
          started_at?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
          user_email?: string
          version?: number
        }
        Relationships: []
      }
      assessment_audit: {
        Row: {
          action: string
          actor: string
          attempt_id: string | null
          created_at: string
          day: number | null
          details: Json
          id: number
          item_id: string | null
          target_email: string | null
        }
        Insert: {
          action: string
          actor: string
          attempt_id?: string | null
          created_at?: string
          day?: number | null
          details?: Json
          id?: never
          item_id?: string | null
          target_email?: string | null
        }
        Update: {
          action?: string
          actor?: string
          attempt_id?: string | null
          created_at?: string
          day?: number | null
          details?: Json
          id?: never
          item_id?: string | null
          target_email?: string | null
        }
        Relationships: []
      }
      assessment_config: {
        Row: {
          day_settings: Json
          extra_facts: string
          extra_facts_ru: string
          id: number
          retention_days: number
          thresholds: Json
          updated_at: string
          updated_by: string | null
          version: number
          weights: Json
        }
        Insert: {
          day_settings: Json
          extra_facts?: string
          extra_facts_ru?: string
          id?: number
          retention_days?: number
          thresholds: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
          weights: Json
        }
        Update: {
          day_settings?: Json
          extra_facts?: string
          extra_facts_ru?: string
          id?: number
          retention_days?: number
          thresholds?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
          weights?: Json
        }
        Relationships: []
      }
      assessment_items: {
        Row: {
          answer_key: string[]
          created_at: string
          day: number
          difficulty: number
          explanation: string | null
          explanation_ru: string | null
          id: string
          kind: string
          options: Json
          prompt: string
          prompt_ru: string | null
          source_ref: string | null
          status: string
          topic: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          answer_key?: string[]
          created_at?: string
          day: number
          difficulty?: number
          explanation?: string | null
          explanation_ru?: string | null
          id: string
          kind?: string
          options?: Json
          prompt: string
          prompt_ru?: string | null
          source_ref?: string | null
          status?: string
          topic: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          answer_key?: string[]
          created_at?: string
          day?: number
          difficulty?: number
          explanation?: string | null
          explanation_ru?: string | null
          id?: string
          kind?: string
          options?: Json
          prompt?: string
          prompt_ru?: string | null
          source_ref?: string | null
          status?: string
          topic?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      assessment_messages: {
        Row: {
          attempt_id: string
          content: string
          created_at: string
          latency_ms: number | null
          role: string
          seq: number
        }
        Insert: {
          attempt_id: string
          content: string
          created_at?: string
          latency_ms?: number | null
          role: string
          seq: number
        }
        Update: {
          attempt_id?: string
          content?: string
          created_at?: string
          latency_ms?: number | null
          role?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_messages_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_unlocks: {
        Row: {
          day: number
          unlocked_at: string
          unlocked_by: string
          user_email: string
        }
        Insert: {
          day: number
          unlocked_at?: string
          unlocked_by: string
          user_email: string
        }
        Update: {
          day?: number
          unlocked_at?: string
          unlocked_by?: string
          user_email?: string
        }
        Relationships: []
      }
      copilot_logs: {
        Row: {
          answer_chars: number | null
          email: string | null
          finish_reason: string | null
          hit_ids: string[] | null
          id: number
          latency_ms: number | null
          locale: string | null
          model: string | null
          question: string | null
          status: string
          ts: string
        }
        Insert: {
          answer_chars?: number | null
          email?: string | null
          finish_reason?: string | null
          hit_ids?: string[] | null
          id?: number
          latency_ms?: number | null
          locale?: string | null
          model?: string | null
          question?: string | null
          status: string
          ts?: string
        }
        Update: {
          answer_chars?: number | null
          email?: string | null
          finish_reason?: string | null
          hit_ids?: string[] | null
          id?: number
          latency_ms?: number | null
          locale?: string | null
          model?: string | null
          question?: string | null
          status?: string
          ts?: string
        }
        Relationships: []
      }
      content_changelog: {
        Row: {
          approved_by: string
          body: string
          body_ru: string | null
          created_at: string
          id: string
          linked_path: string | null
          published_on: string
          sort_order: number
          status: string
          title: string
          title_ru: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          approved_by: string
          body: string
          body_ru?: string | null
          created_at?: string
          id: string
          linked_path?: string | null
          published_on: string
          sort_order?: number
          status?: string
          title: string
          title_ru?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          approved_by?: string
          body?: string
          body_ru?: string | null
          created_at?: string
          id?: string
          linked_path?: string | null
          published_on?: string
          sort_order?: number
          status?: string
          title?: string
          title_ru?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      content_competitors: {
        Row: {
          assortment: string | null
          base_discount: string | null
          certificates: string | null
          created_at: string
          dealer_coverage: string | null
          delivery_time: string | null
          id: string
          logistics: string | null
          marketing_offers: string | null
          max_discount: string | null
          name: string
          payment_method: string | null
          payment_terms: string | null
          retro_bonus: string | null
          sort_order: number
          status: string
          threat_level: string
          updated_at: string
          updated_by: string | null
          version: number
          volume_discount: string | null
        }
        Insert: {
          assortment?: string | null
          base_discount?: string | null
          certificates?: string | null
          created_at?: string
          dealer_coverage?: string | null
          delivery_time?: string | null
          id: string
          logistics?: string | null
          marketing_offers?: string | null
          max_discount?: string | null
          name: string
          payment_method?: string | null
          payment_terms?: string | null
          retro_bonus?: string | null
          sort_order?: number
          status?: string
          threat_level: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          volume_discount?: string | null
        }
        Update: {
          assortment?: string | null
          base_discount?: string | null
          certificates?: string | null
          created_at?: string
          dealer_coverage?: string | null
          delivery_time?: string | null
          id?: string
          logistics?: string | null
          marketing_offers?: string | null
          max_discount?: string | null
          name?: string
          payment_method?: string | null
          payment_terms?: string | null
          retro_bonus?: string | null
          sort_order?: number
          status?: string
          threat_level?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          volume_discount?: string | null
        }
        Relationships: []
      }
      content_contacts: {
        Row: {
          created_at: string
          id: string
          messenger: string
          name: string
          phone: string
          role: string
          role_ru: string | null
          sort_order: number
          status: string
          topic: string
          topic_ru: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id: string
          messenger: string
          name: string
          phone: string
          role: string
          role_ru?: string | null
          sort_order?: number
          status?: string
          topic: string
          topic_ru?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          messenger?: string
          name?: string
          phone?: string
          role?: string
          role_ru?: string | null
          sort_order?: number
          status?: string
          topic?: string
          topic_ru?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      content_faqs: {
        Row: {
          answer: string
          answer_ru: string | null
          category: string
          created_at: string
          id: string
          question: string
          question_ru: string | null
          sort_order: number
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          answer: string
          answer_ru?: string | null
          category: string
          created_at?: string
          id: string
          question: string
          question_ru?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          answer?: string
          answer_ru?: string | null
          category?: string
          created_at?: string
          id?: string
          question?: string
          question_ru?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      content_gate_reports: {
        Row: {
          actor: string | null
          created_at: string
          id: number
          issues: Json
          passed: boolean
          row_id: string
          table_name: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          id?: number
          issues?: Json
          passed: boolean
          row_id: string
          table_name: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          id?: number
          issues?: Json
          passed?: boolean
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      content_objections: {
        Row: {
          client_says: string
          client_says_ru: string | null
          created_at: string
          follow_up: string | null
          follow_up_ru: string | null
          id: string
          keywords: string[]
          label: string
          label_ru: string | null
          real_meaning: string
          real_meaning_ru: string | null
          response: string
          response_ru: string | null
          script_ids: string[]
          sort_order: number
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          client_says: string
          client_says_ru?: string | null
          created_at?: string
          follow_up?: string | null
          follow_up_ru?: string | null
          id: string
          keywords?: string[]
          label: string
          label_ru?: string | null
          real_meaning: string
          real_meaning_ru?: string | null
          response: string
          response_ru?: string | null
          script_ids?: string[]
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          client_says?: string
          client_says_ru?: string | null
          created_at?: string
          follow_up?: string | null
          follow_up_ru?: string | null
          id?: string
          keywords?: string[]
          label?: string
          label_ru?: string | null
          real_meaning?: string
          real_meaning_ru?: string | null
          response?: string
          response_ru?: string | null
          script_ids?: string[]
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      content_package_groups: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          status: string
          subtitle: string
          subtitle_ru: string | null
          title: string
          title_ru: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id: string
          sort_order?: number
          status?: string
          subtitle: string
          subtitle_ru?: string | null
          title: string
          title_ru?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          status?: string
          subtitle?: string
          subtitle_ru?: string | null
          title?: string
          title_ru?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      content_packages: {
        Row: {
          advance_pct: number | null
          created_at: string
          delivery_time: string
          delivery_time_ru: string | null
          discount_pct: number
          estimated_discount: string
          estimated_discount_ru: string | null
          group_id: string
          id: string
          is_featured: boolean
          logistics: string
          logistics_ru: string | null
          name: string
          name_ru: string | null
          order_volume: string
          order_volume_ru: string | null
          payment_terms: string
          payment_terms_ru: string | null
          sort_order: number
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          advance_pct?: number | null
          created_at?: string
          delivery_time: string
          delivery_time_ru?: string | null
          discount_pct?: number
          estimated_discount: string
          estimated_discount_ru?: string | null
          group_id: string
          id: string
          is_featured?: boolean
          logistics: string
          logistics_ru?: string | null
          name: string
          name_ru?: string | null
          order_volume: string
          order_volume_ru?: string | null
          payment_terms: string
          payment_terms_ru?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          advance_pct?: number | null
          created_at?: string
          delivery_time?: string
          delivery_time_ru?: string | null
          discount_pct?: number
          estimated_discount?: string
          estimated_discount_ru?: string | null
          group_id?: string
          id?: string
          is_featured?: boolean
          logistics?: string
          logistics_ru?: string | null
          name?: string
          name_ru?: string | null
          order_volume?: string
          order_volume_ru?: string | null
          payment_terms?: string
          payment_terms_ru?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_packages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "content_package_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      content_products: {
        Row: {
          category: string
          created_at: string
          filename: string | null
          id: string
          image_path: string | null
          line: string
          material: string | null
          name_ru: string
          name_uz: string | null
          sizes: string[]
          sort_order: number
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          category: string
          created_at?: string
          filename?: string | null
          id: string
          image_path?: string | null
          line: string
          material?: string | null
          name_ru: string
          name_uz?: string | null
          sizes?: string[]
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          filename?: string | null
          id?: string
          image_path?: string | null
          line?: string
          material?: string | null
          name_ru?: string
          name_uz?: string | null
          sizes?: string[]
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      content_scripts: {
        Row: {
          cheat_sheet: string
          cheat_sheet_ru: string | null
          created_at: string
          id: string
          name: string
          name_ru: string | null
          sort_order: number
          stages: Json
          stages_ru: Json | null
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          cheat_sheet: string
          cheat_sheet_ru?: string | null
          created_at?: string
          id: string
          name: string
          name_ru?: string | null
          sort_order?: number
          stages?: Json
          stages_ru?: Json | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          cheat_sheet?: string
          cheat_sheet_ru?: string | null
          created_at?: string
          id?: string
          name?: string
          name_ru?: string | null
          sort_order?: number
          stages?: Json
          stages_ru?: Json | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      content_sops: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          status: string
          steps: Json
          steps_ru: Json | null
          summary: string
          summary_ru: string | null
          title: string
          title_ru: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id: string
          sort_order?: number
          status?: string
          steps?: Json
          steps_ru?: Json | null
          summary?: string
          summary_ru?: string | null
          title: string
          title_ru?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          status?: string
          steps?: Json
          steps_ru?: Json | null
          summary?: string
          summary_ru?: string | null
          title?: string
          title_ru?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      content_versions: {
        Row: {
          actor: string | null
          created_at: string
          id: number
          op: string
          row_id: string
          snapshot: Json
          table_name: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          id?: number
          op?: string
          row_id: string
          snapshot: Json
          table_name: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          id?: number
          op?: string
          row_id?: string
          snapshot?: Json
          table_name?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          expires_at: string
          hits: number
          key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          expires_at: string
          hits: number
          key: string
          updated_at?: string
          window_start: string
        }
        Update: {
          expires_at?: string
          hits?: number
          key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      telemetry_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          entity_id: string | null
          entity_type: string | null
          id: number
          meta: Json | null
          path: string
          session_id: string
          ts: string
          type: string
          user_email: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          meta?: Json | null
          path: string
          session_id: string
          ts: string
          type: string
          user_email: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          meta?: Json | null
          path?: string
          session_id?: string
          ts?: string
          type?: string
          user_email?: string
        }
        Relationships: []
      }
      user_state: {
        Row: {
          key: string
          updated_at: string
          user_email: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_email?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_email?: string
          value?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_assessment_clear_override: {
        Args: { p_attempt: string; p_note: string; p_version: number }
        Returns: number
      }
      admin_assessment_override: {
        Args: { p_attempt: string; p_score: number; p_note: string; p_version: number }
        Returns: number
      }
      admin_assessment_reset: {
        Args: { p_attempt: string; p_version?: number }
        Returns: undefined
      }
      admin_assessment_reset_person: {
        Args: { p_email: string }
        Returns: Json
      }
      admin_assessment_unlock: {
        Args: { p_email: string; p_day: number }
        Returns: boolean
      }
      admin_people_overview: {
        Args: { p_from: string; p_to: string }
        Returns: {
          active_days: number
          active_ms: number
          calls_logged: number
          checklist_completed: number
          content_views: number
          copies: number
          copilot_asks: number
          daily: Json
          first_seen_at: string | null
          last_seen_at: string | null
          member_added_at: string
          member_email: string
          member_full_name: string | null
          member_is_active: boolean
          member_role: string
          searches: number
          sessions: number
          zero_result_searches: number
        }[]
      }
      admin_person_daily: {
        Args: { p_email: string; p_from: string; p_to: string }
        Returns: {
          active_ms: number
          content_views: number
          day: string
          events: number
        }[]
      }
      admin_person_recent_events: {
        Args: { p_email: string; p_limit?: number }
        Returns: {
          event_entity_id: string | null
          event_entity_type: string | null
          event_meta: Json | null
          event_path: string
          event_ts: string
          event_type: string
        }[]
      }
      admin_person_sections: {
        Args: { p_email: string; p_from: string; p_to: string }
        Returns: {
          active_ms: number
          section: string
          visits: number
        }[]
      }
      admin_person_summary: {
        Args: { p_email: string; p_from: string; p_to: string; p_prev_from: string }
        Returns: {
          active_days: number
          active_days_prev: number
          active_ms: number
          active_ms_prev: number
          calls_logged: number
          calls_logged_prev: number
          checklist_completed: number
          checklist_completed_prev: number
          content_views: number
          content_views_prev: number
          copies: number
          copies_prev: number
          copilot_asks: number
          copilot_asks_prev: number
          first_seen_at: string | null
          last_seen_at: string | null
          searches: number
          searches_prev: number
          sessions: number
          sessions_prev: number
          zero_result_searches: number
          zero_result_searches_prev: number
        }[]
      }
      admin_purge_person_history: {
        Args: { p_email: string }
        Returns: Json
      }
      admin_top_content: {
        Args: { p_from: string; p_to: string; p_limit?: number }
        Returns: {
          copies: number
          people: number
          view_entity_id: string | null
          view_path: string
          view_type: string
          views: number
        }[]
      }
      admin_user_last_activity: {
        Args: Record<PropertyKey, never>
        Returns: {
          last_seen_at: string | null
          member_email: string
        }[]
      }
      custom_access_token_hook: {
        Args: { event: Json }
        Returns: Json
      }
      copilot_stats: {
        Args: { p_from: string; p_to: string }
        Returns: {
          error_count: number
          error_rate: number | null
          no_hits_count: number
          no_hits_rate: number | null
          ok_count: number
          p50_latency_ms: number | null
          p95_latency_ms: number | null
          rate_limited_count: number
          total_count: number
        }[]
      }
      copilot_unanswered: {
        Args: { p_from: string; p_to: string; p_limit?: number }
        Returns: {
          ask_count: number
          last_asked_at: string
          operator_count: number
          question_key: string
          sample_question: string
        }[]
      }
      dashboard_hourly: {
        Args: { p_from: string; p_to: string; p_operator?: string }
        Returns: {
          event_count: number
          hour_of_day: number
        }[]
      }
      dashboard_kpis: {
        Args: { p_from: string; p_to: string; p_prev_from: string; p_operator?: string }
        Returns: {
          active_ms: number
          active_ms_prev: number
          active_operators: number
          active_operators_prev: number
          zero_result_searches: number
          zero_result_searches_prev: number
        }[]
      }
      dashboard_most_viewed: {
        Args: { p_from: string; p_to: string; p_operator?: string; p_limit?: number }
        Returns: {
          view_count: number
          view_entity_id: string | null
          view_path: string
          view_type: string
        }[]
      }
      dashboard_not_helpful: {
        Args: { p_from: string; p_to: string; p_operator?: string; p_limit?: number }
        Returns: {
          feedback_count: number
          page_path: string
        }[]
      }
      dashboard_operator_activity: {
        Args: { p_from: string; p_to: string; p_operator?: string }
        Returns: {
          active_ms: number
          checklist_completed: number
          copy_count: number
          operator_email: string
          top_viewed: Json
        }[]
      }
      dashboard_web_vitals: {
        Args: { p_from: string; p_to: string; p_operator?: string }
        Returns: {
          metric_name: string
          p50: number
          p75: number
          samples: number
        }[]
      }
      dashboard_zero_result_searches: {
        Args: { p_from: string; p_to: string; p_operator?: string; p_limit?: number }
        Returns: {
          last_seen_at: string
          search_count: number
          search_query: string
        }[]
      }
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      reorder_content_rows: {
        Args: { p_table: string; p_ids: string[]; p_versions: number[] }
        Returns: undefined
      }
      run_assessment_retention: {
        Args: { p_skip_if_scheduled?: boolean }
        Returns: {
          attempts_deleted: number
          messages_deleted: number
          skipped: boolean
          unlocks_deleted: number
          window_days: number
        }[]
      }
      run_retention: {
        Args: { p_skip_if_scheduled?: boolean }
        Returns: {
          admin_notifications_deleted: number
          content_gate_reports_deleted: number
          content_versions_deletes_deleted: number
          content_versions_updates_deleted: number
          copilot_logs_deleted: number
          copilot_logs_redacted: number
          skipped: boolean
          telemetry_events_deleted: number
        }[]
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
