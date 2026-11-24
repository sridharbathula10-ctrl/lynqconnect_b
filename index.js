require("dotenv").config();

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20kb" }));

const requiredFields = ["name", "company", "email", "phone", "interest", "message"];

function getTransporter() {
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASSWORD = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
  if (!SMTP_USER || !SMTP_PASSWORD) return null;

  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
}

app.post("/api/contact", async (req, res) => {
  const payload = req.body || {};

  // The profile email button sends this lightweight payload. Deliver the
  // click notification to the configured site inbox; the supplied email is
  // included as context and is not used as an arbitrary SMTP recipient.
  if (Array.isArray(payload.path)) {
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const lang = typeof payload.lang === "string" ? payload.lang.trim() : "";
    const path = payload.path.filter((part) => typeof part === "string").map((part) => part.trim());
    const website = typeof payload.company_website === "string" ? payload.company_website.trim() : "";

    // Treat the hidden website field as a honeypot and return a success
    // response without sending mail when a bot fills it in.
    if (website) return res.status(200).json({ message: "Email request received" });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email address is required", fields: ["email"] });
    }
    if (!path.length || path.length !== payload.path.length || path.some((part) => !part)) {
      return res.status(400).json({ error: "A valid path is required", fields: ["path"] });
    }

    const transporter = getTransporter();
    if (!transporter) {
      return res.status(503).json({ error: "Email service is not configured" });
    }

    const recipient = process.env.CONTACT_TO || process.env.SMTP_USER;
    const pathText = path.join(" / ");
    try {
      await transporter.sendMail({
        from: `Website Enquiry <${process.env.SMTP_USER}>`,
        to: recipient,
        replyTo: email,
        subject: `Email request from ${pathText}`,
        text: `A visitor used the email button.\n\nEmail: ${email}\nLanguage: ${lang || "unspecified"}\nPath: ${pathText}`,
        html: `<h2>Email button clicked</h2><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Language:</strong> ${escapeHtml(lang || "unspecified")}</p><p><strong>Path:</strong> ${escapeHtml(pathText)}</p>`,
      });
      return res.status(200).json({ message: "Email request sent successfully" });
    } catch (error) {
      console.error("Email request send failed:", error.message);
      return res.status(502).json({ error: "Could not send email request" });
    }
  }

  const values = Object.fromEntries(
    requiredFields.map((field) => [field, typeof payload[field] === "string" ? payload[field].trim() : ""]),
  );

  const missing = requiredFields.filter((field) => !values[field]);
  if (missing.length) {
    return res.status(400).json({ error: "Missing required fields", fields: missing });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const transporter = getTransporter();
  if (!transporter) {
    return res.status(503).json({ error: "Email service is not configured" });
  }

  const recipient = process.env.CONTACT_TO || process.env.SMTP_USER;
  const rows = requiredFields.map((field) => `${field}: ${values[field]}`).join("\n");
  try {
    await transporter.sendMail({
      from: `Website Enquiry <${process.env.SMTP_USER}>`,
      to: recipient,
      replyTo: values.email,
      subject: `Website Enquiry from ${values.name}`,
      text: `A new contact form submission was received.\n\n${rows}`,
      html: `<h2>New contact form submission</h2><table>${requiredFields
        .map((field) => `<tr><th align="left" style="padding:4px 12px 4px 0">${field}</th><td>${escapeHtml(values[field])}</td></tr>`)
        .join("")}</table>`,
    });
    return res.status(200).json({ message: "Contact email sent successfully" });
  } catch (error) {
    console.error("Contact email send failed:", error.message);
    return res.status(502).json({ error: "Could not send contact email" });
  }
});

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

app.get("/", (_req, res) => res.send("Contact API is running"));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`API listening on port ${port}`));
