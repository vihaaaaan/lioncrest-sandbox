// Types for the API

// Schema info returned from /schema_names endpoint
export interface SchemaInfo {
  value: string;
  display_name: string;
}

export interface SchemaNameResponse {
  schemas: SchemaInfo[];
  count: number;
  message: string;
}

export interface DataExtractionRequest {
  text: string;
  schema_type: string;
}

// Simplified response type - schema_type is now just a string
export interface DataExtractionResponse {
  schema_type: string;
  extracted_data: Record<string, any>;
  success: boolean;
  message?: string;
}

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

// A convenient alias for editor components - allow any string key for dynamic schema fields
export type ExtractedData = Record<string, any>;