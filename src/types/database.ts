export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          created_at: string
          details: Json | null
          diff: Json | null
          id: string
          record_id: string | null
          row_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          created_at?: string
          details?: Json | null
          diff?: Json | null
          id?: string
          record_id?: string | null
          row_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          created_at?: string
          details?: Json | null
          diff?: Json | null
          id?: string
          record_id?: string | null
          row_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      candidate_documents: {
        Row: {
          archived_at: string | null
          created_at: string
          document_type_id: string
          file_name: string
          file_path: string
          id: string
          id_proof_kind: string | null
          mime_type: string
          notes: string | null
          original_size_bytes: number | null
          size_bytes: number
          status: string
          student_id: string
          title: string
          upload_link_id: string | null
          uploaded_by: string | null
          uploaded_via: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          document_type_id: string
          file_name: string
          file_path: string
          id?: string
          id_proof_kind?: string | null
          mime_type: string
          notes?: string | null
          original_size_bytes?: number | null
          size_bytes: number
          status?: string
          student_id: string
          title: string
          upload_link_id?: string | null
          uploaded_by?: string | null
          uploaded_via: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          document_type_id?: string
          file_name?: string
          file_path?: string
          id?: string
          id_proof_kind?: string | null
          mime_type?: string
          notes?: string | null
          original_size_bytes?: number | null
          size_bytes?: number
          status?: string
          student_id?: string
          title?: string
          upload_link_id?: string | null
          uploaded_by?: string | null
          uploaded_via?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_documents_upload_link_id_fkey"
            columns: ["upload_link_id"]
            isOneToOne: false
            referencedRelation: "document_upload_links"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string
          admins_can_void: boolean
          created_at: string
          email: string
          email_body_template: string
          email_doc_request_template: string | null
          email_subject_template: string
          footer_note: string | null
          id: string
          logo_path: string | null
          name: string
          phone: string
          receipt_prefix: string
          singleton: boolean
          statement_prefix: string
          support_access_enabled: boolean
          terms: string | null
          trn: string
          updated_at: string
          updated_by: string | null
          vat_enabled: boolean
          vat_rate: number
          website: string
          whatsapp_doc_request_template: string | null
          whatsapp_receipt_template: string
          whatsapp_statement_template: string
        }
        Insert: {
          address: string
          admins_can_void?: boolean
          created_at?: string
          email: string
          email_body_template?: string
          email_doc_request_template?: string | null
          email_subject_template?: string
          footer_note?: string | null
          id?: string
          logo_path?: string | null
          name: string
          phone: string
          receipt_prefix?: string
          singleton?: boolean
          statement_prefix?: string
          support_access_enabled?: boolean
          terms?: string | null
          trn: string
          updated_at?: string
          updated_by?: string | null
          vat_enabled?: boolean
          vat_rate?: number
          website: string
          whatsapp_doc_request_template?: string | null
          whatsapp_receipt_template?: string
          whatsapp_statement_template?: string
        }
        Update: {
          address?: string
          admins_can_void?: boolean
          created_at?: string
          email?: string
          email_body_template?: string
          email_doc_request_template?: string | null
          email_subject_template?: string
          footer_note?: string | null
          id?: string
          logo_path?: string | null
          name?: string
          phone?: string
          receipt_prefix?: string
          singleton?: boolean
          statement_prefix?: string
          support_access_enabled?: boolean
          terms?: string | null
          trn?: string
          updated_at?: string
          updated_by?: string | null
          vat_enabled?: boolean
          vat_rate?: number
          website?: string
          whatsapp_doc_request_template?: string | null
          whatsapp_receipt_template?: string
          whatsapp_statement_template?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          created_at: string
          default_fee: number | null
          duration: string | null
          id: string
          is_active: boolean
          level: string
          name: string
          university_id: string
        }
        Insert: {
          created_at?: string
          default_fee?: number | null
          duration?: string | null
          id?: string
          is_active?: boolean
          level: string
          name: string
          university_id: string
        }
        Update: {
          created_at?: string
          default_fee?: number | null
          duration?: string | null
          id?: string
          is_active?: boolean
          level?: string
          name?: string
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_log: {
        Row: {
          action: string
          actor: string
          at: string
          document_id: string | null
          id: string
          ip: string | null
          metadata: Json | null
        }
        Insert: {
          action: string
          actor: string
          at?: string
          document_id?: string | null
          id?: string
          ip?: string | null
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor?: string
          at?: string
          document_id?: string | null
          id?: string
          ip?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_access_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "candidate_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          helper_text: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          helper_text?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          helper_text?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_upload_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          last_used_at: string | null
          requested_types: string[]
          revoked_at: string | null
          student_id: string
          token: string
          upload_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          requested_types: string[]
          revoked_at?: string | null
          student_id: string
          token: string
          upload_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          requested_types?: string[]
          revoked_at?: string | null
          student_id?: string
          token?: string
          upload_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_upload_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_upload_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      email_rate_limits: {
        Row: {
          email_type: string
          id: string
          recipient: string
          reference_id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          email_type: string
          id?: string
          recipient: string
          reference_id: string
          sent_at?: string
          user_id: string
        }
        Update: {
          email_type?: string
          id?: string
          recipient?: string
          reference_id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_rate_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          admission_staff_id: string
          course_id: string
          created_at: string
          created_by: string
          discount: number
          id: string
          intake: string | null
          opening_paid: number
          opening_paid_note: string | null
          share_enabled: boolean
          share_token: string
          specialization_id: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          total_fee: number
          university_id: string
          updated_at: string
          vat_rate: number
          vat_type: string
        }
        Insert: {
          admission_staff_id: string
          course_id: string
          created_at?: string
          created_by: string
          discount?: number
          id?: string
          intake?: string | null
          opening_paid?: number
          opening_paid_note?: string | null
          share_enabled?: boolean
          share_token?: string
          specialization_id?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          total_fee: number
          university_id: string
          updated_at?: string
          vat_rate?: number
          vat_type?: string
        }
        Update: {
          admission_staff_id?: string
          course_id?: string
          created_at?: string
          created_by?: string
          discount?: number
          id?: string
          intake?: string | null
          opening_paid?: number
          opening_paid_note?: string | null
          share_enabled?: boolean
          share_token?: string
          specialization_id?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          total_fee?: number
          university_id?: string
          updated_at?: string
          vat_rate?: number
          vat_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_admission_staff_id_fkey"
            columns: ["admission_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_specialization_id_fkey"
            columns: ["specialization_id"]
            isOneToOne: false
            referencedRelation: "specializations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      job_titles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          balance_after_snapshot: number
          comments: string | null
          created_at: string
          enrollment_id: string
          fee_snapshot: number
          id: string
          idempotency_key: string | null
          mode: Database["public"]["Enums"]["payment_mode"]
          paid_at: string
          paid_before_snapshot: number
          payee_name: string | null
          pdf_path: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          purpose_note: string | null
          receipt_no: string
          received_by: string
          recorded_at: string
          reference_no: string | null
          share_enabled: boolean
          share_token: string
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          vat_amount: number
          vat_rate: number
          vat_type: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          balance_after_snapshot: number
          comments?: string | null
          created_at?: string
          enrollment_id: string
          fee_snapshot: number
          id?: string
          idempotency_key?: string | null
          mode: Database["public"]["Enums"]["payment_mode"]
          paid_at: string
          paid_before_snapshot: number
          payee_name?: string | null
          pdf_path?: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          purpose_note?: string | null
          receipt_no: string
          received_by: string
          recorded_at?: string
          reference_no?: string | null
          share_enabled?: boolean
          share_token?: string
          status?: Database["public"]["Enums"]["payment_status"]
          student_id: string
          vat_amount?: number
          vat_rate?: number
          vat_type?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          balance_after_snapshot?: number
          comments?: string | null
          created_at?: string
          enrollment_id?: string
          fee_snapshot?: number
          id?: string
          idempotency_key?: string | null
          mode?: Database["public"]["Enums"]["payment_mode"]
          paid_at?: string
          paid_before_snapshot?: number
          payee_name?: string | null
          pdf_path?: string | null
          purpose?: Database["public"]["Enums"]["payment_purpose"]
          purpose_note?: string | null
          receipt_no?: string
          received_by?: string
          recorded_at?: string
          reference_no?: string | null
          share_enabled?: boolean
          share_token?: string
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
          vat_amount?: number
          vat_rate?: number
          vat_type?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollment_ledger"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_scope: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          is_support: boolean
          job_title: string | null
          phone: string | null
          reports_to: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          admin_scope?: string
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          is_support?: boolean
          job_title?: string | null
          phone?: string | null
          reports_to?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          admin_scope?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_support?: boolean
          job_title?: string | null
          phone?: string | null
          reports_to?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      receipt_counters: {
        Row: {
          last_no: number
          year: number
        }
        Insert: {
          last_no?: number
          year: number
        }
        Update: {
          last_no?: number
          year?: number
        }
        Relationships: []
      }
      share_logs: {
        Row: {
          channel: Database["public"]["Enums"]["share_channel"]
          created_at: string
          enrollment_id: string | null
          id: string
          meta: Json
          payment_id: string | null
          recipient: string | null
          sent_at: string
          sent_by: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["share_channel"]
          created_at?: string
          enrollment_id?: string | null
          id?: string
          meta?: Json
          payment_id?: string | null
          recipient?: string | null
          sent_at?: string
          sent_by?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["share_channel"]
          created_at?: string
          enrollment_id?: string | null
          id?: string
          meta?: Json
          payment_id?: string | null
          recipient?: string | null
          sent_at?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollment_ledger"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "share_logs_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_logs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_logs_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      specializations: {
        Row: {
          course_id: string
          created_at: string
          default_fee: number | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          course_id: string
          created_at?: string
          default_fee?: number | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          course_id?: string
          created_at?: string
          default_fee?: number | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "specializations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      student_addresses: {
        Row: {
          city: string
          contact_name: string | null
          contact_phone: string | null
          country: string
          created_at: string
          created_by: string
          id: string
          is_default: boolean
          line1: string
          line2: string | null
          postal_code: string | null
          state: string | null
          student_id: string
          type: string
          updated_at: string
        }
        Insert: {
          city: string
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          created_by: string
          id?: string
          is_default?: boolean
          line1: string
          line2?: string | null
          postal_code?: string | null
          state?: string | null
          student_id: string
          type: string
          updated_at?: string
        }
        Update: {
          city?: string
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          created_by?: string
          id?: string
          is_default?: boolean
          line1?: string
          line2?: string | null
          postal_code?: string | null
          state?: string | null
          student_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_addresses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_addresses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_counters: {
        Row: {
          id: number
          last_no: number
        }
        Insert: {
          id?: number
          last_no?: number
        }
        Update: {
          id?: number
          last_no?: number
        }
        Relationships: []
      }
      students: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          full_name: string
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_relation: string | null
          guardian_whatsapp: string | null
          id: string
          is_active: boolean
          mobile: string
          notes: string | null
          student_code: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          full_name: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relation?: string | null
          guardian_whatsapp?: string | null
          id?: string
          is_active?: boolean
          mobile: string
          notes?: string | null
          student_code: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          full_name?: string
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relation?: string | null
          guardian_whatsapp?: string | null
          id?: string
          is_active?: boolean
          mobile?: string
          notes?: string | null
          student_code?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          country: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      enrollment_ledger: {
        Row: {
          balance: number | null
          discount: number | null
          enrollment_id: string | null
          last_payment_at: string | null
          net_fee: number | null
          opening_paid: number | null
          opening_paid_note: string | null
          payment_count: number | null
          student_id: string | null
          total_fee: number | null
          total_paid: number | null
          total_payable: number | null
          vat_amount: number | null
          vat_rate: number | null
          vat_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_directory_view: {
        Row: {
          course_ids: string[] | null
          course_names: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          enrollment_count: number | null
          full_name: string | null
          id: string | null
          last_payment_at: string | null
          mobile: string | null
          notes: string | null
          student_code: string | null
          total_balance: number | null
          total_net_fee: number | null
          total_paid: number | null
          university_ids: string[] | null
          university_names: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_student_enrollment: {
        Args: {
          p_admission_staff_id?: string
          p_course_id: string
          p_discount?: number
          p_intake?: string
          p_specialization_id?: string
          p_student_id: string
          p_total_fee?: number
          p_university_id: string
        }
        Returns: Json
      }
      archive_candidate_document: {
        Args: { p_document_id: string }
        Returns: {
          archived_at: string | null
          created_at: string
          document_type_id: string
          file_name: string
          file_path: string
          id: string
          id_proof_kind: string | null
          mime_type: string
          notes: string | null
          original_size_bytes: number | null
          size_bytes: number
          status: string
          student_id: string
          title: string
          upload_link_id: string | null
          uploaded_by: string | null
          uploaded_via: string
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "candidate_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_manage_user: { Args: { p_target: string }; Returns: boolean }
      check_and_log_email_rate_limit: {
        Args: {
          p_email_type: string
          p_recipient: string
          p_reference_id: string
        }
        Returns: Json
      }
      create_student_with_enrollment: {
        Args: {
          p_admission_staff_id?: string
          p_billing_address?: Json
          p_course_id?: string
          p_discount?: number
          p_email?: string
          p_full_name: string
          p_guardian_email?: string
          p_guardian_name?: string
          p_guardian_phone?: string
          p_guardian_relation?: string
          p_guardian_whatsapp?: string
          p_intake?: string
          p_mobile: string
          p_notes?: string
          p_opening_paid?: number
          p_opening_paid_note?: string
          p_shipping_address?: Json
          p_specialization_id?: string
          p_total_fee?: number
          p_university_id?: string
          p_vat_rate?: number
          p_vat_type?: string
          p_whatsapp?: string
        }
        Returns: Json
      }
      current_app_role: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      dashboard_kpis:
        | { Args: never; Returns: Json }
        | {
            Args: { p_from: string; p_staff_id?: string; p_to: string }
            Returns: Json
          }
      get_candidate_documents_summary: {
        Args: { p_student_id: string }
        Returns: Json
      }
      get_link_documents_stats: { Args: { p_days?: number }; Returns: Json }
      get_public_receipt: { Args: { p_token: string }; Returns: Json }
      get_public_statement: { Args: { p_token: string }; Returns: Json }
      get_staff_list: {
        Args: never
        Returns: {
          admin_scope: string
          collections_this_month: number
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_support: boolean
          job_title: string
          last_sign_in_at: string
          phone: string
          reports_to: string
          reports_to_name: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      hit_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      import_programs: { Args: { p_data: Json }; Returns: Json }
      is_active_user: { Args: never; Returns: boolean }
      is_admin_or_above: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      record_payment: {
        Args: {
          p_amount: number
          p_comments: string
          p_enrollment_id: string
          p_idempotency_key?: string
          p_mode: Database["public"]["Enums"]["payment_mode"]
          p_paid_at: string
          p_payee_name: string
          p_purpose: Database["public"]["Enums"]["payment_purpose"]
          p_purpose_note: string
          p_reference_no: string
        }
        Returns: {
          amount: number
          balance_after_snapshot: number
          comments: string | null
          created_at: string
          enrollment_id: string
          fee_snapshot: number
          id: string
          idempotency_key: string | null
          mode: Database["public"]["Enums"]["payment_mode"]
          paid_at: string
          paid_before_snapshot: number
          payee_name: string | null
          pdf_path: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          purpose_note: string | null
          receipt_no: string
          received_by: string
          recorded_at: string
          reference_no: string | null
          share_enabled: boolean
          share_token: string
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          vat_amount: number
          vat_rate: number
          vat_type: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_collections: {
        Args: {
          p_course_id?: string
          p_from: string
          p_mode?: string
          p_purpose?: string
          p_staff_id?: string
          p_to: string
          p_university_id?: string
        }
        Returns: Json
      }
      report_dayend: {
        Args: { p_date: string; p_staff_id?: string }
        Returns: Json
      }
      report_outstanding: {
        Args: {
          p_course_id?: string
          p_min_balance?: number
          p_staff_id?: string
          p_university_id?: string
        }
        Returns: Json
      }
      report_vat_summary: { Args: { p_year?: number }; Returns: Json }
      report_voids: {
        Args: { p_from: string; p_staff_id?: string; p_to: string }
        Returns: Json
      }
      revoke_document_upload_link: {
        Args: { p_link_id: string }
        Returns: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          last_used_at: string | null
          requested_types: string[]
          revoked_at: string | null
          student_id: string
          token: string
          upload_count: number
        }
        SetofOptions: {
          from: "*"
          to: "document_upload_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rotate_enrollment_share_token: {
        Args: { p_enrollment_id: string }
        Returns: string
      }
      rotate_receipt_share_token: {
        Args: { p_payment_id: string }
        Returns: string
      }
      rotate_share_token: { Args: { p_payment_id: string }; Returns: string }
      set_enrollment_share_enabled: {
        Args: { p_enabled: boolean; p_enrollment_id: string }
        Returns: boolean
      }
      set_payment_share_enabled: {
        Args: { p_enabled: boolean; p_payment_id: string }
        Returns: boolean
      }
      team_member_ids: { Args: { p_manager: string }; Returns: string[] }
      toggle_receipt_share_enabled: {
        Args: { p_enabled?: boolean; p_payment_id: string }
        Returns: boolean
      }
      update_enrollment_fee: {
        Args: {
          p_discount: number
          p_enrollment_id: string
          p_reason?: string
          p_total_fee: number
        }
        Returns: Json
      }
      update_enrollment_opening_paid: {
        Args: {
          p_enrollment_id: string
          p_opening_paid: number
          p_opening_paid_note?: string
          p_reason?: string
        }
        Returns: Json
      }
      verify_candidate_document: {
        Args: { p_document_id: string; p_notes?: string; p_status: string }
        Returns: {
          archived_at: string | null
          created_at: string
          document_type_id: string
          file_name: string
          file_path: string
          id: string
          id_proof_kind: string | null
          mime_type: string
          notes: string | null
          original_size_bytes: number | null
          size_bytes: number
          status: string
          student_id: string
          title: string
          upload_link_id: string | null
          uploaded_by: string | null
          uploaded_via: string
          verified_at: string | null
          verified_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "candidate_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      visible_user_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      void_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: {
          amount: number
          balance_after_snapshot: number
          comments: string | null
          created_at: string
          enrollment_id: string
          fee_snapshot: number
          id: string
          idempotency_key: string | null
          mode: Database["public"]["Enums"]["payment_mode"]
          paid_at: string
          paid_before_snapshot: number
          payee_name: string | null
          pdf_path: string | null
          purpose: Database["public"]["Enums"]["payment_purpose"]
          purpose_note: string | null
          receipt_no: string
          received_by: string
          recorded_at: string
          reference_no: string | null
          share_enabled: boolean
          share_token: string
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          vat_amount: number
          vat_rate: number
          vat_type: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "owner" | "staff" | "super_admin" | "admin"
      enrollment_status: "active" | "completed" | "cancelled"
      payment_mode: "card" | "cash" | "link" | "bank_transfer"
      payment_purpose: "admission" | "repayment" | "other"
      payment_status: "valid" | "void"
      share_channel:
        | "whatsapp"
        | "email"
        | "web_share"
        | "sms"
        | "download"
        | "print"
        | "link_copy"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "staff", "super_admin", "admin"],
      enrollment_status: ["active", "completed", "cancelled"],
      payment_mode: ["card", "cash", "link", "bank_transfer"],
      payment_purpose: ["admission", "repayment", "other"],
      payment_status: ["valid", "void"],
      share_channel: [
        "whatsapp",
        "email",
        "web_share",
        "sms",
        "download",
        "print",
        "link_copy",
      ],
    },
  },
} as const
