# Salesforce Web-to-Lead React Integration

Production-grade integration of a React website with Salesforce Web-to-Lead via a secure, serverless backend proxy endpoint. Designed for local development compatibility and clean deployment to **Azure Static Web Apps** with **Azure Functions**.

## 1. Architecture Overview

### Local Development Flow
```
Browser (React) 
  ↓ [POST /api/lead (JSON)]
Local Proxy Server (http://localhost:7071)
  ↓ [POST (application/x-www-form-urlencoded)]
Salesforce Web-to-Lead (https://webto.salesforce.com/servlet/servlet.WebToLead)
```

### Production Flow (Azure)
```
User
  ↓ [HTTPS]
Cloudflare (DNS & SSL)
  ↓
Azure Static Web Apps (Standard)
  ├─ React Frontend (Vite)
  └─ /api/lead -> Azure Function (Node.js)
        ↓ [POST]
      Salesforce Web-to-Lead
```

---

## 2. Environment Variables & Configuration

Create a `.env` file at the root of the project (excluded from Git). Below are the parameters:

| Variable Name | Environment | Required | Description |
| :--- | :--- | :--- | :--- |
| `SALESFORCE_WEB_TO_LEAD_URL` | Server | Yes | The Salesforce Web-to-Lead POST URL endpoint. |
| `SALESFORCE_OID` | Server | Yes | The 15-character Salesforce Organization ID (`00Dbm00000uN5YG`). |
| `SALESFORCE_LEAD_SOURCE` | Server | Yes | Lead source parameter (default: `Web`). |
| `VITE_RECAPTCHA_SITE_KEY` | Browser | Yes | Google reCAPTCHA v2 public Site Key for the frontend widget. |
| `RECAPTCHA_SECRET_KEY` | Server | Optional | Private secret key used to double-verify captcha tokens server-side. |
| `PORT` | Local Server | No | Local emulator port (default: `7071`). |
| `CORS_ALLOWED_ORIGINS` | Local Server | No | Allowed CORS origin (default: `http://localhost:5173`). |

> [!WARNING]
> Only variables starting with `VITE_` are bundled into the client React code. Never prefix Salesforce URLs or Org IDs with `VITE_` to prevent leaking internals to the client.

---

## 3. Prerequisite Setup

### 1. Install Node.js
Ensure you have **Node.js (v18.x or v20.x)** and NPM installed.
- **Windows / macOS**: Download and run the installer from the [Node.js Official Website](https://nodejs.org/).
- Verify installation in your terminal:
  ```bash
  node -v
  npm -v
  ```

### 2. Download/Clone Project
Navigate to your workspace directory:
```bash
cd e:\AI-Website\salesforces
```

### 3. Install Dependencies
Run the installation script in the root directory:
```bash
npm install
```
Then, install the nested backend API type bindings:
```bash
cd api
npm install
cd ..
```

---

## 4. Local Development

### 1. Configure the `.env` file
Copy the example environment file and fill in the values:
```bash
cp .env.example .env
```
Open `.env` and configure your settings:
- Update `VITE_RECAPTCHA_SITE_KEY` with your Google reCAPTCHA v2 site key (optional for local testing, as a sandbox toggle is provided).
- Update `RECAPTCHA_SECRET_KEY` if you wish to verify the captcha tokens backend-side.

### 2. Start Application (Frontend + Backend)
Run the concurrent development server from the root directory:
```bash
npm run dev
```
This command concurrently runs:
- **Vite React Dev Server** on [http://localhost:5173](http://localhost:5173)
- **Local Azure Function Emulator** on [http://localhost:7071](http://localhost:7071)

Vite is preconfigured to proxy `/api/*` requests to port `7071` during development, avoiding CORS errors.

---

## 5. Testing

### Run Automated Tests
We use **Vitest** for fast unit and component testing. Run tests:
```bash
npm run test
```

The test runner verifies:
1. Valid lead submissions return HTTP 200 with mapped fields.
2. Missing inputs (first name, last name, email, company, city, country, state) are rejected.
3. Invalid email patterns fail validation.
4. Input limits (e.g., first name > 100 characters) are rejected.
5. GET/PUT requests to `/api/lead` are rejected with HTTP 405.
6. Non-JSON request Content-Types are rejected.
7. Mock Salesforce endpoint downs/failures are handled gracefully.
8. Duplicate submission attempts are rate-limited / blocked.

---

## 6. End-to-End Salesforce Lead Submission Test

To test the integration end-to-end and submit a real Lead into Salesforce:

1. Start your local environment (`npm run dev`).
2. Open your browser to [http://localhost:5173](http://localhost:5173).
3. Fill out the contact form with the following test values:
   - **First Name**: `Azure`
   - **Last Name**: `Test`
   - **Email Address**: `your-real-email@example.com` *(Replace this with a real email to verify notification alerts)*
   - **Company**: `pdfmasterpro.shop`
   - **City**: `New Delhi`
   - **Country**: Choose **India** from the dropdown menu (which maps to code `IN`).
   - **State**: Choose **Delhi (DL)** from the state menu (which maps to code `DL`).
4. **Security Verification**: If a real site key is not configured, select the **I am not a robot (Mock Challenge)** checkbox to bypass local verification.
5. Click **Submit Lead Form**.
6. The system will proxy the request and redirect you to the `/thank-you` landing page upon success.

### Verify Lead in Salesforce
To verify that the lead has arrived inside your Salesforce account:
1. Log in to your Salesforce Console ([login.salesforce.com](https://login.salesforce.com)).
2. Navigate to the **Leads** tab (click the App Launcher ▦ at the top left, search for "Leads").
3. Change your list view from *Recently Viewed* to **Today's Leads** or **All Open Leads** using the dropdown at the top left.
4. Look for the lead with Name **Azure Test** and Company **pdfmasterpro.shop**.
5. Click on the lead and verify that:
   - **Lead Source** is set to `Web`.
   - **City** is set to `New Delhi`.
   - **Country** is set to `India` / `IN`.
   - **State/Province** is set to `Delhi` / `DL`.

---

## 7. Security Design & Features

- **No Secrets in Frontend**: Salesforce OID and Web-to-Lead endpoint configurations are stored strictly on the server-side proxy.
- **Request Size Protection**: Raw request payloads are restricted to < 50KB to block payload flooding.
- **Input Sanitization**: Basic HTML markup tag-stripping is run on all incoming parameters to block XSS.
- **Strict Method / Content-Type Checks**: Only accepts POST requests with `application/json` Content-Types.
- **CORS Restricted**: Local Express proxy is mapped only to specified frontend ports. Azure SWA routes requests locally in production to disable global CORS.
- **PII / Secret Masking**: Server logs strip out sensitive OID configurations and mask emails to maintain HIPAA/GDPR compliance. Stack traces are never returned to clients.
- **Best-Effort Duplicate Mitigation**: Uses an in-memory sliding registry to block rapid double-click submissions.

---

## 8. Deployment Preparation Checklist

Before deploying this application to Azure Static Web Apps:

- [ ] Obtain the production Google reCAPTCHA v2 Site Key and set it in your hosting platform under App Settings as `VITE_RECAPTCHA_SITE_KEY`.
- [ ] Set your production Google reCAPTCHA v2 Secret Key in your Function App configuration as `RECAPTCHA_SECRET_KEY`.
- [ ] Configure `SALESFORCE_OID` (`00Dbm00000uN5YG`) in the Azure Function App environment variables.
- [ ] Ensure Azure Static Web Apps is configured with `api_location: "api"` and `app_location: "/"`.
