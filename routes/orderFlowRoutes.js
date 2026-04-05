const express = require("express");
const {
  placeOrderInquiry,
  getMyInquiries,
  getAllInquiries,
  updateInquiryStatus,
  createInvoiceFromInquiry,
  getMyInvoices,
  getAllInvoices,
  downloadInvoicePdf,
} = require("../controllers/orderFlowController");
const { authenticate, requireAdmin, requireStaff } = require("../middleware/auth");

const router = express.Router();

router.post("/inquiries/place-order", authenticate, placeOrderInquiry);
router.get("/inquiries/my", authenticate, getMyInquiries);
router.get("/inquiries", authenticate, requireStaff, getAllInquiries);
router.patch("/inquiries/:inquiryId/status", authenticate, requireStaff, updateInquiryStatus);

router.post("/invoices", authenticate, requireAdmin, createInvoiceFromInquiry);
router.get("/invoices/my", authenticate, getMyInvoices);
router.get("/invoices", authenticate, requireStaff, getAllInvoices);
router.get("/invoices/:invoiceId/pdf", authenticate, downloadInvoicePdf);

module.exports = router;
