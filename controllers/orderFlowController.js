const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const Inquiry = require("../models/Inquiry");
const Invoice = require("../models/Invoice");
const User = require("../models/User");

const isStaffRole = (role) => ["admin", "moderator"].includes(role);

const generateCode = (prefix) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${y}${m}${d}-${rand}`;
};

const parseMoney = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  return 0;
};

const sanitizeText = (value, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized || fallback;
};

const parseDiscount = (value) => {
  const amount = parseMoney(value);
  return amount >= 0 ? amount : 0;
};

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const sanitizePaymentMethod = (method, fallback = "bank") => {
  const value = sanitizeText(method, "");
  return value || fallback;
};

const toLineItem = (item = {}) => {
  const quantity = Number(item.quantity || 0);
  const inferredLineTotal = parseMoney(item.lineTotal ?? item.total ?? item.calculatedPrice);
  const unitPriceCandidate = item.unitPrice ?? item.price;
  const unitPrice = parseMoney(
    unitPriceCandidate ?? (quantity > 0 && inferredLineTotal > 0 ? inferredLineTotal / quantity : 0)
  );
  const discount = parseDiscount(item.discount);
  const grossLineTotal = quantity * unitPrice;
  const lineTotal =
    inferredLineTotal > 0 ? inferredLineTotal : Math.max(grossLineTotal - discount, 0);

  return {
    productId: item.productId ? String(item.productId) : item.id ? String(item.id) : "",
    name: sanitizeText(String(item.name || "")),
    title: sanitizeText(String(item.title || item.name || "")),
    brand: sanitizeText(String(item.brand || "")),
    pattern: sanitizeText(String(item.pattern || "")),
    size: sanitizeText(String(item.size || "")),
    ply: sanitizeText(String(item.ply || "")),
    image: item.image ? String(item.image) : "",
    quantity,
    unitPrice,
    discount,
    lineTotal,
  };
};

const sanitizeItems = (items = []) => {
  if (!Array.isArray(items)) return [];

  return items
    .map(toLineItem)
    .filter(
      (item) =>
        item.name &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0 &&
        Number.isFinite(item.unitPrice) &&
        item.unitPrice >= 0 &&
        Number.isFinite(item.lineTotal) &&
        item.lineTotal >= 0
    );
};

const summarizePaymentStatus = (total, paidAmount) => {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount >= total) return "full";
  return "partial";
};

const toPaymentMethod = (method) => sanitizePaymentMethod(method, "bank");

const paymentMethodLabel = (method) => {
  const normalized = String(method || "bank").trim().toLowerCase();

  switch (normalized) {
    case "credit-card":
      return "Credit Card";
    case "bank":
      return "Bank Transfer";
    case "cash":
      return "Cash";
    case "cheque":
      return "Cheque";
    case "wire-transfer":
      return "Wire Transfer";
    case "mobile-banking":
      return "Mobile Banking";
    default:
      return sanitizeText(method, "Bank Transfer");
  }
};

const paymentStatusLabel = (status) => {
  const normalized = String(status || "unpaid").trim().toLowerCase();

  switch (normalized) {
    case "due":
      return "Due";
    case "unpaid":
      return "Unpaid";
    case "partial":
      return "Partial";
    case "full":
    case "paid":
      return "Full";
    default:
      return normalized || "Unpaid";
  }
};

const normalizeCustomerSnapshot = ({ customer = {}, authUser = null, fallback = null }) => {
  const source = customer || {};
  const fallbackSource = fallback || {};

  const normalized = {
    name: sanitizeText(source.name, sanitizeText(fallbackSource.name, sanitizeText(authUser?.fullName || ""))),
    email: sanitizeText(source.email, sanitizeText(fallbackSource.email, sanitizeText(authUser?.email || ""))).toLowerCase(),
    phone: sanitizeText(source.phone, sanitizeText(fallbackSource.phone, sanitizeText(authUser?.whatsappNumber || ""))),
    companyName: sanitizeText(
      source.companyName,
      sanitizeText(fallbackSource.companyName, sanitizeText(authUser?.companyName || ""))
    ),
    address: sanitizeText(source.address, sanitizeText(fallbackSource.address, "")),
    city: sanitizeText(source.city, sanitizeText(fallbackSource.city, "")),
    state: sanitizeText(source.state, sanitizeText(fallbackSource.state, "")),
    zipCode: sanitizeText(source.zipCode, sanitizeText(fallbackSource.zipCode, "")),
    notes: sanitizeText(source.notes, sanitizeText(fallbackSource.notes, "")),
    whatsappNumber: sanitizeText(
      source.whatsappNumber,
      sanitizeText(fallbackSource.whatsappNumber, sanitizeText(authUser?.whatsappNumber || ""))
    ),
    paymentMethod: toPaymentMethod(source.paymentMethod || fallbackSource.paymentMethod),
  };

  return normalized;
};

const requiredCustomerFields = [
  "name",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zipCode",
];

const validateCustomerSnapshot = (snapshot) => {
  for (const field of requiredCustomerFields) {
    if (!snapshot?.[field] || !String(snapshot[field]).trim()) {
      return field;
    }
  }

  return null;
};

const createTransporter = () => {
  const user = String(process.env.SMTP_USER || process.env.OWNER_EMAIL || "").trim();
  const pass = String(process.env.SMTP_PASSWORD || "").replace(/\s+/g, "");
  const rawHost = String(process.env.SMTP_HOST || "").trim();
  let host = rawHost;

  if (!host || host.includes("@")) {
    const domain = user.split("@")[1]?.toLowerCase();
    if (domain === "gmail.com") host = "smtp.gmail.com";
    else if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com") {
      host = "smtp.office365.com";
    } else {
      host = "smtp.hostinger.com";
    }
  }

  const port = Number(process.env.SMTP_PORT || 465);

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

const toPdfCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const COMPANY_INFO = {
  name: "ASIAN IMPORT AND EXPORT CO Ltd",
  contact: "+14379003996",
  email: "info@asianimportexport.com",
  mobile: "+6621055786",
  address:
    "63/16 Soi Chumchon Talat Tha Ruea Khlong Toei Khwaeng Khlong Toei, Khet Khlong Toei Krung Thep Maha Nakhon 10110, Thailand",
};

const SALES_EMAIL = process.env.SALES_EMAIL || "sale@asianimportexport.com";

const getLineValue = (text, label) => {
  if (!text) return "";
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text).match(new RegExp(`(?:^|\\n)${escaped}:\\s*(.+)`, "i"));
  return match?.[1]?.trim() || "";
};

const toDateLabel = (value, fallbackDate = new Date()) => {
  if (!value) return fallbackDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const getLogoPath = () => {
  const candidates = [
    path.resolve(__dirname, "../../Asian.Import.Export.Co.Frontend/public/logo.png"),
    path.resolve(__dirname, "../public/logo.png"),
    path.resolve(__dirname, "../../Asian.Import.Export.Co.Frontend/public/logo.webp"),
    path.resolve(__dirname, "../public/logo.webp"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
};

const generateInvoicePdfBuffer = (invoice) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 24 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 24;
    const tableX = margin;
    const tableWidth = pageWidth - margin * 2;
    const issueDate = getLineValue(invoice.notes, "Issue Date") || invoice.issuedAt || invoice.createdAt;
    const validityDate = getLineValue(invoice.notes, "Validity Date") || new Date(Date.now() + 4 * 86400000);
    const paymentTerms = getLineValue(invoice.notes, "Payment Terms");
    const productionTime = getLineValue(invoice.notes, "Production Time");
    const portOfLoading = getLineValue(invoice.notes, "Port Of Loading");
    const deliveryAddress = getLineValue(invoice.notes, "Delivery Address");
    const incoterms = getLineValue(invoice.additionalMessages, "Incoterms") || "";
    const bankDetails = getLineValue(invoice.termsAndConditions, "Bank Details") || "";

    const logoPath = getLogoPath();
    if (logoPath) {
      doc.save();
      try {
        doc.fillOpacity(0.08);
        doc.image(logoPath, pageWidth / 2 - 155, pageHeight / 2 - 155, { width: 310 });
      } catch (logoError) {
        // Some PDFKit builds cannot decode webp; skip watermark instead of failing invoice download.
      } finally {
        doc.restore();
      }
    }

    doc.fillOpacity(1);
    doc.strokeOpacity(1);
    doc.fillColor("#111827");
    doc.strokeColor("#111827");

    const drawCell = (x, y, w, h, label, value, options = {}) => {
      const {
        bg,
        align = "left",
        labelSize = 9,
        valueSize = 9.5,
        multiline = false,
        labelColor = "#111827",
        valueColor = "#111827",
        labelFont = "Helvetica-Bold",
        valueFont = "Helvetica",
        borders = { top: true, right: true, bottom: true, left: true },
      } = options;

      if (bg) {
        doc.save();
        doc.rect(x, y, w, h).fill(bg);
        doc.restore();
      }

      if (borders.top) {
        doc.moveTo(x, y).lineTo(x + w, y).stroke();
      }
      if (borders.right) {
        doc.moveTo(x + w, y).lineTo(x + w, y + h).stroke();
      }
      if (borders.bottom) {
        doc.moveTo(x, y + h).lineTo(x + w, y + h).stroke();
      }
      if (borders.left) {
        doc.moveTo(x, y).lineTo(x, y + h).stroke();
      }
      if (label) {
        doc.fillColor(labelColor).font(labelFont).fontSize(labelSize).text(label, x + 6, y + 5, {
          width: w - 12,
          align,
          lineBreak: true,
        });
      }
      if (value !== undefined && value !== null) {
        doc.fillColor(valueColor).font(valueFont).fontSize(valueSize).text(String(value), x + 6, y + (label ? 18 : 8), {
          width: w - 12,
          height: h - (label ? 20 : 8),
          align,
          lineBreak: multiline,
          ellipsis: multiline ? false : true,
        });
      }
    };

    let y = margin;
    doc.rect(tableX, y, tableWidth, pageHeight - margin * 2).stroke();

    drawCell(tableX, y, tableWidth, 44, "", "");
    doc.font("Helvetica-Bold").fontSize(18).text("ASIAN IMPORT EXPORT CO., LTD", tableX, y + 8, {
      width: tableWidth,
      align: "center",
    });
    y += 44;

    drawCell(tableX, y, tableWidth, 32, "", "");
    doc.font("Helvetica-Bold").fontSize(14).text("Proforma Invoice", tableX, y + 8, {
      width: tableWidth,
      align: "center",
    });
    y += 32;

    const c1 = tableWidth * 0.15;
    const c2 = tableWidth * 0.18;
    const c3 = tableWidth * 0.2;
    const c4 = tableWidth - c1 - c2 - c3;
    const x1 = tableX;
    const x2 = x1 + c1;
    const x3 = x2 + c2;
    const x4 = x3 + c3;

    const rowHeight = 30;
    drawCell(x1, y, c1, rowHeight, "", "SC No:");
    drawCell(x2, y, c2, rowHeight, "", invoice.invoiceNumber || "");
    drawCell(x3, y, c3, rowHeight, "", "Issue Date:");
    drawCell(x4, y, c4, rowHeight, "", toDateLabel(issueDate));
    y += rowHeight;

    drawCell(x1, y, c1, rowHeight, "", "");
    drawCell(x2, y, c2, rowHeight, "", "");
    drawCell(x3, y, c3, rowHeight, "", "Validity of contract:");
    drawCell(x4, y, c4, rowHeight, "", toDateLabel(validityDate));
    y += rowHeight;

    const customer = invoice.customerSnapshot || {};
    const customerName = customer.companyName || customer.name || "";
    const customerAddress = [customer.address, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ");

    const drawDualRow = (leftLabel, leftValue, rightLabel, rightValue, height = 30) => {
      const half = tableWidth / 2;
      const lx = tableX;
      const rx = tableX + half;
      drawCell(lx, y, half * 0.3, height, "", leftLabel);
      drawCell(lx + half * 0.3, y, half * 0.7, height, "", leftValue || "", { multiline: height >= 40, valueSize: 9 });
      drawCell(rx, y, half * 0.3, height, "", rightLabel);
      drawCell(rx + half * 0.3, y, half * 0.7, height, "", rightValue || "", { multiline: height >= 40, valueSize: 9 });
      y += height;
    };

    drawDualRow("To:", customerName, "From:", COMPANY_INFO.name);
    drawDualRow("Contact:", customer.phone || "", "Contact:", COMPANY_INFO.contact);
    drawDualRow("Email:", customer.email || "", "Email:", COMPANY_INFO.email);
    drawDualRow("Mobile:", customer.whatsappNumber || customer.phone || "", "Mobile:", COMPANY_INFO.mobile);
    drawDualRow("Address:", customerAddress, "Address:", COMPANY_INFO.address, 44);

    drawCell(tableX, y, tableWidth * 0.3, 30, "", "Payment Terms:", { bg: "#edf2e5", valueSize: 9 });
    drawCell(tableX + tableWidth * 0.3, y, tableWidth * 0.7, 30, "", paymentTerms, { bg: "#edf2e5", valueSize: 9 });
    y += 30;

    drawDualRow("Production Time:", productionTime, "", "", 28);
    drawDualRow("Port of Loading:", portOfLoading, "Delivery Address:", deliveryAddress, 34);

    drawCell(tableX, y, tableWidth, 30, "", "");
    doc.font("Helvetica-Bold").fontSize(14).text("Product Description:", tableX, y + 8, {
      width: tableWidth,
      align: "center",
    });
    y += 30;

    const pCols = [0.16, 0.12, 0.1, 0.08, 0.1, 0.08, 0.16, 0.2];
    const pWidths = pCols.map((ratio) => ratio * tableWidth);
    const pXs = pWidths.reduce((acc, w, i) => {
      acc.push((acc[i - 1] || tableX) + (i === 0 ? 0 : pWidths[i - 1]));
      return acc;
    }, []);

    const headerHeight = 30;
    const headers = ["Product Name", "Brand", "Pattern", "Ply", "Size", "QTY", "Unit Price\n(USD/Pics)", "Total Price (USD)"];
    headers.forEach((header, index) => drawCell(pXs[index], y, pWidths[index], headerHeight, "", header));
    y += headerHeight;

    const items = Array.isArray(invoice.items) ? invoice.items : [];
    const maxRows = 7;
    const visibleItems = items.slice(0, maxRows);
    visibleItems.forEach((item) => {
      const row = [
        sanitizeText(item.title || item.name || "-"),
        sanitizeText(String(item.brand || "-"), "-"),
        sanitizeText(String(item.pattern || "-"), "-"),
        sanitizeText(String(item.ply || "-"), "-"),
        sanitizeText(String(item.size || "-"), "-"),
        String(item.quantity || 0),
        toPdfCurrency(item.unitPrice),
        toPdfCurrency(item.lineTotal),
      ];
      row.forEach((cell, index) => drawCell(pXs[index], y, pWidths[index], 28, "", cell, { valueSize: 9.5 }));
      y += 28;
    });

    if (items.length > visibleItems.length) {
      drawCell(tableX, y, tableWidth, 24, "", `+ ${items.length - visibleItems.length} more item(s) included`);
      y += 24;
    }

    const summaryHeight = 74;
    const leftWidth = tableWidth * 0.58;
    const rightWidth = tableWidth - leftWidth;
    drawCell(tableX, y, leftWidth, summaryHeight, "", `Bank Details: ${bankDetails}`, { multiline: true, valueSize: 9 });
    drawCell(
      tableX + leftWidth,
      y,
      rightWidth * 0.5,
      summaryHeight,
      "Final Amount:",
      `(${Number(invoice.discountRate || 0).toFixed(0)}% discount added):`,
      {
        multiline: true,
        labelSize: 11,
        valueSize: 11,
        valueFont: "Helvetica-Bold",
        valueColor: "#f97316",
        labelColor: "#111827",
        bg: "#dbeafe",
        borders: { top: true, right: true, bottom: true, left: false },
      }
    );
    drawCell(tableX + leftWidth + rightWidth * 0.5, y, rightWidth * 0.5, summaryHeight, "", toPdfCurrency(invoice.total), {
      valueSize: 14,
      valueFont: "Helvetica-Bold",
      bg: "#dbeafe",
    });
    y += summaryHeight;

    const bottomHeight = Math.max(pageHeight - margin - y, 60);
    drawCell(tableX, y, tableWidth - 140, bottomHeight, "", "");
    drawCell(tableX + tableWidth - 140, y, 140, bottomHeight, "", `Incoterms: ${incoterms || "N/A"}`, {
      borders: { top: true, right: true, bottom: true, left: false },
    });

    doc.end();
  });

const sendInquiryReceivedEmails = async (inquiry) => {
  const transporter = createTransporter();

  if (!transporter) {
    return {
      sent: false,
      message: "SMTP credentials not configured",
    };
  }

  const senderAddress = process.env.SMTP_USER || process.env.OWNER_EMAIL || SALES_EMAIL;
  const customer = inquiry.customerSnapshot || {};
  const customerEmail = sanitizeText(customer.email, "").toLowerCase();

  const itemRows = (inquiry.items || [])
    .map(
      (item) => `
        <tr>
          <td style="border:1px solid #ddd;padding:8px;">${item.title || item.name}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;">${item.quantity}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:right;">$${Number(item.unitPrice || 0).toFixed(2)}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:right;">$${Number(item.lineTotal || 0).toFixed(2)}</td>
        </tr>
      `
    )
    .join("");

  const customerHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937;">
      <h2 style="margin-bottom:8px;">Inquiry Received (${inquiry.inquiryNumber})</h2>
      <p style="margin-top:0;">Hello ${customer.name || "Customer"}, we have received your inquiry from checkout.</p>
      <p>Our sales team will review and send your invoice soon.</p>
      <p><strong>Inquiry Number:</strong> ${inquiry.inquiryNumber}<br/>
      <strong>Payment Method:</strong> ${paymentMethodLabel(customer.paymentMethod)}<br/>
      <strong>Total:</strong> $${Number(inquiry.total || 0).toFixed(2)}</p>

      <table style="border-collapse:collapse;width:100%;margin:14px 0;">
        <thead>
          <tr style="background:#0f766e;color:#fff;">
            <th style="border:1px solid #0f766e;padding:8px;text-align:left;">Product</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:center;">Qty</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:right;">Unit</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
  `;

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937;">
      <h2 style="margin-bottom:8px;">New Checkout Inquiry (${inquiry.inquiryNumber})</h2>
      <p style="margin-top:0;">A customer submitted a checkout inquiry.</p>
      <p><strong>Customer:</strong> ${customer.name || "N/A"}<br/>
      <strong>Login/Register Email:</strong> ${customerEmail || "N/A"}<br/>
      <strong>Phone:</strong> ${customer.phone || "N/A"}<br/>
      <strong>Address:</strong> ${[customer.address, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ") || "N/A"}</p>
      ${customer.notes ? `<p><strong>Notes:</strong> ${customer.notes}</p>` : ""}

      <table style="border-collapse:collapse;width:100%;margin:14px 0;">
        <thead>
          <tr style="background:#0f766e;color:#fff;">
            <th style="border:1px solid #0f766e;padding:8px;text-align:left;">Product</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:center;">Qty</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:right;">Unit</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <p><strong>Total:</strong> $${Number(inquiry.total || 0).toFixed(2)}<br/>
      <strong>Payment Method:</strong> ${paymentMethodLabel(customer.paymentMethod)}</p>
    </div>
  `;

  const mailTasks = [
    transporter.sendMail({
      from: `"Asian Import Export Co" <${senderAddress}>`,
      to: SALES_EMAIL,
      replyTo: customerEmail || undefined,
      subject: `New Inquiry ${inquiry.inquiryNumber} from Checkout`,
      html: adminHtml,
    }),
  ];

  if (customerEmail) {
    mailTasks.push(
      transporter.sendMail({
        from: `"Asian Import Export Co" <${senderAddress}>`,
        to: customerEmail,
        subject: `Inquiry ${inquiry.inquiryNumber} received`,
        html: customerHtml,
      })
    );
  }

  await Promise.all(mailTasks);

  return {
    sent: true,
    message: "Inquiry emails sent",
  };
};

const sendInvoiceEmail = async (invoice) => {
  const transporter = createTransporter();

  if (!transporter) {
    return {
      sent: false,
      message: "SMTP credentials not configured",
    };
  }

  const pdfBuffer = await generateInvoicePdfBuffer(invoice);
  const customer = invoice.customerSnapshot || {};
  const accountCustomer = await User.findById(invoice.customer).select("email").lean();
  const customerEmail = sanitizeText(
    accountCustomer?.email || customer?.email || "",
    ""
  ).toLowerCase();
  const senderAddress = process.env.SMTP_USER || process.env.OWNER_EMAIL || SALES_EMAIL;
  const rows = (invoice.items || [])
    .map(
      (item) => `
        <tr>
          <td style="border:1px solid #ddd;padding:8px;">${item.title || item.name}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center;">${item.quantity}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:right;">$${Number(item.unitPrice || 0).toFixed(2)}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:right;">$${Number(item.discount || 0).toFixed(2)}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:right;">$${Number(item.lineTotal || 0).toFixed(2)}</td>
        </tr>
      `
    )
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937;">
      <h2 style="margin-bottom:8px;">Invoice ${invoice.invoiceNumber}</h2>
      <p style="margin-top:0;">Hello ${customer.name}, your invoice is ready. A PDF copy is attached.</p>

      <div style="background:#f8fafc;border:1px solid #e5e7eb;padding:12px;border-radius:6px;margin:16px 0;">
        <p style="margin:0 0 6px 0;"><strong>Payment Method:</strong> ${paymentMethodLabel(
          customer.paymentMethod
        )}</p>
        <p style="margin:0;"><strong>Payment Status:</strong> ${paymentStatusLabel(invoice.paymentStatus)}</p>
      </div>

      <table style="border-collapse:collapse;width:100%;margin:12px 0;">
        <thead>
          <tr style="background:#0f766e;color:#fff;">
            <th style="border:1px solid #0f766e;padding:8px;text-align:left;">Product</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:center;">Qty</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:right;">Unit</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:right;">Discount</th>
            <th style="border:1px solid #0f766e;padding:8px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <p><strong>Product subtotal:</strong> $${Number(invoice.productSubtotal || 0).toFixed(2)}<br/>
      <strong>VAT:</strong> $${Number(invoice.vatAmount || 0).toFixed(2)}<br/>
      <strong>Discount:</strong> -$${Number(invoice.discountAmount || 0).toFixed(2)}<br/>
      <strong>Shipping:</strong> $${Number(invoice.shippingCost || 0).toFixed(2)}<br/>
      <strong>Total:</strong> $${Number(invoice.total || 0).toFixed(2)}<br/>
      <strong>Paid:</strong> $${Number(invoice.paidAmount || 0).toFixed(2)}<br/>
      <strong>Balance Due:</strong> $${Number(invoice.balanceDue || 0).toFixed(2)}</p>

      ${invoice.notes ? `<p><strong>Notes:</strong> ${invoice.notes}</p>` : ""}
      ${invoice.extraNotes ? `<p><strong>Extra Notes:</strong> ${invoice.extraNotes}</p>` : ""}
      ${invoice.termsAndConditions ? `<p><strong>Terms & Conditions:</strong> ${invoice.termsAndConditions}</p>` : ""}
      ${invoice.additionalMessages ? `<p><strong>Additional Messages:</strong> ${invoice.additionalMessages}</p>` : ""}
    </div>
  `;

  const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937;">
      <h2 style="margin-bottom:8px;">Invoice Generated: ${invoice.invoiceNumber}</h2>
      <p style="margin-top:0;">This invoice has been generated and is attached as a PDF.</p>
      <p><strong>Customer:</strong> ${customer?.name || "N/A"}<br/>
      <strong>Customer Email:</strong> ${customerEmail || "N/A"}<br/>
      <strong>Total:</strong> $${Number(invoice.total || 0).toFixed(2)}<br/>
      <strong>Payment Status:</strong> ${paymentStatusLabel(invoice.paymentStatus)}</p>
      ${html}
    </div>
  `;

  const attachments = [
    {
      filename: `${invoice.invoiceNumber}.pdf`,
      content: pdfBuffer,
    },
  ];

  const deliveries = [
    transporter.sendMail({
      from: `"Asian Import Export Co" <${senderAddress}>`,
      to: SALES_EMAIL,
      subject: `Invoice ${invoice.invoiceNumber} generated`,
      html: adminHtml,
      attachments,
    }),
  ];

  if (customerEmail) {
    deliveries.push(
      transporter.sendMail({
        from: `"Asian Import Export Co" <${senderAddress}>`,
        to: customerEmail,
        subject: `Invoice ${invoice.invoiceNumber} from Asian Import Export`,
        html,
        attachments,
      })
    );
  }

  await Promise.all(deliveries);

  return {
    sent: true,
    message: "Invoice emails sent to sales and customer",
  };
};

const mapInquiry = (inquiry) => ({
  id: inquiry._id,
  inquiryNumber: inquiry.inquiryNumber,
  customerId: inquiry.customer,
  customer: inquiry.customerSnapshot,
  items: inquiry.items,
  subtotal: inquiry.subtotal,
  total: inquiry.total,
  currency: inquiry.currency,
  paymentMethod: inquiry.paymentMethod,
  status: inquiry.status,
  contactChannel: inquiry.contactChannel,
  internalNotes: inquiry.internalNotes,
  payment: inquiry.payment,
  linkedInvoice: inquiry.linkedInvoice,
  hiddenByCustomer: Boolean(inquiry.hiddenByCustomer),
  hiddenAt: inquiry.hiddenAt || null,
  createdAt: inquiry.createdAt,
  updatedAt: inquiry.updatedAt,
});

const mapInvoice = (invoice) => ({
  id: invoice._id,
  invoiceNumber: invoice.invoiceNumber,
  inquiryId: invoice.inquiry,
  customerId: invoice.customer,
  customer: invoice.customerSnapshot,
  items: invoice.items,
  subtotal: invoice.subtotal,
  productSubtotal: invoice.productSubtotal,
  vatRate: invoice.vatRate,
  vatAmount: invoice.vatAmount,
  discountRate: invoice.discountRate,
  discountAmount: invoice.discountAmount,
  shippingCost: invoice.shippingCost,
  total: invoice.total,
  paidAmount: invoice.paidAmount,
  balanceDue: invoice.balanceDue,
  paymentStatus: invoice.paymentStatus,
  currency: invoice.currency,
  invoiceStatus: invoice.invoiceStatus,
  notes: invoice.notes,
  extraNotes: invoice.extraNotes,
  termsAndConditions: invoice.termsAndConditions,
  additionalMessages: invoice.additionalMessages,
  issuedAt: invoice.issuedAt,
  createdBy: invoice.createdBy,
  createdAt: invoice.createdAt,
  updatedAt: invoice.updatedAt,
});

const placeOrderInquiry = async (req, res) => {
  try {
    const authUser = req.authUser;
    if (!authUser || authUser.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Only customers can place orders",
      });
    }

    const { customer, items, paymentMethod, currency = "USD" } = req.body;

    const lineItems = sanitizeItems(items);
    if (lineItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one valid item is required",
      });
    }

    const customerSnapshot = normalizeCustomerSnapshot({ customer, authUser });
    const accountEmail = sanitizeText(authUser.email || "", "").toLowerCase();
    if (accountEmail) {
      customerSnapshot.email = accountEmail;
    }
    const missingField = validateCustomerSnapshot(customerSnapshot);

    if (missingField) {
      return res.status(400).json({
        success: false,
        message: `Missing customer field: ${missingField}`,
      });
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const total = subtotal;

    const inquiry = await Inquiry.create({
      inquiryNumber: generateCode("INQ"),
      customer: authUser._id,
      customerSnapshot,
      items: lineItems,
      subtotal,
      total,
      currency,
      paymentMethod: paymentMethod === "credit-card" ? "credit-card" : "bank",
      status: "in_process",
    });

    let emailDelivery = {
      sent: false,
      message: "Inquiry email not attempted",
    };
    try {
      emailDelivery = await sendInquiryReceivedEmails(inquiry);
    } catch (emailError) {
      emailDelivery = {
        sent: false,
        message: emailError.message || "Failed to send inquiry email",
      };
      console.error("Inquiry email send error:", emailError);
    }

    return res.status(201).json({
      success: true,
      message: "Inquiry created successfully",
      inquiry: mapInquiry(inquiry),
      emailDelivery,
    });
  } catch (error) {
    console.error("Place order inquiry error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create inquiry",
      error: error.message,
    });
  }
};

const getMyInquiries = async (req, res) => {
  try {
    const inquiries = await Inquiry.find({
      customer: req.authUser._id,
      hiddenByCustomer: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      inquiries: inquiries.map(mapInquiry),
    });
  } catch (error) {
    console.error("Get my inquiries error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch inquiries" });
  }
};

const getAllInquiries = async (req, res) => {
  try {
    if (!isStaffRole(req.authUser?.role)) {
      return res.status(403).json({ success: false, message: "Staff access required" });
    }

    const status = req.query.status;
    const query = status ? { status } : {};

    const inquiries = await Inquiry.find(query).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      inquiries: inquiries.map(mapInquiry),
    });
  } catch (error) {
    console.error("Get all inquiries error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch inquiries" });
  }
};

const deleteInquiry = async (req, res) => {
  try {
    const { inquiryId } = req.params;
    if (!inquiryId || !mongoose.Types.ObjectId.isValid(inquiryId)) {
      return res.status(400).json({ success: false, message: "Valid inquiryId is required" });
    }

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    const authRole = req.authUser?.role;
    const isAdmin = authRole === "admin";
    const isOwner = String(inquiry.customer) === String(req.authUser?._id);

    if (isAdmin) {
      if (inquiry.linkedInvoice) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete an inquiry that already has an invoice",
        });
      }
      await Inquiry.deleteOne({ _id: inquiryId });
      return res.status(200).json({ success: true, message: "Inquiry deleted successfully" });
    }

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own inquiries",
      });
    }

    inquiry.hiddenByCustomer = true;
    inquiry.hiddenAt = new Date();
    await inquiry.save();

    return res.status(200).json({
      success: true,
      message: "Inquiry removed from your dashboard",
    });
  } catch (error) {
    console.error("Delete inquiry error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete inquiry" });
  }
};

const updateInquiryStatus = async (req, res) => {
  try {
    if (!isStaffRole(req.authUser?.role)) {
      return res.status(403).json({ success: false, message: "Staff access required" });
    }

    const { inquiryId } = req.params;
    const { status, internalNotes, contactChannel } = req.body;

    const allowedStatuses = ["in_process", "invoice_sent", "cancelled"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid inquiry status" });
    }

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    inquiry.status = status;

    if (typeof internalNotes === "string") {
      inquiry.internalNotes = internalNotes.trim();
    }

    if (["email", "whatsapp", "phone", "mixed"].includes(contactChannel)) {
      inquiry.contactChannel = contactChannel;
    }

    await inquiry.save();

    return res.status(200).json({
      success: true,
      message: "Inquiry status updated",
      inquiry: mapInquiry(inquiry),
    });
  } catch (error) {
    console.error("Update inquiry status error:", error);
    return res.status(500).json({ success: false, message: "Failed to update inquiry status" });
  }
};

const createInvoiceFromInquiry = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (req.authUser?.role !== "admin") {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const {
      inquiryId,
      items,
      customer = {},
      paidAmount = 0,
      notes = "",
      extraNotes = "",
      termsAndConditions = "",
      additionalMessages = "",
      vatRate = 0,
      discountRate = 0,
      shippingCost = 0,
      invoiceNumber,
      currency = "USD",
    } = req.body;

    if (!inquiryId || !mongoose.Types.ObjectId.isValid(inquiryId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Valid inquiryId is required" });
    }

    const inquiry = await Inquiry.findById(inquiryId).session(session);
    if (!inquiry) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    if (inquiry.linkedInvoice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Invoice already exists for this inquiry" });
    }

    const invoiceItems = sanitizeItems(items?.length ? items : inquiry.items);
    if (invoiceItems.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "At least one valid invoice item is required" });
    }

    const customerSnapshot = normalizeCustomerSnapshot({
      customer,
      fallback: {
        ...inquiry.customerSnapshot,
        paymentMethod: inquiry.paymentMethod,
      },
    });

    const accountCustomer = await User.findById(inquiry.customer)
      .select("email")
      .session(session);
    const accountEmail = sanitizeText(
      accountCustomer?.email || inquiry.customerSnapshot?.email || "",
      ""
    ).toLowerCase();

    if (!accountEmail) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Customer account email is missing",
      });
    }

    // Always keep invoice email aligned with login/register account email.
    customerSnapshot.email = accountEmail;

    const missingCustomerField = validateCustomerSnapshot(customerSnapshot);
    if (missingCustomerField) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Missing customer field: ${missingCustomerField}`,
      });
    }

    const productSubtotal = roundCurrency(invoiceItems.reduce((sum, item) => sum + item.lineTotal, 0));
    const normalizedVatRate = Math.max(Number(vatRate) || 0, 0);
    const normalizedDiscountRate = Math.max(Number(discountRate) || 0, 0);
    const normalizedShippingCost = Math.max(Number(shippingCost) || 0, 0);
    const vatAmount = roundCurrency((productSubtotal * normalizedVatRate) / 100);
    const discountAmount = roundCurrency((productSubtotal * normalizedDiscountRate) / 100);
    const subtotal = roundCurrency(Math.max(productSubtotal + vatAmount - discountAmount + normalizedShippingCost, 0));
    const total = subtotal;
    const normalizedPaidAmount = Math.max(Number(paidAmount) || 0, 0);
    const balanceDue = Math.max(total - normalizedPaidAmount, 0);

    const invoice = await Invoice.create(
      [
        {
          invoiceNumber: sanitizeText(invoiceNumber, generateCode("INV")),
          inquiry: inquiry._id,
          customer: inquiry.customer,
          customerSnapshot,
          items: invoiceItems,
          productSubtotal,
          vatRate: normalizedVatRate,
          vatAmount,
          discountRate: normalizedDiscountRate,
          discountAmount,
          shippingCost: normalizedShippingCost,
          subtotal,
          total,
          paidAmount: normalizedPaidAmount,
          balanceDue,
          paymentStatus: summarizePaymentStatus(total, normalizedPaidAmount),
          currency: String(currency || inquiry.currency || "USD").trim(),
          notes: String(notes || "").trim(),
          extraNotes: String(extraNotes || "").trim(),
          termsAndConditions: String(termsAndConditions || "").trim(),
          additionalMessages: String(additionalMessages || "").trim(),
          createdBy: {
            id: String(req.authUser._id),
            name: req.authUser.fullName || "",
            email: req.authUser.email || "",
            role: req.authUser.role || "",
          },
        },
      ],
      { session }
    );

    inquiry.status = "invoice_sent";
    inquiry.linkedInvoice = invoice[0]._id;
    inquiry.payment.paidAmount = normalizedPaidAmount;
    inquiry.payment.confirmed = normalizedPaidAmount > 0;
    inquiry.payment.confirmedAt = normalizedPaidAmount > 0 ? new Date() : inquiry.payment.confirmedAt;
    await inquiry.save({ session });

    await session.commitTransaction();
    session.endSession();

    let emailDelivery = {
      sent: false,
      message: "Email not attempted",
    };
    try {
      emailDelivery = await sendInvoiceEmail(invoice[0]);
    } catch (emailError) {
      emailDelivery = {
        sent: false,
        message: emailError.message || "Failed to send invoice email",
      };
      console.error("Invoice email send error:", emailError);
    }

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      invoice: mapInvoice(invoice[0]),
      inquiry: mapInquiry(inquiry),
      emailDelivery,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Create invoice error:", error);
    return res.status(500).json({ success: false, message: "Failed to create invoice", error: error.message });
  }
};

const downloadInvoicePdf = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    if (!invoiceId || !mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ success: false, message: "Valid invoiceId is required" });
    }

    const invoice = await Invoice.findById(invoiceId).lean();
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const isOwner = String(invoice.customer) === String(req.authUser?._id);
    const isStaff = isStaffRole(req.authUser?.role);

    if (!isOwner && !isStaff) {
      return res.status(403).json({ success: false, message: "Not allowed to download this invoice" });
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${invoice.invoiceNumber}.pdf\"`);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("Download invoice PDF error:", error);
    return res.status(500).json({ success: false, message: "Failed to download invoice PDF" });
  }
};

const getMyInvoices = async (req, res) => {
  try {
    let customerId = req.authUser._id;

    if (req.authUser.role === "admin" || req.authUser.role === "moderator") {
      const customerUid = req.query.customerUid;
      if (customerUid) {
        const customer = await User.findOne({ firebaseUid: customerUid });
        if (customer) {
          customerId = customer._id;
        }
      }
    }

    const invoices = await Invoice.find({ customer: customerId }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      invoices: invoices.map(mapInvoice),
    });
  } catch (error) {
    console.error("Get my invoices error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch invoices" });
  }
};

const getAllInvoices = async (req, res) => {
  try {
    if (!isStaffRole(req.authUser?.role)) {
      return res.status(403).json({ success: false, message: "Staff access required" });
    }

    const invoices = await Invoice.find({}).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      invoices: invoices.map(mapInvoice),
    });
  } catch (error) {
    console.error("Get all invoices error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch invoices" });
  }
};

const deleteInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (req.authUser?.role !== "admin") {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { invoiceId } = req.params;
    if (!invoiceId || !mongoose.Types.ObjectId.isValid(invoiceId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Valid invoiceId is required" });
    }

    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const inquiry = await Inquiry.findById(invoice.inquiry).session(session);
    if (inquiry) {
      inquiry.linkedInvoice = null;
      inquiry.status = "in_process";
      inquiry.payment.confirmed = false;
      inquiry.payment.paidAmount = 0;
      inquiry.payment.confirmedAt = null;
      await inquiry.save({ session });
    }

    await Invoice.deleteOne({ _id: invoice._id }).session(session);

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ success: true, message: "Invoice deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Delete invoice error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete invoice" });
  }
};

module.exports = {
  placeOrderInquiry,
  getMyInquiries,
  getAllInquiries,
  updateInquiryStatus,
  deleteInquiry,
  createInvoiceFromInquiry,
  getMyInvoices,
  getAllInvoices,
  deleteInvoice,
  downloadInvoicePdf,
};
