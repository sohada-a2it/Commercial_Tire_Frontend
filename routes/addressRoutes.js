const express = require("express");
const zipcodes = require("zipcodes");

const router = express.Router();

const normalizeStateValue = (value = "") => String(value || "").trim().toUpperCase();

const toUniqueSortedStrings = (values = []) =>
  [...new Set(values.filter(Boolean).map((value) => String(value).trim()))].sort((a, b) => a.localeCompare(b));

router.get("/cities", (req, res) => {
  const state = normalizeStateValue(req.query.state);
  if (!state) {
    return res.status(400).json({ success: false, message: "Missing state abbreviation" });
  }

  const entries = zipcodes.lookupByState(state) || [];
  const cities = toUniqueSortedStrings(entries.map((entry) => entry.city));

  return res.json({ success: true, state, cities });
});

router.get("/zip-codes", (req, res) => {
  const state = normalizeStateValue(req.query.state);
  const city = String(req.query.city || "").trim();

  if (!state || !city) {
    return res.status(400).json({ success: false, message: "Missing state or city" });
  }

  const entries = zipcodes.lookupByName(city, state) || [];
  const zipCodes = toUniqueSortedStrings(entries.map((entry) => entry.zip || entry.zipcode));

  return res.json({ success: true, state, city, zipCodes });
});

module.exports = router;
