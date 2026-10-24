// middleware/upload.js - shared, safer image upload handling.
//  * file extension comes from the verified MIME type, never from the
//    user-supplied filename
//  * the first bytes of the saved file are checked, so a renamed .exe or
//    .html file is rejected even if the browser claims image/png
//  * upload problems (too big, wrong type) become friendly messages in
//    req.uploadError instead of crashing into the 500 page
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
};

const MAX_BYTES = 5 * 1024 * 1024;
const TYPE_MESSAGE = 'Only PNG, JPG, JPEG, and WEBP images are allowed.';

function looksLikeImage(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    const png = buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const jpg = buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    const webp =
      buf.slice(0, 4).toString('ascii') === 'RIFF' &&
      buf.slice(8, 12).toString('ascii') === 'WEBP';
    return png || jpg || webp;
  } catch (e) {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function removeFile(filePath) {
  if (filePath) fs.unlink(filePath, () => {});
}

// field: form field name, dir: absolute folder, prefix: (req) => filename prefix
function imageUpload({ field, dir, prefix }) {
  fs.mkdirSync(dir, { recursive: true });

  const uploader = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      filename: (req, file, cb) => {
        const ext = MIME_EXT[file.mimetype];
        cb(null, `${prefix(req)}-${Date.now()}-${Math.round(Math.random() * 100000)}${ext}`);
      },
    }),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      if (MIME_EXT[file.mimetype]) return cb(null, true);
      const err = new Error(TYPE_MESSAGE);
      err.code = 'BAD_IMAGE_TYPE';
      return cb(err);
    },
  }).single(field);

  return function handleUpload(req, res, next) {
    uploader(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          req.uploadError = 'Images must be 5 MB or smaller.';
        } else if (err.code === 'BAD_IMAGE_TYPE') {
          req.uploadError = TYPE_MESSAGE;
        } else if (err instanceof multer.MulterError) {
          req.uploadError = 'The upload could not be processed. Please try another image.';
        } else {
          return next(err);
        }
        if (req.file) removeFile(req.file.path);
        req.file = undefined;
        return next();
      }

      if (req.file && !looksLikeImage(req.file.path)) {
        removeFile(req.file.path);
        req.file = undefined;
        req.uploadError = 'That file is not a valid image.';
      }
      return next();
    });
  };
}

// Delete a stored upload given its public URL, but only inside `dir`.
async function deleteStoredImage(publicUrl, publicPrefix, dir) {
  if (typeof publicUrl !== 'string' || !publicUrl.startsWith(publicPrefix)) return;
  const file = path.basename(publicUrl);
  await fs.promises.unlink(path.join(dir, file)).catch((err) => {
    if (err.code !== 'ENOENT') console.error('Failed to remove an image:', err.message);
  });
}

module.exports = { imageUpload, removeFile, deleteStoredImage };
