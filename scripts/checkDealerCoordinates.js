require("dotenv").config();
const mongoose = require("mongoose");
const Dealer = require("../models/Dealer");
const connectDB = require("../config/db");

async function checkCoordinates() {
    try {
        await connectDB();
        console.log("Connected to database");

        const dealers = await Dealer.find().limit(20);

        console.log("\n📊 DEALER COORDINATES CHECK:");
        console.log("================================\n");

        let withCoords = 0;
        let withoutCoords = 0;
        let invalidCoords = 0;

        dealers.forEach((dealer, idx) => {
            const lng = dealer.location?.coordinates?.[0];
            const lat = dealer.location?.coordinates?.[1];
            const isValid = lng && lat && !(lng === 0 && lat === 0);

            console.log(`${idx + 1}. ${dealer.name}`);
            console.log(`   Country: ${dealer.address?.country}`);
            console.log(`   Coordinates: [${lng}, ${lat}]`);
            console.log(`   Type: [${typeof lng}, ${typeof lat}]`);
            console.log(`   Valid: ${isValid ? '✅ YES' : '❌ NO'}`);
            console.log("");

            if (isValid) withCoords++;
            else if (!lng || !lat) withoutCoords++;
            else invalidCoords++;
        });

        console.log("================================");
        console.log(`✅ With valid coordinates: ${withCoords}`);
        console.log(`❌ Without coordinates: ${withoutCoords}`);
        console.log(`⚠️ Invalid coordinates: ${invalidCoords}`);
        console.log("================================\n");

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

checkCoordinates();
