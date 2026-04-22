require("dotenv").config();
const mongoose = require("mongoose");
const Dealer = require("../models/Dealer");
const connectDB = require("../config/db");

// Default coordinates for countries
const COUNTRY_COORDS = {
    "India": { lat: 20.5937, lng: 78.9629 },
    "USA": { lat: 37.0902, lng: -95.7129 },
    "Bangladesh": { lat: 23.6850, lng: 90.3563 },
    "Pakistan": { lat: 30.3753, lng: 69.3451 },
    "UK": { lat: 55.3781, lng: -3.4360 },
    "Canada": { lat: 56.1304, lng: -106.3468 },
    "Australia": { lat: -25.2744, lng: 133.7751 },
    "Germany": { lat: 51.1657, lng: 10.4515 },
    "France": { lat: 46.2276, lng: 2.2137 },
    "Japan": { lat: 36.2048, lng: 138.2529 },
};

async function updateDealerCoordinates() {
    try {
        await connectDB();
        console.log("Connected to database\n");

        // Find dealers without valid coordinates
        const dealers = await Dealer.find();

        let updated = 0;
        let skipped = 0;

        for (const dealer of dealers) {
            const lng = dealer.location?.coordinates?.[0];
            const lat = dealer.location?.coordinates?.[1];
            const isInvalid = !lng || !lat || (lng === 0 && lat === 0) || lng === 0;

            if (isInvalid) {
                const country = dealer.address?.country;
                const defaultCoords = COUNTRY_COORDS[country];

                if (defaultCoords) {
                    // Update with country center coordinates
                    dealer.location = {
                        type: "Point",
                        coordinates: [defaultCoords.lng, defaultCoords.lat]
                    };

                    await dealer.save();
                    console.log(`✅ Updated: ${dealer.name} (${country})`);
                    updated++;
                } else {
                    console.log(`⚠️  Skipped: ${dealer.name} - Country "${country}" not in mapping`);
                    skipped++;
                }
            } else {
                console.log(`✓ Already valid: ${dealer.name}`);
            }
        }

        console.log(`\n================================`);
        console.log(`✅ Updated: ${updated}`);
        console.log(`⚠️  Skipped: ${skipped}`);
        console.log(`================================\n`);

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

updateDealerCoordinates();
