import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import ThankYou from "../src/pages/ThankYou";
import { submitLead } from "../src/services/leadApi";

describe("Frontend Page - ThankYou", () => {
  it("should render thank you confirmation and route link back to form", () => {
    render(
      <BrowserRouter>
        <ThankYou />
      </BrowserRouter>
    );

    expect(screen.getByText(/Submission Successful!/i)).toBeInTheDocument();
    expect(screen.getByText(/safely synced with our Salesforce Lead desk/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Return to Form/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Return to Form/i })).toHaveAttribute("href", "/");
  });
});

describe("Frontend Service Client - leadApi.ts", () => {
  it("should submit payload and return success response on HTTP 200", async () => {
    const mockPayload = {
      firstName: "Azure",
      lastName: "Test",
      email: "test@example.com",
      company: "pdfmasterpro",
      city: "New Delhi",
      country: "IN",
      state: "DL"
    };

    const mockResponseData = { success: true, message: "Your request has been submitted successfully." };
    
    // Mock global fetch
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseData
    } as any);

    const result = await submitLead(mockPayload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/lead", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(mockPayload)
    });
    
    expect(result).toEqual({
      success: true,
      message: "Your request has been submitted successfully."
    });
    
    fetchSpy.mockRestore();
  });

  it("should catch fetch exceptions and return user-friendly failure response", async () => {
    const mockPayload = {
      firstName: "Azure",
      lastName: "Test",
      email: "test@example.com",
      company: "pdfmasterpro",
      city: "New Delhi",
      country: "IN",
      state: "DL"
    };

    // Mock fetch throwing exception (e.g., DNS resolution failure or client offline)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Failed to fetch"));

    const result = await submitLead(mockPayload);

    expect(result).toEqual({
      success: false,
      message: "Unable to submit your request. Please check your network connection and try again."
    });
    
    fetchSpy.mockRestore();
  });
});
