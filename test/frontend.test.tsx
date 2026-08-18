import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ContactForm from "../src/components/ContactForm/ContactForm";
import { submitLead } from "../src/services/leadApi";
import { BrowserRouter } from "react-router-dom";

// Mock the API client
vi.mock("../src/services/leadApi", () => ({
  submitLead: vi.fn()
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe("Frontend Component - ContactForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default environment variable stubbing for Vite config
    vi.stubEnv("VITE_RECAPTCHA_SITE_KEY", "TODO_REQUIRED_CONFIGURATION");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const renderForm = () => {
    return render(
      <BrowserRouter>
        <ContactForm />
      </BrowserRouter>
    );
  };

  it("should render all standard input fields and submit button", () => {
    renderForm();

    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Company Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/City/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Country/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/State\/Province/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submit Lead Form/i })).toBeInTheDocument();
  });

  it("should show validation errors when submitting an empty form", async () => {
    renderForm();

    const submitBtn = screen.getByRole("button", { name: /Submit Lead Form/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/First name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Last name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Email address is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Company is required/i)).toBeInTheDocument();
    expect(screen.getByText(/City is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Please select a country/i)).toBeInTheDocument();
  });

  it("should validate email format and show an error for invalid email", async () => {
    renderForm();

    // Fill in other required inputs
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "John" } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: "Smith" } });
    fireEvent.change(screen.getByLabelText(/Company Name/i), { target: { value: "ABC" } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "New Delhi" } });
    fireEvent.change(screen.getByLabelText(/Country/i), { target: { value: "IN" } });
    
    // Invalid email input
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "invalid-email" } });

    fireEvent.click(screen.getByRole("button", { name: /Submit Lead Form/i }));

    expect(await screen.findByText(/Please enter a valid email address/i)).toBeInTheDocument();
  });

  it("should render state dropdown dynamically when country 'IN' (India) is selected", async () => {
    renderForm();

    const countrySelect = screen.getByLabelText(/Country/i);
    fireEvent.change(countrySelect, { target: { value: "IN" } });

    // Expect the state select dropdown to contain Indian state codes
    const stateSelect = screen.getByRole("combobox", { name: /State\/Province/i });
    expect(stateSelect).toBeInTheDocument();
    expect(stateSelect.tagName).toBe("SELECT");

    // Expect India states options
    expect(screen.getByRole("option", { name: /Delhi \(DL\)/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Maharashtra \(MH\)/i })).toBeInTheDocument();
  });

  it("should render custom input fields when Country is set to 'OTHER'", async () => {
    renderForm();

    const countrySelect = screen.getByLabelText(/Country/i);
    fireEvent.change(countrySelect, { target: { value: "OTHER" } });

    // Expect country custom text input to appear
    expect(await screen.findByLabelText(/Country ISO Code/i)).toBeInTheDocument();
    
    // Expect state custom text input to appear instead of a select dropdown
    expect(screen.getByLabelText(/State\/Province Code/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /State\/Province/i })).not.toBeInTheDocument();
  });

  it("should call submitLead API and navigate to /thank-you on success", async () => {
    vi.mocked(submitLead).mockResolvedValueOnce({
      success: true,
      message: "Lead submitted"
    });

    renderForm();

    // Populate valid details
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Azure" } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "azure.test@example.com" } });
    fireEvent.change(screen.getByLabelText(/Company Name/i), { target: { value: "pdfmasterpro.shop" } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "New Delhi" } });
    
    // Country and State Dropdowns
    fireEvent.change(screen.getByLabelText(/Country/i), { target: { value: "IN" } });
    fireEvent.change(screen.getByRole("combobox", { name: /State\/Province/i }), { target: { value: "DL" } });

    // Bypass Captcha via Mock Checkbox in Local Sandbox mode
    const mockCaptchaCheck = screen.getByLabelText(/I am not a robot \(Mock Challenge\)/i);
    fireEvent.click(mockCaptchaCheck);

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /Submit Lead Form/i }));

    await waitFor(() => {
      expect(submitLead).toHaveBeenCalledTimes(1);
      expect(submitLead).toHaveBeenCalledWith({
        firstName: "Azure",
        lastName: "Test",
        email: "azure.test@example.com",
        company: "pdfmasterpro.shop",
        city: "New Delhi",
        country: "IN",
        state: "DL",
        recaptchaToken: "mock_sandbox_token"
      });
      expect(mockNavigate).toHaveBeenCalledWith("/thank-you");
    });
  });

  it("should show submission failure alert when the API returns success: false", async () => {
    vi.mocked(submitLead).mockResolvedValueOnce({
      success: false,
      message: "Salesforce Web-to-Lead endpoint is down."
    });

    renderForm();

    // Populate valid details
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: "Azure" } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: "azure.test@example.com" } });
    fireEvent.change(screen.getByLabelText(/Company Name/i), { target: { value: "pdfmasterpro.shop" } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "New Delhi" } });
    fireEvent.change(screen.getByLabelText(/Country/i), { target: { value: "IN" } });
    fireEvent.change(screen.getByRole("combobox", { name: /State\/Province/i }), { target: { value: "DL" } });
    fireEvent.click(screen.getByLabelText(/I am not a robot \(Mock Challenge\)/i));

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /Submit Lead Form/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Salesforce Web-to-Lead endpoint is down/i)).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
