const express = require("express");
const router = express.Router();
const { platformAuthenticate } = require("../../middleware/authenticate")
const {
    createContact,
    getContacts,
    getContactById,
    deleteContact,
    updateContactReadStatus,
} = require("./contactController");

router.post("/", createContact);
router.get("/", platformAuthenticate(), getContacts);
router.get("/:id", platformAuthenticate(), getContactById);
router.patch("/:id/read", platformAuthenticate(), updateContactReadStatus);
router.delete("/:id", platformAuthenticate(), deleteContact);

module.exports = router;