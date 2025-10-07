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

// Discriminated union, so TS knows the exact payload shape by schema_type
export type DataExtractionResponse =
  | { schema_type: typeof SchemaType.NETWORK;        extracted_data: NetworkPayload;        success: boolean; message?: string }
  | { schema_type: typeof SchemaType.DEAL_FLOW;      extracted_data: DealFlowPayload;      success: boolean; message?: string }
  | { schema_type: typeof SchemaType.LP_MAIN_DASHBOARD; extracted_data: LPMainDashboardPayload; success: boolean; message?: string }
  | { schema_type: typeof SchemaType.VC_FUND;        extracted_data: VCFundPayload;        success: boolean; message?: string };

// --- Basic structures mirroring Pydantic alias keys exactly ---
// Keep everything optional (server may omit fields). Types are strings for now (basic).

export interface LPMainDashboardPayload {
  "Name"?: string;
  "Amount $"?: string;
  "Email"?: string;
  "Notes"?: string;
  "Status"?: string;
  "Fund"?: string;
  "Sent Email?"?: string;
  "Follow Up date"?: string;
  "Upcoming Meeting"?: string;
  "Last Reach Out"?: string;
  "Country"?: string;
  "State"?: string; // could be a stricter USStateName union later
  "City"?: string;
}

export interface DealFlowPayload {
  "Company name"?: string;
  "CEO/ Primary Contact"?: string;
  "Email"?: string;
  "Date Sourced"?: string;
  "Revenue Run Rate"?: string; // keep string for now; can switch to number later
  "Financing Round"?: string;
  "Evaluation"?: string;
  "State"?: string;
  "City"?: string;
  "Referral Source"?: string;
  "Name of Referral"?: string;
  "Sourced By"?: string;
  "DEI"?: string;
  "Equity/ Debt"?: string;
  "Notes"?: string;
  "Files"?: string;
}

export interface VCFundPayload {
  "Name"?: string;
  "Stage"?: string;
  "Date"?: string;
  "Name of Contact"?: string;
  "Title"?: string;
  "Email"?: string;
  "Phone"?: string;
  "Country"?: string;
  "State"?: string;
  "Industry Focus"?: string;
  "Check Size"?: string;
  "LinkedIn"?: string;
  "Notes"?: string;
}

export interface NetworkPayload {
  "Name"?: string;
  "LinkedIn"?: string;
  "Email"?: string;
  "Phone"?: string;
  "Company"?: string;
  "Title"?: string;
  "Status"?: string;
  "Country"?: string;
  "State"?: string;
  "City"?: string;
  "Notes"?: string;
  "Date"?: string;
  "Date (Last Met)"?: string;
  "Date (Last Contact)"?: string;
}

// A convenient alias for editor components
export type ExtractedData =
  | LPMainDashboardPayload
  | DealFlowPayload
  | VCFundPayload
  | NetworkPayload;