const mongoose = require("mongoose");
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

const toLineItem = (item = {}) => {
  const quantity = Number(item.quantity || 0);
  const inferredLineTotal = parseMoney(item.lineTotal ?? item.total ?? item.calculatedPrice);
  const unitPriceCandidate = item.unitPrice ?? item.price;
  const unitPrice = parseMoney(
    unitPriceCandidate ?? (quantity > 0 && inferredLineTotal > 0 ? inferredLineTotal / quantity : 0)
  );
  const lineTotal = inferredLineTotal > 0 ? inferredLineTotal : quantity * unitPrice;

  return {
    productId: item.productId ? String(item.productId) : item.id ? String(item.id) : "",
    name: String(item.name || "").trim(),
    image: item.image ? String(item.image) : "",
    quantity,
    unitPrice,
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
  if (paidAmount >= total) return "paid";
  return "partial";
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
  quote: inquiry.quote,
  quoteAcceptedAt: inquiry.quoteAcceptedAt,
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
  total: invoice.total,
  paidAmount: invoice.paidAmount,
  balanceDue: invoice.balanceDue,
  paymentStatus: invoice.paymentStatus,
  currency: invoice.currency,
  invoiceStatus: invoice.invoiceStatus,
  notes: invoice.notes,
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

    const requiredCustomerFields = [
      "name",
      "email",
      "phone",
      "address",
      "city",
      "state",
      "zipCode",
    ];

    for (const field of requiredCustomerFields) {
      if (!customer?.[field] || !String(customer[field]).trim()) {
        return res.status(400).json({
          success: false,
          message: `Missing customer field: ${field}`,
        });
      }
    }

    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const total = subtotal;

    const inquiry = await Inquiry.create({
      inquiryNumber: generateCode("INQ"),
      customer: authUser._id,
      customerSnapshot: {
        name: String(customer.name).trim(),
        email: String(customer.email).trim().toLowerCase(),
        phone: String(customer.phone).trim(),
        companyName: authUser.companyName || "",
        address: String(customer.address).trim(),
        city: String(customer.city).trim(),
        state: String(customer.state).trim(),
        zipCode: String(customer.zipCode).trim(),
        notes: customer.notes ? String(customer.notes).trim() : "",
        whatsappNumber: authUser.whatsappNumber || "",
      },
      items: lineItems,
      subtotal,
      total,
      currency,
      paymentMethod: paymentMethod === "credit-card" ? "credit-card" : "bank",
      status: "new",
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

const updateInquiryStatus = async (req, res) => {
  try {
    if (!isStaffRole(req.authUser?.role)) {
      return res.status(403).json({ success: false, message: "Staff access required" });
    }

    const { inquiryId } = req.params;
    const { status, internalNotes, contactChannel, paidAmount, paymentNotes } = req.body;

    const allowedStatuses = [
      "new",
      "quoted",
      "quote_accepted",
      "invoice_created",
      "closed",
      "cancelled",
    ];

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

    if (typeof paidAmount !== "undefined") {
      const normalizedPaidAmount = Math.max(Number(paidAmount) || 0, 0);
      inquiry.payment.paidAmount = normalizedPaidAmount;
      inquiry.payment.confirmed = normalizedPaidAmount > 0;
      inquiry.payment.confirmedAt = normalizedPaidAmount > 0 ? new Date() : null;
    }

    if (typeof paymentNotes === "string") {
      inquiry.payment.notes = paymentNotes.trim();
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

const markInquiryQuoted = async (req, res) => {
  try {
    if (!isStaffRole(req.authUser?.role)) {
      return res.status(403).json({ success: false, message: "Staff access required" });
    }

    const { inquiryId } = req.params;
    const { amount, currency = "USD", notes = "" } = req.body;
    const quoteAmount = Number(amount);

    if (!Number.isFinite(quoteAmount) || quoteAmount < 0) {
      return res.status(400).json({ success: false, message: "Invalid quote amount" });
    }

    const inquiry = await Inquiry.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    inquiry.status = "quoted";
    inquiry.quote = {
      amount: quoteAmount,
      currency: String(currency || "USD").trim(),
      notes: String(notes || "").trim(),
      quotedAt: new Date(),
      quotedByName: req.authUser?.fullName || "",
      quotedByEmail: req.authUser?.email || "",
    };

    await inquiry.save();

    return res.status(200).json({
      success: true,
      message: "Inquiry marked as quoted",
      inquiry: mapInquiry(inquiry),
    });
  } catch (error) {
    console.error("Mark inquiry quoted error:", error);
    return res.status(500).json({ success: false, message: "Failed to update quote" });
  }
};

const acceptQuote = async (req, res) => {
  try {
    const { inquiryId } = req.params;
    const inquiry = await Inquiry.findById(inquiryId);

    if (!inquiry) {
      return res.status(404).json({ success: false, message: "Inquiry not found" });
    }

    if (String(inquiry.customer) !== String(req.authUser._id)) {
      return res.status(403).json({ success: false, message: "You can only update your own inquiry" });
    }

    if (inquiry.status !== "quoted") {
      return res.status(400).json({ success: false, message: "Only quoted inquiries can be accepted" });
    }

    inquiry.status = "quote_accepted";
    inquiry.quoteAcceptedAt = new Date();
    await inquiry.save();

    return res.status(200).json({
      success: true,
      message: "Quote accepted successfully",
      inquiry: mapInquiry(inquiry),
    });
  } catch (error) {
    console.error("Accept quote error:", error);
    return res.status(500).json({ success: false, message: "Failed to accept quote" });
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

    const { inquiryId, items, paidAmount = 0, notes = "", currency = "USD" } = req.body;

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

    const subtotal = invoiceItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const total = subtotal;
    const normalizedPaidAmount = Math.max(Number(paidAmount) || 0, 0);
    const balanceDue = Math.max(total - normalizedPaidAmount, 0);

    const invoice = await Invoice.create(
      [
        {
          invoiceNumber: generateCode("INV"),
          inquiry: inquiry._id,
          customer: inquiry.customer,
          customerSnapshot: {
            name: inquiry.customerSnapshot.name,
            email: inquiry.customerSnapshot.email,
            phone: inquiry.customerSnapshot.phone,
            companyName: inquiry.customerSnapshot.companyName,
            address: inquiry.customerSnapshot.address,
            city: inquiry.customerSnapshot.city,
            state: inquiry.customerSnapshot.state,
            zipCode: inquiry.customerSnapshot.zipCode,
          },
          items: invoiceItems,
          subtotal,
          total,
          paidAmount: normalizedPaidAmount,
          balanceDue,
          paymentStatus: summarizePaymentStatus(total, normalizedPaidAmount),
          currency: String(currency || inquiry.currency || "USD").trim(),
          notes: String(notes || "").trim(),
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

    inquiry.status = "invoice_created";
    inquiry.linkedInvoice = invoice[0]._id;
    inquiry.payment.paidAmount = normalizedPaidAmount;
    inquiry.payment.confirmed = normalizedPaidAmount > 0;
    inquiry.payment.confirmedAt = normalizedPaidAmount > 0 ? new Date() : inquiry.payment.confirmedAt;
    await inquiry.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      invoice: mapInvoice(invoice[0]),
      inquiry: mapInquiry(inquiry),
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Create invoice error:", error);
    return res.status(500).json({ success: false, message: "Failed to create invoice", error: error.message });
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

module.exports = {
  placeOrderInquiry,
  getMyInquiries,
  getAllInquiries,
  updateInquiryStatus,
  markInquiryQuoted,
  acceptQuote,
  createInvoiceFromInquiry,
  getMyInvoices,
  getAllInvoices,
};
