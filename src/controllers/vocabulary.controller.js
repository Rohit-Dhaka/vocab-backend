import mongoose from "mongoose";
import Vocabulary from "../models/Vocabulary.js";
import cloudinary from "../config/cloudinary.js";

const ALLOWED_LANGUAGES = ["english", "german"];

const ALLOWED_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

const ALLOWED_STATUSES = ["not_started", "in_progress", "done"];

// Model ke fields se match karte hain (pronunciationEnglish / pronunciationHindi)
const EDITABLE_FIELDS = [
  "language",
  "word",
  "hindiMeaning",
  "englishMeaning",
  "pronunciationEnglish",
  "pronunciationHindi",
  "level",
  "status",
  "progress",
];

const STRING_FIELDS = [
  "language",
  "word",
  "hindiMeaning",
  "englishMeaning",
  "pronunciationEnglish",
  "pronunciationHindi",
  "level",
  "status",
];

const MAX_LENGTHS = {
  word: 150,
  hindiMeaning: 500,
  englishMeaning: 500,
  pronunciationEnglish: 200,
  pronunciationHindi: 200,
};

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const isValidObjectId = (id) => mongoose.isValidObjectId(id);

// Validate and sanitize vocabulary data.
const validateVocabularyData = (body, isCreate = false) => {
  const data = {};

  for (const field of EDITABLE_FIELDS) {
    if (Object.hasOwn(body, field)) {
      data[field] = body[field];
    }
  }

  if (isCreate) {
    const requiredFields = [
      "language",
      "word",
      "hindiMeaning",
      "englishMeaning",
    ];

    for (const field of requiredFields) {
      if (typeof data[field] !== "string" || !data[field].trim()) {
        fail(`${field} is required.`);
      }
    }
  }

  // Convert FormData progress strings into numbers.
  if (Object.hasOwn(data, "progress") && typeof data.progress === "string") {
    const normalizedProgress = data.progress.trim();

    if (normalizedProgress !== "") {
      data.progress = Number(normalizedProgress);
    }
  }

  for (const field of STRING_FIELDS) {
    if (Object.hasOwn(data, field) && typeof data[field] !== "string") {
      fail(`${field} must be a string.`);
    }
  }

  for (const [field, maxLength] of Object.entries(MAX_LENGTHS)) {
    if (typeof data[field] === "string") {
      data[field] = data[field].trim();

      if (data[field].length > maxLength) {
        fail(`${field} cannot exceed ${maxLength} characters.`);
      }
    }
  }

  if (
    data.language !== undefined &&
    !ALLOWED_LANGUAGES.includes(data.language)
  ) {
    fail("Language must be english or german.");
  }

  if (data.level !== undefined && !ALLOWED_LEVELS.includes(data.level)) {
    fail("Level must be A1, A2, B1, B2 or C1.");
  }

  if (data.status !== undefined && !ALLOWED_STATUSES.includes(data.status)) {
    fail("Invalid vocabulary status.");
  }

  if (
    data.progress !== undefined &&
    (typeof data.progress !== "number" ||
      !Number.isInteger(data.progress) ||
      data.progress < 0 ||
      data.progress > 100)
  ) {
    fail("Progress must be an integer between 0 and 100.");
  }

  return data;
};

// Automatically synchronize status and progress.
const synchronizeProgress = (data, existing = {}) => {
  const hasProgress = Object.hasOwn(data, "progress");
  const hasStatus = Object.hasOwn(data, "status");

  let progress = hasProgress ? data.progress : (existing.progress ?? 0);

  let status = hasStatus
    ? data.status
    : (existing.status ?? "not_started");

  if (hasProgress && !hasStatus) {
    if (progress === 0) {
      status = "not_started";
    } else if (progress === 100) {
      status = "done";
    } else {
      status = "in_progress";
    }
  } else if (hasStatus && !hasProgress) {
    if (status === "not_started") {
      progress = 0;
    } else if (status === "done") {
      progress = 100;
    } else if (progress === 0 || progress === 100) {
      progress = 1;
    }
  }

  if (status === "not_started" && progress !== 0) {
    fail("Not Started vocabulary must have 0% progress.");
  }

  if (status === "in_progress" && (progress < 1 || progress > 99)) {
    fail("In Progress vocabulary must have progress between 1 and 99.");
  }

  if (status === "done" && progress !== 100) {
    fail("Completed vocabulary must have 100% progress.");
  }

  return { status, progress };
};

// Memory (buffer) se Cloudinary par image upload karta hai.
const uploadToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "vocabulary", resource_type: "image" },
      (error, result) => (error ? reject(error) : resolve(result))
    );

    stream.end(buffer);
  });

// Delete an image from Cloudinary.
const deleteCloudinaryImage = async (publicId) => {
  if (!publicId) return;

  try {
    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result !== "ok" && result.result !== "not found") {
      console.error("Cloudinary image deletion was unsuccessful.");
    }
  } catch (error) {
    console.error("Cloudinary deletion error:", error.message);
  }
};

// POST /api/vocabulary
export const createVocabulary = async (req, res) => {
  let uploadedImage = null;

  try {
    // Pehle data validate, phir image upload (galat data par faltu upload na ho)
    const data = validateVocabularyData(req.body, true);

    const { status, progress } = synchronizeProgress(data);

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);

      uploadedImage = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }

    const vocabulary = await Vocabulary.create({
      ...data,
      status,
      progress,
      image: uploadedImage || {
        url: "",
        publicId: "",
      },
    });

    return res.status(201).json({
      success: true,
      message: "Vocabulary created successfully.",
      data: { vocabulary },
    });
  } catch (error) {
    if (uploadedImage?.publicId) {
      await deleteCloudinaryImage(uploadedImage.publicId);
    }

    if (error.statusCode || error.name === "ValidationError") {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Create vocabulary error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create vocabulary.",
    });
  }
};

// GET /api/vocabulary
export const getVocabularies = async (req, res) => {
  try {
    const {
      language,
      level,
      status,
      search,
      page = "1",
      limit = "20",
    } = req.query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(limitNumber) ||
      limitNumber < 1 ||
      limitNumber > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Page must be positive and limit must be between 1 and 100.",
      });
    }

    const filter = {};

    if (language !== undefined) {
      if (!ALLOWED_LANGUAGES.includes(language)) {
        return res.status(400).json({
          success: false,
          message: "Invalid language filter.",
        });
      }

      filter.language = language;
    }

    if (level !== undefined) {
      if (!ALLOWED_LEVELS.includes(level)) {
        return res.status(400).json({
          success: false,
          message: "Invalid level filter.",
        });
      }

      filter.level = level;
    }

    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status filter.",
        });
      }

      filter.status = status;
    }

    if (search !== undefined) {
      if (typeof search !== "string" || search.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Search must not exceed 100 characters.",
        });
      }

      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const regex = new RegExp(escapedSearch, "i");

      filter.$or = [
        { word: regex },
        { hindiMeaning: regex },
        { englishMeaning: regex },
      ];
    }

    const skip = (pageNumber - 1) * limitNumber;

    const [vocabularies, total] = await Promise.all([
      Vocabulary.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      Vocabulary.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        vocabularies,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(total / limitNumber),
        },
      },
    });
  } catch (error) {
    console.error("Get vocabularies error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch vocabulary.",
    });
  }
};

// GET /api/vocabulary/:id
export const getVocabularyById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vocabulary ID.",
      });
    }

    const vocabulary = await Vocabulary.findById(req.params.id);

    if (!vocabulary) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: { vocabulary },
    });
  } catch (error) {
    console.error("Get vocabulary error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch vocabulary.",
    });
  }
};

// PUT /api/vocabulary/:id
export const updateVocabulary = async (req, res) => {
  let uploadedImage = null;
  let oldImagePublicId = null;
  let vocabularySaved = false;

  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vocabulary ID.",
      });
    }

    const vocabulary = await Vocabulary.findById(req.params.id);

    if (!vocabulary) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary not found.",
      });
    }

    // Pehle data validate, phir image upload (galat data par faltu upload na ho)
    const data = validateVocabularyData(req.body);

    const { status, progress } = synchronizeProgress(data, vocabulary);

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);

      uploadedImage = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    }

    oldImagePublicId = vocabulary.image?.publicId || "";

    Object.assign(vocabulary, data, { status, progress });

    if (uploadedImage) {
      vocabulary.image = uploadedImage;
    }

    await vocabulary.save();

    vocabularySaved = true;

    if (
      uploadedImage &&
      oldImagePublicId &&
      oldImagePublicId !== uploadedImage.publicId
    ) {
      await deleteCloudinaryImage(oldImagePublicId);
    }

    return res.status(200).json({
      success: true,
      message: "Vocabulary updated successfully.",
      data: { vocabulary },
    });
  } catch (error) {
    if (!vocabularySaved && uploadedImage?.publicId) {
      await deleteCloudinaryImage(uploadedImage.publicId);
    }

    if (error.statusCode || error.name === "ValidationError") {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Update vocabulary error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update vocabulary.",
    });
  }
};

// DELETE /api/vocabulary/:id
export const deleteVocabulary = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vocabulary ID.",
      });
    }

    const vocabulary = await Vocabulary.findByIdAndDelete(req.params.id);

    if (!vocabulary) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary not found.",
      });
    }

    if (vocabulary.image?.publicId) {
      await deleteCloudinaryImage(vocabulary.image.publicId);
    }

    return res.status(200).json({
      success: true,
      message: "Vocabulary deleted successfully.",
    });
  } catch (error) {
    console.error("Delete vocabulary error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to delete vocabulary.",
    });
  }
};

// ---------- Statistics helpers ----------

// Ek status ke words ginne ke liye
const countStatus = (status) => ({
  $sum: { $cond: [{ $eq: ["$status", status] }, 1, 0] },
});

// Har group mein common fields
const statusFields = {
  totalWords: { $sum: 1 },
  completedWords: countStatus("done"),
  inProgressWords: countStatus("in_progress"),
  notStartedWords: countStatus("not_started"),
  averageProgress: { $avg: "$progress" },
};

const remainingWords = {
  $subtract: ["$totalWords", "$completedWords"],
};

const averageProgress = {
  $round: [{ $ifNull: ["$averageProgress", 0] }, 1],
};

const completionRate = {
  $round: [
    {
      $multiply: [
        { $divide: ["$completedWords", { $max: ["$totalWords", 1] }] },
        100,
      ],
    },
    1,
  ],
};

// GET /api/vocabulary/stats
export const getVocabularyStats = async (req, res) => {
  try {
    const stats = await Vocabulary.aggregate([
      {
        $facet: {
          // Overall statistics
          overall: [
            {
              $group: {
                _id: null,
                ...statusFields,
                totalProgress: { $sum: "$progress" },
              },
            },
            {
              $project: {
                _id: 0,
                totalWords: 1,
                completedWords: 1,
                inProgressWords: 1,
                notStartedWords: 1,
                remainingWords,
                totalProgress: 1,
                averageProgress,
                completionRate,
              },
            },
          ],

          // English and German statistics
          languages: [
            {
              $group: {
                _id: "$language",
                ...statusFields,
              },
            },
            {
              $project: {
                _id: 0,
                language: "$_id",
                totalWords: 1,
                completedWords: 1,
                inProgressWords: 1,
                notStartedWords: 1,
                remainingWords,
                averageProgress,
                completionRate,
              },
            },
            { $sort: { language: 1 } },
          ],

          // Statistics for A1, A2, B1, B2 and C1
          levels: [
            {
              $group: {
                _id: {
                  language: "$language",
                  level: "$level",
                },
                ...statusFields,
              },
            },
            {
              $project: {
                _id: 0,
                language: "$_id.language",
                level: "$_id.level",
                totalWords: 1,
                completedWords: 1,
                inProgressWords: 1,
                notStartedWords: 1,
                averageProgress,
              },
            },
            { $sort: { language: 1, level: 1 } },
          ],
        },
      },
    ]);

    const result = stats[0];

    return res.status(200).json({
      success: true,
      message: "Vocabulary statistics fetched successfully.",

      data: {
        overall: result.overall[0] || {
          totalWords: 0,
          completedWords: 0,
          inProgressWords: 0,
          notStartedWords: 0,
          remainingWords: 0,
          totalProgress: 0,
          averageProgress: 0,
          completionRate: 0,
        },

        languages: result.languages,
        levels: result.levels,
      },
    });
  } catch (error) {
    console.error("Vocabulary statistics error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch vocabulary statistics.",
    });
  }
};