import { Context, HttpRequest } from "@azure/functions";

// Lazy in-memory cache for duplicate submission detection (prevents multi-clicking)
const duplicateCache = new Map<string, number>();
const DUPLICATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function isDuplicateRequest(email: string, company: string): boolean {
  const now = Date.now();
  const key = `${email.toLowerCase().trim()}|${company.toLowerCase().trim()}`;
  
  // Lazy cleanup of expired items
  for (const [k, timestamp] of duplicateCache.entries()) {
    if (now - timestamp > DUPLICATE_TIMEOUT_MS) {
      duplicateCache.delete(k);
    }
  }

  const lastSubmitted = duplicateCache.get(key);
  if (lastSubmitted && (now - lastSubmitted) < DUPLICATE_TIMEOUT_MS) {
    return true;
  }

  duplicateCache.set(key, now);
  return false;
}

// Basic input sanitization to strip HTML tags
function sanitize(input: string): string {
  return input.replace(/<[^>]*>?/gm, "").trim();
}

// Safe email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default async function (context: Context, req: HttpRequest): Promise<void> {
  context.log("[API] Processing lead submission request.");

  // 1. Method verification: POST only
  if (req.method !== "POST") {
    context.log.warn(`[API] Invalid method: ${req.method}. Only POST is allowed.`);
    context.res = {
      status: 405,
      headers: { "Content-Type": "application/json" },
      body: {
        success: false,
        message: "Method Not Allowed. Only POST is supported."
      }
    };
    return;
  }

  // 2. Content-Type verification: Must be application/json
  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    context.log.warn(`[API] Invalid Content-Type: ${contentType}.`);
    context.res = {
      status: 415,
      headers: { "Content-Type": "application/json" },
      body: {
        success: false,
        message: "Unsupported Media Type. Request body must be JSON."
      }
    };
    return;
  }

  try {
    // 3. Size Protection: Check raw body size to prevent overload
    const rawBody = req.rawBody || "";
    if (rawBody.length > 50000) { // Limit request to ~50KB
      context.log.warn(`[API] Payload too large: ${rawBody.length} bytes.`);
      context.res = {
        status: 413,
        headers: { "Content-Type": "application/json" },
        body: {
          success: false,
          message: "Payload Too Large. Request size exceeds limit."
        }
      };
      return;
    }

    const body = req.body;
    if (!body || typeof body !== "object") {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: {
          success: false,
          message: "Bad Request. Missing or invalid JSON body."
        }
      };
      return;
    }

    // 4. Extract and check parameters
    const { firstName, lastName, email, company, city, country, state, recaptchaToken } = body;

    // Validate type constraints and required fields
    const fieldsToValidate = { firstName, lastName, email, company, city, country, state };
    for (const [name, val] of Object.entries(fieldsToValidate)) {
      if (val === undefined || val === null || val === "") {
        context.log.warn(`[API] Missing required field: ${name}`);
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: {
            success: false,
            message: "Unable to submit your request. Please fill out all required fields."
          }
        };
        return;
      }
      if (typeof val !== "string") {
        context.log.warn(`[API] Field ${name} must be a string.`);
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: {
            success: false,
            message: "Unable to submit your request. Invalid field type."
          }
        };
        return;
      }
    }

    // Trim and sanitize inputs
    const sanitizedFirstName = sanitize(firstName);
    const sanitizedLastName = sanitize(lastName);
    const sanitizedEmail = sanitize(email);
    const sanitizedCompany = sanitize(company);
    const sanitizedCity = sanitize(city);
    const sanitizedCountry = sanitize(country);
    const sanitizedState = sanitize(state);

    // 5. Length validations (Salesforce limits and buffer)
    if (
      sanitizedFirstName.length > 100 ||
      sanitizedLastName.length > 100 ||
      sanitizedEmail.length > 254 ||
      sanitizedCompany.length > 200 ||
      sanitizedCity.length > 100 ||
      sanitizedCountry.length > 100 ||
      sanitizedState.length > 100
    ) {
      context.log.warn("[API] Input exceeds maximum character limits.");
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: {
          success: false,
          message: "Unable to submit your request. Input size exceeds limit."
        }
      };
      return;
    }

    // 6. Format check: Email
    if (!EMAIL_REGEX.test(sanitizedEmail)) {
      context.log.warn(`[API] Invalid email format: ${sanitizedEmail.substring(0, 3)}...`);
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: {
          success: false,
          message: "Unable to submit your request. Please provide a valid email address."
        }
      };
      return;
    }

    // 7. Duplicate Submission Check
    if (isDuplicateRequest(sanitizedEmail, sanitizedCompany)) {
      context.log.warn(`[API] Duplicate submission detected for email suffix: ...${sanitizedEmail.split("@")[1]}`);
      context.res = {
        status: 409,
        headers: { "Content-Type": "application/json" },
        body: {
          success: false,
          message: "Your request is already being processed. Please do not submit duplicate requests."
        }
      };
      return;
    }

    // 8. reCAPTCHA Verification Scaffolding (Google API validation)
    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
    if (recaptchaSecret && recaptchaSecret !== "TODO_REQUIRED_CONFIGURATION") {
      if (!recaptchaToken) {
        context.log.warn("[API] Google reCAPTCHA secret configured but no token provided by client.");
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: {
            success: false,
            message: "Unable to submit your request. Captcha verification failed."
          }
        };
        return;
      }
      
      try {
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaToken}`;
        const recaptchaResponse = await fetch(verifyUrl, { method: "POST" });
        const recaptchaData = await recaptchaResponse.json() as { success: boolean };
        if (!recaptchaData.success) {
          context.log.warn("[API] Google reCAPTCHA verification failed on siteverify.");
          context.res = {
            status: 400,
            headers: { "Content-Type": "application/json" },
            body: {
              success: false,
              message: "Unable to submit your request. Captcha verification failed."
            }
          };
          return;
        }
      } catch (err) {
        context.log.error("[API] Failed verifying reCAPTCHA token with Google:", err);
        // Fall through to submit, or reject depending on strict security policies. We reject for safety.
        context.res = {
          status: 500,
          headers: { "Content-Type": "application/json" },
          body: {
            success: false,
            message: "Unable to submit your request. Please try again."
          }
        };
        return;
      }
    }

    // 9. Load Salesforce server-side configurations
    const salesforceUrl = process.env.SALESFORCE_WEB_TO_LEAD_URL || "https://webto.salesforce.com/servlet/servlet.WebToLead";
    const salesforceOid = process.env.SALESFORCE_OID || "00Dbm00000uN5YG";
    const salesforceLeadSource = process.env.SALESFORCE_LEAD_SOURCE || "Web";

    // 10. Map Frontend keys to Salesforce Web-to-Lead keys
    const sfParams = new URLSearchParams();
    sfParams.append("oid", salesforceOid);
    sfParams.append("retURL", "https://pdfmasterpro.shop/thank-you");
    sfParams.append("lead_source", salesforceLeadSource);
    sfParams.append("first_name", sanitizedFirstName);
    sfParams.append("last_name", sanitizedLastName);
    sfParams.append("email", sanitizedEmail);
    sfParams.append("company", sanitizedCompany);
    sfParams.append("city", sanitizedCity);
    sfParams.append("country_code", sanitizedCountry);
    sfParams.append("state_code", sanitizedState);

    // If reCAPTCHA token exists, forward it to Salesforce
    if (recaptchaToken) {
      sfParams.append("g-recaptcha-response", recaptchaToken);
    }

    context.log("[API] Submitting lead to Salesforce endpoint...");

    // 11. HTTPS POST submission to Salesforce
    const response = await fetch(salesforceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: sfParams.toString(),
      signal: AbortSignal.timeout(10000) // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`Salesforce Web-to-Lead endpoint returned status ${response.status}`);
    }

    context.log("[API] Lead submitted successfully to Salesforce.");

    // 12. Return success response
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        success: true,
        message: "Your request has been submitted successfully."
      }
    };

  } catch (error: any) {
    // 13. Safe error handling: log detail internally but hide stack trace and config from client
    context.log.error("[API] Error submitting lead to Salesforce:", error.message || error);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: {
        success: false,
        message: "Unable to submit your request. Please try again."
      }
    };
  }
}
