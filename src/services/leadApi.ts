import { LeadPayload, LeadResponse } from "../types/lead";

/**
 * Submits the lead form payload to the backend proxy API (/api/lead).
 * @param payload The sanitized lead form input data.
 * @returns An object containing success status and feedback message.
 */
export async function submitLead(payload: LeadPayload): Promise<LeadResponse> {
  try {
    const response = await fetch("/api/lead", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || "Unable to submit your request. Please try again."
      };
    }

    return {
      success: true,
      message: data.message || "Your request has been submitted successfully."
    };
  } catch (error) {
    return {
      success: false,
      message: "Unable to submit your request. Please check your network connection and try again."
    };
  }
}
