const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Allows your WordPress site to call this backend
app.use(express.json());

// Ensure temp directory exists
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

// Cleanup old temp files every hour
setInterval(() => {
  fs.readdir(tmpDir, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(tmpDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > 3600000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 3600000);

app.post('/api/download', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const id = crypto.randomBytes(8).toString('hex');
  const outputTemplate = path.join(tmpDir, `${id}.%(ext)s`);
  
  // yt-dlp command: best video+audio, merged into mp4
  const command = `yt-dlp -f "bestvideo+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;

  exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`yt-dlp error: ${error.message}`);
      return res.status(500).json({ error: 'Failed to download. Check if URL is valid and video is public.' });
    }

    fs.readdir(tmpDir, (err, files) => {
      if (err) return res.status(500).json({ error: 'Server error locating file' });
      const downloadedFile = files.find(f => f.startsWith(id));
      if (!downloadedFile) return res.status(500).json({ error: 'No video file produced' });
      
      const filePath = path.join(tmpDir, downloadedFile);
      res.download(filePath, `video_${id}.mp4`, (err) => {
        fs.unlink(filePath, () => {});
        if (err) console.error('Download send error:', err);
      });
    });
  });
});

app.get('/', (req, res) => {
  res.send('Video Downloader Backend is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
