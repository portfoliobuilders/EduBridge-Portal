export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type AppRole = 'owner' | 'staff'
export type PaymentMode = 'card' | 'cash' | 'link' | 'bank_transfer'
export type PaymentPurpose = 'admission' | 'repayment' | 'other'
export type PaymentStatus = 'valid' | 'void'
export type EnrollmentStatus = 'active' | 'completed' | 'cancelled'
export type ShareChannel = 'whatsapp' | 'email' | 'web_share' | 'sms' | 'download' | 'print' | 'link_copy'

export interface Database {
  public: {
    Tables: {
      company_settings: {
        Row: {
          singleton: boolean
          id: string
          name: string
          address: string
          phone: string
          email: string
          website: string
          trn: string
          logo_path: string | null
          receipt_prefix: string
          statement_prefix: string
          vat_enabled: boolean
          vat_rate: number
          footer_note: string | null
          terms: string | null
          created_at: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          singleton?: boolean
          id?: string
          name: string
          address: string
          phone: string
          email: string
          website: string
          trn: string
          logo_path?: string | null
          receipt_prefix?: string
          statement_prefix?: string
          vat_enabled?: boolean
          vat_rate?: number
          footer_note?: string | null
          terms?: string | null
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          singleton?: boolean
          id?: string
          name?: string
          address?: string
          phone?: string
          email?: string
          website?: string
          trn?: string
          logo_path?: string | null
          receipt_prefix?: string
          statement_prefix?: string
          vat_enabled?: boolean
          vat_rate?: number
          footer_note?: string | null
          terms?: string | null
          created_at?: string
          updated_at?: string
          updated_by?: string | null
        }
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          phone: string | null
          role: AppRole
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          phone?: string | null
          role?: AppRole
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          phone?: string | null
          role?: AppRole
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      universities: {
        Row: {
          id: string
          name: string
          country: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          country?: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          country?: string
          is_active?: boolean
          created_at?: string
        }
      }
      courses: {
        Row: {
          id: string
          university_id: string
          name: string
          level: string
          duration: string | null
          default_fee: number | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          university_id: string
          name: string
          level: string
          duration?: string | null
          default_fee?: number | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          university_id?: string
          name?: string
          level?: string
          duration?: string | null
          default_fee?: number | null
          is_active?: boolean
          created_at?: string
        }
      }
      specializations: {
        Row: {
          id: string
          course_id: string
          name: string
          default_fee: number | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          name: string
          default_fee?: number | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          name?: string
          default_fee?: number | null
          is_active?: boolean
          created_at?: string
        }
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
      }
      students: {
        Row: {
          id: string
          student_code: string
          full_name: string
          mobile: string
          whatsapp: string | null
          email: string | null
          notes: string | null
          created_by: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_code?: string
          full_name: string
          mobile: string
          whatsapp?: string | null
          email?: string | null
          notes?: string | null
          created_by: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          student_code?: string
          full_name?: string
          mobile?: string
          whatsapp?: string | null
          email?: string | null
          notes?: string | null
          created_by?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      enrollments: {
        Row: {
          id: string
          student_id: string
          university_id: string
          course_id: string
          specialization_id: string | null
          admission_staff_id: string
          intake: string | null
          total_fee: number
          discount: number
          status: EnrollmentStatus
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          university_id: string
          course_id: string
          specialization_id?: string | null
          admission_staff_id: string
          intake?: string | null
          total_fee: number
          discount?: number
          status?: EnrollmentStatus
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          university_id?: string
          course_id?: string
          specialization_id?: string | null
          admission_staff_id?: string
          intake?: string | null
          total_fee?: number
          discount?: number
          status?: EnrollmentStatus
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      receipt_counters: {
        Row: {
          year: number
          last_no: number
        }
        Insert: {
          year: number
          last_no?: number
        }
        Update: {
          year?: number
          last_no?: number
        }
      }
      payments: {
        Row: {
          id: string
          receipt_no: string
          enrollment_id: string
          student_id: string
          amount: number
          mode: PaymentMode
          purpose: PaymentPurpose
          purpose_note: string | null
          reference_no: string | null
          paid_at: string
          recorded_at: string
          received_by: string
          payee_name: string | null
          comments: string | null
          status: PaymentStatus
          void_reason: string | null
          voided_by: string | null
          voided_at: string | null
          fee_snapshot: number
          paid_before_snapshot: number
          balance_after_snapshot: number
          vat_amount: number
          pdf_path: string | null
          share_token: string
          share_enabled: boolean
          idempotency_key: string | null
          created_at: string
        }
        Insert: {
          id?: string
          receipt_no: string
          enrollment_id: string
          student_id: string
          amount: number
          mode: PaymentMode
          purpose: PaymentPurpose
          purpose_note?: string | null
          reference_no?: string | null
          paid_at: string
          recorded_at?: string
          received_by: string
          payee_name?: string | null
          comments?: string | null
          status?: PaymentStatus
          void_reason?: string | null
          voided_by?: string | null
          voided_at?: string | null
          fee_snapshot: number
          paid_before_snapshot: number
          balance_after_snapshot: number
          vat_amount?: number
          pdf_path?: string | null
          share_token?: string
          share_enabled?: boolean
          idempotency_key?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          receipt_no?: string
          enrollment_id?: string
          student_id?: string
          amount?: number
          mode?: PaymentMode
          purpose?: PaymentPurpose
          purpose_note?: string | null
          reference_no?: string | null
          paid_at?: string
          recorded_at?: string
          received_by?: string
          payee_name?: string | null
          comments?: string | null
          status?: PaymentStatus
          void_reason?: string | null
          voided_by?: string | null
          voided_at?: string | null
          fee_snapshot?: number
          paid_before_snapshot?: number
          balance_after_snapshot?: number
          vat_amount?: number
          pdf_path?: string | null
          share_token?: string
          share_enabled?: boolean
          idempotency_key?: string | null
          created_at?: string
        }
      }
      share_logs: {
        Row: {
          id: string
          payment_id: string | null
          enrollment_id: string | null
          channel: ShareChannel
          recipient: string | null
          sent_by: string | null
          sent_at: string
          meta: Json
          created_at: string
        }
        Insert: {
          id?: string
          payment_id?: string | null
          enrollment_id?: string | null
          channel: ShareChannel
          recipient?: string | null
          sent_by?: string | null
          sent_at?: string
          meta?: Json
          created_at?: string
        }
        Update: {
          id?: string
          payment_id?: string | null
          enrollment_id?: string | null
          channel?: ShareChannel
          recipient?: string | null
          sent_by?: string | null
          sent_at?: string
          meta?: Json
          created_at?: string
        }
      }
      audit_log: {
        Row: {
          id: string
          table_name: string
          row_id: string
          action: string
          actor: string | null
          at: string
          diff: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          table_name: string
          row_id: string
          action: string
          actor?: string | null
          at?: string
          diff?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          table_name?: string
          row_id?: string
          action?: string
          actor?: string | null
          at?: string
          diff?: Json | null
          created_at?: string
        }
      }
    }
    Views: {
      enrollment_ledger: {
        Row: {
          enrollment_id: string
          student_id: string
          total_fee: number
          discount: number
          net_fee: number
          total_paid: number
          balance: number
          last_payment_at: string | null
          payment_count: number
        }
      }
    }
    Functions: {
      is_active_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_owner: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      record_payment: {
        Args: {
          p_enrollment_id: string
          p_amount: number
          p_mode: PaymentMode
          p_purpose: PaymentPurpose
          p_purpose_note: string | null
          p_reference_no: string | null
          p_paid_at: string
          p_payee_name: string | null
          p_comments: string | null
          p_idempotency_key?: string | null
        }
        Returns: Database['public']['Tables']['payments']['Row']
      }
      void_payment: {
        Args: {
          p_payment_id: string
          p_reason: string
        }
        Returns: Database['public']['Tables']['payments']['Row']
      }
      rotate_share_token: {
        Args: {
          p_payment_id: string
        }
        Returns: string
      }
      get_public_receipt: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: AppRole
      payment_mode: PaymentMode
      payment_purpose: PaymentPurpose
      payment_status: PaymentStatus
      enrollment_status: EnrollmentStatus
      share_channel: ShareChannel
    }
  }
}
