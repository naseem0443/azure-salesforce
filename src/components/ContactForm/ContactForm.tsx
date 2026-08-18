import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { submitLead } from "../../services/leadApi";
import { LeadPayload } from "../../types/lead";
import "./ContactForm.css";

// Supported ISO countries and state mappings
const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "IN", name: "India" },
  { code: "AU", name: "Australia" },
  { code: "OTHER", name: "Other Country (Enter Code)" }
];

const STATES_MAP: Record<string, { code: string; name: string }[]> = {
  US: [
    { code: "CA", name: "California" },
    { code: "NY", name: "New York" },
    { code: "TX", name: "Texas" },
    { code: "FL", name: "Florida" },
    { code: "WA", name: "Washington" }
  ],
  IN: [
    { code: "DL", name: "Delhi" },
    { code: "MH", name: "Maharashtra" },
    { code: "KA", name: "Karnataka" },
    { code: "HR", name: "Haryana" },
    { code: "TN", name: "Tamil Nadu" }
  ],
  CA: [
    { code: "ON", name: "Ontario" },
    { code: "QC", name: "Quebec" },
    { code: "BC", name: "British Columbia" },
    { code: "AB", name: "Alberta" }
  ],
  AU: [
    { code: "NSW", name: "New South Wales" },
    { code: "VIC", name: "Victoria" },
    { code: "QLD", name: "Queensland" },
    { code: "WA", name: "Western Australia" }
  ],
  GB: [
    { code: "ENG", name: "England" },
    { code: "SCT", name: "Scotland" },
    { code: "WLS", name: "Wales" },
    { code: "NIR", name: "Northern Ireland" }
  ]
};

export default function ContactForm() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    city: "",
    countrySelect: "",
    countryCustom: "",
    stateSelect: "",
    stateCustom: ""
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [useMockCaptcha, setUseMockCaptcha] = useState(false);

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  const isRealCaptchaConfigured = siteKey && siteKey !== "TODO_REQUIRED_CONFIGURATION" && siteKey !== "";

  // 1. Google reCAPTCHA script loader
  useEffect(() => {
    if (isRealCaptchaConfigured) {
      const scriptId = "recaptcha-google-script";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://www.google.com/recaptcha/api.js";
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
      }

      // Bind global callback
      (window as any).onRecaptchaSuccess = (token: string) => {
        setRecaptchaToken(token);
        setErrors(prev => ({ ...prev, recaptcha: "" }));
      };

      (window as any).onRecaptchaExpired = () => {
        setRecaptchaToken("");
      };
    }

    return () => {
      // Clean up global bindings if component unmounts
      delete (window as any).onRecaptchaSuccess;
      delete (window as any).onRecaptchaExpired;
    };
  }, [isRealCaptchaConfigured, siteKey]);

  // Handle Input Changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // Clear state selections if country changes
      ...(name === "countrySelect" ? { stateSelect: "", stateCustom: "" } : {})
    }));
    
    // Clear field-specific error as user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  // Client-side validations
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    // Required field checks
    if (!formData.firstName.trim()) newErrors.firstName = "First name is required.";
    else if (formData.firstName.length > 100) newErrors.firstName = "Max 100 characters.";

    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required.";
    else if (formData.lastName.length > 100) newErrors.lastName = "Max 100 characters.";

    if (!formData.email.trim()) newErrors.email = "Email address is required.";
    else if (!emailRegex.test(formData.email.trim())) newErrors.email = "Please enter a valid email address.";
    else if (formData.email.length > 254) newErrors.email = "Max 254 characters.";

    if (!formData.company.trim()) newErrors.company = "Company is required.";
    else if (formData.company.length > 200) newErrors.company = "Max 200 characters.";

    if (!formData.city.trim()) newErrors.city = "City is required.";
    else if (formData.city.length > 100) newErrors.city = "Max 100 characters.";

    // Country validation
    if (!formData.countrySelect) {
      newErrors.countrySelect = "Please select a country.";
    } else if (formData.countrySelect === "OTHER") {
      if (!formData.countryCustom.trim()) {
        newErrors.countryCustom = "Country ISO code is required.";
      } else if (formData.countryCustom.trim().length !== 2) {
        newErrors.countryCustom = "Please enter a valid 2-letter ISO Country code (e.g. FR).";
      }
    }

    // State validation
    if (formData.countrySelect && formData.countrySelect !== "OTHER" && STATES_MAP[formData.countrySelect]) {
      if (!formData.stateSelect) {
        newErrors.stateSelect = "Please select a state.";
      }
    } else {
      if (!formData.stateCustom.trim()) {
        newErrors.stateCustom = "State/Province code is required.";
      } else if (formData.stateCustom.length > 100) {
        newErrors.stateCustom = "Max 100 characters.";
      }
    }

    // Captcha validation
    if (isRealCaptchaConfigured && !recaptchaToken && !useMockCaptcha) {
      newErrors.recaptcha = "Please verify that you are not a robot.";
    } else if (!isRealCaptchaConfigured && !useMockCaptcha) {
      newErrors.recaptcha = "Configuration check: Click the mock check-box to bypass local testing.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (!validateForm()) return;

    setIsSubmitting(true);

    // Prepare mappings
    const finalCountry = formData.countrySelect === "OTHER" 
      ? formData.countryCustom.trim().toUpperCase() 
      : formData.countrySelect;

    const finalState = formData.countrySelect !== "OTHER" && STATES_MAP[formData.countrySelect]
      ? formData.stateSelect 
      : formData.stateCustom.trim().toUpperCase();

    const payload: LeadPayload = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim(),
      company: formData.company.trim(),
      city: formData.city.trim(),
      country: finalCountry,
      state: finalState,
      recaptchaToken: isRealCaptchaConfigured ? recaptchaToken : (useMockCaptcha ? "mock_sandbox_token" : undefined)
    };

    try {
      const response = await submitLead(payload);
      if (response.success) {
        navigate("/thank-you");
      } else {
        setSubmitError(response.message);
      }
    } catch (err) {
      setSubmitError("Unable to submit your request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCountryStates = STATES_MAP[formData.countrySelect];

  return (
    <div className="glass-card">
      <div className="contact-form-container">
        <div className="form-header">
          <h1 className="form-title">Get in Touch</h1>
          <p className="form-subtitle">Fill out the form below, and we'll route your request to our team.</p>
        </div>

        {submitError && (
          <div className="form-notification error" role="alert">
            <span>⚠</span> {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            {/* First Name */}
            <div className={`form-group ${errors.firstName ? "has-error" : ""}`}>
              <label htmlFor="firstName" className="form-label">
                First Name<span className="required-star">*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                value={formData.firstName}
                onChange={handleChange}
                className="form-input"
                placeholder="John"
                disabled={isSubmitting}
                maxLength={100}
                required
              />
              {errors.firstName && <span className="error-message">{errors.firstName}</span>}
            </div>

            {/* Last Name */}
            <div className={`form-group ${errors.lastName ? "has-error" : ""}`}>
              <label htmlFor="lastName" className="form-label">
                Last Name<span className="required-star">*</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                value={formData.lastName}
                onChange={handleChange}
                className="form-input"
                placeholder="Smith"
                disabled={isSubmitting}
                maxLength={100}
                required
              />
              {errors.lastName && <span className="error-message">{errors.lastName}</span>}
            </div>

            {/* Email Address */}
            <div className={`form-group full-width ${errors.email ? "has-error" : ""}`}>
              <label htmlFor="email" className="form-label">
                Email Address<span className="required-star">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="form-input"
                placeholder="john.smith@example.com"
                disabled={isSubmitting}
                maxLength={254}
                required
              />
              {errors.email && <span className="error-message">{errors.email}</span>}
            </div>

            {/* Company Name */}
            <div className={`form-group full-width ${errors.company ? "has-error" : ""}`}>
              <label htmlFor="company" className="form-label">
                Company Name<span className="required-star">*</span>
              </label>
              <input
                id="company"
                name="company"
                type="text"
                value={formData.company}
                onChange={handleChange}
                className="form-input"
                placeholder="ABC Enterprise Ltd"
                disabled={isSubmitting}
                maxLength={200}
                required
              />
              {errors.company && <span className="error-message">{errors.company}</span>}
            </div>

            {/* City */}
            <div className={`form-group ${errors.city ? "has-error" : ""}`}>
              <label htmlFor="city" className="form-label">
                City<span className="required-star">*</span>
              </label>
              <input
                id="city"
                name="city"
                type="text"
                value={formData.city}
                onChange={handleChange}
                className="form-input"
                placeholder="New Delhi"
                disabled={isSubmitting}
                maxLength={100}
                required
              />
              {errors.city && <span className="error-message">{errors.city}</span>}
            </div>

            {/* Country Dropdown */}
            <div className={`form-group ${errors.countrySelect ? "has-error" : ""}`}>
              <label htmlFor="countrySelect" className="form-label">
                Country<span className="required-star">*</span>
              </label>
              <select
                id="countrySelect"
                name="countrySelect"
                value={formData.countrySelect}
                onChange={handleChange}
                className="form-select"
                disabled={isSubmitting}
                required
              >
                <option value="">Select country...</option>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.countrySelect && <span className="error-message">{errors.countrySelect}</span>}
            </div>

            {/* Conditional Country Custom Entry */}
            {formData.countrySelect === "OTHER" && (
              <div className={`form-group ${errors.countryCustom ? "has-error" : ""}`}>
                <label htmlFor="countryCustom" className="form-label">
                  Country ISO Code<span className="required-star">*</span>
                </label>
                <input
                  id="countryCustom"
                  name="countryCustom"
                  type="text"
                  value={formData.countryCustom}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="FR"
                  maxLength={2}
                  disabled={isSubmitting}
                  required
                />
                {errors.countryCustom && <span className="error-message">{errors.countryCustom}</span>}
              </div>
            )}

            {/* State/Province - Dropdown or text field based on Country */}
            {selectedCountryStates ? (
              <div className={`form-group ${errors.stateSelect ? "has-error" : ""}`}>
                <label htmlFor="stateSelect" className="form-label">
                  State/Province<span className="required-star">*</span>
                </label>
                <select
                  id="stateSelect"
                  name="stateSelect"
                  value={formData.stateSelect}
                  onChange={handleChange}
                  className="form-select"
                  disabled={isSubmitting}
                  required
                >
                  <option value="">Select state...</option>
                  {selectedCountryStates.map(s => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                {errors.stateSelect && <span className="error-message">{errors.stateSelect}</span>}
              </div>
            ) : (
              <div className={`form-group ${errors.stateCustom ? "has-error" : ""}`}>
                <label htmlFor="stateCustom" className="form-label">
                  State/Province Code<span className="required-star">*</span>
                </label>
                <input
                  id="stateCustom"
                  name="stateCustom"
                  type="text"
                  value={formData.stateCustom}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="DL"
                  disabled={isSubmitting}
                  maxLength={100}
                  required
                />
                {errors.stateCustom && <span className="error-message">{errors.stateCustom}</span>}
              </div>
            )}

            {/* Google reCAPTCHA widget / sandbox emulator */}
            <div className="form-group full-width">
              <label className="form-label">
                Security Verification<span className="required-star">*</span>
              </label>
              
              <div className="captcha-container">
                {isRealCaptchaConfigured ? (
                  /* Google reCAPTCHA widget node */
                  <div 
                    className="g-recaptcha" 
                    data-sitekey={siteKey}
                    data-callback="onRecaptchaSuccess"
                    data-expired-callback="onRecaptchaExpired"
                    data-theme="dark"
                  ></div>
                ) : (
                  /* Dev/Sandbox Mock Captcha Trigger */
                  <div className="recaptcha-placeholder">
                    <div className="placeholder-title">reCAPTCHA Local Sandbox</div>
                    <div className="placeholder-text">
                      VITE_RECAPTCHA_SITE_KEY is not configured yet. 
                    </div>
                    <label className="mock-checkbox-label">
                      <input
                        type="checkbox"
                        checked={useMockCaptcha}
                        onChange={(e) => {
                          setUseMockCaptcha(e.target.checked);
                          if (errors.recaptcha) setErrors(prev => ({ ...prev, recaptcha: "" }));
                        }}
                        className="mock-checkbox"
                        disabled={isSubmitting}
                      />
                      I am not a robot (Mock Challenge)
                    </label>
                  </div>
                )}
                {errors.recaptcha && <span className="error-message">{errors.recaptcha}</span>}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="submit-btn"
            style={{ marginTop: "2rem" }}
          >
            {isSubmitting ? (
              <>
                <span className="spinner"></span>
                Submitting Request...
              </>
            ) : (
              "Submit Lead Form"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
