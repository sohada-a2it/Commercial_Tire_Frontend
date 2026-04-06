const express = require("express");
const {
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
} = require("../controllers/orderFlowController");
const { authenticate, requireAdmin, requireStaff } = require("../middleware/auth");

const router = express.Router();

router.post("/inquiries/place-order", authenticate, placeOrderInquiry);
router.get("/inquiries/my", authenticate, getMyInquiries);
router.get("/inquiries", authenticate, requireStaff, getAllInquiries);
router.patch("/inquiries/:inquiryId/status", authenticate, requireStaff, updateInquiryStatus);
router.delete("/inquiries/:inquiryId", authenticate, requireAdmin, deleteInquiry);

router.post("/invoices", authenticate, requireAdmin, createInvoiceFromInquiry);
router.get("/invoices/my", authenticate, getMyInvoices);
router.get("/invoices", authenticate, requireStaff, getAllInvoices);
router.delete("/invoices/:invoiceId", authenticate, requireAdmin, deleteInvoice);
router.get("/invoices/:invoiceId/pdf", authenticate, downloadInvoicePdf);

module.exports = router;
