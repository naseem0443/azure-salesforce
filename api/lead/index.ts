import { Context, HttpRequest } from "@azure/functions";

// Local/dev duplicate protection.
// NOTE: This is intentionally in-memory and is not a distributed production rate limiter.
const duplicateCache = new Map<string, number>();
const DUPLICATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function hasRecentSubmission(email: string, company: string): boolean {
  const now = Date.now();
  const key = `${email.toLowerCase().trim()}|${company.toLowerCase().trim()}`;

  for (const [k, timestamp] of duplicateCache.entries()) {
    if (now - timestamp > DUPLICATE_TIMEOUT_MS) {
      duplicateCache.delete(k);
    }
  }

  const lastSubmitted = duplicateCache.get(key);
  return !!lastSubmitted && now - lastSubmitted < DUPLICATE_TIMEOUT_MS;
}

function rememberSuccessfulSubmission(email: string, company: string): void {
  const key = `${email.toLowerCase().trim()}|${company.toLowerCase().trim()}`;
  duplicateCache.set(key, Date.now());
}

// Basic sanitization for the seven plain-text fields.
function sanitize(input: string): string {
  return input.replace(/<[^>]*>?/gm, "").trim();
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing required configuration: ${name}`);
  }

  return value.trim();
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body,
  };
}

export default async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  context.log("[API] Processing lead submission request.");

  // 1. POST only
  if (req.method !== "POST") {
    context.log.warn(`[API] Invalid method: ${req.method}.`);
    context.res = jsonResponse(405, {
      success: false,
      message: "Method Not Allowed. Only POST is supported.",
    });
    return;
  }

  // 2. JSON only
  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    context.log.warn(`[API] Invalid Content-Type: ${contentType}.`);
    context.res = jsonResponse(415, {
      success: false,
      message: "Unsupported Media Type. Request body must be JSON.",
    });
    return;
  }

  try {
    // 3. Request-size protection
    const rawBody = req.rawBody || "";
    if (rawBody.length > 50_000) {
      context.log.warn(`[API] Payload too large: ${rawBody.length} bytes.`);
      context.res = jsonResponse(413, {
        success: false,
        message: "Payload Too Large. Request size exceeds limit.",
      });
      return;
    }

    // 4. Validate request body
    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      context.res = jsonResponse(400, {
        success: false,
        message: "Bad Request. Missing or invalid JSON body.",
      });
      return;
    }

    const {
      firstName,
      lastName,
      email,
      company,
      city,
      country,
      state,
      recaptchaToken,
    } = body as Record<string, unknown>;

    const fieldsToValidate: Record<string, unknown> = {
      firstName,
      lastName,
      email,
      company,
      city,
      country,
      state,
    };

    // 5. Required/type validation
    for (const [name, value] of Object.entries(fieldsToValidate)) {
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      ) {
        context.log.warn(`[API] Missing required field: ${name}.`);
        context.res = jsonResponse(400, {
          success: false,
          message:
            "Unable to submit your request. Please fill out all required fields.",
        });
        return;
      }

      if (typeof value !== "string") {
        context.log.warn(`[API] Field ${name} must be a string.`);
        context.res = jsonResponse(400, {
          success: false,
          message: "Unable to submit your request. Invalid field type.",
        });
        return;
      }
    }

    // 6. CAPTCHA token, when supplied, must be a string.
    if (
      recaptchaToken !== undefined &&
      recaptchaToken !== null &&
      typeof recaptchaToken !== "string"
    ) {
      context.log.warn("[API] Invalid reCAPTCHA token type.");
      context.res = jsonResponse(400, {
        success: false,
        message: "Unable to submit your request. Captcha verification failed.",
      });
      return;
    }

    // 7. Sanitize
    const sanitizedFirstName = sanitize(firstName as string);
    const sanitizedLastName = sanitize(lastName as string);
    const sanitizedEmail = sanitize(email as string).toLowerCase();
    const sanitizedCompany = sanitize(company as string);
    const sanitizedCity = sanitize(city as string);
    const sanitizedCountry = sanitize(country as string);
    const sanitizedState = sanitize(state as string);
    const sanitizedRecaptchaToken =
      typeof recaptchaToken === "string" ? recaptchaToken.trim() : "";

    // Ensure sanitization did not turn required fields into empty values.
    const sanitizedFields = {
      firstName: sanitizedFirstName,
      lastName: sanitizedLastName,
      email: sanitizedEmail,
      company: sanitizedCompany,
      city: sanitizedCity,
      country: sanitizedCountry,
      state: sanitizedState,
    };

    for (const [name, value] of Object.entries(sanitizedFields)) {
      if (!value) {
        context.log.warn(`[API] Field became empty after sanitization: ${name}.`);
        context.res = jsonResponse(400, {
          success: false,
          message:
            "Unable to submit your request. Please provide valid information.",
        });
        return;
      }
    }

    // 8. Length validation
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
      context.res = jsonResponse(400, {
        success: false,
        message: "Unable to submit your request. Input size exceeds limit.",
      });
      return;
    }

    // 9. Email validation
    if (!EMAIL_REGEX.test(sanitizedEmail)) {
      context.log.warn("[API] Invalid email format.");
      context.res = jsonResponse(400, {
        success: false,
        message:
          "Unable to submit your request. Please provide a valid email address.",
      });
      return;
    }

    // 10. CAPTCHA verification.
    // This is an independent Google reCAPTCHA v2 verification performed by the backend.
    // The secret never leaves the server.
    const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY?.trim();

    if (!recaptchaSecret) {
      context.log.error("[API] RECAPTCHA_SECRET_KEY is not configured.");
      context.res = jsonResponse(500, {
        success: false,
        message: "Unable to submit your request. Please try again later.",
      });
      return;
    }

    if (!sanitizedRecaptchaToken) {
      context.log.warn("[API] No reCAPTCHA token provided.");
      context.res = jsonResponse(400, {
        success: false,
        message: "Unable to submit your request. Captcha verification failed.",
      });
      return;
    }

    try {
      const verifyBody = new URLSearchParams({
        secret: recaptchaSecret,
        response: sanitizedRecaptchaToken,
      });

      const recaptchaResponse = await fetch(
        "https://www.google.com/recaptcha/api/siteverify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: verifyBody.toString(),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!recaptchaResponse.ok) {
        context.log.warn(
          `[API] reCAPTCHA verification service returned HTTP ${recaptchaResponse.status}.`
        );
        context.res = jsonResponse(502, {
          success: false,
          message: "Unable to verify the security check. Please try again.",
        });
        return;
      }

      const recaptchaData = (await recaptchaResponse.json()) as {
        success?: boolean;
        hostname?: string;
        ["error-codes"]?: string[];
      };

      if (!recaptchaData.success) {
        context.log.warn("[API] Google reCAPTCHA verification failed.");
        context.res = jsonResponse(400, {
          success: false,
          message: "Unable to submit your request. Captcha verification failed.",
        });
        return;
      }

      // For production, verify hostname against the actual registered domain.
      // Local development can use localhost only if the Google key is configured for it.
      const allowedHosts = new Set([
        "pdfmasterpro.shop",
        "www.pdfmasterpro.shop",
        "localhost",
        "127.0.0.1",
      ]);

      if (
        recaptchaData.hostname &&
        !allowedHosts.has(recaptchaData.hostname.toLowerCase())
      ) {
        context.log.warn(
          `[API] Unexpected reCAPTCHA hostname: ${recaptchaData.hostname}`
        );
        context.res = jsonResponse(400, {
          success: false,
          message: "Unable to submit your request. Captcha verification failed.",
        });
        return;
      }
    } catch (error) {
      context.log.error(
        "[API] reCAPTCHA verification request failed:",
        error instanceof Error ? error.message : error
      );
      context.res = jsonResponse(502, {
        success: false,
        message: "Unable to verify the security check. Please try again.",
      });
      return;
    }

    // 11. Validate Salesforce configuration.
    const salesforceUrl = getRequiredEnv("SALESFORCE_WEB_TO_LEAD_URL");
    const salesforceOid = getRequiredEnv("SALESFORCE_OID");
    const salesforceLeadSource = getRequiredEnv("SALESFORCE_LEAD_SOURCE");
    const returnUrl = getRequiredEnv("SALESFORCE_RETURN_URL");

    // Only allow the configured Salesforce Web-to-Lead endpoint.
    if (
      salesforceUrl !==
      "https://webto.salesforce.com/servlet/servlet.WebToLead"
    ) {
      throw new Error("Invalid Salesforce Web-to-Lead endpoint configuration.");
    }

    // 12. Duplicate check BEFORE Salesforce submission, but do not mark it yet.
    if (hasRecentSubmission(sanitizedEmail, sanitizedCompany)) {
      context.log.warn(
        `[API] Recent duplicate submission detected for email domain: ...${
          sanitizedEmail.split("@")[1] || "unknown"
        }`
      );
      context.res = jsonResponse(409, {
        success: false,
        message:
          "Your request was already submitted recently. Please do not submit duplicate requests.",
      });
      return;
    }

    // 13. Build Salesforce Web-to-Lead parameters.
    const sfParams = new URLSearchParams();
    sfParams.append("oid", salesforceOid);
    sfParams.append("retURL", returnUrl);
    sfParams.append("lead_source", salesforceLeadSource);
    sfParams.append("first_name", sanitizedFirstName);
    sfParams.append("last_name", sanitizedLastName);
    sfParams.append("email", sanitizedEmail);
    sfParams.append("company", sanitizedCompany);
    sfParams.append("city", sanitizedCity);
    sfParams.append("country_code", sanitizedCountry);
    sfParams.append("state_code", sanitizedState);

    // Preserve the Salesforce Web-to-Lead CAPTCHA token.
    sfParams.append("g-recaptcha-response", sanitizedRecaptchaToken);

    context.log("[API] Submitting lead to Salesforce endpoint.");

    // 14. Submit to Salesforce.
    const response = await fetch(salesforceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: sfParams.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      context.log.warn(
        `[API] Salesforce Web-to-Lead returned HTTP ${response.status}.`
      );
      context.res = jsonResponse(502, {
        success: false,
        message: "Unable to submit your request. Please try again later.",
      });
      return;
    }

    // Mark duplicate only after successful Salesforce submission.
    rememberSuccessfulSubmission(sanitizedEmail, sanitizedCompany);

    context.log("[API] Lead submitted successfully to Salesforce.");

    context.res = jsonResponse(200, {
      success: true,
      message: "Your request has been submitted successfully.",
    });
  } catch (error) {
    // Never return internal error details/configuration to the browser.
    context.log.error(
      "[API] Error submitting lead to Salesforce:",
      error instanceof Error ? error.message : error
    );

    context.res = jsonResponse(500, {
      success: false,
      message: "Unable to submit your request. Please try again.",
    });
  }
}