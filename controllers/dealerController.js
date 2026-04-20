const Dealer = require("../models/Dealer");

/* =========================
   ➤ CREATE DEALER
========================= */ 
// CREATE
exports.createDealer = async (req, res) => {
  try {
    const {
      name,
      company,
      phone,
      email,
      isActive,
      tireBrands,
      address,
      lat,
      lng,
    } = req.body;

    const dealer = await Dealer.create({
      name,
      company,
      phone,
      email,
      isActive,
      tireBrands,
      address: {
        city: address.city,
        country: address.country,
        location: {
          type: "Point",
          coordinates: [lng, lat], // IMPORTANT ORDER
        },
      },
    });

    res.status(201).json({ success: true, dealer });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =========================
   ➤ GET ALL DEALERS
   (WITH FILTERS)
========================= */
exports.getDealers = async (req, res) => {
  try {
    const { city, brand, authorized, search } = req.query;

    let filter = { isActive: true };

    // City filter
    if (city) {
      filter["address.city"] = new RegExp(city, "i");
    }

    // Brand filter
    if (brand) {
      filter.tireBrands = brand;
    }

    // Authorized filter
    if (authorized) {
      filter.isAuthorized = authorized === "true";
    }

    // Text search (name/company/city)
    if (search) {
      filter.$or = [
        { name: new RegExp(search, "i") },
        { company: new RegExp(search, "i") },
        { "address.city": new RegExp(search, "i") },
      ];
    }

    const dealers = await Dealer.find(filter).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: dealers.length,
      data: dealers,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================
   ➤ GET SINGLE DEALER
========================= */
exports.getDealerById = async (req, res) => {
  try {
    const dealer = await Dealer.findById(req.params.id);

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    res.json({
      success: true,
      data: dealer,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================
   ➤ UPDATE DEALER
========================= */
exports.updateDealer = async (req, res) => {
  try {
    const dealer = await Dealer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    res.json({
      success: true,
      message: "Dealer updated successfully",
      data: dealer,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================
   ➤ DELETE DEALER
========================= */
exports.deleteDealer = async (req, res) => {
  try {
    const dealer = await Dealer.findByIdAndDelete(req.params.id);

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found",
      });
    }

    res.json({
      success: true,
      message: "Dealer deleted successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================
   ➤ NEARBY DEALERS (GEO SEARCH)
========================= */
exports.getNearbyDealers = async (req, res) => {
  try {
    const { lng, lat, distance = 50000 } = req.query;

    if (!lng || !lat) {
      return res.status(400).json({
        success: false,
        message: "Longitude and Latitude are required",
      });
    }

    const dealers = await Dealer.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: parseInt(distance),
        },
      },
    });

    res.json({
      success: true,
      count: dealers.length,
      data: dealers,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};