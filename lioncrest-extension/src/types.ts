// Types for the API
export const SchemaType = {
  NETWORK: "network",
  DEAL_FLOW: "deal_flow",
  LP_MAIN_DASHBOARD: "lp_main_dashboard",
  VC_FUND: "vc_fund"
} as const;

export type SchemaType = typeof SchemaType[keyof typeof SchemaType];

export const SchemaTypeLabels = {
  [SchemaType.NETWORK]: "Network",
  [SchemaType.DEAL_FLOW]: "Deal Flow",
  [SchemaType.LP_MAIN_DASHBOARD]: "LP Main Dashboard",
  [SchemaType.VC_FUND]: "VC Fund"
}

export interface DataExtractionRequest {
  text: string;
  schema_type: SchemaType;
}

export interface DataExtractionResponse {
  extracted_data: Record<string, any>;
  schema_type: SchemaType;
  success: boolean;
  message?: string;
}

// Network schema types
export interface Contact {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
}

export interface Organization {
  name?: string;
  type?: string;
  industry?: string;
  description?: string;
  website?: string;
}

export interface Relationship {
  from_entity?: string;
  to_entity?: string;
  relationship_type?: string;
  description?: string;
}

export interface NetworkData {
  contacts?: Contact[];
  organizations?: Organization[];
  relationships?: Relationship[];
}

// Deal Flow schema types
export interface Founder {
  name?: string;
  role?: string;
  background?: string;
}

export interface KeyMetrics {
  revenue?: string;
  growth_rate?: string;
  users?: string;
}

export interface DealFlowData {
  company_name?: string;
  industry?: string;
  stage?: string;
  funding_amount?: string;
  valuation?: string;
  investors?: string[];
  founders?: Founder[];
  business_model?: string;
  market_size?: string;
  competitive_advantage?: string;
  key_metrics?: KeyMetrics;
}

// LP Main Dashboard schema types
export interface LPMainDashboardData {
  Name?: string;
  "LP Connection"?: string[];
  "Amount $"?: string;
  Email?: string;
  Notes?: string;
  Status?: string;
  Fund?: string;
  "sent email?"?: string;
  "Follow Up date"?: string;
  "Upcoming Meeting"?: string;
  "Last Reach Out"?: string;
  Country?: string;
  State?: string;
  City?: string;
}

// VC Fund schema types
export interface PortfolioCompany {
  company_name?: string;
  investment_date?: string;
  investment_amount?: string;
  current_status?: string;
  sector?: string;
}

export interface FundPerformance {
  total_invested?: string;
  current_value?: string;
  realized_returns?: string;
  irr?: string;
  multiple?: string;
}

export interface FundManager {
  name?: string;
  role?: string;
  experience?: string;
}

export interface VCFundData {
  fund_name?: string;
  fund_size?: string;
  vintage_year?: string;
  investment_focus?: string;
  geographic_focus?: string;
  stage_focus?: string;
  portfolio_companies?: PortfolioCompany[];
  fund_performance?: FundPerformance;
  fund_managers?: FundManager[];
}

export type ExtractedData = NetworkData | DealFlowData | LPMainDashboardData | VCFundData;
