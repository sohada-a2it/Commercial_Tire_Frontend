const Dealer = require("../models/Dealer");

/* =========================
   ➤ CREATE DEALER
========================= */
exports.createDealer = async (req, res) => {
  try {
    const {
      name,
      company,
      phone,
      email,
      website,
      isActive,
      tireBrands,
      services,
      address,
      lat,
      lng,
    } = req.body;

    const dealer = await Dealer.create({
      name,
      company,
      phone,
      email,
      website,
      isActive,
      tireBrands,
      services,

      // ✅ ADDRESS FIXED
      address: {
        street: address?.street,
        area: address?.area,
        city: address?.city,
        state: address?.state,
        country: address?.country,
        postalCode: address?.postalCode,
        fullAddress: address?.fullAddress,
      },

      // ✅ GEO LOCATION (ROOT LEVEL)
      location: {
        type: "Point",
        coordinates: [parseFloat(lng) || 0, parseFloat(lat) || 0],
      },
    });

    res.status(201).json({
      success: true,
      message: "Dealer created successfully",
      data: dealer,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================
   ➤ GET ALL DEALERS
========================= */
exports.getDealers = async (req, res) => {
  try {
    const { city, brand, authorized, search, service, country, limit = 50 } = req.query;

    let filter = { isActive: true };

    // ✅ ADD COUNTRY FILTER - exact match with trim
    if (country) {
      console.log("Filtering by country:", country);
      // Trim the country and do case-insensitive match
      filter["address.country"] = {
        $regex: `^${country.trim()}$`,
        $options: "i"
      };
    }

    if (city) {
      filter["address.city"] = new RegExp(city, "i");
    }

    if (brand) {
      filter.tireBrands = brand;
    }

    if (service) {
      filter.services = new RegExp(service, "i");
    }

    if (authorized) {
      filter.isAuthorized = authorized === "true";
    }

    if (search) {
      filter.$or = [
        { name: new RegExp(search, "i") },
        { company: new RegExp(search, "i") },
        { "address.city": new RegExp(search, "i") },
        { services: new RegExp(search, "i") },
      ];
    }

    console.log("Query filter:", JSON.stringify(filter));
    const dealers = await Dealer.find(filter)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    console.log("Dealers found:", dealers.length);

    res.json({
      success: true,
      count: dealers.length,
      data: dealers,
    });
  } catch (err) {
    console.error("Error in getDealers:", err);
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
    const updates = { ...req.body };

    // ✅ GEO FIX during update
    if (req.body.lat && req.body.lng) {
      updates.location = {
        type: "Point",
        coordinates: [
          parseFloat(req.body.lng),
          parseFloat(req.body.lat),
        ],
      };
    }

    const dealer = await Dealer.findByIdAndUpdate(
      req.params.id,
      updates,
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
            coordinates: [
              parseFloat(lng),
              parseFloat(lat),
            ],
          },
          $maxDistance: parseInt(distance),
        },
      },
      isActive: true,
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