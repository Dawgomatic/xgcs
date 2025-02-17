const express = require('express');
const cors = require('cors');
const storageRoutes = require('./routes/storage');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json()); // To parse JSON bodies

// Register the storage routes
app.use('/api', storageRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
}); 