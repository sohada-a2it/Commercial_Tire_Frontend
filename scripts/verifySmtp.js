require("dotenv").config();
const nodemailer = require("nodemailer");

const user = String(process.env.SMTP_USER || process.env.OWNER_EMAIL || "").trim();
const pass = String(process.env.SMTP_PASSWORD || "").trim();
const host = String(process.env.SMTP_HOST || "").trim().toLowerCase() || "mail.asianimportexport.com";

const normalizeHost = (rawHost, email) => {
  const domain = String(email || "").split("@")[1]?.toLowerCase() || "";
  if (domain === "gmail.com") return "smtp.gmail.com";
  if (["outlook.com", "hotmail.com", "live.com"].includes(domain)) return "smtp.office365.com";
  if (!rawHost || rawHost.includes("@")) return "mail.asianimportexport.com";

  const looksLikeDomain = rawHost.includes(".") && !rawHost.startsWith("smtp.") && !rawHost.startsWith("mail.");
  if (looksLikeDomain) {
    if (rawHost === "asianimportexport.com" || domain === "asianimportexport.com") {
      return "mail.asianimportexport.com";
    }
    return `smtp.${rawHost}`;
  }

  return rawHost;
};

const resolvedHost = normalizeHost(host, user);
const relaxTlsForHost = resolvedHost === "mail.asianimportexport.com";

const tests = [
  { name: "SSL-465", port: 465, secure: true },
  { name: "STARTTLS-587", port: 587, secure: false, requireTLS: true },
];

(async () => {
  if (!user || !pass) {
    console.error("Missing SMTP_USER/OWNER_EMAIL or SMTP_PASSWORD in environment.");
    process.exit(1);
  }

  console.log(`SMTP user: ${user}`);
  console.log(`SMTP host: ${resolvedHost}`);
  console.log(`Password length: ${pass.length}`);

  let ok = false;
  for (const cfg of tests) {
    try {
      const transporter = nodemailer.createTransport({
        host: resolvedHost,
        port: cfg.port,
        secure: cfg.secure,
        requireTLS: cfg.requireTLS,
        auth: { user, pass },
        tls: relaxTlsForHost ? { rejectUnauthorized: false } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });

      await transporter.verify();
      console.log(`${cfg.name}: OK`);
      ok = true;
    } catch (error) {
      const code = error?.code || "UNKNOWN";
      const responseCode = error?.responseCode || "";
      const response = String(error?.response || error?.message || "").slice(0, 180);
      console.log(`${cfg.name}: FAIL ${code} ${responseCode} ${response}`.trim());
    }
  }

  if (!ok) {
    console.log("\nResult: SMTP authentication is still failing at provider level.");
    console.log("Action: Reset mailbox password in your email provider panel and update .env.");
    process.exit(2);
  }
})();
