const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
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
  const host = process.env.SMTP_HOST || "smtp.hostinger.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || process.env.OWNER_EMAIL;
  const pass = process.env.SMTP_PASSWORD;

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

const generateInvoicePdfBuffer = (invoice) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const y0 = 50;
    doc.fontSize(20).text("Invoice", 50, y0);
    doc
      .fontSize(11)
      .text(`Invoice Number: ${invoice.invoiceNumber}`, 50, y0 + 30)
      .text(`Inquiry ID: ${invoice.inquiry}`, 50, y0 + 48)
      .text(`Issued: ${new Date(invoice.issuedAt || invoice.createdAt).toLocaleString()}`, 50, y0 + 66);

    doc
      .fontSize(11)
      .text("Customer", 50, y0 + 100)
      .text(invoice.customerSnapshot.name || "", 50, y0 + 118)
      .text(invoice.customerSnapshot.email || "", 50, y0 + 136)
      .text(invoice.customerSnapshot.phone || "", 50, y0 + 154)
      .text(invoice.customerSnapshot.address || "", 50, y0 + 172)
      .text(
        `${invoice.customerSnapshot.city || ""}, ${invoice.customerSnapshot.state || ""} ${invoice.customerSnapshot.zipCode || ""}`,
        50,
        y0 + 190
      )
      .text(
        `Payment Method: ${paymentMethodLabel(invoice.customerSnapshot.paymentMethod || "bank")}`,
        50,
        y0 + 208
      );

    let currentY = y0 + 245;
    doc.fontSize(11).text("Items", 50, currentY);
    currentY += 20;

    doc
      .fontSize(10)
      .text("Name", 50, currentY)
      .text("Qty", 290, currentY)
      .text("Unit", 340, currentY)
      .text("Discount", 410, currentY)
      .text("Total", 490, currentY);

    currentY += 16;

    (invoice.items || []).forEach((item) => {
      const name = sanitizeText(item.title || item.name || "", "Item");
      doc
        .fontSize(10)
        .text(name, 50, currentY, { width: 230 })
        .text(String(item.quantity || 0), 290, currentY)
        .text(toPdfCurrency(item.unitPrice), 340, currentY)
        .text(toPdfCurrency(item.discount), 410, currentY)
        .text(toPdfCurrency(item.lineTotal), 490, currentY);
      currentY += 20;

      if (currentY > 720) {
        doc.addPage();
        currentY = 60;
      }
    });

    currentY += 12;
    doc.fontSize(11).text("Payment Breakdown", 50, currentY);
    currentY += 18;

    const breakdownRows = [
      ["Product subtotal", invoice.productSubtotal],
      ["VAT", invoice.vatAmount],
      ["Discount", invoice.discountAmount ? -Math.abs(invoice.discountAmount) : 0],
      ["Shipping", invoice.shippingCost],
    ];

    breakdownRows.forEach(([label, amount]) => {
      doc.fontSize(10).text(`${label}: ${toPdfCurrency(amount)}`, 50, currentY);
      currentY += 16;
    });

    doc
      .fontSize(11)
      .text(`Subtotal: ${toPdfCurrency(invoice.subtotal)}`, 370, currentY - 64)
      .text(`Total: ${toPdfCurrency(invoice.total)}`, 370, currentY - 46)
      .text(`Paid: ${toPdfCurrency(invoice.paidAmount)}`, 370, currentY - 28)
      .text(`Balance Due: ${toPdfCurrency(invoice.balanceDue)}`, 370, currentY - 10)
      .text(`Payment Status: ${paymentStatusLabel(invoice.paymentStatus)}`, 370, currentY + 8);

    const notesStartY = Math.max(currentY + 32, 640);

    if (invoice.notes) {
      doc.fontSize(11).text("Notes", 50, notesStartY).fontSize(10).text(invoice.notes, 50, notesStartY + 18, {
        width: 290,
      });
    }

    if (invoice.extraNotes) {
      doc.fontSize(11).text("Extra Notes", 50, notesStartY + 90).fontSize(10).text(invoice.extraNotes, 50, notesStartY + 108, {
        width: 290,
      });
    }

    if (invoice.termsAndConditions) {
      doc.fontSize(11).text("Terms & Conditions", 50, notesStartY + 180).fontSize(10).text(invoice.termsAndConditions, 50, notesStartY + 198, {
        width: 290,
      });
    }

    if (invoice.additionalMessages) {
      doc.fontSize(11).text("Additional Messages", 50, notesStartY + 270).fontSize(10).text(invoice.additionalMessages, 50, notesStartY + 288, {
        width: 290,
      });
    }

    doc.end();
  });

const sendInvoiceEmail = async (invoice) => {
  const transporter = createTransporter();

  if (!transporter) {
    return {
      sent: false,
      message: "SMTP credentials not configured",
    };
  }

  const pdfBuffer = await generateInvoicePdfBuffer(invoice);
  const customer = invoice.customerSnapshot;
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

  await transporter.sendMail({
    from: `"Asian Import Export Co" <${process.env.SMTP_USER || process.env.OWNER_EMAIL}>`,
    to: customer.email,
    cc: process.env.OWNER_EMAIL || undefined,
    subject: `Invoice ${invoice.invoiceNumber} from Asian Import Export`,
    html,
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  return {
    sent: true,
    message: "Invoice email sent",
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

    return res.status(201).json({
      success: true,
      message: "Inquiry created successfully",
      inquiry: mapInquiry(inquiry),
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
    const inquiries = await Inquiry.find({ customer: req.authUser._id })
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
    if (req.authUser?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { inquiryId } = req.params;
    if (!inquiryId || !mongoose.Types.ObjectId.isValid(inquiryId)) {
      return res.status(400).json({ success: false, message: "Valid inquiryId is required" });
    }

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    if (inquiry.linkedInvoice) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete an inquiry that already has an invoice",
      });
    }

    await Inquiry.deleteOne({ _id: inquiryId });

    return res.status(200).json({ success: true, message: "Inquiry deleted successfully" });
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
