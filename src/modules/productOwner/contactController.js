const Contact = require("../../models/platform/Contact")
const mongoose = require("mongoose");

exports.createContact = async (req, res) => {
    try {
        // Pick only the fields we expect (prevents extra fields being saved)
        const { name, email, subject, message } = req.body;

        const contact = await Contact.create({ name, email, subject, message });

        res.status(201).json({
            success: true,
            message: "Message sent successfully",
            data: contact,
        });
    } catch (err) {
        // Mongoose validation errors (missing field, invalid email, bad enum)
        if (err.name === "ValidationError") {
            const errors = Object.values(err.errors).map((e) => e.message);
            return res.status(400).json({ success: false, errors });
        }

        console.error("createContact error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};

exports.getContacts = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
        const { subject, status, search } = req.query;

        const filter = {};
        if (subject) filter.subject = String(subject);
        if (status === "unread") filter.isRead = false;
        if (status === "read") filter.isRead = true;
        if (search) {
            // Escape regex metacharacters so user input is matched literally.
            const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [{ name: rx }, { email: rx }, { message: rx }];
        }

        const [contacts, total, unreadCount] = await Promise.all([
            Contact.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Contact.countDocuments(filter),
            Contact.countDocuments({ isRead: false }),
        ]);

        res.json({
            success: true,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
            unreadCount,
            data: contacts,
        });
    } catch (err) {
        console.error("getContacts error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};

exports.getContactById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: "Invalid ID" });
        }

        const contact = await Contact.findById(id);
        if (!contact) {
            return res.status(404).json({ success: false, error: "Message not found" });
        }

        res.json({ success: true, data: contact });
    } catch (err) {
        console.error("getContactById error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};

exports.deleteContact = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: "Invalid ID" });
        }

        const contact = await Contact.findByIdAndDelete(id);
        if (!contact) {
            return res.status(404).json({ success: false, error: "Message not found" });
        }

        res.json({ success: true, message: "Message deleted" });
    } catch (err) {
        console.error("deleteContact error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};

exports.updateContactReadStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: "Invalid ID" });
        }

        const isRead = req.body.isRead !== false;
        const contact = await Contact.findByIdAndUpdate(id, { isRead }, { new: true });
        if (!contact) {
            return res.status(404).json({ success: false, error: "Message not found" });
        }

        res.json({ success: true, data: contact });
    } catch (err) {
        console.error("updateContactReadStatus error:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
};
