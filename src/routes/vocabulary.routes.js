import express from "express";

import {
  createVocabulary,
  getVocabularies,
  getVocabularyById,
  updateVocabulary,
  deleteVocabulary,
  getVocabularyStats,
} from "../controllers/vocabulary.controller.js";

import upload from "../middleware/upload.middleware.js";

const router = express.Router();

// Get vocabulary statistics
// GET /api/vocabulary/stats
router.get("/stats", getVocabularyStats);

// Create new vocabulary with optional image
// POST /api/vocabulary
router.post("/", upload.single("image"), createVocabulary);

// Get all vocabulary with optional filters and pagination
// GET /api/vocabulary
router.get("/", getVocabularies);

// Get vocabulary by ID
// GET /api/vocabulary/:id
router.get("/:id", getVocabularyById);

// Update vocabulary with optional new image
// PUT /api/vocabulary/:id
router.put("/:id", upload.single("image"), updateVocabulary);

// Delete vocabulary by ID
// DELETE /api/vocabulary/:id
router.delete("/:id", deleteVocabulary);

export default router;