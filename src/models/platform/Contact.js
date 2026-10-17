const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
        },
        subject: {
            type: String,
            enum: ["", "pricing", "support", "partnership", "other"],
            default: "",
        },
        message: {
            type: String,
            required: [true, "Message is required"],
            trim: true,
        },
        // Product-owner inbox state — set when an admin opens the message.
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Contact", ContactSchema);