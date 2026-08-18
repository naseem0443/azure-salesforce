import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import leadHandler from "../api/lead/index";
import { Context, HttpRequest } from "@azure/functions";

// Helper to construct mock Azure Function Context
function createMockContext(): Context {
  const logFn = vi.fn() as any;
  logFn.warn = vi.fn();
  logFn.error = vi.fn();
  logFn.info = vi.fn();
  logFn.verbose = vi.fn();

  return {
    log: logFn,
    bindingData: {},
    bindingDefinitions: [],
    bindings: {},
    executionContext: {
      invocationId: "test-invocation-id",
      functionName: "lead",
      functionDirectory: ""
    },
    done: vi.fn(),
    res: undefined
  } as any;
}

// Helper to construct mock HttpRequest
function createMockRequest(options: Partial<HttpRequest>): HttpRequest {
  return {
    method: "POST",
    url: "/api/lead",
    headers: { "content-type": "application/json" },
    query: {},
    params: {},
    body: {},
    rawBody: "",
    ...options
  } as any;
}

describe("Backend API - /api/lead Handler", () => {
  let context: Context;

  beforeEach(() => {
    context = createMockContext();
    vi.stubEnv("SALESFORCE_WEB_TO_LEAD_URL", "https://webto.salesforce.com/servlet/servlet.WebToLead");
    vi.stubEnv("SALESFORCE_OID", "00Dbm00000uN5YG");
    vi.stubEnv("SALESFORCE_LEAD_SOURCE", "Web");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "TODO_REQUIRED_CONFIGURATION"); // Disabled by default for simplicity unless set
    vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("should fail with 405 if request method is GET", async () => {
    const req = createMockRequest({ method: "GET" });
    await leadHandler(context, req);

    expect(context.res?.status).toBe(405);
    expect(context.res?.body).toEqual({
      success: false,
      message: "Method Not Allowed. Only POST is supported."
    });
  });

  it("should fail with 415 if Content-Type is not application/json", async () => {
    const req = createMockRequest({
      headers: { "content-type": "text/html" }
    });
    await leadHandler(context, req);

    expect(context.res?.status).toBe(415);
    expect(context.res?.body).toEqual({
      success: false,
      message: "Unsupported Media Type. Request body must be JSON."
    });
  });

  it("should fail with 413 if request body is too large", async () => {
    const hugeBody = "a".repeat(60000);
    const req = createMockRequest({
      rawBody: hugeBody
    });
    await leadHandler(context, req);

    expect(context.res?.status).toBe(413);
    expect(context.res?.body).toEqual({
      success: false,
      message: "Payload Too Large. Request size exceeds limit."
    });
  });

  it("should fail with 400 if JSON body is missing or malformed", async () => {
    const req = createMockRequest({
      body: null,
      rawBody: ""
    });
    await leadHandler(context, req);

    expect(context.res?.status).toBe(400);
    expect(context.res?.body?.success).toBe(false);
  });

  // Required parameters testing helper
  const requiredFields = [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "company", label: "Company" },
    { key: "city", label: "City" },
    { key: "country", label: "Country" },
    { key: "state", label: "State" }
  ];

  requiredFields.forEach(({ key }) => {
    it(`should fail with 400 if field '${key}' is missing`, async () => {
      const body: Record<string, any> = {
        firstName: "Azure",
        lastName: "Test",
        email: "test@example.com",
        company: "pdfmasterpro",
        city: "New Delhi",
        country: "IN",
        state: "DL"
      };
      delete body[key];

      const req = createMockRequest({
        body,
        rawBody: JSON.stringify(body)
      });

      await leadHandler(context, req);

      expect(context.res?.status).toBe(400);
      expect(context.res?.body?.success).toBe(false);
      expect(context.res?.body?.message).toContain("required fields");
    });
  });

  it("should fail with 400 if email format is invalid", async () => {
    const body = {
      firstName: "Azure",
      lastName: "Test",
      email: "invalid-email-format",
      company: "pdfmasterpro",
      city: "New Delhi",
      country: "IN",
      state: "DL"
    };

    const req = createMockRequest({
      body,
      rawBody: JSON.stringify(body)
    });

    await leadHandler(context, req);

    expect(context.res?.status).toBe(400);
    expect(context.res?.body?.success).toBe(false);
    expect(context.res?.body?.message).toContain("valid email address");
  });

  it("should fail with 400 if string fields exceed length limits", async () => {
    const body = {
      firstName: "A".repeat(101), // Limit: 100
      lastName: "Test",
      email: "test@example.com",
      company: "pdfmasterpro",
      city: "New Delhi",
      country: "IN",
      state: "DL"
    };

    const req = createMockRequest({
      body,
      rawBody: JSON.stringify(body)
    });

    await leadHandler(context, req);

    expect(context.res?.status).toBe(400);
    expect(context.res?.body?.success).toBe(false);
    expect(context.res?.body?.message).toContain("Input size exceeds limit");
  });

  it("should fail with 500 (safe response) if Salesforce returns an HTTP error code", async () => {
    // Mock fetch returning HTTP 500
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error"
    } as any);

    const body = {
      firstName: "Azure",
      lastName: "Test",
      email: "sf-error@example.com",
      company: "pdfmasterpro",
      city: "New Delhi",
      country: "IN",
      state: "DL"
    };

    const req = createMockRequest({
      body,
      rawBody: JSON.stringify(body)
    });

    await leadHandler(context, req);

    expect(context.res?.status).toBe(500);
    expect(context.res?.body).toEqual({
      success: false,
      message: "Unable to submit your request. Please try again."
    });
  });

  it("should fail with 500 (safe response) if Salesforce fetch network fails", async () => {
    // Mock fetch throwing network error
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Network Down"));

    const body = {
      firstName: "Azure",
      lastName: "Test",
      email: "net-error@example.com",
      company: "pdfmasterpro",
      city: "New Delhi",
      country: "IN",
      state: "DL"
    };

    const req = createMockRequest({
      body,
      rawBody: JSON.stringify(body)
    });

    await leadHandler(context, req);

    expect(context.res?.status).toBe(500);
    expect(context.res?.body).toEqual({
      success: false,
      message: "Unable to submit your request. Please try again."
    });
  });

  it("should succeed with 200 and return a positive response on successful submission", async () => {
    // Mock fetch returning HTTP 200 Ok
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200
    } as any);

    const body = {
      firstName: "Azure",
      lastName: "Test",
      email: "ok-submission@example.com",
      company: "pdfmasterpro",
      city: "New Delhi",
      country: "IN",
      state: "DL"
    };

    const req = createMockRequest({
      body,
      rawBody: JSON.stringify(body)
    });

    await leadHandler(context, req);

    expect(context.res?.status).toBe(200);
    expect(context.res?.body).toEqual({
      success: true,
      message: "Your request has been submitted successfully."
    });

    // Check fetch parameter mapping
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, requestOptions] = vi.mocked(globalThis.fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://webto.salesforce.com/servlet/servlet.WebToLead");
    expect(requestOptions.method).toBe("POST");
    expect(requestOptions.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded"
    });
    
    // Check parameters mapped to Salesforce standards
    const parsedBody = new URLSearchParams(requestOptions.body as string);
    expect(parsedBody.get("oid")).toBe("00Dbm00000uN5YG");
    expect(parsedBody.get("lead_source")).toBe("Web");
    expect(parsedBody.get("first_name")).toBe("Azure");
    expect(parsedBody.get("last_name")).toBe("Test");
    expect(parsedBody.get("email")).toBe("ok-submission@example.com");
    expect(parsedBody.get("company")).toBe("pdfmasterpro");
    expect(parsedBody.get("city")).toBe("New Delhi");
    expect(parsedBody.get("country_code")).toBe("IN");
    expect(parsedBody.get("state_code")).toBe("DL");
  });

  it("should block duplicate submission within timeout period", async () => {
    // Mock fetch returning HTTP 200 Ok
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200
    } as any);

    const body = {
      firstName: "Azure",
      lastName: "Test",
      email: "duplicate-check@example.com",
      company: "pdfmasterpro-dupe",
      city: "New Delhi",
      country: "IN",
      state: "DL"
    };

    const req1 = createMockRequest({
      body,
      rawBody: JSON.stringify(body)
    });

    // First submission should work
    await leadHandler(context, req1);
    expect(context.res?.status).toBe(200);

    // Second submission with same parameters should return 409 Conflict
    const req2 = createMockRequest({
      body,
      rawBody: JSON.stringify(body)
    });
    const context2 = createMockContext();
    await leadHandler(context2, req2);
    
    expect(context2.res?.status).toBe(409);
    expect(context2.res?.body?.success).toBe(false);
    expect(context2.res?.body?.message).toContain("already being processed");
  });
});
