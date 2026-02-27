const express = require("express");
const router = express.Router();
const { auth, adminOnly } = require("../middleware/authMiddleware");
const {
  getToggles,
  getToggleByKey,
  updateToggle,
} = require("../controllers/featureToggleController");

router.get("/", auth, getToggles);
router.get("/:key", auth, getToggleByKey);
router.put("/:key", auth, adminOnly, updateToggle);

module.exports = router;
