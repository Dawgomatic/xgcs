const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const storageDir = path.join(__dirname, '../../public/storage');
const storageFile = path.join(storageDir, 'items.json');

// Ensure the directory and file exist
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

if (!fs.existsSync(storageFile)) {
  fs.writeFileSync(storageFile, JSON.stringify([]));
}

// Endpoint to get items
router.get('/items', (req, res) => {
  console.log('GET /items');
  const items = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
  res.json(items);
});

// Endpoint to save items
router.post('/items', (req, res) => {
  console.log('POST /items', req.body);
  const items = req.body;
  fs.writeFileSync(storageFile, JSON.stringify(items));
  res.status(200).send('Items saved');
});

module.exports = router; 