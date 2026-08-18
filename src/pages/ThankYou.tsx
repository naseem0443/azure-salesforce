import { Link } from "react-router-dom";

export default function ThankYou() {
  return (
    <main className="app-container">
      <div className="glass-card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
          
          {/* Animated Success Circle Icon */}
          <div style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "rgba(16, 185, 129, 0.1)",
            border: "2px solid var(--color-success)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: "2.5rem",
            color: "var(--color-success)"
          }}>
            ✓
          </div>

          <h1 style={{ fontSize: "2.25rem", fontWeight: "700", background: "var(--accent-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Submission Successful!
          </h1>
          
          <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", maxWidth: "420px", lineHeight: "1.6" }}>
            Thank you for reaching out. Your request has been recorded and safely synced with our Salesforce Lead desk. Our team will review the details and get back to you shortly.
          </p>

          <hr style={{ width: "100%", maxWidth: "150px", border: "0", height: "1px", background: "var(--glass-border)", margin: "1rem 0" }} />

          <Link to="/" className="submit-btn" style={{ maxWidth: "240px", textDecoration: "none", display: "inline-flex" }}>
            Return to Form
          </Link>
        </div>
      </div>
    </main>
  );
}
