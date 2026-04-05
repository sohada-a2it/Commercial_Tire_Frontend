const { v2: cloudinary } = require("cloudinary");

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

const buildOptimizedUrl = (publicId, resourceType = "image") => {
  if (!publicId) return "";

  return cloudinary.url(publicId, {
    secure: true,
    resource_type: resourceType,
    transformation: [
      {
        fetch_format: "auto",
        quality: "auto:good",
        crop: "limit",
        width: 1600,
      },
    ],
  });
};

module.exports = {
  cloudinary,
  buildOptimizedUrl,
};