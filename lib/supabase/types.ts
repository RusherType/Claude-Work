export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      agent_questions: {
        Row: {
          agent_run_id: string | null;
          answer: string | null;
          answered_at: string | null;
          answered_by: string | null;
          id: string;
          options: Json | null;
          product_id: string;
          question: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          agent_run_id?: string | null;
          answer?: string | null;
          answered_at?: string | null;
          answered_by?: string | null;
          id?: string;
          options?: Json | null;
          product_id: string;
          question: string;
          workspace_id: string;
        };
        Update: {
          agent_run_id?: string | null;
          answer?: string | null;
          answered_at?: string | null;
          answered_by?: string | null;
          id?: string;
          options?: Json | null;
          product_id?: string;
          question?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_questions_workspace_id_agent_run_id_fkey";
            columns: ["workspace_id", "agent_run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "agent_questions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_questions_workspace_id_product_id_fkey";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      agent_runs: {
        Row: {
          cost_usd: number | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          input_tokens: number | null;
          market: Database["public"]["Enums"]["market_code"];
          model: string;
          output: Json | null;
          output_tokens: number | null;
          product_id: string | null;
          prompt_version: string;
          started_at: string | null;
          tool_calls: Json | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          cost_usd?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          input_tokens?: number | null;
          market?: Database["public"]["Enums"]["market_code"];
          model: string;
          output?: Json | null;
          output_tokens?: number | null;
          product_id?: string | null;
          prompt_version: string;
          started_at?: string | null;
          tool_calls?: Json | null;
          workspace_id: string;
        };
        Update: {
          cost_usd?: number | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          input_tokens?: number | null;
          market?: Database["public"]["Enums"]["market_code"];
          model?: string;
          output?: Json | null;
          output_tokens?: number | null;
          product_id?: string | null;
          prompt_version?: string;
          started_at?: string | null;
          tool_calls?: Json | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_runs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agent_runs_workspace_id_product_id_fkey";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      alert_items: {
        Row: {
          alert_id: string;
          cost_after: number | null;
          cost_before: number | null;
          product_id: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          alert_id: string;
          cost_after?: number | null;
          cost_before?: number | null;
          product_id: string;
          workspace_id: string;
        };
        Update: {
          alert_id?: string;
          cost_after?: number | null;
          cost_before?: number | null;
          product_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alert_items_workspace_id_alert_id_fkey";
            columns: ["workspace_id", "alert_id"];
            isOneToOne: false;
            referencedRelation: "alerts";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "alert_items_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alert_items_workspace_id_product_id_fkey";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      alerts: {
        Row: {
          body: string | null;
          created_at: string | null;
          effective_from: string | null;
          id: string;
          kind: string | null;
          measure_id: string | null;
          read_at: string | null;
          title: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          created_at?: string | null;
          effective_from?: string | null;
          id?: string;
          kind?: string | null;
          measure_id?: string | null;
          read_at?: string | null;
          title: string;
          workspace_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string | null;
          effective_from?: string | null;
          id?: string;
          kind?: string | null;
          measure_id?: string | null;
          read_at?: string | null;
          title?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_measure_id_fkey";
            columns: ["measure_id"];
            isOneToOne: false;
            referencedRelation: "tariff_measures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      api_keys: {
        Row: {
          created_at: string | null;
          id: string;
          key_hash: string;
          last_used_at: string | null;
          name: string | null;
          prefix: string;
          revoked_at: string | null;
          scope: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          id?: string;
          key_hash: string;
          last_used_at?: string | null;
          name?: string | null;
          prefix: string;
          revoked_at?: string | null;
          scope?: string | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          key_hash?: string;
          last_used_at?: string | null;
          name?: string | null;
          prefix?: string;
          revoked_at?: string | null;
          scope?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string | null;
          data: Json | null;
          entity: string | null;
          entity_id: string | null;
          id: number;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string | null;
          data?: Json | null;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          workspace_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string | null;
          data?: Json | null;
          entity?: string | null;
          entity_id?: string | null;
          id?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      broker_orders: {
        Row: {
          broker_name: string | null;
          broker_notes: string | null;
          completed_at: string | null;
          created_at: string | null;
          id: string;
          price_usd: number | null;
          product_id: string;
          status: string | null;
          stripe_payment_intent: string | null;
          verified_code: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          broker_name?: string | null;
          broker_notes?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          id?: string;
          price_usd?: number | null;
          product_id: string;
          status?: string | null;
          stripe_payment_intent?: string | null;
          verified_code?: string | null;
          workspace_id: string;
        };
        Update: {
          broker_name?: string | null;
          broker_notes?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          id?: string;
          price_usd?: number | null;
          product_id?: string;
          status?: string | null;
          stripe_payment_intent?: string | null;
          verified_code?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "broker_orders_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "broker_orders_workspace_id_product_id_fkey";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      classifications: {
        Row: {
          agent_run_id: string | null;
          alternatives: Json | null;
          citations: Json | null;
          code: string | null;
          confidence: number | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string | null;
          gri_path: Json | null;
          id: string;
          is_current: boolean | null;
          market: Database["public"]["Enums"]["market_code"];
          override_reason: string | null;
          product_id: string;
          reasoning: string | null;
          source: Database["public"]["Enums"]["class_source"];
          status: Database["public"]["Enums"]["class_status"];
          tariff_revision_id: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          agent_run_id?: string | null;
          alternatives?: Json | null;
          citations?: Json | null;
          code?: string | null;
          confidence?: number | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string | null;
          gri_path?: Json | null;
          id?: string;
          is_current?: boolean | null;
          market?: Database["public"]["Enums"]["market_code"];
          override_reason?: string | null;
          product_id: string;
          reasoning?: string | null;
          source?: Database["public"]["Enums"]["class_source"];
          status?: Database["public"]["Enums"]["class_status"];
          tariff_revision_id?: string | null;
          workspace_id: string;
        };
        Update: {
          agent_run_id?: string | null;
          alternatives?: Json | null;
          citations?: Json | null;
          code?: string | null;
          confidence?: number | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string | null;
          gri_path?: Json | null;
          id?: string;
          is_current?: boolean | null;
          market?: Database["public"]["Enums"]["market_code"];
          override_reason?: string | null;
          product_id?: string;
          reasoning?: string | null;
          source?: Database["public"]["Enums"]["class_source"];
          status?: Database["public"]["Enums"]["class_status"];
          tariff_revision_id?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classifications_workspace_id_agent_run_id_fkey";
            columns: ["workspace_id", "agent_run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "classifications_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classifications_workspace_id_product_id_fkey";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          id: string;
          kind: string | null;
          meta: Json | null;
          storage_path: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          kind?: string | null;
          meta?: Json | null;
          storage_path: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          kind?: string | null;
          meta?: Json | null;
          storage_path?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_schedules: {
        Row: {
          carrier: string | null;
          effective_from: string;
          effective_to: string | null;
          fee_type: string;
          flat_amount: number | null;
          id: string;
          market: Database["public"]["Enums"]["market_code"];
          max_amount: number | null;
          min_amount: number | null;
          mode: string | null;
          pct: number | null;
          source_url: string | null;
        };
        ComputedFields: never;
        Insert: {
          carrier?: string | null;
          effective_from: string;
          effective_to?: string | null;
          fee_type: string;
          flat_amount?: number | null;
          id?: string;
          market: Database["public"]["Enums"]["market_code"];
          max_amount?: number | null;
          min_amount?: number | null;
          mode?: string | null;
          pct?: number | null;
          source_url?: string | null;
        };
        Update: {
          carrier?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          fee_type?: string;
          flat_amount?: number | null;
          id?: string;
          market?: Database["public"]["Enums"]["market_code"];
          max_amount?: number | null;
          min_amount?: number | null;
          mode?: string | null;
          pct?: number | null;
          source_url?: string | null;
        };
        Relationships: [];
      };
      integrations: {
        Row: {
          access_token_secret_id: string | null;
          id: string;
          last_synced_at: string | null;
          provider: string;
          shop_domain: string | null;
          status: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          access_token_secret_id?: string | null;
          id?: string;
          last_synced_at?: string | null;
          provider: string;
          shop_domain?: string | null;
          status?: string | null;
          workspace_id: string;
        };
        Update: {
          access_token_secret_id?: string | null;
          id?: string;
          last_synced_at?: string | null;
          provider?: string;
          shop_domain?: string | null;
          status?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integrations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token_hash: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token_hash: string;
          workspace_id: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          role?: Database["public"]["Enums"]["member_role"];
          user_id: string;
          workspace_id: string;
        };
        Update: {
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          content_hash: string | null;
          created_at: string | null;
          currency: string | null;
          customs_value: number | null;
          description: string | null;
          external_id: string | null;
          facts: Json | null;
          id: string;
          image_urls: string[] | null;
          integration_id: string | null;
          origin_country: string | null;
          product_type: string | null;
          sku: string | null;
          tags: string[] | null;
          title: string;
          updated_at: string | null;
          vendor: string | null;
          weight_kg: number | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          content_hash?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customs_value?: number | null;
          description?: string | null;
          external_id?: string | null;
          facts?: Json | null;
          id?: string;
          image_urls?: string[] | null;
          integration_id?: string | null;
          origin_country?: string | null;
          product_type?: string | null;
          sku?: string | null;
          tags?: string[] | null;
          title: string;
          updated_at?: string | null;
          vendor?: string | null;
          weight_kg?: number | null;
          workspace_id: string;
        };
        Update: {
          content_hash?: string | null;
          created_at?: string | null;
          currency?: string | null;
          customs_value?: number | null;
          description?: string | null;
          external_id?: string | null;
          facts?: Json | null;
          id?: string;
          image_urls?: string[] | null;
          integration_id?: string | null;
          origin_country?: string | null;
          product_type?: string | null;
          sku?: string | null;
          tags?: string[] | null;
          title?: string;
          updated_at?: string | null;
          vendor?: string | null;
          weight_kg?: number | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_workspace_id_integration_id_fkey";
            columns: ["workspace_id", "integration_id"];
            isOneToOne: false;
            referencedRelation: "integrations";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      profiles: {
        Row: {
          full_name: string | null;
          id: string;
          is_platform_admin: boolean | null;
        };
        ComputedFields: never;
        Insert: {
          full_name?: string | null;
          id: string;
          is_platform_admin?: boolean | null;
        };
        Update: {
          full_name?: string | null;
          id?: string;
          is_platform_admin?: boolean | null;
        };
        Relationships: [];
      };
      quote_lines: {
        Row: {
          breakdown: Json | null;
          code_used: string | null;
          id: string;
          product_id: string | null;
          quantity: number;
          quote_id: string;
          unit_value: number | null;
          used_suggested: boolean | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          breakdown?: Json | null;
          code_used?: string | null;
          id?: string;
          product_id?: string | null;
          quantity: number;
          quote_id: string;
          unit_value?: number | null;
          used_suggested?: boolean | null;
          workspace_id: string;
        };
        Update: {
          breakdown?: Json | null;
          code_used?: string | null;
          id?: string;
          product_id?: string | null;
          quantity?: number;
          quote_id?: string;
          unit_value?: number | null;
          used_suggested?: boolean | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quote_lines_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_lines_workspace_id_product_id_fkey";
            columns: ["workspace_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["workspace_id", "id"];
          },
          {
            foreignKeyName: "quote_lines_workspace_id_quote_id_fkey";
            columns: ["workspace_id", "quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["workspace_id", "id"];
          },
        ];
      };
      quotes: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          destination: Database["public"]["Enums"]["market_code"] | null;
          id: string;
          mode: string | null;
          name: string | null;
          origin: string | null;
          totals: Json | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          destination?: Database["public"]["Enums"]["market_code"] | null;
          id?: string;
          mode?: string | null;
          name?: string | null;
          origin?: string | null;
          totals?: Json | null;
          workspace_id: string;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          destination?: Database["public"]["Enums"]["market_code"] | null;
          id?: string;
          mode?: string | null;
          name?: string | null;
          origin?: string | null;
          totals?: Json | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      ruling_chunks: {
        Row: {
          chunk: string;
          embedding: string | null;
          id: number;
          ruling_number: string | null;
        };
        ComputedFields: never;
        Insert: {
          chunk: string;
          embedding?: string | null;
          id?: number;
          ruling_number?: string | null;
        };
        Update: {
          chunk?: string;
          embedding?: string | null;
          id?: number;
          ruling_number?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ruling_chunks_ruling_number_fkey";
            columns: ["ruling_number"];
            isOneToOne: false;
            referencedRelation: "rulings";
            referencedColumns: ["number"];
          },
        ];
      };
      rulings: {
        Row: {
          collection: string | null;
          full_text: string | null;
          hts_codes: string[] | null;
          number: string;
          ruling_date: string | null;
          status: string | null;
          subject: string | null;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          collection?: string | null;
          full_text?: string | null;
          hts_codes?: string[] | null;
          number: string;
          ruling_date?: string | null;
          status?: string | null;
          subject?: string | null;
          url?: string | null;
        };
        Update: {
          collection?: string | null;
          full_text?: string | null;
          hts_codes?: string[] | null;
          number?: string;
          ruling_date?: string | null;
          status?: string | null;
          subject?: string | null;
          url?: string | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          current_period_end: string | null;
          plan: string | null;
          sku_limit: number | null;
          status: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          trial_ends_at: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          current_period_end?: string | null;
          plan?: string | null;
          sku_limit?: number | null;
          status?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_ends_at?: string | null;
          workspace_id: string;
        };
        Update: {
          current_period_end?: string | null;
          plan?: string | null;
          sku_limit?: number | null;
          status?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_ends_at?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: true;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tariff_lines: {
        Row: {
          code: string;
          column2_rate_raw: string | null;
          description: string;
          embedding: string | null;
          footnotes: Json | null;
          full_path: string | null;
          general_rate_raw: string | null;
          id: number;
          indent: number;
          is_leaf: boolean;
          rate: Json | null;
          revision_id: string;
          special_rate_raw: string | null;
          units: string[] | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          column2_rate_raw?: string | null;
          description: string;
          embedding?: string | null;
          footnotes?: Json | null;
          full_path?: string | null;
          general_rate_raw?: string | null;
          id?: number;
          indent: number;
          is_leaf: boolean;
          rate?: Json | null;
          revision_id: string;
          special_rate_raw?: string | null;
          units?: string[] | null;
        };
        Update: {
          code?: string;
          column2_rate_raw?: string | null;
          description?: string;
          embedding?: string | null;
          footnotes?: Json | null;
          full_path?: string | null;
          general_rate_raw?: string | null;
          id?: number;
          indent?: number;
          is_leaf?: boolean;
          rate?: Json | null;
          revision_id?: string;
          special_rate_raw?: string | null;
          units?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "tariff_lines_revision_id_fkey";
            columns: ["revision_id"];
            isOneToOne: false;
            referencedRelation: "tariff_revisions";
            referencedColumns: ["id"];
          },
        ];
      };
      tariff_measures: {
        Row: {
          applies_to_modes: string[] | null;
          authority: string;
          ch99_code: string | null;
          created_by: string | null;
          effective_from: string;
          effective_to: string | null;
          excluded_prefixes: string[] | null;
          hts_prefixes: string[];
          id: string;
          market: Database["public"]["Enums"]["market_code"];
          notes: string | null;
          origin_countries: string[];
          published: boolean | null;
          rate_type: string | null;
          rate_value: number;
          source_url: string;
        };
        ComputedFields: never;
        Insert: {
          applies_to_modes?: string[] | null;
          authority: string;
          ch99_code?: string | null;
          created_by?: string | null;
          effective_from: string;
          effective_to?: string | null;
          excluded_prefixes?: string[] | null;
          hts_prefixes: string[];
          id?: string;
          market: Database["public"]["Enums"]["market_code"];
          notes?: string | null;
          origin_countries: string[];
          published?: boolean | null;
          rate_type?: string | null;
          rate_value: number;
          source_url: string;
        };
        Update: {
          applies_to_modes?: string[] | null;
          authority?: string;
          ch99_code?: string | null;
          created_by?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          excluded_prefixes?: string[] | null;
          hts_prefixes?: string[];
          id?: string;
          market?: Database["public"]["Enums"]["market_code"];
          notes?: string | null;
          origin_countries?: string[];
          published?: boolean | null;
          rate_type?: string | null;
          rate_value?: number;
          source_url?: string;
        };
        Relationships: [];
      };
      tariff_revisions: {
        Row: {
          effective_from: string;
          id: string;
          imported_at: string | null;
          label: string;
          market: Database["public"]["Enums"]["market_code"];
          source_url: string | null;
        };
        ComputedFields: never;
        Insert: {
          effective_from: string;
          id?: string;
          imported_at?: string | null;
          label: string;
          market: Database["public"]["Enums"]["market_code"];
          source_url?: string | null;
        };
        Update: {
          effective_from?: string;
          id?: string;
          imported_at?: string | null;
          label?: string;
          market?: Database["public"]["Enums"]["market_code"];
          source_url?: string | null;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          business_type: string | null;
          created_at: string | null;
          default_incoterm: string | null;
          default_mode: string | null;
          default_origin: string | null;
          deleted_at: string | null;
          home_country: string;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          business_type?: string | null;
          created_at?: string | null;
          default_incoterm?: string | null;
          default_mode?: string | null;
          default_origin?: string | null;
          deleted_at?: string | null;
          home_country: string;
          id?: string;
          name: string;
        };
        Update: {
          business_type?: string | null;
          created_at?: string | null;
          default_incoterm?: string | null;
          default_mode?: string | null;
          default_origin?: string | null;
          deleted_at?: string | null;
          home_country?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      active_measures: {
        Args: {
          p_code: string;
          p_mode: string;
          p_on: string;
          p_origin: string;
        };
        Returns: {
          applies_to_modes: string[] | null;
          authority: string;
          ch99_code: string | null;
          created_by: string | null;
          effective_from: string;
          effective_to: string | null;
          excluded_prefixes: string[] | null;
          hts_prefixes: string[];
          id: string;
          market: Database["public"]["Enums"]["market_code"];
          notes: string | null;
          origin_countries: string[];
          published: boolean | null;
          rate_type: string | null;
          rate_value: number;
          source_url: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "tariff_measures";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      create_invitation: {
        Args: {
          p_email: string;
          p_role: Database["public"]["Enums"]["member_role"];
          p_workspace: string;
        };
        Returns: string;
      };
      create_workspace: {
        Args: {
          p_business_type?: string;
          p_home_country: string;
          p_name: string;
        };
        Returns: string;
      };
      current_revision: {
        Args: { m: Database["public"]["Enums"]["market_code"] };
        Returns: string;
      };
      has_role: {
        Args: {
          roles: Database["public"]["Enums"]["member_role"][];
          ws: string;
        };
        Returns: boolean;
      };
      is_member: { Args: { ws: string }; Returns: boolean };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      match_rulings: {
        Args: { hts_prefix?: string; k?: number; query_embedding: string };
        Returns: {
          chunk: string;
          ruling_number: string;
          similarity: number;
        }[];
      };
      match_tariff_lines: {
        Args: { k?: number; query_embedding: string; rev: string };
        Returns: {
          code: string;
          description: string;
          full_path: string;
          id: number;
          is_leaf: boolean;
          similarity: number;
        }[];
      };
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined };
      show_limit: { Args: Record<PropertyKey, never>; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      workspace_members: {
        Args: { p_workspace: string };
        Returns: {
          email: string;
          full_name: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        }[];
      };
    };
    Enums: {
      class_source: "ai" | "override" | "broker";
      class_status:
        | "queued"
        | "needs_answer"
        | "in_review"
        | "suggested"
        | "confirmed"
        | "broker_verified"
        | "outdated";
      market_code: "US" | "UK" | "EU" | "CA" | "AU";
      member_role: "owner" | "admin" | "member" | "viewer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      class_source: ["ai", "override", "broker"],
      class_status: [
        "queued",
        "needs_answer",
        "in_review",
        "suggested",
        "confirmed",
        "broker_verified",
        "outdated",
      ],
      market_code: ["US", "UK", "EU", "CA", "AU"],
      member_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const;
