const express = require("express");
const {
  postMessage,
  postGenerateImage,
  getHistory,
  clearHistory,
  setHistory
} = require("../controllers/chatController");

const router = express.Router();

router.get("/history", getHistory);
router.delete("/history", clearHistory);
router.put("/history", setHistory);
router.post("/message", postMessage);
router.post("/generate-image", postGenerateImage);

// Public guest share endpoint (no auth)
const { shareGuest } = require("../controllers/shareController");
router.post("/public/share", shareGuest);

module.exports = router;
