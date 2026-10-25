
import mongoose from "mongoose";

const vocabularySchema = new mongoose.Schema(
  {
    // Language of the vocabulary word.
    language: {
      type: String,
      enum: {
        values: ["english", "german"],
        message: "Language must be either English or German.",
      },
      required: [true, "Language is required."],
      index: true,
      trim: true,
      lowercase: true,
    },

    // Vocabulary word.
    word: {
      type: String,
      required: [true, "Word is required."],
      trim: true,
      maxlength: [150, "Word cannot exceed 150 characters."],
    },

    // Hindi meaning of the word.
    hindiMeaning: {
      type: String,
      required: [true, "Hindi meaning is required."],
      trim: true,
      maxlength: [500, "Hindi meaning cannot exceed 500 characters."],
    },

    // English meaning of the word.
    englishMeaning: {
      type: String,
      required: [true, "English meaning is required."],
      trim: true,
      maxlength: [500, "English meaning cannot exceed 500 characters."],
    },

    // Pronunciation written in English/Latin script.
    pronunciationEnglish: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        200,
        "English pronunciation cannot exceed 200 characters.",
      ],
    },

    // Pronunciation written using Hindi script.
    pronunciationHindi: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        200,
        "Hindi pronunciation cannot exceed 200 characters.",
      ],
    },

    // CEFR vocabulary level.
    level: {
      type: String,
      enum: {
        values: ["A1", "A2", "B1", "B2", "C1"],
        message: "Level must be A1, A2, B1, B2, or C1.",
      },
      default: "A1",
      required: [true, "Vocabulary level is required."],
      index: true,
      uppercase: true,
      trim: true,
    },

    // Learning status.
    status: {
      type: String,
      enum: {
        values: ["not_started", "in_progress", "done"],
        message:
          "Status must be not_started, in_progress, or done.",
      },
      default: "not_started",
      required: [true, "Learning status is required."],
      index: true,
      trim: true,
    },

    // Learning progress from 0 to 100.
    progress: {
      type: Number,
      min: [0, "Progress cannot be less than 0."],
      max: [100, "Progress cannot exceed 100."],
      default: 0,
      validate: {
        validator(value) {
          return Number.isInteger(value);
        },
        message: "Progress must be an integer between 0 and 100.",
      },
    },

    // Cloudinary image details.
    image: {
      url: {
        type: String,
        trim: true,
        default: "",
      },

      publicId: {
        type: String,
        trim: true,
        default: "",
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Keep learning status and progress consistent.
vocabularySchema.pre("validate", function () {
  if (!Number.isInteger(this.progress)) {
    this.invalidate(
      "progress",
      "Progress must be an integer between 0 and 100."
    );

    return;
  }

  if (this.status === "not_started" && this.progress !== 0) {
    this.invalidate(
      "progress",
      "Not Started vocabulary must have 0% progress."
    );
  }

  if (
    this.status === "in_progress" &&
    (this.progress < 1 || this.progress > 99)
  ) {
    this.invalidate(
      "progress",
      "In Progress vocabulary must have progress between 1 and 99."
    );
  }

  if (this.status === "done" && this.progress !== 100) {
    this.invalidate(
      "progress",
      "Completed vocabulary must have 100% progress."
    );
  }
});

// Compound index for language-specific vocabulary filters.
vocabularySchema.index({
  language: 1,
  level: 1,
  status: 1,
});

const Vocabulary = mongoose.model("Vocabulary", vocabularySchema);

export default Vocabulary;
