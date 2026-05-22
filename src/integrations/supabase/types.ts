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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      branch_requests: {
        Row: {
          accepted_at: string | null
          branch_label: string
          created_at: string
          currency: string
          delivered_at: string | null
          existing_staff_id: string | null
          fee_amount: number
          id: string
          notes: string | null
          paid_at: string | null
          reject_reason: string | null
          request_type: string
          requested_by: string
          restaurant_id: string
          resulting_staff_id: string | null
          shipped_at: string | null
          shipping_address: string | null
          staff_email: string | null
          staff_full_name: string | null
          staff_password: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          branch_label: string
          created_at?: string
          currency?: string
          delivered_at?: string | null
          existing_staff_id?: string | null
          fee_amount?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          reject_reason?: string | null
          request_type?: string
          requested_by: string
          restaurant_id: string
          resulting_staff_id?: string | null
          shipped_at?: string | null
          shipping_address?: string | null
          staff_email?: string | null
          staff_full_name?: string | null
          staff_password?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          branch_label?: string
          created_at?: string
          currency?: string
          delivered_at?: string | null
          existing_staff_id?: string | null
          fee_amount?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          reject_reason?: string | null
          request_type?: string
          requested_by?: string
          restaurant_id?: string
          resulting_staff_id?: string | null
          shipped_at?: string | null
          shipping_address?: string | null
          staff_email?: string | null
          staff_full_name?: string | null
          staff_password?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_requests_existing_staff_id_fkey"
            columns: ["existing_staff_id"]
            isOneToOne: false
            referencedRelation: "restaurant_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_requests_resulting_staff_id_fkey"
            columns: ["resulting_staff_id"]
            isOneToOne: false
            referencedRelation: "restaurant_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          photo_url: string | null
          price: number | null
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          photo_url?: string | null
          price?: number | null
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          photo_url?: string | null
          price?: number | null
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: []
      }
      offers: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          required_visits: number
          restaurant_id: string
          reward: string
          title: string
          window_days: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          required_visits?: number
          restaurant_id: string
          reward: string
          title: string
          window_days?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          required_visits?: number
          restaurant_id?: string
          reward?: string
          title?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birthday: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          birthday?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      redemption_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          offer_id: string
          restaurant_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          offer_id: string
          restaurant_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          offer_id?: string
          restaurant_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemption_codes_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_codes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          id: string
          offer_id: string
          redeemed_at: string
          restaurant_id: string
          user_id: string
          verified_by: string | null
        }
        Insert: {
          id?: string
          offer_id: string
          redeemed_at?: string
          restaurant_id: string
          user_id: string
          verified_by?: string | null
        }
        Update: {
          id?: string
          offer_id?: string
          redeemed_at?: string
          restaurant_id?: string
          user_id?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_staff: {
        Row: {
          created_at: string
          id: string
          label: string | null
          nfc_token: string | null
          password: string | null
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          nfc_token?: string | null
          password?: string | null
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          nfc_token?: string | null
          password?: string | null
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          created_at: string
          cuisine: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          owner_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          cuisine?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          owner_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          cuisine?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          owner_id?: string | null
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          id: string
          offer_id: string
          user_id: string
          verified_by: string | null
          visited_at: string
        }
        Insert: {
          id?: string
          offer_id: string
          user_id: string
          verified_by?: string | null
          visited_at?: string
        }
        Update: {
          id?: string
          offer_id?: string
          user_id?: string
          verified_by?: string | null
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "owner" | "customer"
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
    Enums: {
      app_role: ["admin", "owner", "customer"],
    },
  },
} as const
