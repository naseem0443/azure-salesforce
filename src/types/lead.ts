export interface LeadPayload {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  city: string;
  country: string; // ISO 3166-1 two-letter code
  state: string;    // State code
}

export interface LeadResponse {
  success: boolean;
  message: string;
}
