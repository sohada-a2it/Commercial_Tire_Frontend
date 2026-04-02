const express = require("express");
const {
  placeOrderInquiry,
  getMyInquiries,
  getAllInquiries,
  updateInquiryStatus,
  markInquiryQuoted,
  acceptQuote,
  createInvoiceFromInquiry,
  getMyInvoices,
  getAllInvoices,
} = require("../controllers/orderFlowController");
const { authenticate, requireAdmin, requireStaff } = require("../middleware/auth");

const router = express.Router();

router.post("/inquiries/place-order", authenticate, placeOrderInquiry);
router.get("/inquiries/my", authenticate, getMyInquiries);
router.get("/inquiries", authenticate, requireStaff, getAllInquiries);
router.patch("/inquiries/:inquiryId/status", authenticate, requireStaff, updateInquiryStatus);
router.patch("/inquiries/:inquiryId/quote", authenticate, requireStaff, markInquiryQuoted);
router.patch("/inquiries/:inquiryId/accept-quote", authenticate, acceptQuote);

router.post("/invoices", authenticate, requireAdmin, createInvoiceFromInquiry);
router.get("/invoices/my", authenticate, getMyInvoices);
router.get("/invoices", authenticate, requireStaff, getAllInvoices);

module.exports = router;
