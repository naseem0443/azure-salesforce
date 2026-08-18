import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import leadHandler from "./lead/index";
import { Context, HttpRequest } from "@azure/functions";

// Load environment variables from root directory .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const port = process.env.PORT || 7071;

// CORS configuration - support local frontend port
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
  ? process.env.CORS_ALLOWED_ORIGINS.split(",") 
  : ["http://localhost:5173"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

// Parse body and populate rawBody for size validation check (matching Azure behavior)
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Route handler mapping to Azure Function trigger code
app.post("/api/lead", async (req: any, res) => {
  // Create Mock Context
  const context: Context = {
    log: Object.assign(
      (...args: any[]) => console.log("[MOCK-LOG]", ...args),
      {
        warn: (...args: any[]) => console.warn("[MOCK-WARN]", ...args),
        error: (...args: any[]) => console.error("[MOCK-ERROR]", ...args),
        info: (...args: any[]) => console.info("[MOCK-INFO]", ...args),
        verbose: (...args: any[]) => console.debug("[MOCK-VERBOSE]", ...args)
      }
    ),
    bindingData: {},
    bindingDefinitions: [],
    bindings: {},
    executionContext: {
      invocationId: "mock-invocation-id-" + Math.random().toString(36).substr(2, 9),
      functionName: "lead",
      functionDirectory: path.join(__dirname, "lead")
    },
    done: () => {}
  } as any;

  // Create Mock HttpRequest
  const request: HttpRequest = {
    method: req.method as any,
    url: req.originalUrl,
    headers: req.headers as Record<string, string>,
    query: req.query as Record<string, string>,
    params: req.params as Record<string, string>,
    body: req.body,
    rawBody: req.rawBody || JSON.stringify(req.body)
  } as unknown as HttpRequest;

  try {
    await leadHandler(context, request);
    
    const response = context.res || { status: 200, body: {} };
    const resHeaders = response.headers || { "Content-Type": "application/json" };
    
    // Set headers
    Object.entries(resHeaders).forEach(([k, v]) => {
      res.setHeader(k, v as string | number | string[]);
    });
    
    res.status(response.status || 200).send(response.body);
  } catch (err: any) {
    console.error("[EMULATOR-ERROR] Failed executing function handler:", err);
    res.status(500).json({
      success: false,
      message: "Unable to submit your request. Please try again."
    });
  }
});

// Start emulator
app.listen(port, () => {
  console.log(`[EMULATOR] Local Azure Function API Emulator running on http://localhost:${port}`);
  console.log(`[EMULATOR] Configured with CORS for: ${allowedOrigins.join(", ")}`);
});
