import express from "express";
import admin from "firebase-admin";
import cors from "cors";
import multer from "multer";
import cloudinary from "./utils/cloudinary.js";
import streamifier from "streamifier";
import dotenv from "dotenv";
import fs from "fs";

const serviceAccount = JSON.parse(
  fs.readFileSync("./serviceAccount.json", "utf8")
);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


app.get("/", (req, res) => res.send("Notification Server Running"));

app.post("/send-notification", async (req, res) => {
  try {
    const { title, body, fcmToken } = req.body;

    const message = {
      notification: { title, body },
      token: fcmToken,
    };

    const response = await admin.messaging().send(message);
    res.status(200).json({ success: true, response });
  } catch (error) {
    console.error("❌ Error sending notification:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Updated upload route to handle multiple media types (images, videos, audio, documents)
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    console.log("� Media upload request received");
    
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { originalname, mimetype, size } = req.file;
    console.log(`📄 File details: ${originalname}, Type: ${mimetype}, Size: ${size} bytes`);

    // Determine file type and folder based on MIME type
    let folder = "chat_app_media";
    let resourceType = "auto"; // Cloudinary auto-detection
    
    if (mimetype.startsWith('image/')) {
      folder = "chat_app_images";
      resourceType = "image";
      console.log("📸 Processing image upload");
    } else if (mimetype.startsWith('video/')) {
      folder = "chat_app_videos";
      resourceType = "video";
      console.log("🎥 Processing video upload");
    } else if (mimetype.startsWith('audio/')) {
      folder = "chat_app_audio";
      resourceType = "video"; // Cloudinary uses 'video' for audio files
      console.log("🎵 Processing audio upload");
    } else {
      folder = "chat_app_documents";
      resourceType = "raw"; // For documents and other files
      console.log("📄 Processing document upload");
    }

    // Configure upload options based on media type
    const uploadOptions = {
      folder: folder,
      resource_type: resourceType,
    };

    // Add specific options for videos
    if (resourceType === "video" && mimetype.startsWith('video/')) {
      uploadOptions.quality = "auto"; // Optimize video quality
      uploadOptions.format = "mp4"; // Convert to MP4 for better compatibility
    }

    // Add specific options for images
    if (resourceType === "image") {
      uploadOptions.quality = "auto"; // Optimize image quality
      uploadOptions.fetch_format = "auto"; // Auto-format for better performance
    }

    const streamUpload = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (result) {
              console.log(`✅ Upload successful: ${result.secure_url}`);
              resolve(result);
            } else {
              console.error("❌ Cloudinary upload error:", error);
              reject(error);
            }
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
    };

    const result = await streamUpload();
    
    // Return appropriate URL field name for backward compatibility
    const responseData = {
      url: result.secure_url,
      mediaUrl: result.secure_url, // Generic field name
      publicId: result.public_id,
      format: result.format,
      resourceType: result.resource_type,
      bytes: result.bytes,
      duration: result.duration, // For videos/audio
      width: result.width, // For images/videos
      height: result.height, // For images/videos
    };

    // Also include legacy field names for backward compatibility
    if (resourceType === "image") {
      responseData.imageUrl = result.secure_url;
    } else if (resourceType === "video" && mimetype.startsWith('video/')) {
      responseData.videoUrl = result.secure_url;
    } else if (resourceType === "video" && mimetype.startsWith('audio/')) {
      responseData.audioUrl = result.secure_url;
    }

    res.json(responseData);
    
  } catch (error) {
    console.error("❌ Media upload failed:", error);
    res.status(500).json({ 
      error: "Upload failed",
      details: error.message 
    });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
