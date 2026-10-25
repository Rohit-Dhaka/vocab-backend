import express from "express";
import cors from "cors";
import vocabularyRoutes from "./routes/vocabulary.routes.js";

const app = express();

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Parse incoming JSON requests
app.use(express.json({ limit: "1mb" }));

// Parse URL-encoded requests
app.use(express.urlencoded({ extended: true }));

// API health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Vocabulary API is running successfully.",
  });
});

// Vocabulary routes
app.use("/api/vocabulary", vocabularyRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Application Error:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  if (error.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image size cannot exceed 5 MB."
          : "Image upload failed.",
    });
  }

  if (error.message?.includes("Only JPG, PNG and WebP")) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(error.statusCode || 500).json({
    success: false,
    message:
      error.statusCode && error.statusCode < 500
        ? error.message
        : "Internal server error.",
  });
});

export default app;